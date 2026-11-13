// Copyright (C) 2026 Duff (Duff-SPP). GPL-3.0-only; see LICENSE and ATTRIBUTION.md at the repository root.
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const fs = require('node:fs/promises');
const path = require('node:path');
const { atomicJson } = require('./release-format.cjs');
const exec = promisify(execFile);

// Wine reads this per-application key as an alternative to WINEDLLOVERRIDES.
// Preserve the existing value so disabling the option does not reset user setup.
async function configureWineCompatibility(executable, enabled, { run = exec, platform = process.platform, stateFile } = {}) {
  if (platform !== 'win32') return;
  const image = path.win32.basename(executable);
  if (!/^[a-z0-9_. -]+\.exe$/i.test(image)) throw new Error('Invalid Wine game executable name.');
  if (!stateFile) {
    if (!process.versions.electron) return;
    stateFile = path.join(require('electron').app.getPath('userData'), `wine-divxtac-${image}.json`);
  }
  let state = null;
  try { state = JSON.parse(await fs.readFile(stateFile, 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (state && (state.version !== 1 || !(state.previous === null || typeof state.previous === 'string'))) {
    throw new Error('Cannot read the saved Wine DLL override.');
  }
  if (!enabled && !state) return;
  const windowsRoot = process.env.SystemRoot || process.env.WINDIR || 'C:\\Windows';
  const reg = path.join(windowsRoot, 'System32', 'reg.exe');
  const command = args => run(reg, args, { windowsHide: true, timeout: 10000 });
  const query = async key => {
    try { return (await command(['query', key, '/v', 'divxtac'])).stdout; }
    catch (error) { if (error.code === 1) return null; throw error; }
  };
  // Native Windows must never receive Wine registry settings.
  try { await command(['query', 'HKCU\\Software\\Wine']); }
  catch (error) { if (error.code === 1) return; throw error; }
  const key = `HKCU\\Software\\Wine\\AppDefaults\\${image}\\DllOverrides`;
  const output = await query(key);
  const match = output?.match(/^\s*divxtac\s+REG_SZ(?:[ \t]+([^\r\n]*))?\s*$/im);
  if (output !== null && !match) throw new Error('Cannot read the current Wine DLL override.');
  const current = match ? (match[1] || '').trim() : null;
  if (enabled) {
    if (!state) await atomicJson(stateFile, { version: 1, previous: current });
    await command(['add', key, '/v', 'divxtac', '/t', 'REG_SZ', '/d', 'd', '/f']);
  } else {
    // Keep overrides edited outside the launcher after the option was enabled.
    if (current === 'd') {
      if (state.previous === null) await command(['delete', key, '/v', 'divxtac', '/f']);
      else await command(['add', key, '/v', 'divxtac', '/t', 'REG_SZ', '/d', state.previous, '/f']);
    }
    await fs.unlink(stateFile);
  }
}

module.exports = { configureWineCompatibility };
