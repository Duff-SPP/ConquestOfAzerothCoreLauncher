const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '../src/main.cjs'), 'utf8');

test('client and account services use Electron Chromium networking', () => {
  assert.match(source, /const electronFetch = \(input, init\) => net\.fetch\(input, init\);/);
  assert.match(source, /new ClientUpdater\(config\.manifestUrl, \{ fetchImpl: electronFetch,/);
  assert.match(source, /new Portal\(config\.apiBaseUrl, \{\s*fetchImpl: electronFetch,/);
});
