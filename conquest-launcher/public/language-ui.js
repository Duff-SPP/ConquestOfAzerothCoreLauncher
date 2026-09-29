'use strict';
const languageShell = new Map();
for (const selector of ['header', 'footer']) {
  const element = document.querySelector(selector);
  if (element) languageShell.set(element, element.innerHTML);
}
function languageOptions() {
  return launcherI18n.languages.map(item => `<option value="${item.code}" ${item.code === launcherI18n.language ? 'selected' : ''}>${item.name}</option>`).join('');
}
function refreshLanguageShell() {
  for (const [element, source] of languageShell) element.innerHTML = launcherI18n.html(source);
  fillIcons();
}
function applyLanguage(code) {
  launcherI18n.setLanguage(code);
  refreshLanguageShell();
  render();
  document.getElementById('connection-status').textContent = state.account ? lt`Signed in: ${state.account.username}` : state.accountServiceAvailable === true ? t('Account service connected') : state.accountServiceAvailable === false ? t('Account service unavailable') : t('Connecting...');
  if (modal.open) {
    if (modal.classList.contains('language-dialog')) showLanguage();
    else if (modal.classList.contains('settings-dialog')) showSettings();
  }
}
function showLanguage() {
  openModal(lh`${modalHeader(t('Language'))}<div class="modal-body"><label class="setting-row"><span class="setting-title">Language</span><select data-setting="language" aria-label="Language">${languageOptions()}</select></label><p>Choose the language used by the launcher. This does not change the game language.</p></div><div class="modal-footer"><button class="gold-button" data-action="dismiss-modal">Done</button></div>`, 'language-dialog');
}
actions.language = showLanguage;
