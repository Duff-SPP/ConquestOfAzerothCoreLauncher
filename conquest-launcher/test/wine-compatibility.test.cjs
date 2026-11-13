const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { configureWineCompatibility } = require('../src/wine-compatibility.cjs');
const { defaults, sanitize, saveSettings, readSettings } = require('../src/settings.cjs');

test('Wine option defaults off and survives a settings restart with strict boolean validation', async t => {
  assert.equal(defaults.wineCompatibility, false);
  for (const value of ['true', 1, null, {}]) assert.equal(sanitize({ wineCompatibility: value }).wineCompatibility, false);
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'coa-wine-settings-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const file = path.join(root, 'settings.json');
  await saveSettings(file, { wineCompatibility: true });
  assert.equal((await readSettings(file)).wineCompatibility, true);
  await saveSettings(file, { wineCompatibility: false });
  assert.equal((await readSettings(file)).wineCompatibility, false);
});

test('Wine override preserves its baseline across repeated launches and restores it when disabled', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'coa-wine-override-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  for (const previous of [null, '', 'n,b']) {
    const stateFile = path.join(root, 'override.json');
    let current = previous;
    const options = { platform: 'win32', stateFile, run: async (file, args, flags) => {
      assert.match(file, /System32[\\/]reg\.exe$/i);
      assert.equal(flags.windowsHide, true);
      if (args[1] === 'HKCU\\Software\\Wine') return { stdout: '' };
      assert.equal(args[1], 'HKCU\\Software\\Wine\\AppDefaults\\Ascension.exe\\DllOverrides');
      assert.equal(args[3], 'divxtac');
      if (args[0] === 'query') {
        if (current === null) throw Object.assign(new Error('missing'), { code: 1 });
        return { stdout: `\r\n    divxtac    REG_SZ    ${current}\r\n` };
      }
      if (args[0] === 'add') current = args[7];
      else if (args[0] === 'delete') current = null;
      else assert.fail('Unexpected registry command');
      return { stdout: '' };
    } };
    await configureWineCompatibility('C:\\Game\\Ascension.exe', true, options);
    assert.equal(current, 'd');
    await configureWineCompatibility('C:\\Game\\Ascension.exe', true, options);
    assert.equal(JSON.parse(await fs.readFile(stateFile, 'utf8')).previous, previous);
    await configureWineCompatibility('C:\\Game\\Ascension.exe', false, options);
    assert.equal(current, previous);
    await assert.rejects(fs.stat(stateFile), { code: 'ENOENT' });
  }
});

test('native Windows receives no override, and disabled settings without ownership do not query registry', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'coa-wine-native-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  let calls = 0;
  const options = { platform: 'win32', stateFile: path.join(root, 'override.json'), run: async (_file, args) => {
    calls++;
    assert.deepEqual(args, ['query', 'HKCU\\Software\\Wine']);
    throw Object.assign(new Error('Wine key not present'), { code: 1 });
  } };
  await configureWineCompatibility('C:\\Game\\Ascension.exe', false, options);
  assert.equal(calls, 0);
  await configureWineCompatibility('C:\\Game\\Ascension.exe', true, options);
  assert.equal(calls, 1);
  await assert.rejects(fs.stat(options.stateFile), { code: 'ENOENT' });
});

test('disabling preserves subsequent manual Wine changes; failed writes keep the restore record', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'coa-wine-failure-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const stateFile = path.join(root, 'override.json');
  await fs.writeFile(stateFile, JSON.stringify({ version: 1, previous: 'b' }));
  const options = { platform: 'win32', stateFile, run: async (_file, args) => {
    if (args[0] !== 'query') throw new Error('write denied');
    return { stdout: args.length === 2 ? '' : '    divxtac    REG_SZ    n,b\r\n' };
  } };
  await configureWineCompatibility('C:\\Game\\Ascension.exe', false, options);
  await assert.rejects(fs.stat(stateFile), { code: 'ENOENT' });
  await assert.rejects(configureWineCompatibility('C:\\Game\\Ascension.exe', true, options), /write denied/);
  assert.equal(JSON.parse(await fs.readFile(stateFile, 'utf8')).previous, 'n,b');
});
