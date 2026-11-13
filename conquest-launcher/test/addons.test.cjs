const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { AddonService } = require('../src/addons.cjs');

test('bundled addon catalog is intentionally empty', async () => {
  const catalog = await new AddonService(path.resolve(__dirname, '../src/assets/AddonCatalog')).catalog();
  assert.equal(catalog.packages.length, 0);
});

test('retired packages remain uninstallable without offering downloads and preserve changed files', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'coa-retired-addon-'));
  try {
    const catalog = path.join(root, 'catalog'), client = path.join(root, 'client');
    await fs.mkdir(path.join(catalog, 'OldAddon'), {recursive:true});
    await fs.mkdir(client);
    await fs.writeFile(path.join(client, 'Ascension.exe'), 'fixture');
    await fs.writeFile(path.join(catalog, 'OldAddon', 'OldAddon.toc'), '## Title: OldAddon');
    await fs.writeFile(path.join(catalog, 'OldAddon', 'main.lua'), '-- original');
    await new AddonService(catalog).install('oldaddon', client);
    await fs.rm(path.join(catalog, 'OldAddon'), {recursive:true});
    const service = new AddonService(catalog);
    const items = (await service.list(client, true)).packages;
    assert.equal(items.length, 1);
    assert.equal(items[0].catalog, false);
    assert.equal(items[0].managed, true);
    assert.equal(items[0].status, 'installed');
    const inspect = service.installedState;
    service.installedState = async () => { throw new Error('access denied'); };
    assert.equal((await service.list(client)).packages[0].status, 'unreadable');
    service.installedState = inspect;
    await assert.rejects(service.install('oldaddon', client), /not found/);
    const installed = path.join(client, 'Interface', 'AddOns', 'OldAddon');
    await fs.writeFile(path.join(installed, 'main.lua'), '-- player edit');
    const removed = await service.uninstall('oldaddon', client);
    assert.equal(removed.preservedFiles, 1);
    assert.equal(await fs.readFile(path.join(installed, 'main.lua'), 'utf8'), '-- player edit');
    await assert.rejects(fs.stat(path.join(installed, 'OldAddon.toc')), {code:'ENOENT'});
    assert.equal((await service.list(client)).packages[0].managed, true);
    await service.uninstall('oldaddon', client, true);
    await assert.rejects(fs.stat(path.join(installed, 'main.lua')), {code:'ENOENT'});
  } finally { await fs.rm(root, {recursive:true,force:true}); }
});

test('release catalog index ignores obsolete folders left by launcher upgrades', async () => {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'coa-catalog-upgrade-'));
  try {
    await fs.mkdir(path.join(root,'OldAddon'));
    await fs.writeFile(path.join(root,'OldAddon','OldAddon.toc'),'## Title: Old addon');
    await fs.writeFile(path.join(root,'catalog-index.json'),JSON.stringify({schema:1,folders:[]}));
    assert.equal((await new AddonService(root).catalog()).packages.length,0);
    await fs.mkdir(path.join(root,'NewAddon'));
    await fs.writeFile(path.join(root,'NewAddon','NewAddon.toc'),'## Title: New addon');
    await fs.writeFile(path.join(root,'catalog-index.json'),JSON.stringify({schema:1,folders:['NewAddon']}));
    const catalog=await new AddonService(root).catalog();
    assert.deepEqual(catalog.packages.map(pkg=>pkg.id),['newaddon']);
  } finally {await fs.rm(root,{recursive:true,force:true});}
});
