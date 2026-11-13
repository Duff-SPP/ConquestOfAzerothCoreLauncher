// Copyright (C) 2026 Duff (Duff-SPP). GPL-3.0-only; see LICENSE and ATTRIBUTION.md at the repository root.
const fs = require('node:fs/promises');
const path = require('node:path');
const { safePath, statOrNull } = require('./release-format.cjs');
const { readGameProcesses } = require('./game-processes.cjs');

async function isGameRunning(root, { listProcesses = readGameProcesses, platform = process.platform } = {}) {
  if (platform !== 'win32' || !root) return false;
  const processes = await listProcesses();
  if (!Array.isArray(processes)) throw new Error('Windows returned an invalid game process list.');
  const directory = path.win32.resolve(root);
  const ascension = path.win32.join(directory, 'Ascension.exe').toLowerCase();
  const wow = path.win32.join(directory, 'Wow.exe').toLowerCase();
  for (const process of processes) {
    if (!process || typeof process.ExecutablePath !== 'string' || !path.win32.isAbsolute(process.ExecutablePath)) continue;
    const executable = path.win32.normalize(process.ExecutablePath).toLowerCase();
    if (executable === ascension || executable === wow) return true;
  }
  return false;
}

async function requireGameClosed(root) {
  if (await isGameRunning(root)) throw new Error('Close the game before updating or changing the client.');
}

function realmAccessError(error, target) {
  if (!['EPERM', 'EACCES', 'EBUSY'].includes(error.code)) return error;
  return new Error(`Cannot update the game realmlist. Close the game and any editor using realmlist.wtf, and check that your account can write to the client folder. Security software may also be blocking access. File: ${target}`, { cause: error });
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
    const original = await fs.readFile(target, 'utf8').catch(error => { if (error.code === 'ENOENT') return ''; throw realmAccessError(error, target); });
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
    try {
      try { await fs.writeFile(target, desired); }
      catch (error) {
        if (!['EPERM', 'EACCES'].includes(error.code)) throw error;
        // Windows chmod clears the read-only attribute without changing ACLs.
        const stat = await fs.stat(target);
        await fs.chmod(target, stat.mode | 0o200);
        await fs.writeFile(target, desired);
      }
    } catch (error) {
      throw realmAccessError(error, target);
    }
  }
}

module.exports = { requireGameClosed, isGameRunning, configureRealm };
