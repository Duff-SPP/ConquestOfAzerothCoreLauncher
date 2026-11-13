const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { validateClientFolder, probeClientFolder } = require('../src/client-folder.cjs');

async function folder(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'coa-folder-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const game = path.join(root, 'Project Descension');
  await fs.mkdir(game);
  return game;
}

test('empty custom folder with spaces and existing client both pass write validation', async t => {
  const game = await folder(t);
  assert.equal(await validateClientFolder(game, 'Ascension.exe'), game);
  assert.deepEqual(await fs.readdir(path.join(game, '.coa-launcher')), []);
  await fs.writeFile(path.join(game, 'Ascension.exe'), 'fixture');
  assert.equal(await validateClientFolder(game, 'Ascension.exe'), game);
});

test('unrelated folders, executable directories and linked metadata are rejected', async t => {
  const game = await folder(t);
  await assert.rejects(validateClientFolder(game, 'Ascension.exe', [game]), /dedicated/);
  await fs.writeFile(path.join(game, 'personal.txt'), 'keep');
  await assert.rejects(validateClientFolder(game, 'Ascension.exe'), /empty folder/);
  await fs.mkdir(path.join(game, 'Ascension.exe'));
  await assert.rejects(validateClientFolder(game, 'Ascension.exe'), /Expected a file/);
  const outside = path.join(path.dirname(game), 'outside'); await fs.mkdir(outside);
  await fs.symlink(outside, path.join(game, '.coa-launcher'), 'junction');
  await assert.rejects(probeClientFolder(game), /Linked/);
  assert.deepEqual(await fs.readdir(outside), []);
});

test('permission failure produces a destination-specific error', async () => {
  const source = await fs.readFile(path.join(__dirname, '../src/client-folder.cjs'), 'utf8');
  const context = { module: { exports: {} }, require(name) {
    if (name === 'node:fs/promises') return { mkdir: async () => { throw Object.assign(new Error('denied'), { code: 'EPERM' }); } };
    if (name === './release-format.cjs') return { safePath: async (root, relative) => path.join(root, relative) };
    return require(name);
  } };
  vm.runInNewContext(source, context);
  await assert.rejects(context.module.exports.probeClientFolder('C:\\Protected\\Game'), /cannot write.*Protected.*Change game location/);
});

test('picker can replace an invalid saved path and never saves a rejected destination', async () => {
  const source = await fs.readFile(path.join(__dirname, '../src/main.cjs'), 'utf8');
  const pick = source.slice(source.indexOf('async function chooseClientFolder()'), source.indexOf('async function mutateClient('));
  let selection = 'D:\\Games\\Project Descension'; let rejectDestination = false;
  const context = { path: path.win32, process: { env: {} }, window: {}, config: { clientExecutable: 'Ascension.exe' }, settings: { installPath: 'C:\\Launcher' },
    app: { getPath: key => key === 'exe' ? 'C:\\Launcher\\launcher.exe' : 'C:\\Users\\Player' },
    nativeText: text => text,
    requireGameClosed: async directory => assert.equal(directory, selection),
    requireIdleClient: async validatePath => assert.equal(validatePath, false),
    dialog: { showOpenDialog: async () => ({ canceled: false, filePaths: [selection] }) },
    writableClient: directory => assert.equal(directory, selection),
    validateClientFolder: async () => { if (rejectDestination) throw new Error('unwritable'); },
    persist: async next => { context.settings = next; }, clientInfo: async () => ({ path: context.settings.installPath }),
    clientUpdater: { emit: () => {} }
  };
  vm.createContext(context); vm.runInContext(pick, context);
  assert.equal((await context.chooseClientFolder()).path, selection);
  const saved = selection; selection = 'C:\\Protected'; rejectDestination = true;
  await assert.rejects(context.chooseClientFolder(), /unwritable/);
  assert.equal(context.settings.installPath, saved);
});

test('folder layout permits siblings and dedicated child clients while protecting launcher files', async () => {
  const source = await fs.readFile(path.join(__dirname, '../src/main.cjs'), 'utf8');
  const code = source.slice(source.indexOf('function writableClient('), source.indexOf("app.setName("));
  const context = vm.createContext({ path: path.win32, app: { isPackaged: true, getPath: () => 'C:\\Games\\Launcher\\Conquest.exe' } });
  vm.runInContext(code, context);
  for (const folder of ['C:\\Games\\CoA', 'C:\\Games\\Launcher\\Client', 'C:\\Games\\Launcher\\Games\\CoA', 'C:\\Games\\Launcher-old']) assert.doesNotThrow(() => context.writableClient(folder));
  for (const folder of ['C:\\', 'C:\\Games', 'C:\\Games\\Launcher', 'C:\\Games\\Launcher\\resources\\Client', 'C:\\Games\\Launcher\\LOCALES', 'C:\\Games\\Launcher\\.coa-launcher']) assert.throws(() => context.writableClient(folder), /dedicated/);
});
