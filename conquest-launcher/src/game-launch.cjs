const { spawn } = require('node:child_process');
const path = require('node:path');

function launchGame(executable, { spawnProcess = spawn } = {}) {
  if (!path.win32.isAbsolute(executable) || path.win32.extname(executable).toLowerCase() !== '.exe') {
    throw new Error('Select a valid absolute game executable path.');
  }

  const directory = path.win32.dirname(executable);

  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawnProcess(executable, [], {
        cwd: directory,
        shell: false,
        detached: true,
        stdio: 'ignore',
        windowsHide: true
      });
    } catch (error) {
      reject(new Error(`Windows could not start ${executable}: ${error.message || 'Unknown error'}`));
      return;
    }

    const failed = error => reject(new Error(`Windows could not start ${executable}: ${error.message || 'Unknown error'}`));
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
    });
  });
}

module.exports = { launchGame };
