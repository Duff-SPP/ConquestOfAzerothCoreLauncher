const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { createHash } = require('node:crypto');
const { AddonService } = require('../src/addons.cjs');

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'coa-mandatory-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const catalog = path.join(root, 'catalog'), client = path.join(root, 'client');
  await fs.mkdir(catalog); await fs.mkdir(client);
  for (const name of ['Required', 'Dependency', 'Optional', 'Blizzard_TalentUI', 'Development']) {
    await fs.mkdir(path.join(catalog, name));
    if (name !== 'Blizzard_TalentUI') await fs.writeFile(path.join(catalog, name, name + (name === 'Development' ? '.toc.dev' : '.toc')), `## Title: ${name}\n${name === 'Required' ? '## Dependencies: Dependency\n' : ''}`);
    await fs.writeFile(path.join(catalog, name, 'main.lua'), 'catalog ' + name);
  }
  const service = () => new AddonService(catalog, { mandatoryFolders: ['Required', 'Blizzard_TalentUI'], assetFolders: ['Blizzard_TalentUI'] });
  return { catalog, client, service };
}

test('mandatory install handles dependencies and explicit Blizzard assets, skips optional and dev addons', async t => {
  const f = await fixture(t), service = f.service();
  const result = await service.installMandatory(f.client);
  assert.deepEqual(result.installedPackages, ['blizzard-talentui', 'dependency', 'required']);
  await assert.rejects(fs.stat(path.join(f.client, 'Interface/AddOns/Optional')), { code: 'ENOENT' });
  assert.equal((await service.catalog()).packages.some(p => p.id === 'development'), false);
  assert.equal(await fs.readFile(path.join(f.client, 'Interface/AddOns/Blizzard_TalentUI/main.lua'), 'utf8'), 'catalog Blizzard_TalentUI');
  await assert.rejects(service.uninstall('required', f.client), /mandatory/);
  await assert.rejects(service.uninstall('dependency', f.client), /required by/);
  const target = path.join(f.client, 'Interface/AddOns/Required/main.lua');
  const before = await fs.stat(target);
  await service.installMandatory(f.client);
  assert.equal((await fs.stat(target)).mtimeMs, before.mtimeMs);
});

test('mandatory updates preserve custom bytes and account data before replacing conflicting files', async t => {
  const f = await fixture(t);
  const target = path.join(f.client, 'Interface/AddOns/Required/main.lua');
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, 'player customization');
  await fs.writeFile(path.join(path.dirname(target), 'personal.lua'), 'unrelated file');
  await fs.mkdir(path.join(f.client, 'WTF/Account'), { recursive: true });
  await fs.writeFile(path.join(f.client, 'WTF/Account/settings.lua'), 'account settings');
  const result = await f.service().installMandatory(f.client);
  assert.equal(result.preservedFiles, 1);
  const hash = createHash('sha256').update('player customization').digest('hex');
  assert.equal(await fs.readFile(path.join(f.client, `.coa-launcher/preserved-addons/${hash}/Interface/AddOns/Required/main.lua`), 'utf8'), 'player customization');
  assert.equal(await fs.readFile(target, 'utf8'), 'catalog Required');
  await fs.writeFile(path.join(f.catalog, 'Required/main.lua'), 'new mandatory release');
  await f.service().installMandatory(f.client);
  assert.equal(await fs.readFile(target, 'utf8'), 'new mandatory release');
  assert.equal(await fs.readFile(path.join(f.client, 'WTF/Account/settings.lua'), 'utf8'), 'account settings');
  assert.equal(await fs.readFile(path.join(path.dirname(target), 'personal.lua'), 'utf8'), 'unrelated file');
});

test('missing mandatory folders fail before installation and shipped mandatory list resolves', async t => {
  const f = await fixture(t);
  await assert.rejects(new AddonService(f.catalog, { mandatoryFolders: ['Missing'] }).installMandatory(f.client), /Mandatory addon is missing/);
  assert.deepEqual(await fs.readdir(f.client), []);
  const config = require('../launcher.config.json');
  const service = new AddonService(path.resolve(__dirname, '../src/assets/AddonCatalog'), { mandatoryFolders: config.mandatoryAddons, assetFolders: config.mandatoryAssetFolders });
  const catalog = await service.catalog();
  const mandatory = catalog.packages.filter(p => p.mandatory);
  assert.equal(mandatory.length, 0);
  assert.deepEqual(config.mandatoryAddons, []);
  assert.equal(mandatory.some(p => p.primaryFolder === 'Ascension_RotationStudio'), false);
  assert.equal((await service.planInstall(mandatory.map(p => p.id), f.client)).length, 0);
});

test('inventory lists custom, catalog and no-TOC folders without adopting or modifying them', async t => {
  const f = await fixture(t);
  const root = path.join(f.client, 'Interface/AddOns');
  await fs.mkdir(path.join(root, 'Optional'), {recursive:true});
  await fs.writeFile(path.join(root,'Optional/Optional.toc'),'## Title: Custom optional\n## Version: player');
  await fs.writeFile(path.join(root,'Optional/main.lua'),'my changes');
  await fs.mkdir(path.join(root,'MyAddon'));
  await fs.writeFile(path.join(root,'MyAddon/MyAddon.toc'),'## Title: My addon\n## Version: 42');
  await fs.mkdir(path.join(root,'AssetsOnly'));
  const service = new AddonService(f.catalog);
  const result = await service.list(f.client);
  assert.equal(result.packages.find(p=>p.id==='optional').status,'installed');
  const verified = await service.list(f.client, true);
  assert.equal(verified.packages.find(p=>p.id==='optional').status,'update');
  assert.equal(result.packages.find(p=>p.id==='optional').managed,false);
  assert.equal(result.packages.find(p=>p.id==='local:MyAddon').installedVersion,'42');
  assert.equal(result.packages.find(p=>p.id==='local:AssetsOnly').status,'unknown');
  assert.equal(await fs.readFile(path.join(root,'Optional/main.lua'),'utf8'),'my changes');
  await assert.rejects(fs.stat(path.join(f.client,'.coa-launcher/addons.json')), {code:'ENOENT'});
  assert.deepEqual(await service.installMandatory(f.client), {installedPackages:[],preservedFiles:0});
});
