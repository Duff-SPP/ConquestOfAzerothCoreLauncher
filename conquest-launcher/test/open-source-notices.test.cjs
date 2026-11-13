const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');

test('launcher credits identify the original author and distinguish license from third-party assets', async () => {
  const app = await fs.readFile(path.join(root, 'conquest-launcher/public/app.js'), 'utf8');
  const match = app.match(/function launcherCreditsHtml\(\) \{[\s\S]*?\n\}/);
  assert.ok(match, 'A reusable credits notice must be rendered by the launcher');
  const context = { t: text => text, lh: (parts, ...values) => parts.reduce((all, part, i) => all + part + (values[i] || ''), '') };
  vm.runInNewContext(match[0], context);
  const html = context.launcherCreditsHtml();
  assert.match(html, /Originally developed by Duff \(Duff-SPP\)/);
  assert.match(html, /GPLv3/);
  assert.match(html, /no warranty/i);
  assert.match(html, /third.party/i);
  const updates = await fs.readFile(path.join(root, 'conquest-launcher/public/updates.js'), 'utf8');
  assert.match(updates.slice(updates.indexOf("if (tab === 'about')"), updates.indexOf("} else if (tab === 'launcher')")), /launcherCreditsHtml\(\)/);
});

test('distributions receive complete license and attribution files without compiling', async t => {
  const { copyLegalNotices } = require('../tools/production-bundles.cjs');
  assert.equal(typeof copyLegalNotices, 'function');
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'coa-license-'));
  t.after(() => fs.rm(folder, { recursive: true, force: true }));
  await copyLegalNotices(folder);
  for (const file of ['LICENSE', 'COPYING', 'ATTRIBUTION.md', 'THIRD_PARTY_NOTICES.md']) {
    assert.deepEqual(await fs.readFile(path.join(folder, 'public/licenses', file)), await fs.readFile(path.join(root, file)));
  }
  assert.match(await fs.readFile(path.join(root, 'COPYING'), 'utf8'), /GNU GENERAL PUBLIC LICENSE[\s\S]*Version 3/);
  assert.match(await fs.readFile(path.join(root, 'ATTRIBUTION.md'), 'utf8'), /7\(b\)[\s\S]*7\(c\)/);
  const pkg = JSON.parse(await fs.readFile(path.join(root, 'conquest-launcher/package.json'), 'utf8'));
  assert.ok(pkg.build.files.find(item => typeof item === 'object' && item.filter.includes('public/licenses/**/*')));
  const project = await fs.readFile(path.join(root, 'Conquest-Launcher-Backend/Conquest.Launcher.Backend.csproj'), 'utf8');
  assert.match(project, /\.\.\/COPYING/);
});

test('local legal view displays bundled texts as escaped content without depending on GitHub', async () => {
  const app = await fs.readFile(path.join(root, 'conquest-launcher/public/app.js'), 'utf8');
  const match = app.match(/async function showLegalNotices\(\) \{[\s\S]*?\n\}/);
  assert.ok(match, 'An offline license view is required');
  let rendered = '';
  const context = { t: text => text, api: { legalNotices: async () => [{ name: 'ATTRIBUTION.md', text: '<script>unsafe</script> Originally developed by Duff (Duff-SPP)' }] }, escape: text => String(text).replaceAll('<','&lt;').replaceAll('>','&gt;'), modalHeader: () => '', openModal: html => { rendered = html; }, lh: (parts,...values) => parts.reduce((all,part,i) => all+part+(values[i]||''),'') };
  vm.runInNewContext(match[0], context);
  await context.showLegalNotices();
  assert.match(rendered, /Duff \(Duff-SPP\)/);
  assert.match(rendered, /&lt;script&gt;/);
  assert.doesNotMatch(rendered, /<script>/);
});
