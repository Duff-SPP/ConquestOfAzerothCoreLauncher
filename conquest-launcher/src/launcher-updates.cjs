function createLauncherUpdates(app, notify, canRestart) {
  let status = { phase: app.isPackaged ? 'idle' : 'development', message: app.isPackaged ? 'Ready to check launcher updates.' : 'Launcher updates are available in the installed version.' };
  const set = (phase, message, extra = {}) => { status = { phase, message, ...extra }; notify(status); };
  let updater; let checking = false;
  if (app.isPackaged) {
    updater = require('electron-updater').autoUpdater;
    updater.autoDownload = true;
    updater.autoInstallOnAppQuit = false;
    updater.allowDowngrade = false;
    updater.disableWebInstaller = true;
    updater.on('checking-for-update', () => set('checking', 'Checking launcher updates…'));
    updater.on('update-available', info => set('downloading', `Downloading launcher ${info.version}…`, { version: info.version }));
    updater.on('download-progress', progress => set('downloading', 'Downloading launcher update…', { percent: progress.percent }));
    updater.on('update-not-available', () => set('ready', 'Your launcher is up to date.'));
    updater.on('update-downloaded', info => set('downloaded', `Launcher ${info.version} is ready. Restart to install.`, { version: info.version }));
    updater.on('error', error => set('error', `Launcher update unavailable: ${error.message}`));
  }
  return {
    get status() { return status; },
    async check() {
      if (!updater) return status;
      if (checking || status.phase === 'downloading' || status.phase === 'downloaded') return status;
      checking = true;
      try { await updater.checkForUpdates(); } catch (error) { set('error', `Launcher update unavailable: ${error.message || 'Unknown updater error'}`); }
      finally { checking = false; }
      return status;
    },
    async install() {
      if (!updater || status.phase !== 'downloaded') throw new Error('No launcher update is ready to install.');
      await canRestart();
      updater.quitAndInstall(false, true);
    }
  };
}
module.exports = { createLauncherUpdates };
