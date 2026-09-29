const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const fs = require('node:fs/promises');
const path = require('node:path');
const { safePath, statOrNull } = require('./release-format.cjs');
const exec = promisify(execFile);

async function isGameRunning(root) {
  if (process.platform !== 'win32' || !root) return false;
  const windowsRoot = process.env.SystemRoot || process.env.WINDIR || 'C:\\Windows';
  const powershell = path.join(windowsRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const script = `[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false); $ErrorActionPreference = 'Stop'; Get-CimInstance Win32_Process -Filter "Name = 'Ascension.exe' OR Name = 'Wow.exe'" | Select-Object ExecutablePath | ConvertTo-Json -Compress`;
  const { stdout } = await exec(powershell, ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true, timeout: 10000 });
  const paths = stdout.trim() ? JSON.parse(stdout) : [];
  const directory = path.resolve(root).toLowerCase();
  const candidates = (Array.isArray(paths) ? paths : [paths]).map(value => value?.ExecutablePath);
  if (candidates.some(value => typeof value === 'string' && value && path.dirname(path.resolve(value)).toLowerCase() === directory)) return true;
  // An elevated game's path can be hidden from a normal launcher after restart.
  if (candidates.some(value => typeof value !== 'string' || !value)) {
    throw new Error('Windows could not identify a running WoW/Ascension process. Close the game before updating or changing client files.');
  }
  return false;
}
async function requireGameClosed(root) {
  if (await isGameRunning(root)) throw new Error('Close the game before updating or changing the client.');
}
async function configureRealm(root, host) {
  if (!/^[a-zA-Z0-9.-]+$/.test(host)) throw new Error('Invalid realm hostname.');
  const targets = [];
  if (await statOrNull(await safePath(root, 'realmlist.wtf', true))) targets.push('realmlist.wtf');
  const data = path.join(root, 'Data');
  // Probe the parent chain before reading locale folders.
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
