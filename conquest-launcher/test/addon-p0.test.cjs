const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { AddonService } = require('../src/addons.cjs');
test('a failed addon replacement rolls back files and ownership and can be retried', () => fixture(async ({catalog, client, addon}) => {
  await addon('Rollback');
  await new AddonService(catalog).install('rollback', client);
  const installed = path.join(client, 'Interface', 'AddOns', 'Rollback', 'main.lua');
  const record = path.join(client, '.coa-launcher', 'addons.json');
  const before = await fs.readFile(record, 'utf8');
  await fs.writeFile(path.join(catalog, 'Rollback', 'main.lua'), '-- new release');
  const rename = fs.rename;
  let failed = false;
  fs.rename = async (from, to) => {
    if (!failed && String(from).includes('addon-stage') && to === installed) {
      failed = true; throw new Error('injected replacement failure');
    }
    return rename(from, to);
  };
  try { await assert.rejects(new AddonService(catalog).install('rollback', client), /injected replacement failure/); }
  finally { fs.rename = rename; }
  assert.equal(failed, true);
  assert.equal(await fs.readFile(installed, 'utf8'), '-- fixture');
  assert.equal(await fs.readFile(record, 'utf8'), before);
  await new AddonService(catalog).install('rollback', client);
  assert.equal(await fs.readFile(installed, 'utf8'), '-- new release');
}));
async function fixture(run) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'coa-p0-'));
  const catalog = path.join(root, 'catalog'), client = path.join(root, 'client');
  await fs.mkdir(catalog); await fs.mkdir(client);
  const addon = async (name, headers = '', extension = '.toc') => {
    const folder = path.join(catalog, name); await fs.mkdir(folder);
    await fs.writeFile(path.join(folder, name + extension), '## Title: ' + name + '\n' + headers);
    await fs.writeFile(path.join(folder, 'main.lua'), '-- fixture');
  };
  try { await run({ root, catalog, client, addon }); }
  finally { assert.equal(path.dirname(root), os.tmpdir()); await fs.rm(root, { recursive: true, force: true }); }
}
test('hard dependencies are ordered/deduplicated, optional/loading metadata preserved, update/uninstall preserve player files', () => fixture(async ({catalog, client, addon}) => {
  await addon('Ascension_Collections');
  await addon('AscensionUI', '## Dependencies: Ascension_Collections');
  await addon('Ascension_EnchantCollection', '## Dependencies: Ascension_Collections, AscensionUI\n## OptionalDeps: MissingOptional\n## LoadOnDemand: 1\n## LoadWith: MissingLoadWith');
  await addon('Blizzard_Private'); await addon('DevOnly', '', '.toc.dev');
  const service = new AddonService(catalog), data = await service.catalog();
  assert.equal(data.folderCount, 3);
  const pkg = data.byId.get('ascension-enchantcollection');
  assert.deepEqual(pkg.tocMetadata[0].optionalDependencies, ['MissingOptional']);
  assert.equal(pkg.tocMetadata[0].loadOnDemand, true);
  assert.deepEqual((await service.planInstall(pkg.id, client)).map(p=>p.id), ['ascension-collections','ascensionui',pkg.id]);
  await service.install(pkg.id, client);
  assert.deepEqual((await service.planInstall(pkg.id, client)).map(p=>p.id), [pkg.id]);
  await assert.rejects(service.uninstall('ascension-collections', client), /required by/);
  const folder = path.join(client,'Interface','AddOns','Ascension_EnchantCollection');
  await fs.writeFile(path.join(folder,'my-notes.txt'),'player');
  await service.install(pkg.id, client);
  assert.equal(await fs.readFile(path.join(folder,'my-notes.txt'),'utf8'),'player');
  await fs.writeFile(path.join(folder,'main.lua'),'-- edited by player');
  assert.equal((await service.uninstall(pkg.id, client)).preservedFiles, 1);
  assert.equal(await fs.readFile(path.join(folder,'main.lua'),'utf8'),'-- edited by player');
  assert.equal(await fs.readFile(path.join(folder,'my-notes.txt'),'utf8'),'player');
}));
test('missing dependencies and cycles fail before writes, unmanaged files are not adopted', () => fixture(async ({catalog, client, addon}) => {
  await addon('Missing', '## Dependencies: Absent');
  await addon('CycleA', '## Dependencies: CycleB'); await addon('CycleB','## Dependencies: CycleA');
  await addon('Manual'); const service = new AddonService(catalog);
  await assert.rejects(service.install('missing', client), /missing addon Absent/);
  await assert.rejects(service.install('cyclea', client), /cycle/);
  const folder=path.join(client,'Interface','AddOns','Manual');await fs.mkdir(folder,{recursive:true});
  await fs.writeFile(path.join(folder,'main.lua'),'player');
  await assert.rejects(service.install('manual', client), /Unmanaged/);
  await assert.rejects(service.uninstall('manual', client), /not owned/);
}));
test('manual reverse dependencies block removal; junctions cannot redirect writes', () => fixture(async ({root,catalog,client,addon}) => {
  await addon('Provider');const service=new AddonService(catalog);await service.install('provider',client);
  const manual=path.join(client,'Interface','AddOns','PlayerAddon');await fs.mkdir(manual);
  await fs.writeFile(path.join(manual,'PlayerAddon.toc'),'## Dependencies: Provider');
  await assert.rejects(service.uninstall('provider',client),/PlayerAddon/);
  const linked=path.join(root,'linked-client');await fs.mkdir(linked);
  await fs.symlink(path.join(client,'Interface'),path.join(linked,'Interface'),process.platform==='win32'?'junction':'dir');
  try { await assert.rejects(service.install('provider',linked),/Linked/); }
  finally { await fs.unlink(path.join(linked,'Interface')); }
}));

test('repair backs up modified owned files and refuses to overwrite a damaged backup', () => fixture(async ({catalog,client,addon}) => {
  await addon('Edited'); const service=new AddonService(catalog);await service.install('edited',client);
  const target=path.join(client,'Interface/AddOns/Edited/main.lua');await fs.writeFile(target,'player fixes');
  const hash=require('node:crypto').createHash('sha256').update('player fixes').digest('hex');
  const backup=path.join(client,'.coa-launcher/preserved-addons',hash,'Interface/AddOns/Edited/main.lua');
  assert.equal((await service.install('edited',client)).preservedFiles,1);
  assert.equal(await fs.readFile(backup,'utf8'),'player fixes');
  assert.equal(await fs.readFile(target,'utf8'),'-- fixture');
  await fs.writeFile(target,'player fixes');await fs.writeFile(backup,'damaged backup');
  await assert.rejects(service.install('edited',client),/verify addon backup/);
  assert.equal(await fs.readFile(target,'utf8'),'player fixes');
}));

test('custom catalog dependency is reused without adoption and its own missing dependencies are checked', () => fixture(async ({catalog,client,addon}) => {
 await addon('Library');await addon('Consumer','## Dependencies: Library');
 const local=path.join(client,'Interface/AddOns/Library');await fs.mkdir(local,{recursive:true});
 await fs.writeFile(path.join(local,'Library.toc'),'## Title: My library');await fs.writeFile(path.join(local,'main.lua'),'custom library');
 const service=new AddonService(catalog);assert.deepEqual((await service.planInstall('consumer',client)).map(p=>p.id),['consumer']);
 await service.install('consumer',client);assert.equal(await fs.readFile(path.join(local,'main.lua'),'utf8'),'custom library');
 const record=JSON.parse(await fs.readFile(path.join(client,'.coa-launcher/addons.json'),'utf8'));assert.equal(record.packages.library,undefined);
 await fs.writeFile(path.join(local,'Library.toc'),'## Dependencies: MissingLibrary');
 await assert.rejects(service.planInstall('consumer',client),/MissingLibrary/);
}));

test('damaged ownership leaves inventory readable but management blocked without changing metadata', () => fixture(async ({catalog,client,addon}) => {
 await addon('Listed');const service=new AddonService(catalog);await service.install('listed',client);
 const record=path.join(client,'.coa-launcher/addons.json');
 for(const contents of ['{broken',JSON.stringify({schema:1,packages:{listed:[{path:'../unsafe',sha256:'a'.repeat(64)}]}})]){
  await fs.writeFile(record,contents);const result=await service.list(client);
  assert.equal(result.packages.find(p=>p.id==='listed').status,'installed');assert.equal(result.packages[0].managed,false);
  assert.equal(result.packages[0].managementBlocked,true);assert.equal(result.warnings.length,1);
  await assert.rejects(service.install('listed',client));await assert.rejects(service.uninstall('listed',client));
  assert.equal(await fs.readFile(record,'utf8'),contents);
  assert.equal(await fs.readFile(path.join(client,'Interface/AddOns/Listed/main.lua'),'utf8'),'-- fixture');
 }
}));
