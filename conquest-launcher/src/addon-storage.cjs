// File ownership and a recoverable transaction shared by preview and packaged addons.
const fs = require('node:fs/promises');
const path = require('node:path');
const { safePath, filePath, statOrNull, hashFile, atomicJson } = require('./release-format.cjs');
const ownedPath = value => {
  filePath(value);
  if (!/^Interface\/AddOns\/[^/]+\/.+/.test(value)) throw new Error('Invalid addon ownership path.');
  return value;
};
async function tree(root) {
  const files = [];
  async function walk(prefix) {
    await safePath(root, prefix + '.probe', true);
    for (const entry of await fs.readdir(path.join(root, prefix), { withFileTypes: true })) {
      const relative = prefix + entry.name;
      filePath(relative);
      if (entry.isSymbolicLink()) throw new Error('Linked addon files are not supported.');
      if (entry.isDirectory()) await walk(relative + '/');
      else if (entry.isFile()) files.push({ path: relative, sha256: await hashFile(await safePath(root, relative, true)) });
      else throw new Error('Unsupported addon file.');
    }
  }
  await walk('');
  return files.sort((a, b) => a.path.localeCompare(b.path));
}
class AddonStorage {
  constructor(root) { this.root = root; }
  meta(name) { return safePath(this.root, '.coa-launcher/' + name, true); }
  target(name) { return safePath(this.root, ownedPath(name), true); }
  async state() {
    try {
      const data = JSON.parse(await fs.readFile(await this.meta('addons.json'), 'utf8'));
      if (data.schema !== 1 || !data.packages || typeof data.packages !== 'object') throw new Error('Invalid addon ownership record.');
      const seen = new Set();
      for (const files of Object.values(data.packages)) {
        if (!Array.isArray(files)) throw new Error('Invalid addon ownership record.');
        for (const file of files) {
          ownedPath(file.path);
          if (!/^[a-f0-9]{64}$/.test(file.sha256) || seen.has(file.path.toLowerCase())) throw new Error('Invalid addon ownership record.');
          seen.add(file.path.toLowerCase());
        }
      }
      return data;
    } catch (error) { if (error.code === 'ENOENT') return { schema: 1, packages: {} }; throw error; }
  }
  async recover() {
    const file = await this.meta('addon-transaction.json');
    if (!await statOrNull(file)) return;
    const journal = JSON.parse(await fs.readFile(file, 'utf8'));
    if (!['applying', 'committed'].includes(journal.phase) || !Array.isArray(journal.entries)) throw new Error('Invalid addon recovery record.');
    // Validate every path before touching any files.
    for (const entry of journal.entries) await this.target(entry.path);
    if (journal.phase === 'applying') {
      for (let i = journal.entries.length - 1; i >= 0; i--) {
        const entry = journal.entries[i], target = await this.target(entry.path);
        const backup = await this.meta(`addon-backup/${i}`), stage = await this.meta(`addon-stage/${i}`);
        if (await statOrNull(backup)) {
          await fs.unlink(target).catch(e => { if (e.code !== 'ENOENT') throw e; });
          await fs.rename(backup, target);
        } else if (!entry.existed && !entry.remove && !await statOrNull(stage)) {
          await fs.unlink(target).catch(e => { if (e.code !== 'ENOENT') throw e; });
        }
      }
      await atomicJson(await this.meta('addons.json'), journal.previous);
    }
    for (let i = 0; i < journal.entries.length; i++) {
      for (const kind of ['addon-backup', 'addon-stage']) await fs.unlink(await this.meta(`${kind}/${i}`)).catch(e => { if (e.code !== 'ENOENT') throw e; });
    }
    await fs.unlink(file);
  }
  async commit(changes, next, previous) {
    const entries = [];
    // All packages are staged and checked before changing the installation.
    for (let i = 0; i < changes.length; i++) {
      const change = changes[i], target = await this.target(change.path);
      if (change.source) {
        const stage = await this.meta(`addon-stage/${i}`);
        await fs.mkdir(path.dirname(stage), { recursive: true });
        await fs.copyFile(change.source, stage);
        if (await hashFile(stage) !== change.sha256) throw new Error('Addon package changed while staging. Try again.');
      }
      entries.push({ path: change.path, existed: !!await statOrNull(target), remove: !change.source });
    }
    const journalFile = await this.meta('addon-transaction.json');
    await atomicJson(journalFile, { phase: 'applying', entries, previous });
    try {
      for (let i = 0; i < entries.length; i++) {
        const entry = entries[i], target = await this.target(entry.path), backup = await this.meta(`addon-backup/${i}`);
        await fs.mkdir(path.dirname(target), { recursive: true });
        await fs.mkdir(path.dirname(backup), { recursive: true });
        if (entry.existed) await fs.rename(target, backup);
        if (!entry.remove) await fs.rename(await this.meta(`addon-stage/${i}`), target);
      }
      await atomicJson(await this.meta('addons.json'), next);
      await atomicJson(journalFile, { phase: 'committed', entries, previous });
    } catch (error) { await this.recover(); throw error; }
    await this.recover();
    // Only empty directories are removed. Manual/modified files and SavedVariables remain.
    for (const entry of entries.filter(e => e.remove)) {
      let folder = path.dirname(await this.target(entry.path));
      const boundary = path.join(path.resolve(this.root), 'Interface', 'AddOns');
      while (folder.startsWith(boundary + path.sep)) {
        try { await fs.rmdir(folder); } catch { break; }
        folder = path.dirname(folder);
      }
    }
  }
}
module.exports = { AddonStorage, tree };
