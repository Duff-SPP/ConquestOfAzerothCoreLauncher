const { contextBridge, ipcRenderer } = require('electron');

async function invoke(channel, ...args) {
  const result = await ipcRenderer.invoke(channel, ...args);
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

contextBridge.exposeInMainWorld('launcher', Object.freeze({
  bootstrap: () => invoke('launcher:bootstrap'),
  window: action => invoke('launcher:window', action),
  saveSettings: patch => invoke('launcher:settings', patch),
  chooseClient: () => invoke('launcher:choose-client'),
  chooseInstall: () => invoke('launcher:choose-install'),
  checkClient: force => invoke('launcher:client-check', force === true),
  updateClient: force => invoke('launcher:client-update', force === true),
  pauseClient: () => invoke('launcher:client-pause'),
  account: () => invoke('launcher:account'),
  discord: () => invoke('launcher:discord'),
  login: (login, password) => invoke('launcher:login', login, password),
  register: (username, email, password, confirmPassword, acceptTestWarning) => invoke('launcher:register', username, email, password, confirmPassword, acceptTestWarning === true),
  accountOverview: () => invoke('launcher:account-overview'),
  accountCharacters: () => invoke('launcher:account-characters'),
  discordLinkStatus: () => invoke('launcher:discord-link-status'),
  discordLink: () => invoke('launcher:discord-link-start'),
  discordUnlink: () => invoke('launcher:discord-link-unlink'),
  logout: () => invoke('launcher:logout'),

  checkLauncher: () => invoke('launcher:launcher-check'),
  installLauncherUpdate: () => invoke('launcher:launcher-install'),
  onClientProgress: callback => {
    const listener = (_event, status) => callback(status);
    ipcRenderer.on('launcher:client-progress', listener);
    return () => ipcRenderer.removeListener('launcher:client-progress', listener);
  },
  onLauncherUpdate: callback => {
    const listener = (_event, status) => callback(status);
    ipcRenderer.on('launcher:update-status', listener);
    return () => ipcRenderer.removeListener('launcher:update-status', listener);
  },
  clientInfo: () => invoke('launcher:client-info'),
  launch: () => invoke('launcher:launch'),
  openFolder: () => invoke('launcher:open-folder'),
  external: key => invoke('launcher:external', key),
  databaseView: request => invoke('launcher:database-view', request),
  reloadDatabase: () => invoke('launcher:database-reload'),
  issues: force => invoke('launcher:issues', force === true),
  openIssue: number => invoke('launcher:open-issue', number),
  submitBug: report => invoke('launcher:submit-bug', report),
  addons: verify => invoke('launcher:addons', verify === true),
  installAddon: packageId => invoke('launcher:addon-install', packageId),
  uninstallAddon: packageId => invoke('launcher:addon-uninstall', packageId),
  openAddonsFolder: () => invoke('launcher:open-addons-folder'),
  onDatabaseStatus: callback => {
    const listener = (_event, status) => callback(status);
    ipcRenderer.on('launcher:database-status', listener);
    return () => ipcRenderer.removeListener('launcher:database-status', listener);
  },
  onGameExit: callback => {
    const listener = () => callback();
    ipcRenderer.on('launcher:game-exit', listener);
    return () => ipcRenderer.removeListener('launcher:game-exit', listener);
  }
}));
