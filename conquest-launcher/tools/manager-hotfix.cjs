// Local packaging only. Uses the existing installer identity and publisher.
const fs = require('node:fs/promises');
const path = require('node:path');
const { createReadStream } = require('node:fs');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { sha512 } = require('./publish-launcher.cjs');
const launcher = path.resolve(__dirname, '..');
async function sha256(file) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}
async function newest(file) {
  const stat = await fs.lstat(file);
  if (stat.isSymbolicLink()) throw new Error(`Linked build input is unsupported: ${file}`);
  if (!stat.isDirectory()) return stat.mtimeMs;
  let time = 0;
  for (const entry of await fs.readdir(file)) time = Math.max(time, await newest(path.join(file, entry)));
  return time;
}
async function run() {
  const version = JSON.parse(await fs.readFile(path.join(launcher, 'package.json'), 'utf8')).version;
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('Use a stable major.minor.patch version.');
  const bundle = path.join(launcher, 'dist/launcher-release');
  const release = JSON.parse(await fs.readFile(path.join(bundle, 'launcher-release.json'), 'utf8'));
  const filename = `ConquestOfAzerothSetup-${version}.exe`;
  if (release.version !== version || release.file !== filename) throw new Error('Build the current launcher version first.');
  const installer = path.join(bundle, filename);
  const stat = await fs.stat(installer);
  if (stat.size !== release.size || await sha512(installer) !== release.sha512 || await sha512(installer + '.blockmap') !== release.blockmapSha512) throw new Error('Installer/blockmap verification failed. Rebuild before packaging.');
  const latest = await fs.readFile(path.join(bundle, 'latest.yml'), 'utf8');
  const feed = require('js-yaml').load(latest);
  if (feed.version !== version || feed.path !== filename || feed.sha512 !== release.sha512 || !Array.isArray(feed.files) || feed.files.length !== 1 || feed.files[0].url !== filename || feed.files[0].sha512 !== release.sha512 || feed.files[0].size !== release.size) throw new Error('Updater metadata mismatch. Rebuild before packaging.');
  for (const input of ['src', 'public', 'localization', 'build', 'package.json', 'package-lock.json', 'launcher.config.json', 'tools/production-bundles.cjs', 'tools/generate-locales.cjs', 'tools/protected-package.cjs', 'tools/installer-ownership.cjs']) {
    if (await newest(path.join(launcher, input)) > stat.mtimeMs) throw new Error(`Source changed after the build: ${input}. Rebuild the installer.`);
  }
  const outputs = path.join(launcher, '../Release-Output');
  await fs.mkdir(outputs, { recursive: true });
  const name = `Conquest-Launcher-Hotfix-${version}-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  const folder = path.join(outputs, name);
  await fs.mkdir(folder); // Never overwrite a previous release.
  try {
    const names = [];
    async function copy(source, relative) {
      const target = path.join(folder, relative);
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.copyFile(source, target);
      names.push(relative);
    }
    async function write(relative, content) {
      await fs.writeFile(path.join(folder, relative), content, 'utf8');
      names.push(relative);
    }
    for (const file of [filename, filename + '.blockmap']) await copy(path.join(bundle, file), 'launcher-release/' + file);
    await write('launcher-release/latest.yml', latest);
    await write('launcher-release/launcher-release.json', JSON.stringify(release, null, 2) + '\n');
    // Recheck copied bytes, so a concurrent rebuild cannot produce a mixed bundle.
    if (await sha512(path.join(folder, 'launcher-release', filename)) !== release.sha512 || await sha512(path.join(folder, 'launcher-release', filename + '.blockmap')) !== release.blockmapSha512) throw new Error('Build changed during packaging. Retry after the build finishes.');
    await copy(path.join(__dirname, 'publish-launcher.cjs'), 'release-tools/tools/publish-launcher.cjs');
    await copy(path.join(launcher, 'src/release-format.cjs'), 'release-tools/src/release-format.cjs');
    await write('PUBLISH-LAUNCHER.sh', `#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "$0")"
sha256sum -c SHA256SUMS.txt
printf '\\nThis publishes this launcher update to players.\\n'
read -r -p 'Published downloads directory [/srv/coa/published]: ' destination
destination="\${destination:-/srv/coa/published}"
[[ "$destination" = /* ]] || { echo 'Use an absolute directory.'; exit 1; }
read -r -p 'Type PUBLISH to release: ' answer
[[ "$answer" = PUBLISH ]] || exit 0
node ./release-tools/tools/publish-launcher.cjs ./launcher-release "$destination"
`);
    await write('LAUNCHER_DEPLOYMENT.md', `# Launcher ${version} deployment

Upload ${name}.tar.gz and its .sha256 file to the dedicated Linux host.

1. Verify: \`sha256sum -c ${name}.tar.gz.sha256\`
2. Extract: \`tar -xzf ${name}.tar.gz\`
3. Publish when ready: \`sudo bash ${name}/PUBLISH-LAUNCHER.sh\`

The script verifies the files, asks for the existing published downloads directory (default /srv/coa/published), then requires PUBLISH. It updates the launcher feed for installed players. Linux needs Node.js 22+; no npm install is needed there.

This is launcher-only. It does not deploy the backend or game files. For account/session/Discord backend fixes, also create a full package and follow its deployment and database migration instructions.

Do not publish different bytes under an already released version. Build a higher version instead. This package was prepared locally; publishing and player acceptance checks are still pending.
`);
    const checksums = [];
    for (const relative of names.sort()) checksums.push(`${await sha256(path.join(folder, relative))}  ${relative}`);
    await fs.writeFile(path.join(folder, 'SHA256SUMS.txt'), checksums.join('\n') + '\n');
    const archive = path.join(outputs, name + '.tar.gz');
    execFileSync('tar.exe', ['-czf', archive, '-C', outputs, name], { stdio: 'inherit', windowsHide: true });
    await fs.writeFile(archive + '.sha256', `${await sha256(archive)}  ${path.basename(archive)}\n`);
    console.log(`\nHOTFIX READY: ${folder}\nUpload: ${archive}\nAnd: ${archive}.sha256`);
  } catch (error) {
    await fs.writeFile(path.join(folder, 'INCOMPLETE-DO-NOT-UPLOAD.txt'), error.message);
    throw error;
  }
}
if (require.main === module) run().catch(error => { console.error(error.message); process.exitCode = 1; });
