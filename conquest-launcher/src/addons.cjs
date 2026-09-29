const fs = require('node:fs/promises');
const path = require('node:path');
const { constants } = require('node:fs');
const { safePath, filePath, statOrNull, hashFile } = require('./release-format.cjs');
const { AddonStorage, tree } = require('./addon-storage.cjs');

const FAMILY_RULES = Object.freeze([
  { id: 'altoholic', primary: 'Altoholic', name: 'Altoholic', match: name => name === 'Altoholic' || name.startsWith('Altoholic_') },
  { id: 'atlasloot', primary: 'AtlasLoot', name: 'AtlasLoot', match: name => name === 'AtlasLoot' || name.startsWith('AtlasLoot_') },
  { id: 'bagnon', primary: 'Bagnon', name: 'Bagnon', match: name => name === 'Bagnon' || name.startsWith('Bagnon_') },
  { id: 'datastore', primary: 'DataStore', name: 'DataStore', match: name => name === 'DataStore' || name.startsWith('DataStore_') },
  { id: 'dbm', primary: 'DBM-Core', name: 'Deadly Boss Mods', match: name => name.startsWith('DBM-') },
  { id: 'details', primary: 'Details', name: 'Details! Damage Meter', match: name => name === 'Details' || name.startsWith('Details_') },
  { id: 'elvui', primary: 'ElvUI', name: 'ElvUI', match: name => name === 'ElvUI' || name.startsWith('ElvUI_') },
  { id: 'kui-nameplates', primary: 'Kui_Nameplates', name: 'Kui Nameplates', match: name => name === 'Kui_Nameplates' || name.startsWith('Kui_Nameplates_') },
  { id: 'shadowed-unit-frames', primary: 'ShadowedUnitFrames', name: 'Shadowed Unit Frames', match: name => name === 'ShadowedUnitFrames' || name.startsWith('ShadowedUF_') },
  { id: 'tradeskillmaster', primary: 'TradeSkillMaster', name: 'TradeSkillMaster', match: name => name === 'TradeSkillMaster' || name.startsWith('TradeSkillMaster_') },
  { id: 'weakauras', primary: 'WeakAuras', name: 'WeakAuras', match: name => name === 'WeakAuras' || name.startsWith('WeakAuras') },
]);

const CATEGORY_OVERRIDES = Object.freeze({
  altoholic: 'Characters & Inventory',
  atlasloot: 'Raids & Loot',
  bagnon: 'Bags & Inventory',
  datastore: 'Characters & Inventory',
  dbm: 'Combat & Raids',
  details: 'Combat & Raids',
  elvui: 'Interface',
  'kui-nameplates': 'Interface',
  'shadowed-unit-frames': 'Interface',
  tradeskillmaster: 'Economy',
  weakauras: 'Interface',
  apidocumentation: 'Developer',
  bartender4: 'Interface',
  chatter: 'Interface',
  clique: 'Interface',
  decursive: 'Combat & Raids',
  'leatrix-plus': 'Quality of Life',
  'moveanything': 'Interface',
  omen: 'Combat & Raids',
  pawn: 'Items & Gear',
  'professionmenu': 'Professions',
  quartz: 'Interface',
  'ratingbuster': 'Items & Gear',
  'rclootcouncil': 'Raids & Loot',
  'sexymap': 'Interface',
  'vanillaguide': 'Questing',
});

function slug(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function cleanWowText(value) {
  return String(value || '')
    .replace(/\|c[0-9a-fA-F]{8}/g, '')
    .replace(/\|r/g, '')
    .replace(/\|H[^|]*\|h/g, '')
    .replace(/\|h/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function dependencyNames(value) {
  if (!value) return [];
  const names = [];
  for (const part of String(value).split(/[;,]/)) {
    for (const token of part.trim().split(/\s+/)) {
      if (token) names.push(token);
    }
  }
  return names;
}

async function readToc(folder, folderName) {
  let entries;
  try { entries = await fs.readdir(folder, { withFileTypes: true }); }
  catch { return { tocFile: '', title: folderName, notes: '', version: '', dependencies: [] }; }
  const tocFiles = entries.filter(entry => entry.isFile() && entry.name.toLowerCase().endsWith('.toc')).map(entry => entry.name).sort((a, b) => a.localeCompare(b));
  const preferred = tocFiles.find(name => name.toLowerCase() === `${folderName.toLowerCase()}.toc`) || tocFiles[0];
  if (!preferred) return { tocFile: '', title: folderName, notes: '', version: '', dependencies: [] };
  let text = '';
  try { text = await fs.readFile(path.join(folder, preferred), 'utf8'); } catch {}
  const metadata = {};
  for (const line of text.split(/\r?\n/)) {
    const match = /^##\s*([^:]+):\s*(.*)$/.exec(line);
    if (!match) continue;
    metadata[match[1].trim().toLowerCase()] = match[2].trim();
  }
  const required = [metadata.dependencies, metadata.requireddeps, metadata.dependancies].filter(Boolean).join(',');
  return {
    tocFile: preferred,
    title: cleanWowText(metadata.title) || folderName,
    notes: cleanWowText(metadata.notes),
    version: cleanWowText(metadata.version),
    dependencies: [...new Set(dependencyNames(required))],
    optionalDependencies: dependencyNames(metadata.optionaldeps),
    loadOnDemand: metadata.loadondemand === '1',
    loadWith: dependencyNames(metadata.loadwith),
  };
}

function familyFor(folderName) {
  for (const rule of FAMILY_RULES) if (rule.match(folderName)) return rule;
  return { id: slug(folderName), primary: folderName, name: '', match: name => name === folderName };
}

function categoryFor(id, title, notes) {
  if (CATEGORY_OVERRIDES[id]) return CATEGORY_OVERRIDES[id];
  const text = `${title} ${notes}`.toLowerCase();
  if (/auction|trade|market|gold|mailing/.test(text)) return 'Economy';
  if (/raid|boss|threat|combat|damage|healing/.test(text)) return 'Combat & Raids';
  if (/bag|inventory|item|gear|stat/.test(text)) return 'Items & Gear';
  if (/profession|craft/.test(text)) return 'Professions';
  if (/map|unit frame|actionbar|interface|ui|chat|tooltip|nameplate/.test(text)) return 'Interface';
  if (/quest|guide/.test(text)) return 'Questing';
  return 'Utility';
}

function safeChild(root, name) {
  if (typeof name !== 'string' || !name || name !== path.basename(name) || name.includes('\0')) throw new Error('Invalid addon folder name.');
  filePath(name);
  const child = path.resolve(root, name);
  if (!child.startsWith(path.resolve(root) + path.sep)) throw new Error('Invalid addon path.');
  return child;
}

async function existsKind(target) {
  try {
    const stat = await fs.lstat(target);
    return stat.isDirectory() ? 'directory' : stat.isSymbolicLink() ? 'link' : 'other';
  } catch (error) {
    if (error.code === 'ENOENT') return '';
    throw error;
  }
}

async function ensureNoSymlinks(root) {
  const pending = [root];
  while (pending.length) {
    const current = pending.pop();
    const entries = await fs.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isSymbolicLink()) throw new Error(`Addon catalog contains an unsupported symbolic link in ${path.basename(root)}.`);
      if (entry.isDirectory()) pending.push(path.join(current, entry.name));
    }
  }
}

class AddonService {
  constructor(catalogRoot, { mandatoryFolders = [], assetFolders = [] } = {}) {
    this.catalogRoot = path.resolve(catalogRoot);
    this.catalogCache = null;
    this.mandatoryFolders = new Set(mandatoryFolders.map(name => name.toLowerCase()));
    this.assetFolders = new Set(assetFolders.map(name => name.toLowerCase()));
  }

  async catalog() {
    if (this.catalogCache) return this.catalogCache;
    const kind = await existsKind(this.catalogRoot);
    if (kind !== 'directory') throw new Error('Addon catalog folder is missing.');
    const entries = await fs.readdir(this.catalogRoot, { withFileTypes: true });
    const folders = new Map();
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const folderName = entry.name;
      if (/^Blizzard_/i.test(folderName) && !this.mandatoryFolders.has(folderName.toLowerCase())) continue;
      const folderPath = safeChild(this.catalogRoot, folderName);
      const toc = await readToc(folderPath, folderName);
      if (!toc.tocFile && !this.assetFolders.has(folderName.toLowerCase())) continue;
      folders.set(folderName, { name: folderName, path: folderPath, ...toc });
    }
    if (!folders.size) throw new Error('Addon catalog is empty.');
    for (const name of this.mandatoryFolders) {
      if (![...folders.keys()].some(folder => folder.toLowerCase() === name)) throw new Error(`Mandatory addon is missing or has no TOC: ${name}`);
    }

    const grouped = new Map();
    for (const folder of folders.values()) {
      const family = familyFor(folder.name);
      let group = grouped.get(family.id);
      if (!group) {
        group = { id: family.id, family, folders: [] };
        grouped.set(family.id, group);
      }
      group.folders.push(folder);
    }

    const folderToPackage = new Map();
    for (const group of grouped.values()) for (const folder of group.folders) folderToPackage.set(folder.name.toLowerCase(), group.id);

    const packages = [];
    for (const group of grouped.values()) {
      group.folders.sort((a, b) => a.name.localeCompare(b.name));
      const primary = group.folders.find(folder => folder.name === group.family.primary) || group.folders[0];
      const dependencies = new Set();
      const externalDependencies = new Set();
      for (const folder of group.folders) {
        for (const dependency of folder.dependencies) {
          const packageId = folderToPackage.get(dependency.toLowerCase());
          if (packageId && packageId !== group.id) dependencies.add(packageId);
          else if (!packageId && dependency) externalDependencies.add(dependency);
        }
      }
      const title = group.family.name || primary.title || primary.name;
      const notes = primary.notes || group.folders.find(folder => folder.notes)?.notes || '';
      packages.push({
        id: group.id,
        mandatory: group.folders.some(folder => this.mandatoryFolders.has(folder.name.toLowerCase())),
        name: title,
        description: notes || `${title} addon package for Conquest of AzerothCore.`,
        version: primary.version || '',
        category: categoryFor(group.id, title, notes),
        primaryFolder: primary.name,
        tocFile: primary.tocFile,
        folders: group.folders.map(folder => folder.name),
        tocMetadata: group.folders.map(({ name, dependencies, optionalDependencies, loadOnDemand, loadWith }) => ({ name, dependencies, optionalDependencies, loadOnDemand, loadWith })),
        dependencies: [...dependencies].sort(),
        externalDependencies: [...externalDependencies].sort(),
      });
    }
    packages.sort((a, b) => a.name.localeCompare(b.name));
    const byId = new Map(packages.map(item => [item.id, item]));
    this.catalogCache = { packages, byId, folders, folderToPackage, folderCount: folders.size };
    return this.catalogCache;
  }

  async installedState(pkg, addonsRoot, verify = true) {
    if (!addonsRoot) return { status: 'not-installed', installedFolders: 0, installedVersion: '' };
    let installedFolders = 0;
    for (const folderName of pkg.folders) {
      if (await existsKind(safeChild(addonsRoot, folderName))) installedFolders++;
    }
    if (!installedFolders) return { status: 'not-installed', installedFolders: 0, installedVersion: '' };
    if (installedFolders !== pkg.folders.length) return { status: 'partial', installedFolders, installedVersion: '' };

    let installedVersion = '';
    const primary = safeChild(addonsRoot, pkg.primaryFolder);
    const primaryKind = await existsKind(primary);
    if (primaryKind === 'directory') {
      const toc = await readToc(primary, pkg.primaryFolder);
      installedVersion = toc.version || '';
    }
    let status = pkg.version && installedVersion && pkg.version !== installedVersion ? 'update' : 'installed';
    for (const file of verify ? await this.sourceFiles(pkg) : []) {
      const relative = file.path.slice('Interface/AddOns/'.length);
      const target = await safePath(addonsRoot, relative, true);
      if (!await statOrNull(target)) { status = 'partial'; break; }
      if (await hashFile(target) !== file.sha256) status = 'update';
    }
    return { status, installedFolders, installedVersion };
  }

  async list(clientRoot = '', verify = false) {
    const catalog = await this.catalog();
    let addonsRoot = '';
    if (clientRoot) { await safePath(clientRoot, 'Interface/AddOns/.probe', true); addonsRoot = path.join(clientRoot, 'Interface', 'AddOns'); }
    const result = [];
    let ownership = { packages: {} }; const warnings = [];
    try { if (clientRoot) ownership = await new AddonStorage(clientRoot).state(); }
    catch { warnings.push('Addon ownership could not be read. Inventory is read-only; the existing record and player files have been preserved.'); }
    for (const pkg of catalog.packages) {
      let installed;
      try { installed = await this.installedState(pkg, addonsRoot, verify); }
      catch (error) { installed = { status: 'unreadable', installedFolders: 0, installedVersion: '', description: `Could not inspect this addon: ${error.message}` }; }
      result.push({ ...pkg, ...installed, catalog: true, managementBlocked: warnings.length > 0, managed: !!ownership.packages[pkg.id]?.length });
    }
    const entries = addonsRoot ? await fs.readdir(addonsRoot, { withFileTypes: true }).catch(error => { if (error.code === 'ENOENT') return []; throw error; }) : [];
    for (const entry of entries) {
      if ((!entry.isDirectory() && !entry.isSymbolicLink()) || catalog.folderToPackage.has(entry.name.toLowerCase())) continue;
      let toc = { title: entry.name, version: '', notes: '' }, status = 'unknown';
      try {
        await safePath(addonsRoot, `${entry.name}/.probe`, true);
        toc = await readToc(safeChild(addonsRoot, entry.name), entry.name);
      } catch { status = 'unreadable'; }
      result.push({ id: `local:${entry.name}`, name: toc.title, description: status === 'unreadable' ? 'Linked or inaccessible folder; left untouched.' : toc.notes || (toc.tocFile ? 'Player addon not included in the launcher catalog.' : 'Folder found without a readable TOC; in-game availability is unknown.'), category: 'Local addons', version: '', installedVersion: toc.version, folders: [entry.name], dependencies: [], externalDependencies: [], status, installedFolders: 1, catalog: false, managed: false });
    }
    result.sort((a, b) => a.name.localeCompare(b.name));
    return { packages: result, folderCount: catalog.folderCount, warnings };
  }

  packageById(catalog, packageId) {
    if (typeof packageId !== 'string' || !packageId) throw new Error('Invalid addon package.');
    const pkg = catalog.byId.get(packageId);
    if (!pkg) throw new Error('Addon package was not found in the catalog.');
    return pkg;
  }

  dependencyOrder(catalog, rootId) {
    const ordered = [];
    const visiting = new Set();
    const visited = new Set();
    const visit = id => {
      if (visited.has(id)) return;
      if (visiting.has(id)) throw new Error('Addon dependency cycle detected.');
      visiting.add(id);
      const pkg = this.packageById(catalog, id);
      for (const dependency of pkg.dependencies) visit(dependency);
      visiting.delete(id);
      visited.add(id);
      ordered.push(pkg);
    };
    visit(rootId);
    return ordered;
  }

  async sourceFiles(pkg) {
    this.fileCache ||= new Map();
    if (!this.fileCache.has(pkg.id)) {
      const files = [];
      for (const folder of pkg.folders) {
        const root = safeChild(this.catalogRoot, folder);
        for (const file of await tree(root)) files.push({ path: `Interface/AddOns/${folder}/${file.path}`, sha256: file.sha256, source: await safePath(root, file.path, true) });
      }
      this.fileCache.set(pkg.id, files);
    }
    return this.fileCache.get(pkg.id);
  }

  async installedTocs(clientRoot) {
    await safePath(clientRoot, 'Interface/AddOns/.probe', true);
    const root = path.join(clientRoot, 'Interface', 'AddOns');
    const result = new Map();
    const entries = await fs.readdir(root, { withFileTypes: true }).catch(e => { if (e.code === 'ENOENT') return []; throw e; });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      await safePath(root, `${entry.name}/.probe`, true);
      const toc = await readToc(safeChild(root, entry.name), entry.name);
      if (toc.tocFile) result.set(entry.name.toLowerCase(), { name: entry.name, ...toc });
    }
    return result;
  }

  async planInstall(packageId, clientRoot) {
    if (!clientRoot) throw new Error('Choose a writable client/test folder first.');
    const catalog = await this.catalog(), installed = await this.installedTocs(clientRoot);
    const ordered = [], visited = new Set(), visiting = new Set();
    const visitFolder = async (name, owner) => {
      const key = name.toLowerCase();
      if (owner.folders.some(folder => folder.toLowerCase() === key)) return;
      const provider = catalog.folderToPackage.get(key);
      if (provider && !installed.has(key)) { await visit(provider, false); return; }
      const existing = installed.get(key);
      if (!existing) throw new Error(`${owner.name} requires missing addon ${name}; no catalog package provides it.`);
      // Also validate the hard dependencies of reused manually installed providers.
      const manualKey = `manual:${key}`;
      if (visiting.has(manualKey)) throw new Error(`Addon dependency cycle: ${name}`);
      if (visited.has(manualKey)) return;
      visiting.add(manualKey);
      for (const dependency of existing.dependencies) await visitFolder(dependency, { name, folders: [existing.name] });
      visiting.delete(manualKey); visited.add(manualKey);
    };
    const visit = async (id, requested) => {
      if (visited.has(id)) return;
      if (visiting.has(id)) throw new Error(`Addon dependency cycle: ${id}`);
      visiting.add(id);
      const pkg = this.packageById(catalog, id);
      for (const toc of pkg.tocMetadata) for (const dependency of toc.dependencies) await visitFolder(dependency, pkg);
      visiting.delete(id); visited.add(id);
      const state = await this.installedState(pkg, path.join(clientRoot, 'Interface', 'AddOns'));
      if (requested || state.status !== 'installed') ordered.push(pkg);
    };
    for (const id of Array.isArray(packageId) ? packageId : [packageId]) await visit(id, true);
    return ordered;
  }

  async installMandatory(clientRoot) {
    const catalog = await this.catalog();
    const ids = catalog.packages.filter(pkg => pkg.mandatory).map(pkg => pkg.id);
    if (!ids.length) return { installedPackages: [], preservedFiles: 0 };
    return this.install(ids, clientRoot, true);
  }

  async install(packageId, clientRoot, mandatory = false) {
    if (!mandatory && !Array.isArray(packageId)) {
      const pkg = this.packageById(await this.catalog(), packageId);
      if (pkg.mandatory) return this.installMandatory(clientRoot);
    }
    const storage = new AddonStorage(clientRoot);
    await storage.recover();
    const packages = await this.planInstall(packageId, clientRoot);
    const previous = await storage.state(), next = structuredClone(previous), changes = [];
    let preservedFiles = 0;
    const owners = new Map();
    for (const [id, files] of Object.entries(previous.packages)) for (const file of files) owners.set(file.path.toLowerCase(), id);
    for (const pkg of packages) {
      const files = await this.sourceFiles(pkg), names = new Set(files.map(f => f.path.toLowerCase()));
      for (const file of files) {
        const target = await storage.target(file.path), stat = await statOrNull(target);
        const owner = owners.get(file.path.toLowerCase());
        if (owner && owner !== pkg.id) throw new Error(`Addon ownership collision: ${file.path}`);
        if (stat && (mandatory || owner)) {
          const actual = await hashFile(target);
          if (actual === file.sha256) continue;
          const old = (previous.packages[pkg.id] || []).find(entry => entry.path.toLowerCase() === file.path.toLowerCase());
          if (!owner || actual !== old?.sha256) {
            const backup = await storage.meta(`preserved-addons/${actual}/${file.path}`);
            await fs.mkdir(path.dirname(backup), { recursive: true });
            await fs.copyFile(target, backup, constants.COPYFILE_EXCL).catch(error => { if (error.code !== 'EEXIST') throw error; });
            if (await hashFile(backup) !== actual) throw new Error(`Could not verify addon backup: ${file.path}`);
            preservedFiles++;
          }
        }
        if (stat && !owner && !mandatory) throw new Error(`Unmanaged addon file would be overwritten: ${file.path}. Move that addon out of AddOns before installing it from the catalog.`);
        changes.push(file);
      }
      for (const old of previous.packages[pkg.id] || []) {
        if (names.has(old.path.toLowerCase())) continue;
        const target = await storage.target(old.path);
        if (await statOrNull(target) && await hashFile(target) === old.sha256) changes.push({ path: old.path });
      }
      next.packages[pkg.id] = files.map(({ path, sha256 }) => ({ path, sha256 }));
    }
    if (changes.length || JSON.stringify(next) !== JSON.stringify(previous)) await storage.commit(changes, next, previous);
    const target = Array.isArray(packageId) ? { id: 'mandatory', name: 'Mandatory addons' } : this.packageById(await this.catalog(), packageId);
    return { id: target.id, name: target.name, preservedFiles, installedPackages: packages.map(p => p.id), installedFolders: packages.reduce((sum, p) => sum + p.folders.length, 0) };
  }

  async uninstall(packageId, clientRoot) {
    if (!clientRoot) throw new Error('Choose your installed client first.');
    const storage = new AddonStorage(clientRoot); await storage.recover();
    const catalog = await this.catalog(), pkg = this.packageById(catalog, packageId);
    if (pkg.mandatory) throw new Error('This addon is mandatory for the client and cannot be uninstalled through the launcher.');
    const provided = new Set(pkg.folders.map(f => f.toLowerCase()));
    const installed = await this.installedTocs(clientRoot), blockers = new Set();
    for (const [name, toc] of installed) {
      if (!provided.has(name) && toc.dependencies.some(d => provided.has(d.toLowerCase()))) blockers.add(toc.name);
    }
    if (blockers.size) throw new Error(`${pkg.name} is required by ${[...blockers].join(', ')}. Uninstall those addons first.`);
    const previous = await storage.state(), next = structuredClone(previous), changes = [];
    if (!previous.packages[packageId]) throw new Error('This addon is not owned by the launcher. Remove it manually if desired; its files have been preserved.');
    let preserved = 0;
    for (const file of previous.packages[packageId]) {
      const target = await storage.target(file.path);
      if (!await statOrNull(target)) continue;
      if (await hashFile(target) !== file.sha256) { preserved++; continue; }
      changes.push({ path: file.path });
    }
    delete next.packages[packageId];
    await storage.commit(changes, next, previous);
    return { id: pkg.id, name: pkg.name, removedFolders: pkg.folders.length, preservedFiles: preserved };
  }

}

module.exports = { AddonService, cleanWowText, dependencyNames, familyFor };
