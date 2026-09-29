const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { AddonService } = require('../src/addons.cjs');

const catalogRoot = path.resolve(__dirname, '../src/assets/AddonCatalog');

test('catalog groups bundled addon suites without losing folders', async () => {
  const service = new AddonService(catalogRoot);
  const catalog = await service.catalog();
  const bundledFolders = [];
  for (const entry of await fs.readdir(catalogRoot, { withFileTypes: true })) {
    if (entry.isDirectory() && !/^Blizzard_/i.test(entry.name) && (await fs.readdir(path.join(catalogRoot, entry.name))).some(name => /\.toc$/i.test(name))) bundledFolders.push(entry.name);
  }
  bundledFolders.sort();
  const groupedFolders = catalog.packages.flatMap(item => item.folders).sort();
  assert.equal(catalog.folderCount, bundledFolders.length);
  assert.deepEqual(groupedFolders, bundledFolders, 'Every bundled addon folder must belong to exactly one package');
  assert.equal(catalog.byId.get('weakauras').folders.length, 6);
  assert.equal(catalog.byId.get('dbm').folders.length, 25);
  assert.deepEqual(service.dependencyOrder(catalog, 'altoholic').map(item => item.id), ['datastore', 'altoholic']);
});

test('install and uninstall copy only the selected package', async () => {
  const service = new AddonService(catalogRoot);
  const client = await fs.mkdtemp(path.join(os.tmpdir(), 'coa-addon-test-'));
  try {
    await fs.writeFile(path.join(client, 'Ascension.exe'), 'test');
    await service.install('apidocumentation', client);
    let list = await service.list(client);
    assert.equal(list.packages.find(item => item.id === 'apidocumentation').status, 'installed');
    await service.uninstall('apidocumentation', client);
    list = await service.list(client);
    assert.equal(list.packages.find(item => item.id === 'apidocumentation').status, 'not-installed');
  } finally {
    await fs.rm(client, { recursive: true, force: true });
  }
});

test('required catalog dependencies cannot be removed underneath installed addons', async () => {
  const service = new AddonService(catalogRoot);
  const catalog = await service.catalog();
  const client = await fs.mkdtemp(path.join(os.tmpdir(), 'coa-addon-blocker-'));
  const addons = path.join(client, 'Interface', 'AddOns');
  try {
    await fs.mkdir(addons, { recursive: true });
    for (const id of ['datastore', 'altoholic']) {
      for (const folder of catalog.byId.get(id).folders) { await fs.mkdir(path.join(addons, folder), { recursive: true }); await fs.writeFile(path.join(addons, folder, folder + '.toc'), id === 'altoholic' ? '## Dependencies: DataStore' : '## Title: DataStore'); }
    }
    await assert.rejects(() => service.uninstall('datastore', client), /required by Altoholic/);
  } finally {
    await fs.rm(client, { recursive: true, force: true });
  }
});
