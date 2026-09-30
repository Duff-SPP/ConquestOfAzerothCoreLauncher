const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const fs = require('node:fs/promises');
const path = require('node:path');
const { safePath, statOrNull } = require('./release-format.cjs');
const exec = promisify(execFile);

async function imageRunning(name, run) {
  const windowsRoot = process.env.SystemRoot || process.env.WINDIR || 'C:\\Windows';
  const tasklist = path.join(windowsRoot, 'System32', 'tasklist.exe');
  const { stdout } = await run(tasklist, ['/FI', `IMAGENAME eq ${name}`, '/FO', 'CSV', '/NH'], {
    windowsHide: true,
    timeout: 10000
  });
  if (!stdout.trim() || /^INFO:/i.test(stdout.trim())) return false;
  return stdout.split(/\r?\n/).some(line => line.trim().startsWith(`"${name}"`));
}

async function isGameRunning(root, { run = exec, platform = process.platform } = {}) {
  if (platform !== 'win32' || !root) return false;
  return await imageRunning('Ascension.exe', run) || await imageRunning('Wow.exe', run);
}

async function requireGameClosed(root) {
  if (await isGameRunning(root)) throw new Error('Close the game before updating or changing the client.');
}

async function configureRealm(root, host) {
  if (!/^[a-zA-Z0-9.-]+$/.test(host)) throw new Error('Invalid realm hostname.');
  const targets = [];
  if (await statOrNull(await safePath(root, 'realmlist.wtf', true))) targets.push('realmlist.wtf');
  const data = path.join(root, 'Data');
  await safePath(root, 'Data/.probe', true);
  for (const entry of await fs.readdir(data, { withFileTypes: true }).catch(error => { if (error.code === 'ENOENT') return []; throw error; })) {
    if (/^[a-z]{2}[A-Z]{2}$/.test(entry.name) && (entry.isDirectory() || entry.isSymbolicLink())) targets.push(`Data/${entry.name}/realmlist.wtf`);
  }
  if (!targets.length) targets.push('realmlist.wtf');
  for (const relative of targets) {
    const target = await safePath(root, relative, true);
    const original = await fs.readFile(target, 'utf8').catch(error => { if (error.code === 'ENOENT') return ''; throw error; });
    const newline = original.includes('\r\n') ? '\r\n' : '\n';
    const directive = /^[ \t]*set[ \t]+realmlist(?:[ \t]+[^\r\n]*)?$/gim;
    const desired = directive.test(original)
      ? original.replace(directive, `set realmlist ${host}`)
      : original + (original && !original.endsWith('\n') ? newline : '') + `set realmlist ${host}${newline}`;
    if (original === desired) continue;
    if (original) {
      const backup = await safePath(root, `.coa-launcher/realmlist-backups/${relative}`, true);
      await fs.mkdir(path.dirname(backup), { recursive: true });
      await fs.writeFile(backup, original, { flag: 'wx' }).catch(error => { if (error.code !== 'EEXIST') throw error; });
    }
    await fs.writeFile(target, desired);
  }
}

module.exports = { requireGameClosed, isGameRunning, configureRealm };
