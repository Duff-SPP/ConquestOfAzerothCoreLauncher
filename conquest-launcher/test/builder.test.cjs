const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'public/builder/builder.js'), 'utf8');
function dataset() {
  const context = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'public/builder/data/coa-data.js'), 'utf8'), context);
  return context.window.COA_DATA;
}
test('Builder keeps the original 21-class, 3616-node dataset and resolves local asset names', () => {
  const data = dataset(), nodes = Object.values(data.entriesByTab).flat();
  assert.equal(data.classes.length, 21); assert.equal(nodes.length, 3616);
  assert.deepEqual(fs.readFileSync(path.join(root, 'public/builder/data/coa-data.js')), fs.readFileSync(path.join(root, '../CoA-Builder-Local-v0.1/data/coa-data.js')));
  const icons = new Set(fs.readdirSync(path.join(root, 'public/builder/assets/icons')).map(file => file.replace(/\.(png|jpg)$/i, '').toLowerCase()));
  const missing = [...new Set(nodes.filter(node => !icons.has(node.icon.toLowerCase())).map(node => node.icon))];
  assert.deepEqual(missing, ['inv_helm_crown_c_01_purple white']);
  assert.ok(fs.existsSync(path.join(root, 'public/builder/assets/icons/_missing.svg')));
  for (const cls of data.classes) {
    const slug = cls.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    assert.ok(fs.existsSync(path.join(root, `public/builder/assets/backgrounds/${slug}-1.jpg`)), cls.name);
  }
  assert.ok(nodes.find(node => node.id === 34445).connectedNodeIds.includes(7181));
  assert.ok(nodes.find(node => node.id === 7196).connectedNodeIds.includes(6451));
  assert.equal(/https?:\/\/(?!www\.w3\.org\/2000\/svg)|window\.prompt|history\.replaceState/.test(source), false);
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json')));
  assert.ok(pkg.build.files.some(item => item.filter?.includes('public/builder/**/*')));
});

test('purchase, all prerequisites, AE/TE gates, choices, ranks, budgets and downstream refund rules remain intact', () => {
  const fields = new Map(), storage = new Map();
  const element = { querySelector: selector => { if (!fields.has(selector)) fields.set(selector, { closest: () => ({}) }); return fields.get(selector); }, innerHTML: '', className: '' };
  const data = { classes: [{ id: 1, name: 'Test', tabs: [{ id: 1, name: 'Class' }, { id: 2, name: 'Spec' }] }], essenceByClass: { 1: { maxAbilityEssence: 3, maxTalentEssence: 3 } }, entriesByTab: {
    '1:1': [
      { id: 1, maxPoints: 2, aeCost: 1 },
      { id: 2, maxPoints: 1, aeCost: 1, connectedNodeIds: [1] },
      { id: 3, maxPoints: 1, aeCost: 1, requiredIds: [1, 2], reqTabAE: 2 },
    ],
    '1:2': [
      { id: 4, maxPoints: 2, teCost: 1, group: 1 },
      { id: 5, maxPoints: 1, teCost: 1, group: 1 },
      { id: 6, maxPoints: 1, teCost: 1, reqTabTE: 2 },
    ],
  } };
  const context = vm.createContext({ window: { COA_DATA: data }, document: { createElement: () => element }, localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) }, Map, Set });
  // Export internal functions only in this isolated test; the shipped code has no test bridge.
  const instrumented = source.replace('  boot();', `
    refreshSaveSelect = () => {}; refreshAll = () => {}; renderAll = () => {}; rebuildSpecSelect = () => {}; flash = () => {};
    currentSpec = specTabs(currentClass)[0];
    window.testBuilder = { invest, canInvest, tree, maps, hardRequirementMet, validateExistingState, compactBuild, applyBuild, loadSaves, storeSaves };
  `);
  vm.runInContext(instrumented, context); context.window.launcherBuilder.mount({ replaceChildren() {} });
  const b = context.window.testBuilder;
  assert.equal(b.canInvest(b.tree('class')[2], 'class'), false);
  b.invest('class', 2, 1); // Visual edges alone do not require node 1.
  assert.equal(b.maps().class.get(2), 1);
  assert.equal(b.hardRequirementMet(b.tree('class')[2], b.maps()), false);
  b.invest('class', 1, 1); b.invest('class', 3, 1);
  assert.equal(b.maps().class.get(3), 1);
  b.invest('class', 1, -1); assert.equal(b.maps().class.get(1), 1, 'downstream requirement prevents refund');
  b.invest('class', 1, 1); assert.equal(b.maps().class.get(1), 1, 'AE budget prevents extra rank');
  b.invest('class', 3, -1); b.invest('class', 1, 1); assert.equal(b.maps().class.get(1), 2);
  b.invest('class', 1, 1); assert.equal(b.maps().class.get(1), 2, 'rank limit');
  assert.equal(b.canInvest(b.tree('spec')[2], 'spec'), false);
  b.invest('spec', 4, 1); b.invest('spec', 5, 1);
  assert.equal(b.maps().spec.has(4), false); assert.equal(b.maps().spec.get(5), 1);
  b.invest('spec', 4, 1); b.invest('spec', 4, 1); b.invest('spec', 6, 1);
  assert.equal(b.maps().spec.get(6), 1);
  b.invest('spec', 4, -1); assert.equal(b.maps().spec.get(4), 2, 'TE gate prevents refund');
  const saved = JSON.stringify(b.compactBuild());
  for (const rank of [0.5, 'NaN', -1]) assert.throws(() => b.applyBuild({ c: 1, s: 2, a: [[1, rank]], t: [] }), /whole numbers/);
  b.storeSaves([{ id: 'sample', name: 'Test', build: b.compactBuild() }]);
  assert.equal(JSON.stringify(b.loadSaves()[0].build), saved);
  assert.throws(() => b.applyBuild({ c: 1, s: 2, a: [[3, 1]], t: [] }), /prerequisites/);
  assert.equal(JSON.stringify(b.compactBuild()), saved, 'failed import must preserve the previous build');
});
