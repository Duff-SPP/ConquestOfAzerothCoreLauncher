#!/usr/bin/env node
// Manual operation only: collects freshly built artifacts using an explicit allowlist.
const fs = require('node:fs/promises');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { sha512 } = require('./publish-launcher.cjs');
const launcher = path.resolve(__dirname, '..'), root = path.dirname(launcher);
const backend = path.join(root, 'Conquest-Launcher-Backend');
async function copyTree(source, target, allowed) {
  for (const entry of await fs.readdir(source, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) throw new Error('Package source contains a linked path.');
    if (!allowed(entry.name, entry.isDirectory())) continue;
    const from = path.join(source, entry.name), to = path.join(target, entry.name);
    if (entry.isDirectory()) await copyTree(from, to, allowed);
    else { await fs.mkdir(path.dirname(to), { recursive: true }); await fs.copyFile(from, to); }
  }
}
async function newest(source, skip = []) {
  let time = 0;
  for (const entry of await fs.readdir(source, { withFileTypes: true })) {
    if (skip.includes(entry.name)) continue;
    const file = path.join(source, entry.name);
    if (entry.isSymbolicLink()) throw new Error('Linked source is not supported.');
    time = Math.max(time, entry.isDirectory() ? await newest(file, skip) : (await fs.stat(file)).mtimeMs);
  }
  return time;
}
async function run() {
  const version = require('../package.json').version;
  const output = path.join(launcher, 'dist'), bundle = path.join(output, 'launcher-release');
  const release = JSON.parse(await fs.readFile(path.join(bundle, 'launcher-release.json'), 'utf8'));
  if (release.version !== version || release.file !== `ConquestOfAzerothSetup-${version}.exe`) throw new Error('Build current launcher version first.');
  const installer = path.join(bundle, release.file);
  if (await sha512(installer) !== release.sha512 || await sha512(installer + '.blockmap') !== release.blockmapSha512) throw new Error('Launcher artifact verification failed.');
  const launcherTime = Math.max(await newest(path.join(launcher, 'src')), await newest(path.join(launcher, 'public')), await newest(path.join(launcher, 'localization')), (await fs.stat(path.join(launcher, 'tools/generate-locales.cjs'))).mtimeMs, (await fs.stat(path.join(launcher,'package.json'))).mtimeMs, (await fs.stat(path.join(launcher,'launcher.config.json'))).mtimeMs);
  if ((await fs.stat(installer)).mtimeMs < launcherTime) throw new Error('Launcher source changed after build. Rebuild with a fresh version.');
  const publish = path.join(backend,'deploy/linux-x64');
  const dll = path.join(publish,'Conquest.Launcher.Backend.dll');
  if ((await fs.stat(dll)).mtimeMs < Math.max((await fs.stat(path.join(backend,'Program.cs'))).mtimeMs, await newest(path.join(backend,'Services')), await newest(path.join(backend,'Models')), await newest(path.join(backend,'Configuration')), (await fs.stat(path.join(backend,'Conquest.Launcher.Backend.csproj'))).mtimeMs)) throw new Error('Publish current backend source first.');
  const runtime = JSON.parse(await fs.readFile(path.join(publish,'Conquest.Launcher.Backend.runtimeconfig.json'),'utf8'));
  if (!runtime.runtimeOptions.frameworks && !runtime.runtimeOptions.framework) throw new Error('Use the documented framework-dependent Linux publish, not an old self-contained folder.');
  const stage = await fs.mkdtemp(path.join(output, 'vps-current-'));
  await copyTree(publish,path.join(stage,'backend/deploy/linux-x64'),(name,dir)=> dir ? name==='wwwroot' || !/[.]/.test(name) : /\.(dll|so|html|js|css|woff2?|webp|png|ico|jpg)$/.test(name) || /\.(deps|runtimeconfig)\.json$/.test(name));
  for (const folder of ['ubuntu','sql']) await copyTree(path.join(backend,folder),path.join(stage,'backend',folder),(name,dir)=>dir||/\.(sh|conf|service|sql|example)$/.test(name));
  for (const file of ['install-vps.sh','BUILD_AND_RELEASE.md','PRODUCTION_DEPLOYMENT.md']) await fs.copyFile(path.join(root,file),path.join(stage,file));
  for (const file of ['publish-client.cjs','publish-launcher.cjs','release-manager.cjs','validate-master.cjs']) {
    const target=path.join(stage,'release-tools/tools',file);await fs.mkdir(path.dirname(target),{recursive:true});await fs.copyFile(path.join(__dirname,file),target);
  }
  await fs.mkdir(path.join(stage,'release-tools/src'),{recursive:true});
  await fs.copyFile(path.join(launcher,'src/release-format.cjs'),path.join(stage,'release-tools/src/release-format.cjs'));
  await fs.mkdir(path.join(stage,'launcher-release'),{recursive:true});
  for (const file of [release.file,release.file+'.blockmap','launcher-release.json','latest.yml']) await fs.copyFile(path.join(bundle,file),path.join(stage,'launcher-release',file));
  const archive=path.join(root,`Conquest-Launcher-VPS-${version}-${Date.now()}.tar.gz`);
  execFileSync('tar',['-czf',archive,'-C',stage,'backend','release-tools','launcher-release','install-vps.sh','BUILD_AND_RELEASE.md','PRODUCTION_DEPLOYMENT.md'],{stdio:'inherit'});
  console.log(`Current package: ${archive}\nStaging retained for inspection: ${stage}`);
}
if (require.main === module) run().catch(error=>{console.error(error.message);process.exitCode=1;});
