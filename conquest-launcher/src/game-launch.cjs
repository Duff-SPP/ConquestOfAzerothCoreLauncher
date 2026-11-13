// Copyright (C) 2026 Duff (Duff-SPP). GPL-3.0-only; see LICENSE and ATTRIBUTION.md at the repository root.
const { spawn } = require('node:child_process');
const path = require('node:path');
const { configureWineCompatibility } = require('./wine-compatibility.cjs');

function quitLauncherAfterHandoff() {
  if (!process.versions.electron) return;
  const { app } = require('electron');
  const timer = setTimeout(() => app.quit(), 250);
  timer.unref();
}

function applyLauncherLaunchBehavior(mode, { quit, minimize, schedule = setTimeout }) {
  if (mode === 'keep-open') return;
  if (mode === 'minimize') { minimize(); return; }
  const timer = schedule(quit, 250);
  timer?.unref?.();
}

function launchGame(executable, { hdPatches = true, wineCompatibility = false, getAutoLogin = null, spawnProcess = spawn, onLaunched = quitLauncherAfterHandoff } = {}) {
  if (!path.win32.isAbsolute(executable) || path.win32.extname(executable).toLowerCase() !== '.exe') {
    throw new Error('Select a valid absolute game executable path.');
  }

  const directory = path.win32.dirname(executable);

  return configureWineCompatibility(executable, wineCompatibility === true).then(() => new Promise((resolve, reject) => {
    let child;
    let credentials;
    const failure = error => {
      let message = error.message || 'Unknown error';
      if (credentials) message = 'Game launch failed. Check the client files and permissions.';
      return new Error(`Windows could not start ${executable}: ${message}`);
    };
    try {
      credentials = getAutoLogin?.();
      const args = hdPatches === false ? ['-hd', '0'] : [];
      if (credentials) {
        if (typeof credentials.username !== 'string' || !credentials.username || typeof credentials.password !== 'string' || !credentials.password) throw new Error('Sign into the launcher again to use automatic game login.');
        args.push('--login', credentials.username, '--password', credentials.password, '--autologin', '1');
      }
      child = spawnProcess(executable, args, {
        cwd: directory,
        shell: false,
        detached: true,
        stdio: 'ignore',
        windowsHide: false
      });
    } catch (error) {
      reject(failure(error));
      return;
    }

    const failed = error => reject(failure(error));
    child.once('error', failed);
    child.once('spawn', () => {
      child.removeListener('error', failed);
      if (!Number.isSafeInteger(child.pid) || child.pid <= 0) {
        reject(new Error('Windows returned no game process.'));
        return;
      }
      const pid = child.pid;
      child.unref();
      resolve(pid);
      onLaunched();
    });
  }));
}

module.exports = { launchGame, applyLauncherLaunchBehavior };
