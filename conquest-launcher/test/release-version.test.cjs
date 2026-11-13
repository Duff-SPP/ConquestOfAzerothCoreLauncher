const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');

test('release metadata agrees and the current version has a changelog entry', async () => {
  const root = path.resolve(__dirname, '..');
  const pkg = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
  const lock = JSON.parse(await fs.readFile(path.join(root, 'package-lock.json'), 'utf8'));
  const app = await fs.readFile(path.join(root, 'public/app.js'), 'utf8');

  assert.match(pkg.version, /^\d+\.\d+\.\d+$/);
  assert.equal(lock.version, pkg.version);
  assert.equal(lock.packages[''].version, pkg.version);
  assert.ok(app.includes(`version: '${pkg.version}'`));
  assert.match(app, /Added multilingual launcher support with saved language selection for English, French, Spanish, Russian, and Simplified Chinese\./);
  assert.match(app, /Added launcher theme changing\./);
  assert.match(app, /Added update notifications for client releases and launcher updates\./);
});
