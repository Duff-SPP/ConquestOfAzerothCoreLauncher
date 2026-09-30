const { test } = require('node:test');
const assert = require('node:assert/strict');
const { isGameRunning } = require('../src/game-safety.cjs');

test('detects Ascension with native tasklist without PowerShell', async () => {
  const calls = [];
  const running = await isGameRunning('C:\\Game', {
    platform: 'win32',
    run: async (file, args, options) => {
      calls.push({ file, args, options });
      return { stdout: '"Ascension.exe","1234","Console","1","500,000 K"\r\n' };
    }
  });

  assert.equal(running, true);
  assert.equal(calls.length, 1);
  assert.match(calls[0].file, /System32[\\/]tasklist\.exe$/i);
  assert.deepEqual(calls[0].args, ['/FI', 'IMAGENAME eq Ascension.exe', '/FO', 'CSV', '/NH']);
  assert.equal(calls[0].options.windowsHide, true);
});

test('falls through to Wow.exe and reports no process when tasklist is empty', async () => {
  const filters = [];
  const running = await isGameRunning('C:\\Game', {
    platform: 'win32',
    run: async (_file, args) => {
      filters.push(args[1]);
      return { stdout: 'INFO: No tasks are running which match the specified criteria.\r\n' };
    }
  });

  assert.equal(running, false);
  assert.deepEqual(filters, ['IMAGENAME eq Ascension.exe', 'IMAGENAME eq Wow.exe']);
});

test('does not probe processes outside Windows or without a client root', async () => {
  let calls = 0;
  const run = async () => { calls++; return { stdout: '' }; };
  assert.equal(await isGameRunning('C:\\Game', { platform: 'linux', run }), false);
  assert.equal(await isGameRunning('', { platform: 'win32', run }), false);
  assert.equal(calls, 0);
});
