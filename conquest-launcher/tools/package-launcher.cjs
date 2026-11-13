// Copyright (C) 2026 Duff (Duff-SPP). GPL-3.0-only; see LICENSE and ATTRIBUTION.md at the repository root.
// Launcher-only Linux handoff. Never invokes a publisher against a remote host.
const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { sha512, publishLauncher } = require('./publish-launcher.cjs');
async function run() {
  const root = path.resolve(__dirname, '..'), dist = path.join(root, 'dist');
  const version = require('../package.json').version;
  const release = path.join(dist, 'launcher-release');
  const descriptor = JSON.parse(await fs.readFile(path.join(release, 'launcher-release.json')));
  if (descriptor.version !== version) throw new Error('Stale release descriptor');
  for (const name of [descriptor.file, descriptor.file + '.blockmap']) {
    if (await sha512(path.join(dist, name)) !== await sha512(path.join(release, name))) throw new Error('Stale release artifact: ' + name);
  }
  // Exercise the actual publisher locally, verifying the produced feed and alias.
  const verification = await fs.mkdtemp(path.join(dist, 'publish-verification-'));
  await publishLauncher(release, verification, () => {});
  const yaml = require('js-yaml');
  for (const file of [path.join(release, 'latest.yml'), path.join(verification, 'launcher/latest.yml')]) {
    const feed = yaml.load(await fs.readFile(file, 'utf8'));
    if (feed.version !== version || feed.path !== descriptor.file || feed.sha512 !== descriptor.sha512 || feed.files.length !== 1 || feed.files[0].url !== descriptor.file || feed.files[0].size !== descriptor.size || feed.files[0].sha512 !== descriptor.sha512) throw new Error('Invalid updater metadata');
  }
  if (await sha512(path.join(verification, 'launcher/ConquestOfAzerothSetup.exe')) !== descriptor.sha512) throw new Error('Invalid stable installer alias');
  const blockmap = JSON.parse(require('node:zlib').gunzipSync(await fs.readFile(path.join(release, descriptor.file + '.blockmap'))));
  const mapped = blockmap.files.reduce((sum, file) => sum + file.sizes.reduce((n, size) => n + size, 0), 0);
  if (mapped !== descriptor.size || blockmap.files.some(file => file.sizes.length !== file.checksums.length)) throw new Error('Invalid blockmap coverage');
  const stage = await fs.mkdtemp(path.join(dist, 'launcher-deployment-'));
  const names = [];
  async function copy(source, name) {
    const target = path.join(stage, name); await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.copyFile(source, target); names.push(name);
  }
  for (const name of [descriptor.file, descriptor.file + '.blockmap', 'latest.yml', 'launcher-release.json']) await copy(path.join(release, name), 'launcher-release/' + name);
  for (const name of ['tools/publish-launcher.cjs', 'src/release-format.cjs']) await copy(path.join(root, name), 'release-tools/' + name);
  await copy(path.join(root, 'LAUNCHER_DEPLOYMENT.md'), 'LAUNCHER_DEPLOYMENT.md');
  await copy(path.join(root, 'RELEASE_0.6.8_REPORT.md'), 'RELEASE_0.6.8_REPORT.md');
  const checksumLines = [];
  for (const name of names.sort()) checksumLines.push(createHash('sha256').update(await fs.readFile(path.join(stage, name))).digest('hex') + '  ' + name);
  await fs.writeFile(path.join(stage, 'SHA256SUMS.txt'), checksumLines.join('\n') + '\n');
  const archive = path.join(dist, `Conquest-Launcher-Deployment-${version}.tar.gz`);
  execFileSync('tar', ['-czf', archive, '-C', stage, ...names, 'SHA256SUMS.txt']);
  const digest = createHash('sha256').update(await fs.readFile(archive)).digest('hex');
  await fs.writeFile(archive + '.sha256', digest + '  ' + path.basename(archive) + '\n');
  await fs.writeFile(path.join(dist, 'release-verification.json'), JSON.stringify({ version, installerSize: descriptor.size, sha512: descriptor.sha512, blockmapCoverage: mapped, metadata: 'verified', localPublish: verification, stage, archive, sha256: digest }, null, 2));
  console.log(`Verified release metadata, blockmap coverage and local publishing.\n${archive}\n${archive}.sha256`);
}
run().catch(error => { console.error(error); process.exitCode = 1; });
