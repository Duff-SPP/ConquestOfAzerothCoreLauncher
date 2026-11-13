const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { defaults, sanitize, saveSettings, readSettings } = require('../src/settings.cjs');
const { clearClientCache } = require('../src/client-cache.cjs');

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'coa-cache-test-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.writeFile(path.join(root, 'Ascension.exe'), 'client');
  return root;
}
test('only Cache is removed; missing cache is harmless and player files remain', async t => {
  const root = await fixture(t);
  for (const file of ['Cache/WDB/enUS/items.wdb', 'WTF/Config.wtf', 'Interface/AddOns/Test.lua', 'Screenshots/image.jpg', '.coa-launcher/state.json']) {
    const target = path.join(root, file);
    await fs.mkdir(path.dirname(target), { recursive: true }); await fs.writeFile(target, 'kept');
  }
  assert.equal((await clearClientCache(root)).cleared, true);
  await assert.rejects(fs.stat(path.join(root, 'Cache')), { code: 'ENOENT' });
  for (const file of ['WTF/Config.wtf', 'Interface/AddOns/Test.lua', 'Screenshots/image.jpg', '.coa-launcher/state.json']) assert.equal(await fs.readFile(path.join(root, file), 'utf8'), 'kept');
  assert.equal((await clearClientCache(root)).cleared, false);
  await assert.rejects(clearClientCache(''), /Choose your installed client/);
});
test('junctions at Cache or inside Cache cannot redirect deletion', async t => {
  const root = await fixture(t), outside = await fixture(t);
  await fs.writeFile(path.join(outside, 'keep.txt'), 'outside');
  await fs.symlink(outside, path.join(root, 'Cache'), 'junction');
  await assert.rejects(clearClientCache(root), /Linked/);
  await fs.unlink(path.join(root, 'Cache'));
  await fs.mkdir(path.join(root, 'Cache'));
  await fs.symlink(outside, path.join(root, 'Cache/linked'), 'junction');
  await assert.rejects(clearClientCache(root), /Linked/);
  assert.equal(await fs.readFile(path.join(outside, 'keep.txt'), 'utf8'), 'outside');
});

test('cache clearing is unconditional, ignores the old setting and blocks launch on cleanup failure', async t => {
  const root = await fixture(t), file = path.join(root, 'settings.json');
  assert.equal('clearCacheOnLaunch' in defaults, false);
  assert.equal('clearCacheOnLaunch' in sanitize({ clearCacheOnLaunch: false }), false);
  const source = await fs.readFile(path.join(__dirname, '../src/main.cjs'), 'utf8');
  const calls = [], handlers = new Map();
  const context = vm.createContext({
    settings: { ...defaults }, game: null, handle: (key, callback) => handlers.set(key, callback),
    requireIdleClient: async () => {}, clientInfo: async () => ({ installed: true, path: root }),
    config: { localDownloadDemo: false, clientExecutable: 'Ascension.exe' },
    probeClientFolder: async () => {}, clientUpdater: { check: async () => ({ needsUpdate: false }) },
    configureClientGraphics: async () => {}, mutateClient: async action => action(), clearClientCache: async () => calls.push('clear'),
    configureRealm: async () => calls.push('realm'), launchGame: async () => { calls.push('launch'); return 4321; },
    path, setInterval: () => ({ unref() {} }),
  });
  vm.runInContext(source.slice(source.indexOf("handle('launcher:launch'"), source.indexOf("handle('launcher:open-folder'")), context);
  await handlers.get('launcher:launch')();
  assert.deepEqual(calls, ['clear', 'realm', 'launch']);
  calls.length = 0; context.game = null; context.settings.clearCacheOnLaunch = false;
  await handlers.get('launcher:launch')();
  assert.deepEqual(calls, ['clear', 'realm', 'launch']);
  calls.length = 0; context.game = null;
  context.clearClientCache = async () => { throw new Error('Cache locked'); };
  await assert.rejects(handlers.get('launcher:launch')(), /Cache locked/);
  assert.deepEqual(calls, [], 'failed cache clearing must not launch the game');
});
