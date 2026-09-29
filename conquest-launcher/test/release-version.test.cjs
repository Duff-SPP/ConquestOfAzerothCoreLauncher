const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');

test('0.6.9 release metadata and changelog stay aligned', async () => {
  const root = path.resolve(__dirname, '..');
  const pkg = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
  const lock = JSON.parse(await fs.readFile(path.join(root, 'package-lock.json'), 'utf8'));
  const app = await fs.readFile(path.join(root, 'public/app.js'), 'utf8');

  assert.equal(pkg.version, '0.6.9');
  assert.equal(lock.version, '0.6.9');
  assert.equal(lock.packages[''].version, '0.6.9');
  assert.match(app, /version: '0\.6\.9'/);
  assert.match(app, /Added multilingual launcher support with saved language selection for English, French, Spanish, Russian, and Simplified Chinese\./);
  assert.match(app, /Added launcher theme changing\./);
  assert.match(app, /Added update notifications for client releases and launcher updates\./);
});
