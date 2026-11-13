#!/usr/bin/env node
// Copyright (C) 2026 Duff (Duff-SPP). GPL-3.0-only; see LICENSE and ATTRIBUTION.md at the repository root.
// Packages existing compiled output only. Never builds, connects to a VPS or deploys.
const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const launcher = path.resolve(__dirname, '..'), root = path.dirname(launcher);
const backend = path.join(root, 'Conquest-Launcher-Backend');
async function newest(folder) {
  let time = 0;
  for (const entry of await fs.readdir(folder, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) throw Error('Linked sources are not supported.');
    const file = path.join(folder, entry.name);
    time = Math.max(time, entry.isDirectory() ? await newest(file) : (await fs.stat(file)).mtimeMs);
  }
  return time;
}
async function run() {
  const version = require('../package.json').version;
  const policy = JSON.parse(await fs.readFile(path.join(backend, 'ubuntu/download-policy.json'), 'utf8'));
  if (policy.Launcher?.RequiredClientVersion !== version) throw Error('Set download-policy.json RequiredClientVersion to the launcher version before packaging.');
  const source = path.join(backend, 'deploy/linux-x64');
  const dll = path.join(source, 'Conquest.Launcher.Backend.dll');
  const sourceTime = Math.max(...await Promise.all(['Program.cs', 'Conquest.Launcher.Backend.csproj'].map(async file => (await fs.stat(path.join(backend, file))).mtimeMs)), ...await Promise.all(['Services', 'Configuration', 'Models'].map(folder => newest(path.join(backend, folder)))));
  if ((await fs.stat(dll)).mtimeMs < sourceTime) throw Error('Compile the current Linux backend first (BAT option 4).');
  const output = path.join(root, 'Release-Output'); await fs.mkdir(output, { recursive: true });
  const stage = await fs.mkdtemp(path.join(output, 'backend-update-' + version + '-'));
  const files = [];
  async function copy(from, relative) {
    const stat = await fs.lstat(from);
    if (stat.isSymbolicLink()) throw Error('Linked package inputs are not supported.');
    if (stat.isDirectory()) {
      for (const entry of await fs.readdir(from)) await copy(path.join(from, entry), relative + '/' + entry);
    } else {
      if (/appsettings\.Local|\.env$|\.log$|\.pdb$/i.test(relative)) return;
      const target = path.join(stage, relative); await fs.mkdir(path.dirname(target), { recursive: true }); await fs.copyFile(from, target); files.push(relative);
    }
  }
  await copy(source, 'backend/deploy/linux-x64');
  for (const file of ['downloads.nginx.conf', 'download-policy.json']) await copy(path.join(backend, 'ubuntu', file), 'backend/ubuntu/' + file);
  for (const file of ['update-backend.sh', 'UPDATE_0.8.1.md']) await copy(path.join(root, file), file);
  const hashes = [];
  for (const file of files.sort()) hashes.push(createHash('sha256').update(await fs.readFile(path.join(stage, file))).digest('hex') + '  ' + file);
  await fs.writeFile(path.join(stage, 'SHA256SUMS'), hashes.join('\n') + '\n');
  const archive = path.join(output, `Conquest-Backend-Update-${version}-${Date.now()}.tar.gz`);
  execFileSync('tar', ['-czf', archive, '-C', stage, ...await fs.readdir(stage)], { stdio: 'inherit' });
  console.log(`Backend update: ${archive}\nReview staging: ${stage}`);
}
if (require.main === module) run().catch(error => { console.error(error.message); process.exitCode = 1; });
