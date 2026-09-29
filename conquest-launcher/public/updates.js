'use strict';
state.clientProgress = state.clientProgress || { phase: 'idle', message: t('Checking client service…') };
state.launcherUpdate = state.launcherUpdate || { phase: 'idle', message: '' };
state.account = null;
const clientBusy = () => ['checking', 'downloading', 'verifying', 'staging', 'applying', 'finalizing', 'installing-required-addons', 'pausing'].includes(state.clientProgress.phase);
const sizeLabel = value => value >= 1024 ** 3 ? `${(value / 1024 ** 3).toFixed(2)} GB` : `${(value / 1024 ** 2).toFixed(1)} MB`;

function updateControls() {
  const progress = state.clientProgress;
  if (state.config.localDownloadDemo && progress.phase === 'idle' && !progress.message.startsWith('Demo complete')) progress.message = '10-minute download demo · No files will be written.';
  const discordText = document.querySelector('.discord-name small');
  if (discordText && state.discord?.available && state.discord.guildId === state.config.discord?.guildId) {
    const online = state.discord.online, members = state.discord.members;
    discordText.textContent = Number.isInteger(online) && Number.isInteger(members) ? lt`~${online.toLocaleString(launcherI18n.language)} online · ${members.toLocaleString(launcherI18n.language)} members` : t('Join our community');
  }
  const discordCard = document.querySelector('.discord-card');
  if (discordCard) discordCard.title = t('Join Conquest on Discord');
  const play = document.querySelector('.play-button');
  if (play) {
    play.disabled = clientBusy();
    play.querySelector('.play-title').textContent = state.client.running ? t('Playing') : clientBusy() ? (progress.phase === 'checking' ? t('Checking') : progress.phase === 'applying' ? t('Applying') : progress.phase === 'staging' ? t('Preparing') : t('Updating')) : progress.phase === 'available' || progress.phase === 'paused' ? (state.client.installed ? t('Update') : t('Download')) : state.client.installed ? t('Play') : t('Download');
    play.querySelector('.play-subtitle').textContent = state.client.running ? t('Your adventure is underway') : clientBusy() ? t('Preparing your adventure') : state.client.installed ? t('Enter Azeroth') : t('Begin your adventure');
  }
  let panel = document.getElementById('client-update-progress');
  const controls = document.querySelector('.client-controls');
  if (!panel && controls) {
    panel = document.createElement('div'); panel.id = 'client-update-progress'; panel.className = 'client-update-progress';
    panel.innerHTML = launcherI18n.html('<div class="download-heading"><span class="download-heading-label">Client status</span><span class="download-percent"></span></div><p class="update-message" role="status"></p><div class="download-meter"><progress aria-label="Client update progress" max="100"></progress></div><div class="update-detail"></div><button class="ghost-button" data-action="pause-client">Pause download</button>');
    controls.append(panel);
  }
  if (panel) {
    panel.dataset.phase = progress.phase;
    panel.querySelector('.download-meter').hidden = !clientBusy();
    panel.querySelector('.download-heading-label').textContent = ({ verifying: t('Verifying files'), finalizing: t('Finalizing update'), 'installing-required-addons': t('Installing required CoA addons'), pausing: t('Pausing update'), checking: t('Checking files'), downloading: t('Downloading client'), staging: t('Preparing downloaded files'), applying: t('Installing update'), paused: t('Download paused'), ready: t('Ready to play') })[progress.phase] || t('Client status');
    panel.querySelector('.update-message').textContent = tm(state.client.error || state.client.detectionError || progress.message) || '';
    const bar = panel.querySelector('progress'); bar.hidden = !clientBusy();
    if (progress.totalBytes) bar.value = Math.min(99, 100 * progress.bytes / progress.totalBytes);
    else if (progress.total) bar.value = Math.min(99, 100 * progress.completed / progress.total);
    else bar.removeAttribute('value');
    panel.querySelector('.download-percent').textContent = progress.phase === 'ready' ? '100%' : clientBusy() && bar.hasAttribute('value') ? `${Math.floor(bar.value)}%` : '';
    panel.querySelector('.update-detail').textContent = progress.totalBytes ? `${sizeLabel(progress.bytes)} / ${sizeLabel(progress.totalBytes)}` : progress.version ? lt`Client ${progress.version}` : '';
    panel.querySelector('button').hidden = !['downloading', 'checking', 'verifying', 'staging'].includes(progress.phase);
  }
  document.getElementById('footer-client').textContent = state.client.running ? t('Game running') : clientBusy() ? t('Updating client') : progress.phase === 'ready' ? t('Client ready') : state.client.installed ? t('Client selected') : t('No client installed');
  const updateText = document.getElementById('launcher-update-message');
  if (updateText) updateText.textContent = tm(state.launcherUpdate.message);
  const restart = document.getElementById('launcher-restart');
  if (restart) restart.hidden = state.launcherUpdate.phase !== 'downloaded';
  const caption = document.querySelector('.preview-label');
  if (caption) caption.textContent = window.launcher ? (state.launcherUpdate.phase === 'downloaded' ? t('UPDATE READY') : '') : '';
  document.querySelector('.account-button')?.setAttribute('title', state.account ? lt`Signed in as ${state.account.username}` : t('Sign in to your game account'));
}
const renderWithOriginalDesign = render;
render = function () { renderWithOriginalDesign(); updateControls(); };

showInstall = function () {
  openModal(lh`${modalHeader(t('Install Conquest of AzerothCore'), t('Your adventure starts here'))}<div class="modal-body"><div class="install-art"></div><p>Choose a dedicated folder for your game. The launcher downloads the client, keeps it updated and connects it to our realm.</p><p>Interrupted downloads can resume. Your settings, addons and screenshots are preserved.</p><div class="path-field">${icon('folder')}<span>${escape(state.client.path || t('Choose your game folder'))}</span></div></div><div class="modal-footer"><button class="secondary-button" data-action="choose-client">${state.client.path ? t('Change folder') : t('Locate existing client')}</button><button class="gold-button" data-action="${state.client.path ? 'install-selected-client' : 'install-client'}">${icon('download')}${state.client.path ? t('Install in selected folder') : t('Choose folder & install')}</button></div>`);
};
showAccount = function () {
  if (state.account) {
    openModal(lh`${modalHeader(lt`Welcome, ${state.account.username}`, t('Your game account'))}<div class="modal-body"><p>You are signed in to Conquest of AzerothCore.</p><div class="account-actions"><button class="gold-button" data-action="account-dashboard">Manage account</button><button class="secondary-button" data-action="logout">Sign out</button></div></div>`);
    return;
  }
  showAccountLogin();
};
document.addEventListener('submit', async event => {
  if (event.target.id !== 'launcher-login') return;
  event.preventDefault();
  const form = event.target; const button = form.querySelector('[type="submit"]'); button.disabled = true;
  const password = form.querySelector('#account-password');
  try {
    state.account = await api.login(form.querySelector('#account-login').value, password.value);
    if (state.account?.persistenceWarning) toast(state.account.persistenceWarning);
    password.value = ''; showAccount(); updateControls();
  } catch (error) { password.value = ''; form.querySelector('#login-error').textContent = tm(error.message); }
  finally { button.disabled = false; }
});
// Visual-only local demo. Never calls the updater or writes into the selected folder.
let downloadDemoTimer = null, downloadDemoElapsed = 0, downloadDemoStarted = 0;
function startDownloadDemo() {
  if (downloadDemoTimer) return;
  if (downloadDemoElapsed >= 600000) downloadDemoElapsed = 0;
  closeModal(); state.page = 'home'; render();
  downloadDemoStarted = performance.now() - downloadDemoElapsed;
  const files = ['Data/patch-A.MPQ', 'Data/patch-B.MPQ', 'Data/patch-C.MPQ', 'Data/patch-D.MPQ', 'Data/enUS/locale-enUS.MPQ', 'Ascension.exe'];
  const tick = () => {
    downloadDemoElapsed = Math.min(600000, performance.now() - downloadDemoStarted);
    const fraction = downloadDemoElapsed / 600000;
    state.clientProgress = { phase: 'downloading', message: lt`DEMO · Downloading ${files[Math.min(files.length - 1, Math.floor(fraction * files.length))]}`, bytes: Math.floor(24 * 1024 ** 3 * fraction), totalBytes: 24 * 1024 ** 3 };
    if (fraction >= 1) {
      clearInterval(downloadDemoTimer); downloadDemoTimer = null;
      state.clientProgress = { phase: 'idle', message: 'Demo complete · No files downloaded or changed.' };
    }
    updateControls();
  };
  downloadDemoTimer = setInterval(tick, 250); tick();
}
async function performClientUpdate(force = false) {
  if (state.config.localDownloadDemo) { startDownloadDemo(); return; }
  closeModal(); state.page = 'home'; render();
  try { state.client = await api.updateClient(force); render(); toast(t('Client ready. Enjoy Azeroth!')); }
  finally { state.client = await api.clientInfo(); updateControls(); }
}
pendingUpdate = async function (force = false) {
  state.forceRepair = force;
  if (!state.client.path) { showInstall(); return; }
  closeModal();
  const plan = await api.checkClient(force);
  if (!plan.needsUpdate) { toast(plan.warnings?.length ? plan.warnings.join('\n') : t('Your client is up to date.')); return; }
  openModal(lh`${modalHeader(force ? t('Repair your client') : t('Client update available'), lt`Release ${plan.version}`)}<div class="modal-body"><p>${plan.files} files to download · ${sizeLabel(plan.bytes)}${plan.removed ? lt` · ${plan.removed} obsolete files to remove` : ''}</p><p>Game folder: ${escape(state.client.path)}</p><p>Your game must be closed while updating.</p></div><div class="modal-footer"><button class="secondary-button" data-action="dismiss-modal">Later</button><button class="gold-button" data-action="apply-client-update">Download & apply</button></div>`);
};
const settingsWithOriginalDesign = showSettings;
showSettings = function (tab = state.settingsTab) {
  settingsWithOriginalDesign(tab);
  const pane = document.querySelector('.settings-pane');
  if (tab === 'about') {
    pane.innerHTML = lh`<h3>Conquest of AzerothCore</h3><p>Launcher version ${escape(state.version)}</p><div class="setting-row"><span class="setting-title">Realm</span><span class="setting-description">${escape(state.config.realmlist || t('Not configured'))}</span></div><p id="launcher-update-message" role="status"></p><div class="button-row"><button class="secondary-button" data-action="launcher-check">Check launcher updates</button><button id="launcher-restart" class="gold-button" data-action="launcher-install" hidden>Restart & update</button></div><p class="credits">Launcher updates download automatically. Restart when you are ready to install them.</p>`;
  } else if (tab === 'launcher') {
    pane.insertAdjacentHTML('beforeend', launcherI18n.html('<div class="button-row"><button class="secondary-button" data-action="launcher-check">Check launcher updates</button><button id="launcher-restart" class="gold-button" data-action="launcher-install" hidden>Restart & update</button></div><p id="launcher-update-message" role="status"></p>'));
  } else if (tab === 'game') {
    pane.querySelector('.credits').textContent = t('Updates are checked at startup and downloaded when you click Update. Scan & repair verifies every managed file.');
  }
  updateControls();
};
actions.account = () => showAccount();
actions['account-dashboard'] = () => loadAccountDashboard();
actions.settings = () => showSettings('launcher');
actions['game-settings'] = () => showSettings('game');
actions['check-updates'] = () => pendingUpdate(false);
actions.repair = () => pendingUpdate(true);
actions['pause-client'] = () => {
  if (!state.config.localDownloadDemo) return api.pauseClient();
  clearInterval(downloadDemoTimer); downloadDemoTimer = null;
  state.clientProgress = { phase: 'paused', message: t('DEMO paused · Click Download to resume.') }; updateControls();
};
actions['apply-client-update'] = () => performClientUpdate(state.forceRepair === true);
actions['install-selected-client'] = () => performClientUpdate();
actions['install-client'] = async () => {
  const client = await api.chooseInstall(); if (!client) return;
  state.client = client; state.settings.installPath = client.path;
  await performClientUpdate();
};
actions.logout = async () => { try { await api.logout(); } finally { state.account = null; state.accountOverview = null; state.accountCharacters = []; state.discordLink = null; showAccount(); updateControls(); } };
actions['launcher-check'] = async () => { state.launcherUpdate = await api.checkLauncher(); updateControls(); };
actions['launcher-install'] = () => api.installLauncherUpdate();
actions.play = async () => {
  if (state.client.running) { toast(t('Your game is already running.')); return; }
  if (!state.client.installed && state.clientProgress.phase !== 'paused') { showInstall(); return; }
  if (['available', 'paused'].includes(state.clientProgress.phase)) await performClientUpdate();
  let result = await api.launch();
  if (result.needsUpdate) { await performClientUpdate(); result = await api.launch(); }
  if (!result.running) throw new Error(t('The client release changed while updating. Please try again.'));
  state.client.running = true; render();
};
if (window.launcher) {
  api.onClientProgress(progress => {
    state.clientProgress = progress; updateControls();
    if (progress.phase === 'ready' && progress.warnings?.length) toast(progress.warnings.join('\n'));
  });
  api.onLauncherUpdate(status => { state.launcherUpdate = status; updateControls(); if (status.phase === 'downloaded') toast(tm(status.message) + ' ' + t('Open Settings to restart.')); });
  window.addEventListener('DOMContentLoaded', async () => {
    await api.bootstrap();
    const refreshDiscord = () => api.discord().then(data => { state.discord = data; updateControls(); }).catch(() => {});
    refreshDiscord(); setInterval(refreshDiscord, 5 * 60 * 1000);
    let refreshingClient = false;
    const refreshClient = async () => {
      if (refreshingClient) return;
      refreshingClient = true;
      try { state.client = await api.clientInfo(); updateControls(); } catch {} finally { refreshingClient = false; }
    };
    window.addEventListener('focus', refreshClient);
    setInterval(refreshClient, 10000);
    api.account().then(account => { state.account = account; state.accountServiceAvailable = true; updateControls(); document.getElementById('connection-status').textContent = account ? lt`Signed in: ${account.username}` : t('Account service connected'); }).catch(() => { state.accountServiceAvailable = false; document.getElementById('connection-status').textContent = t('Account service unavailable'); });
    try {
      if (!state.client.running) await api.checkClient(false);
      // Checking is automatic; downloading/applying always requires a player click.
    } catch (error) { state.clientProgress = { phase: 'error', message: tm(error.message) }; }
    updateControls();
  });
} else {
  for (const key of ['chooseInstall', 'checkClient', 'updateClient', 'login', 'logout', 'discordLinkStatus', 'discordLink', 'discordUnlink', 'checkLauncher', 'installLauncherUpdate']) api[key] = async () => { throw new Error(t('Open the installed desktop launcher to use this feature.')); };
  updateControls();
}
