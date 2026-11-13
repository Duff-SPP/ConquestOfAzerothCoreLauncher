const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { defaults, sanitize, saveSettings, readSettings } = require('../src/settings.cjs');

test('HD preference defaults on, accepts only booleans, and survives a launcher restart', async t => {
  assert.equal(defaults.hdPatches, true);
  assert.equal(sanitize({}).hdPatches, true);
  for (const invalid of ['false', 0, null, [], {}]) assert.equal(sanitize({ hdPatches: invalid }).hdPatches, true);
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'coa-hd-test-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const file = path.join(directory, 'settings.json');
  await saveSettings(file, { hdPatches: false });
  assert.equal((await readSettings(file)).hdPatches, false);
  await saveSettings(file, { hdPatches: true });
  assert.equal((await readSettings(file)).hdPatches, true);
});

test('saved checkbox preference reaches the main launch handler, including update retries', async () => {
  const root = path.resolve(__dirname, '..');
  const main = await fs.readFile(path.join(root, 'src/main.cjs'), 'utf8');
  const settingsHandler = main.slice(main.indexOf("handle('launcher:settings'"), main.indexOf("handle('launcher:choose-client'"));
  const handlers = new Map(), launches = [];
  const context = vm.createContext({
    settings: { ...defaults }, handle: (name, callback) => handlers.set(name, callback),
    persist: async value => { context.settings = sanitize(value); return context.settings; },
    requireIdleClient: async () => {}, clientInfo: async () => ({ installed: true, path: 'C:\\Game' }),
    game: null, config: { localDownloadDemo: false, clientExecutable: 'Ascension.exe' },
    probeClientFolder: async () => {}, clientUpdater: { check: async () => ({ needsUpdate: false }) },
    configureClientGraphics: async () => {}, mutateClient: async action => action(), configureRealm: async () => {},
    launchGame: async (file, options) => { launches.push({ file, options }); return 4321; },
    path: path.win32, setInterval: () => ({ unref() {} }),
  });
  vm.runInContext(settingsHandler, context);
  vm.runInContext(main.slice(main.indexOf("handle('launcher:launch'"), main.indexOf("handle('launcher:open-folder'")), context);
  await handlers.get('launcher:settings')({ hdPatches: false, wineCompatibility: true });
  context.clientUpdater.check = async () => ({ needsUpdate: true });
  const pending = await handlers.get('launcher:launch')();
  assert.equal(pending.needsUpdate, true);
  assert.equal(launches.length, 0);
  context.clientUpdater.check = async () => ({ needsUpdate: false });
  await handlers.get('launcher:launch')();
  assert.equal(launches[0].options.hdPatches, false);
  assert.equal(launches[0].options.wineCompatibility, true);
  assert.equal(launches[0].file, 'C:\\Game\\Ascension.exe');
  context.game = null;
  await handlers.get('launcher:settings')({ hdPatches: true, wineCompatibility: false });
  await handlers.get('launcher:launch')();
  assert.equal(launches[1].options.hdPatches, true);
  assert.equal(launches[1].options.wineCompatibility, false);
  const app = await fs.readFile(path.join(root, 'public/app.js'), 'utf8');
  assert.match(app, /type="checkbox" data-setting="hdPatches"/);
  const changeHandlers = new Map();
  const renderer = vm.createContext({ document: { addEventListener: (name, callback) => changeHandlers.set(name, callback), body: { classList: { toggle() {} } } },
    guarded: action => action(), state: { settings: { ...defaults } }, api: { saveSettings: patch => handlers.get('launcher:settings')(patch) },
    toast() {}, t: value => value,
  });
  vm.runInContext(app.slice(app.indexOf("document.addEventListener('change'"), app.indexOf("window.addEventListener('resize'")), renderer);
  const checkbox = { id: '', dataset: { setting: 'hdPatches' }, type: 'checkbox', checked: false, disabled: false };
  await changeHandlers.get('change')({ target: checkbox });
  // The event listener schedules its async work through guarded.
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(context.settings.hdPatches, false);
  assert.equal(checkbox.disabled, false);
  for (const code of ['fr', 'es-ES', 'ru', 'zh-CN']) {
    const catalog = JSON.parse(await fs.readFile(path.join(root, 'localization', code + '.json'), 'utf8'));
    assert.ok(catalog['Enable HD patches']);
    assert.ok(catalog['Applies on your next launch.']);
  }
});
