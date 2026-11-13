#!/usr/bin/env node
// Copyright (C) 2026 Duff (Duff-SPP). GPL-3.0-only; see LICENSE and ATTRIBUTION.md at the repository root.
const fs = require('node:fs/promises');
const { createReadStream } = require('node:fs');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const { safePath } = require('../src/release-format.cjs');
async function sha512(file) {
  const hash = createHash('sha512'); for await (const chunk of createReadStream(file)) hash.update(chunk); return hash.digest('base64');
}
async function publishLauncher(source, output, progress = console.log) {
  const release = JSON.parse(await fs.readFile(path.join(source, 'launcher-release.json'), 'utf8'));
  if (!/^\d+\.\d+\.\d+$/.test(release.version) || release.file !== `ConquestOfAzerothSetup-${release.version}.exe` || !Number.isSafeInteger(release.size) || release.size <= 0 || typeof release.sha512 !== 'string') throw new Error('Invalid launcher release bundle. Build it with npm run build.');
  output = path.resolve(output);
  await safePath(output, 'launcher/latest.yml', true);
  await safePath(output, 'launcher/ConquestOfAzerothSetup.exe', true);
  await fs.mkdir(output, { recursive: true });
  const lockFile = path.join(output, '.publish.lock');
  const lock = await fs.open(lockFile, 'wx').catch(() => { throw new Error('Another publish is running. Try again after it finishes.'); });
  const folder = path.join(output, 'launcher'); await fs.mkdir(folder, { recursive: true });
  try {
    for (const name of [release.file, release.file + '.blockmap']) {
      await safePath(output, 'launcher/' + name, true);
      const input = path.join(source, name); const destination = path.join(folder, name); const temp = destination + '.' + randomUUID() + '.tmp';
      try {
        await fs.copyFile(input, temp);
    await fs.chmod(temp, 0o644);
        const expected = name.endsWith('.blockmap') ? release.blockmapSha512 : release.sha512;
        if (await sha512(temp) !== expected || (name === release.file && (await fs.stat(temp)).size !== release.size)) throw new Error(`Release verification failed: ${name}`);
        try { await fs.link(temp, destination); } catch (error) {
          if (error.code !== 'EEXIST') throw error;
          if (await sha512(destination) !== expected) throw new Error('This version was already published with different content. Increase the launcher version and rebuild.');
        }
        await fs.chmod(destination, 0o644);
      } finally { await fs.unlink(temp).catch(() => {}); }
    }
    const metadata = `version: ${release.version}\nfiles:\n  - url: ${release.file}\n    sha512: ${release.sha512}\n    size: ${release.size}\npath: ${release.file}\nsha512: ${release.sha512}\nreleaseDate: '${new Date().toISOString()}'\n`;
    const temp = path.join(folder, 'latest.' + randomUUID() + '.tmp');
    await fs.writeFile(temp, metadata, { mode: 0o644 }); await fs.chmod(temp, 0o644); await fs.rename(temp, path.join(folder, 'latest.yml'));
    const stableTemp = path.join(folder, 'installer.' + randomUUID() + '.tmp');
    try {
      await fs.link(path.join(folder, release.file), stableTemp);
      await fs.chmod(stableTemp, 0o644);
  await fs.rename(stableTemp, path.join(folder, 'ConquestOfAzerothSetup.exe'));
    } finally { await fs.unlink(stableTemp).catch(() => {}); }
    progress(`Launcher ${release.version} published. Existing launchers can now download it.`);
  } finally { await lock.close(); await fs.unlink(lockFile); }
}
if (require.main === module) {
  const [source, output] = process.argv.slice(2);
  if (!source || !output) { console.error('Usage: node tools/publish-launcher.cjs RELEASE_BUNDLE PUBLISHED_FOLDER'); process.exitCode = 1; }
  else publishLauncher(source, output).catch(error => { console.error(error.message); process.exitCode = 1; });
}
module.exports = { publishLauncher, sha512 };
