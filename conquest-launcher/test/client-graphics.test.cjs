const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { configureClientGraphics } = require('../src/client-graphics.cjs');
const { defaults, sanitize, saveSettings, readSettings } = require('../src/settings.cjs');

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'coa-graphics-test-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return root;
}

test('compatibility preserves renderer bytes, repeats safely, and restores the original', async t => {
  const root = await fixture(t);
  await fs.writeFile(path.join(root, 'd3d9.dll'), 'custom renderer');
  await fs.writeFile(path.join(root, 'dxgi.dll'), 'other renderer');
  await configureClientGraphics(root, true, true);
  await configureClientGraphics(root, true, true);
  await assert.rejects(fs.stat(path.join(root, 'd3d9.dll')), { code: 'ENOENT' });
  assert.equal(await fs.readFile(path.join(root, 'd3d9.dll.DISABLED'), 'utf8'), 'custom renderer');
  await assert.rejects(fs.stat(path.join(root, 'dxgi.dll')), { code: 'ENOENT' });
  assert.equal(await fs.readFile(path.join(root, 'dxgi.dll.DISABLED'), 'utf8'), 'other renderer');
  await configureClientGraphics(root, false);
  await configureClientGraphics(root, false);
  assert.equal(await fs.readFile(path.join(root, 'd3d9.dll'), 'utf8'), 'custom renderer');
  assert.equal(await fs.readFile(path.join(root, 'dxgi.dll'), 'utf8'), 'other renderer');
  await assert.rejects(fs.stat(path.join(root, 'd3d9.dll.DISABLED')), { code: 'ENOENT' });
});

test('conflicting files are never overwritten and missing renderer is harmless', async t => {
  const root = await fixture(t);
  await configureClientGraphics(root, true);
  await configureClientGraphics(root, false);
  await fs.writeFile(path.join(root, 'd3d9.dll'), 'active');
  await fs.writeFile(path.join(root, 'd3d9.dll.DISABLED'), 'disabled');
  for (const enabled of [true, false]) await assert.rejects(configureClientGraphics(root, enabled), /conflicting renderer/);
  assert.equal(await fs.readFile(path.join(root, 'd3d9.dll'), 'utf8'), 'active');
  assert.equal(await fs.readFile(path.join(root, 'd3d9.dll.DISABLED'), 'utf8'), 'disabled');
});

test('linked client roots cannot redirect renderer changes', async t => {
  const root = await fixture(t), outside = await fixture(t);
  await fs.writeFile(path.join(outside, 'd3d9.dll'), 'outside');
  await fs.symlink(outside, path.join(root, 'linked'), 'junction');
  await assert.rejects(configureClientGraphics(path.join(root, 'linked'), true), /Linked/);
  assert.equal(await fs.readFile(path.join(outside, 'd3d9.dll'), 'utf8'), 'outside');
});

test('compatibility defaults off, rejects non-booleans, and persists', async t => {
  const root = await fixture(t), file = path.join(root, 'settings.json');
  assert.equal(defaults.graphicsCompatibility, false);
  assert.equal(sanitize({ graphicsCompatibility: 'true' }).graphicsCompatibility, false);
  await saveSettings(file, { ...defaults, graphicsCompatibility: true });
  assert.equal((await readSettings(file)).graphicsCompatibility, true);
});


test('saved compatibility preference is applied before update checks and a conflict prevents launch', async () => {
  const vm = require('node:vm');
  const main = await fs.readFile(path.join(__dirname, '../src/main.cjs'), 'utf8');
  const handlers = new Map(), calls = [];
  const context = vm.createContext({
    settings: { ...defaults }, game: null, path: path.win32,
    handle: (name, callback) => handlers.set(name, callback),
    persist: async value => { context.settings = sanitize(value); return context.settings; },
    requireIdleClient: async () => {}, clientInfo: async () => ({ installed: true, path: 'C:/Game' }),
    mutateClient: async action => action(), configureClientGraphics: async (root, enabled) => calls.push(enabled),
    config: { localDownloadDemo: false, clientExecutable: 'Ascension.exe' },
    probeClientFolder: async () => {}, clientUpdater: { check: async () => { calls.push('check'); return { needsUpdate: false }; } },
    configureRealm: async () => {}, clearClientCache: async () => {},
    launchGame: async () => { calls.push('launch'); return 4321; }, setInterval: () => ({ unref() {} })
  });
  vm.runInContext(main.slice(main.indexOf("handle('launcher:settings'"), main.indexOf("handle('launcher:choose-client'")), context);
  vm.runInContext(main.slice(main.indexOf("handle('launcher:launch'"), main.indexOf("handle('launcher:open-folder'")), context);
  await handlers.get('launcher:settings')({ graphicsCompatibility: true });
  await handlers.get('launcher:launch')();
  assert.deepEqual(calls, [true, 'check', 'launch']);
  context.game = null; calls.length = 0;
  await handlers.get('launcher:settings')({ graphicsCompatibility: false });
  await handlers.get('launcher:launch')();
  assert.deepEqual(calls, [false, 'check', 'launch']);
  context.game = null; calls.length = 0;
  context.configureClientGraphics = async () => { throw new Error('conflicting renderer'); };
  await assert.rejects(handlers.get('launcher:launch')(), /conflicting renderer/);
  assert.deepEqual(calls, []);
});

test('graphics toggles act independently and remember the enhancement preference', async t => {
  const root=await fixture(t);
  await fs.writeFile(path.join(root,'d3d9.dll'),'renderer');
  await fs.writeFile(path.join(root,'dxgi.dll'),'enhancement');
  await configureClientGraphics(root,true,false);
  assert.equal(await fs.readFile(path.join(root,'dxgi.dll'),'utf8'),'enhancement');
  await assert.rejects(fs.stat(path.join(root,'d3d9.dll')),{code:'ENOENT'});
  await configureClientGraphics(root,false,true);
  assert.equal(await fs.readFile(path.join(root,'d3d9.dll'),'utf8'),'renderer');
  await assert.rejects(fs.stat(path.join(root,'dxgi.dll')),{code:'ENOENT'});
  await configureClientGraphics(root,false,false);
  assert.equal(await fs.readFile(path.join(root,'dxgi.dll'),'utf8'),'enhancement');
  const file=path.join(root,'settings.json');
  await saveSettings(file,{...defaults,graphicsCompatibility:false,disableGraphicsEnhancements:true});
  assert.equal((await readSettings(file)).disableGraphicsEnhancements,true);
  assert.equal((await readSettings(file)).graphicsCompatibility,false);
});

test('graphics toggles safely fall back to exclusive copy on exFAT', async t => {
  const root=await fixture(t);
  await fs.writeFile(path.join(root,'d3d9.dll'),'renderer');
  const link=fs.link;
  fs.link=async()=>{throw Object.assign(new Error('unsupported'),{code:'EISDIR'});};
  try {
    await configureClientGraphics(root,true,false);
    assert.equal(await fs.readFile(path.join(root,'d3d9.dll.DISABLED'),'utf8'),'renderer');
    await configureClientGraphics(root,false,false);
    assert.equal(await fs.readFile(path.join(root,'d3d9.dll'),'utf8'),'renderer');
  } finally {fs.link=link;}
});
