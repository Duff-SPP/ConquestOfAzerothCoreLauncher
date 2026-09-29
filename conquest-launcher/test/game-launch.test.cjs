const { test } = require('node:test');
const assert = require('node:assert/strict');
const { launchGame } = require('../src/game-launch.cjs');

test('shell launch keeps special-character paths literal and sets the working directory', async () => {
  const executable = "C:\\Games\\Player's $client & test\\Ascension.exe";
  const pid = await launchGame(executable, { run: async (file, args, options) => {
    assert.match(file, /WindowsPowerShell\\v1\.0\\powershell\.exe$/);
    assert.equal(options.windowsHide, true);
    assert.equal(options.cwd, "C:\\Games\\Player's $client & test");
    const script = Buffer.from(args.at(-1), 'base64').toString('utf16le');
    assert.match(script, /UseShellExecute = \$true/);
    const encodedPaths = [...script.matchAll(/FromBase64String\('([^']+)'\)/g)].map(match => Buffer.from(match[1], 'base64').toString('utf8'));
    assert.deepEqual(encodedPaths, [executable, options.cwd]);
    assert.doesNotMatch(script, /Kill\(|WaitForExit|RedirectStandard/);
    return { stdout: '{"ok":true,"pid":4321}' };
  } });
  assert.equal(pid, 4321);
});

test('shell launch reports cancellation, access denial, missing files and invalid results', async () => {
  for (const [result, message] of [
    [{ ok: false, code: 1223 }, /cancelled/],
    [{ ok: false, code: 5 }, /denied access/],
    [{ ok: false, code: 2 }, /could not find/],
    [{ ok: false, code: 193, message: 'Invalid executable' }, /Invalid executable/],
    [{ ok: true, pid: 0 }, /No game process/]
  ]) {
    await assert.rejects(launchGame('C:\\Game\\Ascension.exe', {
      run: async () => ({ stdout: JSON.stringify(result) })
    }), message);
  }
  await assert.rejects(launchGame('C:\\Game\\Ascension.exe', {
    run: async () => ({ stdout: 'not json' })
  }), /unreadable/);
  await assert.rejects(launchGame('C:\\Game\\Ascension.exe', {
    run: async () => { throw Object.assign(new Error(), { code: 'ENOENT' }); }
  }), /helper failed \(ENOENT\)/);
});

test('only elevation-required retries with runas, and cancellation does not retry', async () => {
  for (const cancelled of [false, true]) {
    let calls = 0;
    const pending = launchGame('C:\\Game\\Ascension.exe', { run: async (_file, args) => {
      const script = Buffer.from(args.at(-1), 'base64').toString('utf16le');
      assert.ok(script.includes(calls === 0 ? "$start.Verb = 'open'" : "$start.Verb = 'runas'"));
      calls++;
      return { stdout: JSON.stringify(calls === 1 ? { ok: false, code: 740 } : cancelled ? { ok: false, code: 1223 } : { ok: true, pid: 42 }) };
    } });
    if (cancelled) await assert.rejects(pending, /cancelled/);
    else assert.equal(await pending, 42);
    assert.equal(calls, 2);
  }
  let calls = 0;
  await assert.rejects(launchGame('C:\\Game\\Ascension.exe', { run: async () => {
    calls++;
    return { stdout: '{"ok":false,"code":5}' };
  } }), /denied access/);
  assert.equal(calls, 1);
});
