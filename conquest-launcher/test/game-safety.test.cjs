const { test } = require('node:test');
const assert = require('node:assert/strict');
const { isGameRunning } = require('../src/game-safety.cjs');
const probe = (paths, root = 'C:\\Games\\CoA') => isGameRunning(root, {
  platform: 'win32', listProcesses: async () => paths.map(ExecutablePath => ({ ExecutablePath }))
});

test('detects only games in the selected client, with Windows casing and separators', async () => {
  for (const executable of ['C:\\Games\\CoA\\Ascension.exe', 'c:/games/coa/WOW.EXE']) {
    assert.equal(await probe([executable]), true);
  }
  assert.equal(await probe(['C:\\Games\\Other\\Ascension.exe', 'C:\\Games\\CoA-old\\Wow.exe', 'C:\\Games\\CoA\\nested\\Ascension.exe']), false);
  assert.equal(await probe([null, '', 'Ascension.exe']), false);
  assert.equal(await probe([]), false);
});

test('queries full process paths without requiring a shell or JSON response', async () => {
  const root = "C:\\Games\\Player's $client & test";
  assert.equal(await isGameRunning(root, { platform: 'win32', listProcesses: async () => {
    return [{ ExecutablePath: root + '\\Ascension.exe' }];
  }}), true);
});

test('skips unsupported platforms and unset roots, and propagates query failures', async () => {
  const listProcesses = async () => { throw new Error('query denied'); };
  assert.equal(await isGameRunning('C:\\Game', { platform: 'linux', listProcesses }), false);
  assert.equal(await isGameRunning('', { platform: 'win32', listProcesses }), false);
  await assert.rejects(isGameRunning('C:\\Game', { platform: 'win32', listProcesses }), /query denied/);
  await assert.rejects(isGameRunning('C:\\Game', { platform: 'win32', listProcesses: async () => null }), /invalid game process list/);
  assert.equal(await probe([]), false);
});

test('read-only realmlist is updated with a backup; persistent denial gives actionable feedback', async t => {
  const fsp = require('node:fs/promises'), path = require('node:path'), os = require('node:os');
  const { configureRealm } = require('../src/game-safety.cjs');
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'coa-realm-'));
  const file = path.join(root, 'Data', 'enUS', 'realmlist.wtf');
  await fsp.mkdir(path.dirname(file), { recursive: true });
  await fsp.writeFile(file, 'set realmlist old.invalid');
  t.after(async () => { await fsp.chmod(file, 0o600); await fsp.rm(root, { recursive: true, force: true }); });
  await fsp.chmod(file, 0o444);
  await configureRealm(root, 'logon.coa-development.org');
  assert.equal(await fsp.readFile(file, 'utf8'), 'set realmlist logon.coa-development.org');
  assert.equal(await fsp.readFile(path.join(root, '.coa-launcher/realmlist-backups/Data/enUS/realmlist.wtf'), 'utf8'), 'set realmlist old.invalid');
  const writeFile = fsp.writeFile;
  fsp.writeFile = async (target, ...args) => { if (target === file) throw Object.assign(new Error('denied'), { code: 'EPERM' }); return writeFile(target, ...args); };
  try { await assert.rejects(configureRealm(root, 'other.invalid'), /Cannot update the game realmlist.*Close the game/); }
  finally { fsp.writeFile = writeFile; }
  assert.equal(await fsp.readFile(file, 'utf8'), 'set realmlist logon.coa-development.org');
});
