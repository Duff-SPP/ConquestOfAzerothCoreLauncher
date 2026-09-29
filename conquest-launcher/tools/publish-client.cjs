#!/usr/bin/env node
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { filePath, protectedPath, validateManifest, launcherVersionParts, safePath, hashFile, atomicJson } = require('../src/release-format.cjs');

async function publishClient(master, output, version, progress = console.log, { minimumLauncherVersion } = {}) {
  if (minimumLauncherVersion !== undefined) launcherVersionParts(minimumLauncherVersion);
  const compatibility = minimumLauncherVersion === undefined ? {} : { minimumLauncherVersion };
  master = await fs.realpath(master); output = path.resolve(output);
  const relation = path.relative(master, output);
  if (!relation || (!relation.startsWith('..' + path.sep) && relation !== '..' && !path.isAbsolute(relation))) throw new Error('Published storage must be outside the master client folder.');
  if (!/^[a-zA-Z0-9._-]{1,80}$/.test(version)) throw new Error('Use a release name such as 2026.09.15-1.');
  await safePath(output, 'client/objects/.probe', true);
  await safePath(output, 'client/releases/.probe', true);
  await safePath(output, 'client/latest.json', true);
  await fs.mkdir(path.join(output, 'client', 'objects'), { recursive: true });
  output = await fs.realpath(output);
  const realRelation = path.relative(master, output);
  if (!realRelation || (!realRelation.startsWith('..' + path.sep) && realRelation !== '..' && !path.isAbsolute(realRelation))) throw new Error('Published storage must not resolve inside master.');
  const lockFile = path.join(output, '.publish.lock');
  const lock = await fs.open(lockFile, 'wx').catch(error => { throw new Error(error.code === 'EEXIST' ? 'Publishing is already running. If a previous publisher crashed, remove .publish.lock after checking no publisher is running.' : error.message); });
  const files = [];
  const snapshots = [];
  const scanned = [];
  try {
    async function walk(folder, prefix = '') {
      const entries = (await fs.readdir(folder, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name));
      scanned.push({ folder, names: entries.filter(entry => !protectedPath(prefix + entry.name)).map(entry => entry.name).sort().join('\n') });
      for (const entry of entries) {
        const relative = prefix + entry.name;
        if (protectedPath(relative)) continue;
        filePath(relative);
        if (entry.isSymbolicLink()) throw new Error(`Remove the linked file/folder before publishing: ${relative}`);
        if (entry.isDirectory()) { await walk(path.join(folder, entry.name), relative + '/'); continue; }
        if (!entry.isFile()) throw new Error(`Unsupported file: ${relative}`);
        const source = await safePath(master, relative);
        const before = await fs.stat(source);
        const sha256 = await hashFile(source);
        const after = await fs.stat(source);
        if (before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs) throw new Error('Master changed while hashing. Finish uploading first.');
        files.push({ path: relative, size: before.size, sha256 });
        snapshots.push({ source, size: after.size, mtimeMs: after.mtimeMs, ctimeMs: after.ctimeMs, sha256 });
        progress('Hashed ' + relative);
      }
    }
    await walk(master);
    validateManifest({ schema: 1, version, files });
    const missing = [];
    for (const file of new Map(snapshots.map(item => [item.sha256, item])).values()) {
      const object = path.join(output, 'client', 'objects', file.sha256);
      const stat = await fs.lstat(object).catch(e => { if (e.code === 'ENOENT') return null; throw e; });
      if (stat) {
        if (!stat.isFile() || stat.isSymbolicLink() || stat.size !== file.size || await hashFile(object) !== file.sha256) throw new Error('Existing immutable object is damaged: ' + file.sha256);
      } else missing.push(file);
    }
    const disk = await fs.statfs(output);
    const required = missing.reduce((sum, file) => sum + file.size, 0) + 512 * 1024 ** 2;
    if (disk.bavail * disk.bsize < required) throw new Error('Not enough free space for new release objects plus a 512 MiB safety margin.');
    for (const file of missing) {
      const temp = path.join(output, 'client', 'objects', '.' + randomUUID() + '.tmp');
      try {
        await fs.copyFile(file.source, temp);
        if ((await fs.stat(temp)).size !== file.size || await hashFile(temp) !== file.sha256) throw new Error('Master changed while copying. Finish uploads first.');
        await fs.link(temp, path.join(output, 'client', 'objects', file.sha256));
      } finally { await fs.unlink(temp).catch(() => {}); }
    }
    for (const snapshot of snapshots) {
      const current = await fs.stat(snapshot.source);
      if (current.size !== snapshot.size || current.mtimeMs !== snapshot.mtimeMs || current.ctimeMs !== snapshot.ctimeMs) throw new Error('Master client changed while publishing. Finish uploading, then try again.');
    }
    for (const scan of scanned) {
      const prefix = path.relative(master, scan.folder).split(path.sep).filter(Boolean).join('/');
      const names = (await fs.readdir(scan.folder)).filter(name => !protectedPath((prefix ? prefix + '/' : '') + name)).sort().join('\n');
      if (names !== scan.names) throw new Error('Master folder contents changed while publishing. Try again after uploads finish.');
    }
    const manifest = validateManifest({ schema: 1, version, ...compatibility, publishedAt: new Date().toISOString(), files });
    const release = path.join(output, 'client', 'releases', version + '.json');
    await fs.mkdir(path.dirname(release), { recursive: true });
    await fs.writeFile(release, JSON.stringify(manifest, null, 2), { flag: 'wx' });
    await atomicJson(path.join(output, 'client', 'latest.json'), manifest);
    progress(`Published ${version}: ${files.length} files, ${(files.reduce((n, f) => n + f.size, 0) / 1024 ** 3).toFixed(2)} GiB. Players can now update.`);
    return manifest;
  } finally { await lock.close(); await fs.unlink(lockFile); }
}
if (require.main === module) {
  const [master, output, version, minimumLauncherVersion] = process.argv.slice(2);
  if (!master || !output || !version) { console.error('Usage: node tools/publish-client.cjs MASTER_FOLDER PUBLISHED_FOLDER RELEASE_NAME [MINIMUM_LAUNCHER_VERSION]'); process.exitCode = 1; }
  else publishClient(master, output, version, console.log, { minimumLauncherVersion }).catch(error => { console.error(error.message); process.exitCode = 1; });
}
module.exports = { publishClient };
