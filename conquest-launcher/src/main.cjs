const { app, BrowserWindow, WebContentsView, ipcMain, dialog, shell, protocol, net, session, safeStorage } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
const { launchGame } = require('./game-launch.cjs');
const { pathToFileURL } = require('node:url');
const { readSettings, saveSettings, externalUrl } = require('./settings.cjs');
const { translateNative } = require('./launcher-language.cjs');
const nativeText = text => translateNative(settings?.language || 'en', text);
const { AddonService } = require('./addons.cjs');
const config = require('../launcher.config.json');
const { ClientUpdater } = require('./client-updater.cjs');
const { safePath } = require('./release-format.cjs');
const { validateClientFolder, probeClientFolder } = require('./client-folder.cjs');
const { Portal } = require('./portal.cjs');
const { requireGameClosed, isGameRunning, configureRealm } = require('./game-safety.cjs');
const { createLauncherUpdates } = require('./launcher-updates.cjs');
const localTesting = !app.isPackaged && process.env.COA_LOCAL_TEST === '1';
config.localDownloadDemo = localTesting && process.env.COA_DOWNLOAD_DEMO === '1';
if (localTesting) {
  app.setPath('userData', path.join(app.getPath('appData'), 'ConquestLauncher-LocalTest'));
  config.apiBaseUrl = 'http://127.0.0.1:5082/';
  config.manifestUrl = 'http://127.0.0.1:5082/downloads/client/latest.json';
  config.links.account = 'http://127.0.0.1:5082/#account';
  config.links.register = 'http://127.0.0.1:5082/#register';
  config.realmlist = '127.0.0.1';
}
function writableClient(directory) {
  if (!directory) return;

  const target = path.resolve(directory).toLowerCase();
  const launcherRoot = path.resolve(
    app.isPackaged ? path.dirname(app.getPath('exe')) : path.join(__dirname, '..')
  ).toLowerCase();

  if (
    target === path.parse(target).root ||
    target === launcherRoot ||
    target.startsWith(launcherRoot + path.sep) ||
    launcherRoot.startsWith(target + path.sep)
  ) {
    throw new Error('Choose a dedicated client folder outside the launcher installation.');
  }
}

app.setName('Conquest of AzerothCore');
if (process.platform === 'win32') app.setAppUserModelId('com.conquestofazerothcore.launcher');
protocol.registerSchemesAsPrivileged([{ scheme: 'conquest', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);

let window = null;
let settings = null;
let settingsFile = '';
let game = null;
let databaseView = null;
let saveQueue = Promise.resolve();
let issueCache = { loadedAt: 0, issues: [] };
let addonService = null;
let clientUpdater = null;
let launcherUpdates = null;
let portal = null;
let clientMutation = false;
async function requireIdleClient(validatePath = true) {
  if (validatePath) writableClient(settings?.installPath);
  if (clientUpdater?.busy || clientMutation) throw new Error('Wait for the current client operation to finish.');
  if (game) throw new Error('Close the game before changing client files.');
  await requireGameClosed(settings?.installPath);
}
async function chooseClientFolder() {
  await requireIdleClient(false);
  const result = await dialog.showOpenDialog(window, { title: nativeText('Choose a game folder: empty or already installed'), properties: ['openDirectory', 'createDirectory'], defaultPath: settings.installPath || app.getPath('documents') });
  if (result.canceled || !result.filePaths[0]) return null;
  // The dialog is asynchronous; recheck before saving a changed destination.
  await requireIdleClient(false);
  const directory = path.resolve(result.filePaths[0]);
  writableClient(directory);
  await requireGameClosed(directory);
  const forbidden = [path.parse(directory).root, app.getPath('home'), app.getPath('documents'), app.getPath('desktop'), path.dirname(app.getPath('exe')), process.env.WINDIR, process.env.ProgramFiles, process.env['ProgramFiles(x86)']];
  await validateClientFolder(directory, config.clientExecutable, forbidden);
  await requireIdleClient(false);
  await persist({ ...settings, installPath: directory });
  clientUpdater.emit('idle', 'Game folder selected. Ready to check the client.');
  return clientInfo();
}
async function mutateClient(action) {
  writableClient(settings?.installPath);
  if (clientUpdater?.busy || clientMutation) throw new Error('Wait for the current client operation to finish.');
  clientMutation = true;
  try { await requireGameClosed(settings?.installPath); return await action(); } finally { clientMutation = false; }
}
function sendStatus(channel, status) { if (window && !window.isDestroyed()) window.webContents.send(channel, status); }
const publicRoot = path.resolve(__dirname, '../public');
const appUrl = 'conquest://launcher/index.html';
const issueCacheMs = 2 * 60 * 1000;

function trustedHttps(value, label) {
  if (typeof value !== 'string' || !value) throw new Error(`${label} is not configured.`);
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error(`${label} must use HTTPS.`);
  return url;
}

function bugRepository() {
  const repository = config.bugtracker?.repository;
  if (typeof repository !== 'string' || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) {
    throw new Error('The bugtracker repository is not configured correctly.');
  }
  return repository;
}

function handle(name, action) {
  ipcMain.handle(name, async (event, ...args) => {
    if (!window || event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame || event.senderFrame.url !== appUrl) {
      throw new Error('Untrusted launcher request.');
    }
    try { return { ok: true, value: await action(...args) }; }
    catch (error) { return { ok: false, error: error.message || 'The request could not be completed.' }; }
  });
}

function persist(next) {
  const pending = saveQueue.then(async () => { settings = await saveSettings(settingsFile, next); return settings; });
  saveQueue = pending.catch(() => {});
  return pending;
}

async function clientInfo() {
  const directory = settings?.installPath;
  if (!directory) return { installed: false, running: !!game, path: '' };
  let running = !!game;
  let detectionError = '';
  try { running ||= await isGameRunning(directory); } catch (error) { detectionError = error.message; }
  const executable = path.join(directory, path.basename(config.clientExecutable));
  let folderAvailable = false;
  try {
    folderAvailable = (await fs.stat(directory)).isDirectory();
    const stat = await fs.stat(executable);
    return { installed: stat.isFile(), addonsReady: stat.isFile() || localTesting, running, detectionError, path: directory };
  } catch (error) {
    return { installed: false, addonsReady: localTesting && folderAvailable && error.code === 'ENOENT', running, detectionError, path: directory, error: error.code === 'ENOENT' ? '' : `Client folder is unavailable: ${error.message}` };
  }
}

function sendDatabaseStatus(state, message = '') {
  if (!window || window.isDestroyed()) return;
  window.webContents.send('launcher:database-status', { state, message });
}

function openSafeExternal(value) {
  const url = trustedHttps(value, 'External link');
  return shell.openExternal(url.href);
}

function ensureDatabaseView() {
  if (databaseView && !databaseView.webContents.isDestroyed()) return databaseView;
  if (!window) throw new Error('Launcher window is not ready.');

  const target = trustedHttps(config.databaseEmbedUrl || config.links?.database, 'Database URL');
  const targetOrigin = target.origin;
  const databaseSession = session.fromPartition('coa-database');
  databaseSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  databaseSession.setPermissionCheckHandler(() => false);

  databaseView = new WebContentsView({
    webPreferences: {
      partition: 'coa-database',
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      devTools: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
    }
  });
  databaseView.setVisible(false);
  databaseView.setBackgroundColor('#160e0d');
  databaseView.setBorderRadius(8);
  window.contentView.addChildView(databaseView);

  const contents = databaseView.webContents;
  contents.setWindowOpenHandler(details => {
    try {
      const url = trustedHttps(details.url, 'Database link');
      if (url.origin === targetOrigin) setImmediate(() => contents.loadURL(url.href).catch(() => {}));
      else setImmediate(() => openSafeExternal(url.href).catch(() => {}));
    } catch {}
    return { action: 'deny' };
  });
  contents.on('will-navigate', event => {
    let next;
    try { next = trustedHttps(event.url, 'Database link'); }
    catch { event.preventDefault(); return; }
    if (next.origin !== targetOrigin) {
      event.preventDefault();
      openSafeExternal(next.href).catch(() => {});
    }
  });
  contents.on('did-start-loading', () => sendDatabaseStatus('loading'));
  contents.on('did-stop-loading', () => sendDatabaseStatus('ready'));
  contents.on('did-fail-load', (_event, errorCode, errorDescription, _validatedUrl, isMainFrame) => {
    if (isMainFrame && errorCode !== -3) sendDatabaseStatus('error', errorDescription || 'Database could not be loaded.');
  });
  contents.loadURL(target.href).catch(error => sendDatabaseStatus('error', error.message));
  return databaseView;
}

function databaseBounds(bounds) {
  if (!window || !bounds || typeof bounds !== 'object') throw new Error('Invalid database bounds.');
  const values = ['x', 'y', 'width', 'height'].map(key => Number(bounds[key]));
  if (values.some(value => !Number.isFinite(value))) throw new Error('Invalid database bounds.');
  const [x, y, width, height] = values.map(Math.round);
  const area = window.getContentBounds();
  const left = Math.max(0, Math.min(x, area.width - 1));
  const top = Math.max(0, Math.min(y, area.height - 1));
  const right = Math.max(left + 1, Math.min(x + width, area.width));
  const bottom = Math.max(top + 1, Math.min(y + height, area.height));
  if (right - left < 100 || bottom - top < 100) throw new Error('Database view is too small.');
  return { x: left, y: top, width: right - left, height: bottom - top };
}

async function readIssues(force = false) {
  const now = Date.now();
  const maxAge = force ? 15 * 1000 : issueCacheMs;
  if (issueCache.issues.length && now - issueCache.loadedAt < maxAge) return issueCache.issues;

  const repository = bugRepository();
  const api = `https://api.github.com/repos/${repository}/issues?state=open&sort=updated&direction=desc&per_page=100`;
  let response;
  try {
    response = await net.fetch(api, {
      method: 'GET',
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'Conquest-of-AzerothCore-Launcher',
        'X-GitHub-Api-Version': '2026-03-10',
      },
    });
  } catch (error) {
    if (issueCache.issues.length) return issueCache.issues;
    throw new Error(`Could not reach GitHub: ${error.message}`);
  }

  if (!response.ok) {
    if (issueCache.issues.length) return issueCache.issues;
    if (response.status === 403 || response.status === 429) throw new Error('GitHub is temporarily rate limiting issue requests. Try again shortly.');
    throw new Error(`GitHub returned HTTP ${response.status}.`);
  }

  const data = await response.json();
  if (!Array.isArray(data)) throw new Error('GitHub returned an unexpected issue response.');
  const issues = [];
  for (const issue of data) {
    if (!issue || typeof issue !== 'object' || issue.pull_request) continue;
    if (!Number.isInteger(issue.number) || typeof issue.title !== 'string') continue;
    issues.push({
      number: issue.number,
      title: issue.title.slice(0, 500),
      body: typeof issue.body === 'string' ? issue.body.slice(0, 20000) : '',
      state: issue.state === 'closed' ? 'closed' : 'open',
      stateReason: typeof issue.state_reason === 'string' ? issue.state_reason : '',
      updatedAt: typeof issue.updated_at === 'string' ? issue.updated_at : '',
      createdAt: typeof issue.created_at === 'string' ? issue.created_at : '',
      author: typeof issue.user?.login === 'string' ? issue.user.login : '',
      comments: Number.isInteger(issue.comments) ? issue.comments : 0,
      labels: Array.isArray(issue.labels) ? issue.labels.map(label => typeof label === 'string' ? label : label?.name).filter(name => typeof name === 'string').slice(0, 12) : [],
    });
  }
  issueCache = { loadedAt: now, issues };
  return issues;
}

function reportBody(report) {
  if (!report || typeof report !== 'object' || Array.isArray(report)) throw new Error('Invalid bug report.');
  const text = key => typeof report[key] === 'string' ? report[key].replace(/\r\n/g, '\n').trim() : '';
  const title = text('title');
  const category = text('category');
  const severity = text('severity');
  const issue = text('issue');
  const expected = text('expected');
  const actual = text('actual');
  const steps = text('steps');
  const allowedCategories = new Set(['Gameplay', 'Class / Spell', 'Quest', 'Item', 'Creature / NPC', 'Dungeon / Raid', 'UI / Addon', 'Performance / Crash', 'Other']);
  const allowedSeverities = new Set(['Minor', 'Normal', 'Major', 'Gamebreaking']);
  if (title.length < 3 || Buffer.byteLength(title, 'utf8') > 200 || /[\x00-\x1F\x7F]/.test(title)) throw new Error('Bug title must be 3–200 bytes and contain no control characters.');
  if (!allowedCategories.has(category) || !allowedSeverities.has(severity)) throw new Error('Choose a valid category and severity.');
  if (!issue || Buffer.byteLength(issue, 'utf8') > 7000) throw new Error('Describe the issue in 1–7,000 bytes.');
  for (const [name, value] of [['Expected result', expected], ['Actual result', actual], ['Steps to reproduce', steps]]) {
    if (Buffer.byteLength(value, 'utf8') > 2500) throw new Error(`${name} is too long.`);
  }
  const body = [
    'Submitted from the Conquest of AzerothCore launcher.',
    '',
    '### Classification',
    `Category: ${category}`,
    `Severity: ${severity}`,
    '',
    '### Issue',
    issue,
  ];
  if (expected) body.push('', '### Expected outcome', expected);
  if (actual) body.push('', '### Actual outcome', actual);
  if (steps) body.push('', '### Steps to reproduce', steps);
  body.push('', '### Launcher', `Version: ${app.getVersion()}`);
  const combined = body.join('\n');
  if (Buffer.byteLength(combined, 'utf8') > 16000) throw new Error('The complete bug report is too long.');
  return { title, body: combined };
}

async function submitBugReport(report) {
  const payload = reportBody(report);
  const submitUrl = config.bugtracker?.submitUrl;
  if (typeof submitUrl === 'string' && submitUrl) {
    const endpoint = trustedHttps(submitUrl, 'Bug report endpoint');
    const response = await net.fetch(endpoint.href, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'User-Agent': 'Conquest-of-AzerothCore-Launcher' },
      body: JSON.stringify(payload),
    });
    let data = null;
    try { data = await response.json(); } catch {}
    if (!response.ok) {
      if (response.status === 429) throw new Error('Bug reports are temporarily rate limited. Try again shortly.');
      throw new Error(data?.error || `Bug report service returned HTTP ${response.status}.`);
    }
    const number = Number(data?.issue_number);
    if (!Number.isInteger(number) || number <= 0) throw new Error('Bug report service returned an invalid issue number.');
    issueCache = { loadedAt: 0, issues: [] };
    return { mode: 'submitted', number };
  }

  // A distributed Electron app cannot safely contain the private Railway intake key.
  // Until a player-facing intake endpoint is configured, open a fully prefilled GitHub draft.
  const repository = bugRepository();
  const draft = new URL(`https://github.com/${repository}/issues/new`);
  draft.searchParams.set('title', payload.title);
  draft.searchParams.set('body', payload.body);
  await shell.openExternal(draft.href);
  return { mode: 'github' };
}

async function main() {
  settingsFile = path.join(app.getPath('userData'), 'settings.json');
  settings = await readSettings(settingsFile, message => dialog.showErrorBox(nativeText('Settings recovered'), message));
  const addonCatalogRoot = app.isPackaged ? path.join(process.resourcesPath, 'AddonCatalog') : path.resolve(__dirname, 'assets/AddonCatalog');
  addonService = new AddonService(addonCatalogRoot, { mandatoryFolders: config.mandatoryAddons || [], assetFolders: config.mandatoryAssetFolders || [] });
  clientUpdater = new ClientUpdater(config.manifestUrl, { allowLocalHttp: localTesting, notify: status => sendStatus('launcher:client-progress', status), beforeApply: async () => { if (game || clientMutation) throw new Error('Wait for the game or addon operation to finish.'); await requireGameClosed(settings?.installPath); } });
  launcherUpdates = createLauncherUpdates(app, status => sendStatus('launcher:update-status', status), async () => {
    if (clientUpdater?.busy || clientMutation) throw new Error('Wait for the current client operation to finish before restarting.');
  });
  portal = new Portal(config.apiBaseUrl, {
    allowLocalHttp: localTesting,
    cookieName: 'coa_launcher',
    sessionFile: path.join(app.getPath('userData'), 'launcher-account-session.bin'),
    encrypt: value => { if (!safeStorage.isEncryptionAvailable()) throw new Error('Windows account encryption is unavailable.'); return safeStorage.encryptString(value); },
    decrypt: value => safeStorage.decryptString(value)
  });
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  session.defaultSession.setPermissionCheckHandler(() => false);
  
  const youtubeFilter = {
  urls: [
    'https://www.youtube-nocookie.com/*',
    'https://www.youtube.com/*'
  ]
};

session.defaultSession.webRequest.onBeforeSendHeaders(
  youtubeFilter,
  (details, callback) => {
    details.requestHeaders.Referer =
      'https://com.conquestofazerothcore.launcher/';

    callback({
      cancel: false,
      requestHeaders: details.requestHeaders
    });
  }
);

  protocol.handle('conquest', request => {
    const url = new URL(request.url);
    if (url.hostname !== 'launcher' || request.method !== 'GET') return new Response('Not found', { status: 404 });
    let relative;
    try { relative = decodeURIComponent(url.pathname).replace(/^\/+/, ''); }
    catch { return new Response('Bad path', { status: 400 }); }
    const file = path.resolve(publicRoot, relative || 'index.html');
    if (!file.startsWith(publicRoot + path.sep)) return new Response('Forbidden', { status: 403 });
    return net.fetch(pathToFileURL(file).href);
  });

  window = new BrowserWindow({
    width: 1440, height: 900, minWidth: 1060, minHeight: 720,
    frame: false, backgroundColor: '#160e0d', show: false,
    title: config.name,
    icon: path.join(publicRoot, 'assets/app-icon.ico'),
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false }
  });
  window.removeMenu();
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', event => event.preventDefault());
  window.webContents.on('will-attach-webview', event => event.preventDefault());
  window.once('ready-to-show', () => window?.show());
  window.on('close', event => {
    if (clientUpdater?.busy || clientMutation) {
      event.preventDefault();
      dialog.showMessageBox(window, { type: 'info', title: nativeText('Client operation in progress'), message: nativeText('Pause the client download before closing. If files are being applied, please wait for it to finish.') });
    }
  });
  window.on('closed', () => {
    if (databaseView && !databaseView.webContents.isDestroyed()) databaseView.webContents.close();
    databaseView = null;
    window = null;
  });

  handle('launcher:bootstrap', async () => ({ config, settings, client: await clientInfo(), version: app.getVersion(), clientProgress: clientUpdater.status, launcherUpdate: launcherUpdates.status }));
  handle('launcher:account', () => portal.account());
  handle('launcher:discord', () => portal.request('/api/community/discord'));
  handle('launcher:login', (login, password) => portal.login(login, password));
  handle('launcher:register', (username, email, password, confirmPassword, acceptTestWarning) => portal.register(username, email, password, confirmPassword, acceptTestWarning));
  handle('launcher:account-overview', () => portal.overview());
  handle('launcher:account-characters', () => portal.characters());
  handle('launcher:discord-link-status', () => portal.discordLinkStatus());
  handle('launcher:discord-link-start', async () => {
    const result = await portal.startDiscordLink();
    const url = trustedHttps(result?.authorizeUrl, 'Discord authorization URL');
    if (url.hostname !== 'discord.com' || url.pathname !== '/oauth2/authorize') throw new Error('The backend returned an invalid Discord authorization URL.');
    await shell.openExternal(url.href);
    return { pending: true, expiresInSeconds: Number(result?.expiresInSeconds) || 600 };
  });
  handle('launcher:discord-link-unlink', () => portal.unlinkDiscord());
  handle('launcher:logout', () => portal.logout());

  handle('launcher:launcher-check', () => launcherUpdates.check());
  handle('launcher:launcher-install', () => launcherUpdates.install());
  handle('launcher:choose-install', chooseClientFolder);
  handle('launcher:client-check', async force => {
    if (config.localDownloadDemo) return { needsUpdate: false };
    await requireIdleClient();
    if (settings.installPath) await probeClientFolder(settings.installPath);
    return clientUpdater.check(settings.installPath, force === true);
  });
  handle('launcher:client-update', async force => {
    if (config.localDownloadDemo) throw new Error('Real client updates are disabled during the local download demo.');
    await requireIdleClient();
    if (settings.installPath) await probeClientFolder(settings.installPath);
    await clientUpdater.update(settings.installPath, force === true, true);
    try { await mutateClient(() => configureRealm(settings.installPath, config.realmlist)); }
    catch (error) {
      clientUpdater.emit('error', 'Client files updated, but realm setup failed: ' + error.message);
      throw error;
    }
    clientUpdater.emit('ready', 'Your client is ready to play.');
    return clientInfo();
  });
  handle('launcher:client-pause', () => clientUpdater.cancel());
  handle('launcher:window', action => {
    if (action === 'minimize') window.minimize();
    else if (action === 'maximize') window.isMaximized() ? window.unmaximize() : window.maximize();
    else if (action === 'close') window.close();
    else throw new Error('Unknown window action.');
  });
  handle('launcher:settings', async patch => {
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new Error('Invalid settings.');
    const next = { ...settings };
    for (const key of ['language', 'startPage', 'closeOnLaunch', 'rememberClient', 'reducedMotion', 'sound']) {
      if (Object.hasOwn(patch, key)) next[key] = patch[key];
    }
    return persist(next);
  });
  handle('launcher:choose-client', chooseClientFolder);
  handle('launcher:client-info', clientInfo);
  handle('launcher:launch', async () => {
    await requireIdleClient();
    if (game) throw new Error('Your game is already running.');
    const info = await clientInfo();
    if (!info.installed) throw new Error('Choose your installed client first.');
    if (!config.localDownloadDemo) {
      await probeClientFolder(info.path);
      const release = await clientUpdater.check(info.path, false, true);
      if (release.needsUpdate) return { running: false, needsUpdate: true };
    }
    await mutateClient(() => configureRealm(info.path, config.realmlist));

    const launched = {};
    game = launched;
    try {
      launched.pid = await launchGame(path.join(info.path, path.basename(config.clientExecutable)));
    } catch (error) { game = null; throw error; }
    // Observe the independent process without owning its lifetime or I/O.
    const monitor = setInterval(() => {
      try { process.kill(launched.pid, 0); }
      catch (error) {
        if (error.code !== 'ESRCH') return;
        clearInterval(monitor);
        if (game === launched) game = null;
        sendStatus('launcher:game-exit');
      }
    }, 2000);
    monitor.unref();
    if (settings.closeOnLaunch) window.minimize();
    return { running: true };
  });
  handle('launcher:open-folder', async () => {
    const info = await clientInfo();
    if (!info.installed) throw new Error('Choose your installed client first.');
    const result = await shell.openPath(info.path);
    if (result) throw new Error(result);
  });
  handle('launcher:external', async key => {
    if (typeof key !== 'string' || !Object.hasOwn(config.links, key)) throw new Error('Unknown service.');
    if (localTesting && (key === 'account' || key === 'register')) { await shell.openExternal(config.links[key]); return; }
    await shell.openExternal(externalUrl(config.links[key]));
  });
  handle('launcher:database-view', async request => {
    if (!request || typeof request !== 'object') throw new Error('Invalid database view request.');
    if (request.visible === false) {
      if (databaseView && !databaseView.webContents.isDestroyed()) databaseView.setVisible(false);
      return { visible: false };
    }
    const view = ensureDatabaseView();
    view.setBounds(databaseBounds(request.bounds));
    view.setVisible(true);
    return { visible: true };
  });
  handle('launcher:database-reload', async () => {
    const view = ensureDatabaseView();
    view.webContents.reload();
  });
  handle('launcher:issues', async force => readIssues(force === true));
  handle('launcher:open-issue', async number => {
    if (!Number.isInteger(number) || number <= 0) throw new Error('Invalid issue number.');
    await shell.openExternal(`https://github.com/${bugRepository()}/issues/${number}`);
  });
  handle('launcher:submit-bug', submitBugReport);
  handle('launcher:addons', async verify => {
    if (clientMutation) throw new Error('Wait for the addon operation to finish.');
    if (!addonService) throw new Error('Addon catalog is not ready.');
    const info = await clientInfo();
    return addonService.list(info.addonsReady ? info.path : '', verify === true);
  });
  handle('launcher:addon-install', async packageId => mutateClient(async () => {
    if (game) throw new Error('Close the game before installing or repairing addons.');
    if (!addonService) throw new Error('Addon catalog is not ready.');
    const info = await clientInfo();
    if (!info.addonsReady) throw new Error('Choose your installed client first.');
    const plan = await addonService.planInstall(packageId, info.path);
    if (plan.length > 1) {
      const answer = await dialog.showMessageBox(window, { type: 'question', title: nativeText('Required addons'), message: nativeText('Install this addon and its required packages?'), detail: plan.map(pkg => pkg.name).join('\n'), buttons: [nativeText('Cancel'), nativeText('Install all')], defaultId: 1, cancelId: 0 });
      if (answer.response !== 1) return { result: { cancelled: true }, catalog: await addonService.list(info.path) };
    }
    const result = await addonService.install(packageId, info.path);
    return { result, catalog: await addonService.list(info.path) };
  }));
  handle('launcher:addon-uninstall', async packageId => mutateClient(async () => {
    if (game) throw new Error('Close the game before uninstalling addons.');
    if (!addonService) throw new Error('Addon catalog is not ready.');
    const info = await clientInfo();
    if (!info.addonsReady) throw new Error('Choose your installed client first.');
    const result = await addonService.uninstall(packageId, info.path);
    return { result, catalog: await addonService.list(info.path) };
  }));
  handle('launcher:open-addons-folder', async () => {
    const info = await clientInfo();
    if (!info.addonsReady) throw new Error('Choose your installed client first.');
    writableClient(info.path);
    await safePath(info.path, 'Interface/AddOns/.probe', true);
    const folder = path.join(info.path, 'Interface', 'AddOns');
    await fs.mkdir(folder, { recursive: true });
    const result = await shell.openPath(folder);
    if (result) throw new Error(result);
  });

  await window.loadURL(appUrl);
  setTimeout(() => launcherUpdates.check(), 5000).unref();
  setInterval(() => launcherUpdates.check(), 4 * 60 * 60 * 1000).unref();
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { if (window?.isMinimized()) window.restore(); window?.focus(); });
  app.whenReady().then(main).catch(error => { dialog.showErrorBox(nativeText('Launcher could not start'), error.message); app.quit(); });
  app.on('window-all-closed', () => app.quit());
}
