/* Local renderer: no remote scripts, credentials, or reference-launcher services. */
'use strict';
const icons = {
  home: launcherI18n.html('<path d="m3 10 9-7 9 7v10H7V10"/><path d="M10 20v-7h5v7"/>'),
  news: launcherI18n.html('<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8 8h8M8 12h3M8 16h3M14 12h2M14 16h2"/>'),
  store: launcherI18n.html('<path d="M3 9 5 4h14l2 5M4 10v10h16V10M3 9a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0M9 20v-6h6v6"/>'),
  heart: launcherI18n.html('<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/>'),
  bug: launcherI18n.html('<rect x="7" y="7" width="10" height="14" rx="5"/><path d="M9 7V5a3 3 0 0 1 6 0v2M12 10v11M3 9l4 2M21 9l-4 2M2 15h5m10 0h5M4 21l4-3m8 0 4 3"/>'),
  book: launcherI18n.html('<path d="M12 5v16M12 5C8 2 4 3 2 4v15c4-2 7-1 10 2 3-3 6-4 10-2V4c-2-1-6-2-10 1Z"/>'),
  database: launcherI18n.html('<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 4 16 4 16 0V5M4 12c0 4 16 4 16 0"/>'),
  addons: launcherI18n.html('<path d="M9 3h6v5c5-3 6 5 0 3v5h-5c3 5-5 6-3 0H3V9h5c-3-5 5-6 1-6Z"/>'),
  bell: launcherI18n.html('<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>'),
  settings: launcherI18n.html('<path d="m9 3 1-1h4l1 3 3 1 3 1 1 4-2 2-1 3v3l-4 2-2-2h-3l-3 1-3-3 1-3-1-3-2-2 2-4 3 1Z"/><circle cx="12" cy="12" r="3"/>'),
  user: launcherI18n.html('<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>'),
  download: launcherI18n.html('<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>'),
  play: launcherI18n.html('<path d="m7 3 14 9-14 9Z"/>'),
  folder: launcherI18n.html('<path d="M3 7V4h6l3 3h9v14H3Z"/><path d="M3 10h18"/>'),
  info: launcherI18n.html('<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/>'),
  external: launcherI18n.html('<path d="M14 3h7v7m0-7L10 14M9 3H3v18h18v-6"/>'),
  discord: launcherI18n.html('<path d="M8 5 5 6c-2 4-3 8-3 11l5 2 1-2m8-12 3 1c2 4 3 8 3 11l-5 2-1-2M6 16c4 2 8 2 12 0M8 5l1 2a16 16 0 0 1 6 0l1-2"/><ellipse cx="8" cy="12" rx="1" ry="1.5"/><ellipse cx="16" cy="12" rx="1" ry="1.5"/>'),
  arrow: launcherI18n.html('<path d="M4 12h16m-6-6 6 6-6 6"/>'),
  check: launcherI18n.html('<path d="m4 12 5 5L20 6"/>'),
  search: launcherI18n.html('<circle cx="10" cy="10" r="7"/><path d="m15 15 6 6"/>'),
  refresh: launcherI18n.html('<path d="M3 10a9 9 0 0 1 15-6l3 3M21 3v4h-4M21 14A9 9 0 0 1 6 20l-3-3M3 21v-4h4"/>'),
  shield: launcherI18n.html('<path d="m12 2 9 4v6c0 6-9 10-9 10S3 18 3 12V6Z"/><path d="m8 12 3 3 5-6"/>'),
  globe: launcherI18n.html('<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18"/>'),
  monitor: launcherI18n.html('<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M12 17v4m-5 0h10"/>'),
  logout: launcherI18n.html('<path d="M9 3H3v18h6M9 12h12m-5-5 5 5-5 5"/>'),
};
const icon = name => lh`<i data-icon="${name}"><svg viewBox="0 0 24 24" aria-hidden="true">${icons[name] || icons.info}</svg></i>`;
function fillIcons(root = document) { for (const node of root.querySelectorAll('i[data-icon]:empty')) node.innerHTML = lh`<svg viewBox="0 0 24 24" aria-hidden="true">${icons[node.dataset.icon] || icons.info}</svg>`; }
function escape(value = '') { return String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character])); }
const articles = [
{
  id: 'welcome',
  category: 'ANNOUNCEMENT',
  title: 'Welcome to Conquest of AzerothCore',
  summary: 'Your gateway to the PTR begins here.',
  image: 'portal.webp',
  body: [
    'Use the launcher to install, update, and repair your client, manage addons, and access account features in one place.',
    'Stay tuned for future project announcements, patch notes, and community updates.'
  ]
},
{
  id: 'world',
  category: 'EXPLORE',
  title: 'A world waiting to be rediscovered',
  summary: 'Familiar lands. New stories. Find your way back to Azeroth.',
  image: 'world-background.png',
  body: [
    'From the gates of ancient cities to the far reaches of Azeroth, your next journey is waiting.',
    'Explore familiar lands and find your next adventure in Azeroth.'
  ]
},
  { id: 'journey', category: 'DEVELOPMENT', title: 'Building the journey ahead', summary: 'Follow the development of Conquest of AzerothCore.', image: 'landscape.webp', body: ['Follow development updates, changelogs, and community announcements here.', 'Check back for the latest project news.'] },
  { id: 'community', category: 'COMMUNITY', title: 'Your adventure. Our community.', summary: 'Find your guild, share your stories, and stay connected.', image: 'trailer.jpg', body: ['Azeroth is better together. Join the Conquest of AzerothCore community on Discord.', 'Use the Discord button to meet other players and stay connected.'] }
];
const changelogEntries = [
  {
    version: '0.6.8',
    items: [
      'Added multilingual launcher support with saved language selection for English, French, Russian, and Simplified Chinese.',
      'Improved installer and uninstaller ownership, locking, registration, and build handling to better protect player files.',
      'Improved production bundle protection while preserving launcher update compatibility.'
    ]
  },
  {
    version: '0.6.7',
    items: [
      'Added optional minimum launcher compatibility checks and expanded downloader regression coverage.'
    ]
  },
  {
    version: '0.6.6',
    items: [
      'Improved addon backup and recovery, dependency handling, stale inventory refresh, and realm setup retry behavior.'
    ]
  },
  {
    version: '0.6.5',
    items: [
      'Added player addon inventory and removed automatic required-addon synchronization so custom addons stay under player control.'
    ]
  },
  {
    version: '0.6.4',
    items: [
      'Improved download, verification, preparation, cancellation, resume, and progress handling.'
    ]
  },
  {
    version: '0.6.3',
    items: [
      'Introduced automatic required-addon installation; this behavior was later removed in version 0.6.5.'
    ]
  },
  {
    version: '0.6.2',
    items: [
      'Added launcher file ownership tracking and safer preservation during install, upgrade, and uninstall.'
    ]
  },
  {
    version: '0.6.1',
    items: [
      'Improved folder selection and installation flow, preserved MemoryBridge.log, and smoothed the transition from updating to ready to play.'
    ]
  }
];
const emptyConfig = { name: 'Conquest of AzerothCore', links: {} };
const defaultSettings = { language: 'en', startPage: 'home', closeOnLaunch: false, rememberClient: true, reducedMotion: false, sound: true, installPath: '' };
let previewSettings;
try { previewSettings = { ...defaultSettings, ...JSON.parse(localStorage.getItem('conquest-preview-settings') || '{}') }; } catch { previewSettings = { ...defaultSettings }; }
const api = window.launcher || {
  bootstrap: async () => ({ config: emptyConfig, settings: previewSettings, client: { installed: false, running: false, path: '' }, version: '0.2.0' }),
  window: async action => { if (action === 'maximize' && !document.fullscreenElement) await document.documentElement.requestFullscreen(); else if (action === 'maximize') await document.exitFullscreen(); else toast(t('Window controls work in the desktop launcher.')); },
  saveSettings: async patch => { Object.assign(previewSettings, patch); localStorage.setItem('conquest-preview-settings', JSON.stringify(previewSettings)); return previewSettings; },
  chooseClient: async () => { throw new Error(t('Open the desktop launcher to select a client folder.')); },
  clientInfo: async () => ({ installed: false, running: false, path: '' }),
  launch: async () => { throw new Error(t('Select a client in the desktop launcher first.')); },
  openFolder: async () => { throw new Error(t('Select a client in the desktop launcher first.')); },
  external: async () => { throw new Error(t('This service has not been connected yet.')); },
  account: async () => null,
  login: async () => { throw new Error(t('Account login is available in the desktop launcher.')); },
  register: async () => { throw new Error(t('Account registration is available in the desktop launcher.')); },
  accountOverview: async () => { throw new Error(t('Account management is available in the desktop launcher.')); },
  accountCharacters: async () => [],
  logout: async () => {},
  databaseView: async () => ({ visible: false }),
  reloadDatabase: async () => {},
  issues: async () => [],
  openIssue: async () => { throw new Error(t('Issue links open in the desktop launcher.')); },
  submitBug: async () => { throw new Error(t('Bug submission is available in the desktop launcher.')); },
  addons: async () => ({ packages: [], folderCount: 0 }),
  installAddon: async () => { throw new Error(t('Addon installation is available in the desktop launcher.')); },
  uninstallAddon: async () => { throw new Error(t('Addon management is available in the desktop launcher.')); },
  openAddonsFolder: async () => { throw new Error(t('Select a client in the desktop launcher first.')); },
  onDatabaseStatus: () => () => {},
  onGameExit: () => () => {},
};
const state = {
  page: 'home', newsTab: 'latest', settingsTab: 'launcher', addonTab: 'browse',
  config: emptyConfig, settings: defaultSettings, client: { installed: false, path: '', running: false }, version: '0.2.0',
  issues: [], issuesLoading: false, issuesError: '', issueQuery: '', databaseStatus: 'loading', databaseMessage: '',
  addons: [], addonLoading: false, addonError: '', addonQuery: '', addonCategory: 'all', addonFolderCount: 0,
  account: null, accountOverview: null, accountCharacters: []
};
const main = document.getElementById('main-content');
const modal = document.getElementById('modal');
const modalContent = document.getElementById('modal-content');
const popoverRoot = document.getElementById('popover-root');
let toastTimer;
let lastModalFocus = null;
function toast(message) {
  clearTimeout(toastTimer);
  const element = document.getElementById('toast');
  element.textContent = tm(message); element.hidden = false;
  toastTimer = setTimeout(() => { element.hidden = true; }, 5500);
}
async function guarded(action) {
  try { return await action(); }
  catch (error) {
    const message = tm(error.message) || t('Something went wrong.');
    if (modal.open) {
      let notice = modalContent.querySelector('[data-modal-error]');
      if (!notice) {
        notice = document.createElement('div'); notice.className = 'info-box';
        notice.dataset.modalError = ''; notice.setAttribute('role', 'alert');
        (modalContent.querySelector('.modal-body') || modalContent).prepend(notice);
      }
      notice.textContent = message;
    } else toast(message);
    return null;
  }
}
function openModal(content, className = '') {
  popoverRoot.innerHTML = '';
  if (state.page === 'database') api.databaseView({ visible: false }).catch(() => {});
  if (!modal.open) lastModalFocus = document.activeElement;
  modal.className = className; modalContent.innerHTML = content; fillIcons(modalContent);
  if (!modal.open) modal.showModal();
  modal.querySelector('.modal-close')?.focus();
}
function closeModal() {
  modal.close();
  if (state.page === 'database') requestAnimationFrame(syncDatabaseView);
}
modal.addEventListener('close', () => {
  // Destroy modal content when closed.
  // This stops embedded media such as YouTube immediately.
  modalContent.innerHTML = '';

  if (lastModalFocus?.isConnected) {
    lastModalFocus.focus();
  }

  if (state.page === 'database') {
    requestAnimationFrame(syncDatabaseView);
  }
});
modal.addEventListener('click', event => { if (event.target === modal) { const bounds = modal.getBoundingClientRect(); if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) closeModal(); } });
const modalHeader = (title, subtitle = '') => lh`<div class="modal-header"><div><h2 id="modal-title">${escape(title)}</h2>${subtitle ? lh`<p>${escape(subtitle)}</p>` : ''}</div><button class="modal-close" data-action="dismiss-modal" aria-label="Close dialog">×</button></div>`;
const titleBlock = (title, description, badge = '') => lh`<div class="page-topline"><div><div class="eyebrow">Conquest of AzerothCore</div><h1 class="page-title">${title}</h1><p class="page-description">${description}</p></div>${badge ? lh`<span class="page-tag">${badge}</span>` : ''}</div>`;
function newsCard(article) { return lh`<button class="news-card" data-article="${article.id}"><div class="news-art"><img src="assets/${article.image}" alt="" loading="eager"><span class="news-category">${t(article.category)}</span></div><div class="news-copy"><div class="news-date">Conquest of AzerothCore</div><h3>${t(article.title)}</h3><p>${t(article.summary)}</p></div></button>`; }
function changelogHtml() {
  return lh`<div class="changelog-history"><p class="changelog-intro">${t('Release history from version 0.6.1 onward.')}</p>${changelogEntries.map(entry => lh`<div class="changelog-item"><small>LAUNCHER · v${escape(entry.version)}</small><h3>${lt`Version ${entry.version}`}</h3><ul class="changelog-list">${entry.items.map(item => lh`<li>${t(item)}</li>`).join('')}</ul></div>`).join('')}</div>`;
}
function homePage() {
  const installed = state.client.installed;
  return lh`<div class="home-page"><section class="hero-grid"><div class="hero-copy"><div class="eyebrow">Your world. Your adventure.</div><h1>Conquest of<br>AzerothCore</h1><p class="hero-description">Return to the world that started it all.<br>Begin your next chapter in Azeroth.</p><div class="client-controls"><div class="client-label"><span>Conquest of AzerothCore</span><span>${installed ? t('Client selected') : 'World of Warcraft'}</span></div><div class="play-row"><button class="play-button" data-action="play">${icon(installed ? 'play' : 'download')}<span class="play-text"><span class="play-title">${state.client.running ? t('Playing') : installed ? t('Play') : t('Download')}</span><span class="play-subtitle">${state.client.running ? t('Your adventure is underway') : installed ? t('Enter Azeroth') : t('Begin your adventure')}</span></span></button><button class="play-options" data-action="play-options" aria-label="Game options">⌄</button></div><button class="locate-client" data-action="choose-client">${icon('folder')}${installed ? launcherI18n.html('<span>Change game location</span>') : launcherI18n.html('Already installed? <span>Locate game</span>')}</button></div></div><aside class="hero-side"><fieldset class="trailer-panel"><legend>A world of adventure</legend><button class="trailer-button" data-action="trailer" aria-label="Watch the trailer"><img src="assets/trailer.jpg" alt="A dragon above a burning Azeroth landscape"><span class="trailer-play"><span>${icon('play')}</span></span><span class="trailer-caption">YOUR NEXT CHAPTER AWAITS</span></button></fieldset><button class="discord-card" data-action="discord"><span class="discord-crest discord-crest-image"><img src="assets/ascension-emblem.webp" alt=""></span><span class="discord-name">Conquest<span><small>Join our community</small></span></span><span class="discord-link">${icon('discord')} DISCORD ${icon('external')}</span></button></aside></section><section class="news-section"><div class="section-heading"><h2>Latest news</h2><span class="heading-rule"></span><button data-page="news">View all news ${icon('arrow')}</button></div><div class="news-grid">${articles.map(newsCard).join('')}</div></section></div>`;
}
function newsPage() {
  return lh`<div class="content-page">${titleBlock(t('News & updates'), t('The latest from your world. Announcements, development, and community stories.'), 'CONQUEST OF AZEROTHCORE')}<div class="tabs" role="tablist" aria-label="News categories"><button role="tab" aria-selected="${state.newsTab === 'latest'}" class="tab ${state.newsTab === 'latest' ? 'active' : ''}" data-news-tab="latest">Latest news</button><button role="tab" aria-selected="${state.newsTab === 'changelog'}" class="tab ${state.newsTab === 'changelog' ? 'active' : ''}" data-news-tab="changelog">Changelog</button></div>${state.newsTab === 'latest' ? lh`<div class="news-page-grid">${articles.map(newsCard).join('')}</div>` : changelogHtml()}</div>`;
}
const services = {
  store: { title: 'Store', description: 'Discover what your project has to offer.', icon: 'store', heading: 'Your store, right here', body: 'The store will connect to your Conquest of AzerothCore website. Products and account balances will appear when your store service is ready.', action: 'Open store' },
  wiki: { title: 'Wiki', heading: 'Knowledge for your journey', body: 'Guides, getting started, and project information will open on your own wiki.', icon: 'book', action: 'Open wiki' },
  discord: { title: 'Join the community', heading: 'Your adventure is better together', body: 'Join the Conquest of AzerothCore Discord community.', icon: 'discord', action: 'Open Discord' },
  support: { title: 'Support', heading: 'A helping hand', body: 'Visit our support page for help with your account or client.', icon: 'shield', action: 'Open support' },
  register: { title: 'Create an account', heading: 'Start your journey', body: 'Create your game account in the desktop launcher.', icon: 'user', action: 'Create account' }
};
function servicePage(key) {
  const service = services[key];
  const connected = !!state.config.links[key];
  return lh`<div class="content-page">${titleBlock(t(service.title), t(service.description) || t(service.body))}<div class="empty-panel"><span class="empty-emblem">${icon(service.icon)}</span><h2>${t(service.heading)}</h2><p>${t(service.body)}</p><button class="gold-button" data-external="${key}" ${connected ? '' : 'disabled'}>${t(service.action)} ${icon('external')}</button><div class="service-details"><span>Project service</span><span>${connected ? t('Connected') : t('Not connected yet')}</span></div></div>${key === 'store' ? launcherI18n.html('<div class="feature-row"><div class="feature-tile">') + icon('user') + launcherI18n.html('<h3>Your account</h3><p>Your own project identity and purchase history.</p></div><div class="feature-tile">') + icon('store') + launcherI18n.html('<h3>Your catalog</h3><p>Products and availability from your project.</p></div><div class="feature-tile">') + icon('shield') + launcherI18n.html('<h3>Your checkout</h3><p>Payments handled by your connected website.</p></div></div>') : ''}</div>`;
}
function databasePage() {
  const embedded = !!window.launcher;
  return lh`<div class="content-page database-page">${titleBlock(t('Database'), t('Explore items, spells, quests, creatures, and discoveries without leaving the launcher.'), t('LIVE DATABASE'))}<div class="database-toolbar"><span class="database-state" id="database-status">${icon('database')}<span>${embedded ? t('Connecting to Ascension Database…') : t('Desktop launcher required for embedded browsing')}</span></span><div class="button-row"><button class="secondary-button" data-action="database-reload" ${embedded ? '' : 'disabled'}>${icon('refresh')}Reload</button><button class="secondary-button" data-external="database">${icon('external')}Open in browser</button></div></div><div class="database-frame"><div class="database-placeholder">${icon('database')}<strong>Ascension Database</strong><span>${embedded ? t('Loading the live database…') : t('The native embedded browser appears here in the desktop launcher.')}</span></div><div class="database-viewport" id="database-viewport" aria-label="Embedded Ascension Database"></div></div></div>`;
}
function formatIssueDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return t('Unknown');
  return new Intl.DateTimeFormat(launcherI18n.language, { month: 'short', day: 'numeric', year: date.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined }).format(date);
}
function issueRowsHtml() {
  if (state.issuesLoading) return lh`<div class="issue-empty issue-loading">${icon('refresh')}<strong>Loading current bugs…</strong>Reading the live GitHub issue tracker.</div>`;
  if (state.issuesError) return lh`<div class="issue-empty">${icon('bug')}<strong>Could not load the bugtracker</strong>${escape(tm(state.issuesError))}<div class="issue-empty-action"><button class="secondary-button" data-action="refresh-issues">${icon('refresh')}Try again</button></div></div>`;
  const query = state.issueQuery.trim().toLowerCase();
  const issues = query ? state.issues.filter(issue => (`#${issue.number} ${issue.title} ${issue.body} ${issue.labels.join(' ')}`).toLowerCase().includes(query)) : state.issues;
  if (!issues.length) return lh`<div class="issue-empty">${icon(query ? 'search' : 'bug')}<strong>${query ? t('No matching bugs') : t('No open bugs found')}</strong>${query ? t('Try another search term.') : t('The live tracker currently has no open issues.')}</div>`;
  return issues.map(issue => lh`<button class="issue-row" data-issue-number="${issue.number}"><span class="issue-main"><span class="issue-number">#${issue.number}</span><strong>${escape(issue.title)}</strong>${issue.labels.length ? lh`<span class="issue-labels">${issue.labels.slice(0, 3).map(label => lh`<span>${escape(label)}</span>`).join('')}</span>` : ''}</span><span><span class="issue-status ${issue.state}">${escape(t(issue.state))}</span></span><span class="issue-date">${escape(formatIssueDate(issue.updatedAt))}</span></button>`).join('');
}
function bugtrackerPage() {
  return lh`<div class="content-page">${titleBlock(t('Bugtracker'), t('Help make Azeroth better. Browse the live tracker and report what you find.'), t('LIVE ISSUES'))}<div class="filter-bar"><label class="search-box">${icon('search')}<input id="bug-search" aria-label="Search issues" placeholder="Search issues..." value="${escape(state.issueQuery)}"></label><div class="button-row bug-actions"><button class="secondary-button" data-action="refresh-issues">${icon('refresh')}Refresh</button><button class="gold-button" data-action="report-bug">${icon('bug')}Report a bug</button></div></div><div class="issue-table"><div class="issue-header"><span>Issue</span><span>Status</span><span>Last updated</span></div><div id="issue-results">${issueRowsHtml()}</div></div></div>`;
}
function renderIssueResults() {
  const target = document.getElementById('issue-results');
  if (!target) return;
  target.innerHTML = issueRowsHtml();
  fillIcons(target);
}
async function loadIssues(force = false) {
  if (state.issuesLoading) return;
  if (!force && state.issues.length) { renderIssueResults(); return; }
  state.issuesLoading = true; state.issuesError = ''; renderIssueResults();
  try { state.issues = await api.issues(force); }
  catch (error) { state.issuesError = tm(error.message) || t('The issue tracker could not be loaded.'); }
  finally { state.issuesLoading = false; renderIssueResults(); }
}
function updateDatabaseStatus() {
  const target = document.getElementById('database-status');
  if (!target) return;
  const labels = { loading: t('Loading Ascension Database…'), ready: t('Ascension Database connected'), error: state.databaseMessage || t('Database could not be loaded') };
  target.className = `database-state ${state.databaseStatus}`;
  target.innerHTML = lh`${icon(state.databaseStatus === 'error' ? 'info' : 'database')}<span>${escape(labels[state.databaseStatus] || labels.loading)}</span>`;
}
function syncDatabaseView() {
  if (!window.launcher || state.page !== 'database' || modal.open) return;
  const host = document.getElementById('database-viewport');
  if (!host) return;
  const bounds = host.getBoundingClientRect();
  if (bounds.width < 100 || bounds.height < 100) return;
  guarded(async () => {
    await api.databaseView({ visible: true, bounds: { x: bounds.left, y: bounds.top, width: bounds.width, height: bounds.height } });
  });
}
function showIssue(number) {
  const issue = state.issues.find(item => item.number === number);
  if (!issue) return;
  const body = escape(issue.body || t('No description was provided.')).replace(/\n/g, launcherI18n.html('<br>'));
  openModal(lh`${modalHeader(`#${issue.number} · ${issue.title}`, t('Conquest of AzerothCore bugtracker'))}<div class="modal-body issue-detail"><div class="issue-meta"><span class="issue-status ${issue.state}">${escape(t(issue.state))}</span><span>Updated ${escape(formatIssueDate(issue.updatedAt))}</span>${issue.author ? lh`<span>Reported by ${escape(issue.author)}</span>` : ''}<span>Comments: ${issue.comments}</span></div><div class="issue-body">${body}</div></div><div class="modal-footer"><button class="secondary-button" data-action="dismiss-modal">Back</button><button class="gold-button" data-action="open-issue" data-issue-open="${issue.number}">${icon('external')}Open on GitHub</button></div>`, 'issue-dialog');
}
function showBugReport() {
  const direct = !!state.config.bugtracker?.submitUrl;
  openModal(lh`${modalHeader(t('Report a bug'), t('Conquest of AzerothCore bugtracker'))}<div class="modal-body"><div class="report-grid"><label class="report-field report-wide"><span>Title</span><input id="report-title" type="text" maxlength="200" placeholder="Short summary of the problem"></label><label class="report-field"><span>Category</span><select id="report-category"><option value="Gameplay">Gameplay</option><option value="Class / Spell">Class / Spell</option><option value="Quest">Quest</option><option value="Item">Item</option><option value="Creature / NPC">Creature / NPC</option><option value="Dungeon / Raid">Dungeon / Raid</option><option value="UI / Addon">UI / Addon</option><option value="Performance / Crash">Performance / Crash</option><option value="Other">Other</option></select></label><label class="report-field"><span>Severity</span><select id="report-severity"><option value="Minor">Minor</option><option value="Normal" selected>Normal</option><option value="Major">Major</option><option value="Gamebreaking">Gamebreaking</option></select></label><label class="report-field report-wide"><span>What happened?</span><textarea id="report-issue" maxlength="7000" rows="5" placeholder="Describe the bug clearly and include anything that may help reproduce it."></textarea></label><label class="report-field"><span>Expected outcome</span><textarea id="report-expected" maxlength="2500" rows="3" placeholder="What should happen?"></textarea></label><label class="report-field"><span>Actual outcome</span><textarea id="report-actual" maxlength="2500" rows="3" placeholder="What happened instead?"></textarea></label><label class="report-field report-wide"><span>Steps to reproduce</span><textarea id="report-steps" maxlength="2500" rows="3" placeholder="1. …&#10;2. …&#10;3. …"></textarea></label></div><div class="info-box">${icon('shield')}<span>${direct ? t('Your report will be sent directly to the Conquest of AzerothCore bugtracker.') : t('Your report will open prefilled in the public bugtracker. Review it there and submit when you are ready.')}</span></div></div><div class="modal-footer"><button class="secondary-button" data-action="dismiss-modal">Cancel</button><button class="gold-button" data-action="submit-bug" id="submit-bug-button">${icon('bug')}${direct ? t('Submit report') : t('Continue to GitHub')}</button></div>`, 'report-dialog');
}
async function submitBugForm() {
  const title = document.getElementById('report-title')?.value.trim() || '';
  const issue = document.getElementById('report-issue')?.value.trim() || '';
  if (title.length < 3) { toast(t('Give the bug a short title first.')); document.getElementById('report-title')?.focus(); return; }
  if (!issue) { toast(t('Describe what happened before submitting.')); document.getElementById('report-issue')?.focus(); return; }
  const button = document.getElementById('submit-bug-button');
  if (button) button.disabled = true;
  try {
    const result = await api.submitBug({
      title,
      category: document.getElementById('report-category')?.value || t('Other'),
      severity: document.getElementById('report-severity')?.value || t('Normal'),
      issue,
      expected: document.getElementById('report-expected')?.value || '',
      actual: document.getElementById('report-actual')?.value || '',
      steps: document.getElementById('report-steps')?.value || '',
    });
    closeModal();
    if (result.mode === 'submitted') {
      toast(lt`Bug #${result.number} was submitted successfully.`);
      state.issues = []; await loadIssues(true);
    } else toast(t('Your report is prefilled on GitHub. Review it there and submit the issue.'));
  } finally { if (button?.isConnected) button.disabled = false; }
}
function addonStatus(addon) {
  if (addon.status === 'unknown') return { label: t('Not in catalog'), className: 'partial' };
  if (addon.status === 'unreadable') return { label: t('Cannot inspect'), className: 'partial' };
  if (addon.status === 'installed') return { label: t('Catalog files match'), className: 'installed' };
  if (addon.status === 'update') return { label: t('Differs from catalog'), className: 'update' };
  if (addon.status === 'partial') return { label: t('Missing catalog files'), className: 'partial' };
  return { label: t('Available'), className: 'available' };
}
function filteredAddons() {
  const query = state.addonQuery.trim().toLowerCase();
  return state.addons.filter(addon => {
    if (state.addonTab === 'installed' && addon.status === 'not-installed') return false;
    if (state.addonCategory !== 'all' && addon.category !== state.addonCategory) return false;
    if (!query) return true;
    return `${addon.name} ${addon.description} ${addon.category} ${addon.folders.join(' ')}`.toLowerCase().includes(query);
  });
}
function addonCardsHtml() {
  if (state.addonLoading) return lh`<div class="addon-empty issue-loading">${icon('refresh')}<strong>Reading addon catalog…</strong><span>Scanning the addons bundled with your launcher.</span></div>`;
  if (state.addonError) return lh`<div class="addon-empty">${icon('addons')}<strong>Addon catalog could not be loaded</strong><span>${escape(tm(state.addonError))}</span><button class="secondary-button" data-action="refresh-addons">${icon('refresh')}Try again</button></div>`;
  const addons = filteredAddons();
  if (!addons.length) {
    const message = state.addonTab === 'installed' && !(state.client.addonsReady || state.client.installed) ? t('Choose your game client to scan installed addons.') : state.addonTab === 'installed' ? t('No addon folders were found in Interface/AddOns.') : t('No addons match your current filters.');
    return lh`<div class="addon-empty">${icon(state.addonTab === 'installed' ? 'folder' : 'search')}<strong>${state.addonTab === 'installed' ? t('No addon folders found') : t('No matching addons')}</strong><span>${message}</span>${!(state.client.addonsReady || state.client.installed) ? lh`<button class="gold-button" data-action="choose-client">${icon('folder')}Locate game client</button>` : ''}</div>`;
  }
  return addons.map(addon => {
    const status = addonStatus(addon);
    const installed = addon.status !== 'not-installed';
    const actionLabel = addon.status === 'update' ? t('Use catalog version') : addon.status === 'partial' ? t('Repair') : installed ? t('Repair') : t('Install');
    const disabled = addon.managementBlocked || !(state.client.addonsReady || state.client.installed) || state.client.running ? 'disabled' : '';
    const modules = addon.folders.length === 1 ? t('1 addon folder') : lt`${addon.folders.length} addon folders`;
    const shownVersion = addon.catalog === false ? addon.installedVersion : addon.version;
    const version = shownVersion ? `v${escape(shownVersion)}` : t('Version not listed');
    return lh`<article class="addon-card"><div class="addon-card-top"><div class="addon-emblem">${icon('addons')}</div><div class="addon-card-heading"><div class="addon-name-row"><h3>${escape(addon.name)}${addon.mandatory ? ' · ' + t('Mandatory') : ''}</h3><span class="addon-status ${status.className}">${escape(status.label)}</span></div><div class="addon-meta"><span>${escape(addon.category)}</span><span>·</span><span>${version}</span><span>·</span><span>${modules}</span></div></div></div><p>${escape(tm(addon.description))}</p><div class="addon-card-footer"><button class="ghost-button addon-details-button" data-addon-details="${escape(addon.id)}">Details</button><div class="addon-card-actions">${installed && addon.managed && !addon.mandatory ? lh`<button class="ghost-button danger-soft" data-addon-uninstall="${escape(addon.id)}" ${disabled}>Uninstall</button>` : ''}${addon.catalog !== false && (!installed || addon.managed) ? lh`<button class="${installed ? 'secondary-button' : 'gold-button'}" data-addon-install="${escape(addon.id)}" ${disabled}>${icon(installed ? 'refresh' : 'download')}${actionLabel}</button>` : ''}</div></div></article>`;
  }).join('');
}
function addonCategories() {
  return [...new Set(state.addons.map(addon => addon.category).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}
function addonsPage() {
  const installedCount = state.addons.filter(addon => addon.status !== 'not-installed').length;
  const categories = addonCategories();
  const clientStatus = (state.client.addonsReady || state.client.installed) ? lt`${installedCount} installed · ${state.addons.filter(addon => addon.catalog !== false).length} catalog packages · ${state.addonFolderCount} addon folders` : lt`${state.addons.filter(addon => addon.catalog !== false).length || '—'} catalog packages · ${state.addonFolderCount || '—'} addon folders · select a client to install`;
  return lh`<div class="content-page addon-page">${titleBlock(t('Addons'), t('Browse addon folders and versions. Use Rescan to verify files against the catalog. Addons inside MPQ patches and in-game enabled status are not inspected. Your addons are never installed automatically.'), t('LOCAL CATALOG'))}<div class="tabs" role="tablist" aria-label="Addon categories"><button role="tab" aria-selected="${state.addonTab === 'browse'}" class="tab ${state.addonTab === 'browse' ? 'active' : ''}" data-addon-tab="browse">Browse addons</button><button role="tab" aria-selected="${state.addonTab === 'installed'}" class="tab ${state.addonTab === 'installed' ? 'active' : ''}" data-addon-tab="installed">Installed addons${installedCount ? lh` <span class="tab-count">${installedCount}</span>` : ''}</button></div><div class="addon-toolbar"><label class="search-box addon-search">${icon('search')}<input id="addon-search" aria-label="Search addons" placeholder="Search addons..." value="${escape(state.addonQuery)}"></label><label class="addon-category"><span>Category</span><select id="addon-category" aria-label="Addon category"><option value="all">All categories</option>${categories.map(category => lh`<option value="${escape(category)}" ${state.addonCategory === category ? 'selected' : ''}>${escape(category)}</option>`).join('')}</select></label><div class="addon-toolbar-actions"><button class="secondary-button" data-action="refresh-addons">${icon('refresh')}Rescan</button><button class="secondary-button" data-action="open-addons-folder" ${(state.client.addonsReady || state.client.installed) ? '' : 'disabled'}>${icon('folder')}AddOns folder</button>${!(state.client.addonsReady || state.client.installed) ? lh`<button class="gold-button" data-action="choose-client">${icon('folder')}Locate game</button>` : ''}</div></div><div class="addon-summary"><span class="status-dot"></span><span>${escape(clientStatus)}</span>${state.client.running ? launcherI18n.html('<strong>Close the game to change addons.</strong>') : ''}</div>${state.addonWarning ? lh`<p role="status">${escape(tm(state.addonWarning))}</p>` : ''}<div id="addon-results" class="addon-grid">${addonCardsHtml()}</div></div>`;
}
function renderAddonCatalog() {
  const target = document.getElementById('addon-results');
  if (!target) return;
  target.innerHTML = addonCardsHtml();
  fillIcons(target);
  const installedCount = state.addons.filter(addon => addon.status !== 'not-installed').length;
  const tab = document.querySelector('[data-addon-tab="installed"]');
  if (tab) tab.innerHTML = lt`Installed addons${installedCount ? lh` <span class="tab-count">${installedCount}</span>` : ''}`;
}
async function loadAddons(force = false, verify = false) {
  if (state.addonLoading) return;
  const clientPath = state.client.path || '';
  if (!force && state.addons.length && state.addonClientPath === clientPath) { renderAddonCatalog(); return; }
  state.addonLoading = true; state.addonError = ''; renderAddonCatalog();
  try {
    const result = await api.addons(verify);
    if ((state.client.path || '') !== clientPath) return;
    state.addonClientPath = clientPath;
    state.addonWarning = (result.warnings || []).join(' ');
    state.addons = Array.isArray(result?.packages) ? result.packages : [];
    state.addonFolderCount = Number.isInteger(result?.folderCount) ? result.folderCount : 0;
  } catch (error) { if ((state.client.path || '') === clientPath) state.addonError = tm(error.message) || t('The addon catalog could not be loaded.'); }
  finally { state.addonLoading = false; if (state.page === 'addons') render(); }
}
function showAddonDetails(packageId) {
  const addon = state.addons.find(item => item.id === packageId);
  if (!addon) return;
  const status = addonStatus(addon);
  const dependencyNames = addon.dependencies.map(id => state.addons.find(item => item.id === id)?.name || id);
  openModal(lh`${modalHeader(addon.name, t('Conquest of AzerothCore addon catalog'))}<div class="modal-body addon-detail"><div class="addon-detail-head"><span class="addon-status ${status.className}">${escape(status.label)}</span><span>${escape(addon.category)}</span>${addon.version ? lh`<span>Catalog v${escape(addon.version)}</span>` : ''}${addon.installedVersion ? lh`<span>Installed v${escape(addon.installedVersion)}</span>` : ''}</div><p>${escape(addon.description)}</p>${addon.status !== 'not-installed' && !addon.managed ? launcherI18n.html('<p>Player-managed files. Scanning does not adopt, replace or remove these files.</p>') : ''}<h3>Addon folders</h3><div class="addon-folder-list">${addon.folders.map(folder => lh`<code>${escape(folder)}</code>`).join('')}</div>${dependencyNames.length ? lh`<h3>Catalog dependencies</h3><p>${dependencyNames.map(escape).join(', ')}</p>` : ''}${addon.externalDependencies.length ? lh`<div class="info-box">${icon('info')}<span>The addon metadata also references: ${addon.externalDependencies.map(escape).join(', ')}. These hard dependencies must already exist in your AddOns folder; installation is blocked if they are missing.</span></div>` : ''}</div><div class="modal-footer"><button class="secondary-button" data-action="dismiss-modal">Close</button>${addon.catalog !== false && (addon.status === 'not-installed' || addon.managed) && (state.client.addonsReady || state.client.installed) ? lh`<button class="gold-button" data-addon-install="${escape(addon.id)}" ${state.client.running || addon.managementBlocked ? 'disabled' : ''}>${icon(addon.status === 'not-installed' ? 'download' : 'refresh')}${addon.status === 'not-installed' ? t('Install') : t('Repair / reinstall')}</button>` : ''}</div>`, 'addon-dialog');
}
async function installAddon(packageId, button) {
  if (!(state.client.addonsReady || state.client.installed)) { await chooseClient(); return; }
  const addon = state.addons.find(item => item.id === packageId);
  if (!addon) throw new Error(t('Addon package was not found.'));
  const original = button?.innerHTML;
  if (button) { button.disabled = true; button.innerHTML = `${icon('refresh')}${t('Installing…')}`; fillIcons(button); }
  try {
    const response = await api.installAddon(packageId);
    if (response.result.cancelled) return;
    state.addons = response.catalog.packages;
    state.addonFolderCount = response.catalog.folderCount;
    if (modal.open && modal.classList.contains('addon-dialog')) closeModal();
    if (state.page === 'addons') render();
    toast(lt`${response.result.name} is installed and ready for your next login or UI reload.` + (response.result.preservedFiles ? ' ' + t('Modified files were backed up under .coa-launcher/preserved-addons.') : ''));
  } finally { if (button?.isConnected) { button.disabled = false; button.innerHTML = original; fillIcons(button); } }
}
function confirmAddonUninstall(packageId) {
  const addon = state.addons.find(item => item.id === packageId);
  if (!addon) return;
  openModal(lh`${modalHeader(lt`Uninstall ${addon.name}?`, t('Addon management'))}<div class="modal-body"><p>This removes unchanged launcher-installed files for <strong>${escape(addon.name)}</strong> from the selected client. Your modified files, manual additions and SavedVariables are kept.</p><div class="info-box">${icon('shield')}<span>Removal is blocked if another installed addon requires this package. Separate dependency packages are kept.</span></div></div><div class="modal-footer"><button class="secondary-button" data-action="dismiss-modal">Cancel</button><button class="gold-button danger-button" data-addon-confirm-uninstall="${escape(addon.id)}">Uninstall addon</button></div>`);
}
async function uninstallAddon(packageId, button) {
  if (button) button.disabled = true;
  const response = await api.uninstallAddon(packageId);
  state.addons = response.catalog.packages;
  state.addonFolderCount = response.catalog.folderCount;
  closeModal();
  if (state.page === 'addons') render();
  toast(lt`${response.result.name}: launcher-owned files removed. SavedVariables preserved.${response.result.preservedFiles ? lt` ${response.result.preservedFiles} modified file(s) kept.` : ''}`);
}
function render() {
  popoverRoot.innerHTML = '';
  if (state.page !== 'database') api.databaseView({ visible: false }).catch(() => {});
  main.classList.toggle('database-mode', state.page === 'database');
  for (const button of document.querySelectorAll('.nav-link[data-page]')) { const active = button.dataset.page === state.page; button.classList.toggle('active', active); if (active) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current'); }
  if (state.page === 'home') main.innerHTML = homePage();
  else if (state.page === 'news') main.innerHTML = newsPage();
  else if (state.page === 'bugtracker') main.innerHTML = bugtrackerPage();
  else if (state.page === 'database') main.innerHTML = databasePage();
  else if (state.page === 'addons') main.innerHTML = addonsPage();
  else main.innerHTML = servicePage(state.page);
  document.getElementById('footer-client').textContent = state.client.running ? t('Game running') : (state.client.addonsReady || state.client.installed) ? t('Client ready') : t('No client selected');
  document.getElementById('version').textContent = `v${state.version}`;
  fillIcons();
  if (state.page === 'bugtracker') loadIssues();
  if (state.page === 'addons') loadAddons();
  if (state.page === 'database') { updateDatabaseStatus(); requestAnimationFrame(syncDatabaseView); }
}
function showService(key) {
  if (key === 'discord') {
    const community = state.discord;
    const available = community?.available && community.guildId === state.config.discord?.guildId;
    const counts = available && Number.isInteger(community.online) && Number.isInteger(community.members)
      ? lt`Approximately ${community.online.toLocaleString(launcherI18n.language)} online · ${community.members.toLocaleString(launcherI18n.language)} members`
      : t('Community counts are currently unavailable.');
    openModal(lh`${modalHeader(t('Conquest on Discord'), t('Your adventure is better together'))}<div class="modal-body"><div class="empty-panel"><span class="empty-emblem">${icon('discord')}</span><h2>Join our community</h2><p>Meet other players, find a guild, and share your adventures.</p><div class="service-details" role="status">${escape(counts)}</div></div></div><div class="modal-footer"><button class="secondary-button" data-action="dismiss-modal">Back to launcher</button><button class="gold-button" data-external="discord">${icon('discord')}Join Discord ${icon('external')}</button></div>`);
    return;
  }
  if (state.config.links[key]) { guarded(() => api.external(key)); return; }
  const service = services[key];
  openModal(lh`${modalHeader(t(service.title))}<div class="modal-body"><div class="empty-panel"><span class="empty-emblem">${icon(service.icon)}</span><h2>${t(service.heading)}</h2><p>${t(service.body)}</p><span class="page-tag">NOT CONNECTED YET</span></div></div><div class="modal-footer"><button class="secondary-button" data-action="dismiss-modal">Back to launcher</button></div>`);
}
function showArticle(id) {
  const article = articles.find(item => item.id === id); if (!article) return;
  openModal(lh`${modalHeader(t(article.title), 'Conquest of AzerothCore')}<img class="article-image" src="assets/${article.image}" alt=""><div class="modal-body article-body"><div class="article-kicker">${t(article.category)}</div>${article.body.map(paragraph => lh`<p>${t(paragraph)}</p>`).join('')}</div>`, 'article-dialog');
}
function showInstall() {
  openModal(lh`${modalHeader(t('Begin your adventure'), 'Conquest of AzerothCore')}<div class="modal-body"><div class="install-art"></div><label class="form-label">Game location</label><div class="path-field">${icon('folder')}<span>${escape(state.client.path || t('Choose your existing WoW client folder'))}</span><button class="secondary-button" data-action="choose-client">Browse</button></div><p>Select an existing client to enable the Play button.</p><div class="info-box">${icon('info')}<span>Choose the folder containing Ascension.exe.</span></div></div><div class="modal-footer"><button class="ghost-button" data-action="dismiss-modal">Cancel</button><button class="gold-button" data-action="choose-client">${icon('folder')}Locate existing client</button></div>`);
}
function accountDate(value, fallback = t('Never')) {
  if (!value) return fallback;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date.toLocaleString(launcherI18n.language);
}
function accountPlayTime(value) {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) return t('No recorded play time');
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours >= 24) return lt`${Math.floor(hours / 24)}d ${hours % 24}h played`;
  if (hours) return lt`${hours}h ${minutes}m played`;
  return lt`${minutes}m played`;
}
function showAccountLogin(prefill = '', notice = '') {
  state.account = null; state.accountOverview = null; state.accountCharacters = []; state.discordLink = null;
  openModal(lh`${modalHeader(t('Welcome, adventurer'), t('Sign in with your game account'))}<form id="launcher-login"><div class="modal-body">${notice ? lh`<div class="info-box" role="status">${icon('check')}<span>${escape(notice)}</span></div>` : ''}<label class="form-label" for="account-login">Account name or email</label><input class="account-input" id="account-login" autocomplete="username" maxlength="254" value="${escape(prefill)}" required><label class="form-label" for="account-password">Password</label><input class="account-input" id="account-password" type="password" autocomplete="current-password" maxlength="128" required><p id="login-error" role="alert"></p><div class="account-actions"><button type="submit" class="gold-button">Sign in</button><button type="button" class="secondary-button" data-action="register">Create account</button><button type="button" class="ghost-button" data-external="account">Account help</button></div><p class="credits">Your password is never saved. Your session is protected by Windows.</p></div></form>`);
  document.getElementById(prefill ? 'account-password' : 'account-login').focus();
}
function showRegister() {
  openModal(lh`${modalHeader(t('Create account'), t('Your next chapter starts here'))}<div class="modal-body register-body"><aside class="register-art"><img src="assets/ascension-emblem.webp" alt="" class="register-crest"><div class="register-art-copy"><span class="account-kicker">CONQUEST OF AZEROTHCORE</span><h3>A world<br>worth returning to</h3><span class="register-art-rule"></span><p>Begin your adventure.<br>Make Azeroth your own.</p></div><span class="register-realm-tag">PUBLIC TEST REALM</span></aside><section class="register-form-panel" aria-label="Account details"><div class="register-intro"><span class="account-kicker">YOUR ADVENTURE BEGINS HERE</span><h3>Join the Conquest</h3><p>One account for the launcher and the game.</p></div><div id="register-error" class="info-box register-error" role="alert" aria-live="assertive" style="display:none"></div><div class="report-grid"><label class="report-field"><span>Account name</span><input id="register-username" type="text" maxlength="64" autocomplete="username" placeholder="Choose an account name"></label><label class="report-field"><span>Email address</span><input id="register-email" type="email" maxlength="254" autocomplete="email" placeholder="you@example.com"></label><label class="report-field"><span>Password</span><input id="register-password" type="password" maxlength="128" autocomplete="new-password" placeholder="Create a password"></label><label class="report-field"><span>Confirm password</span><input id="register-confirm" type="password" maxlength="128" autocomplete="new-password" placeholder="Repeat your password"></label></div><label class="register-consent"><input id="register-test-warning" type="checkbox"><span><strong>Ready to explore the test realm</strong><span>I understand this account is for the Conquest of AzerothCore public test realm.</span></span></label><div class="register-account-note">${icon('shield')}<span>Use these same details to sign in to the launcher and enter Azeroth.</span></div></section></div><div class="modal-footer"><span class="register-footer-note">Already an adventurer?</span><button class="secondary-button" data-action="account-back">Back to sign in</button><button class="gold-button" data-action="account-register">${icon('user')}Create account</button></div>`, 'register-dialog');
  requestAnimationFrame(() => document.getElementById('register-username')?.focus());
}
function showRegistrationError(message) {
  const box = document.getElementById('register-error');
  if (!box) { toast(message || t('Account creation failed.')); return; }
  box.innerHTML = lh`${icon('info')}<span>${escape(tm(message) || t('Account creation failed.'))}</span>`;
  box.style.display = 'flex';
  fillIcons(box);
  box.scrollIntoView({ block: 'nearest' });
}
function clearRegistrationError() {
  const box = document.getElementById('register-error');
  if (!box) return;
  box.style.display = 'none';
  box.innerHTML = '';
}
async function submitAccountLogin(button) {
  const login = document.getElementById('account-login')?.value.trim() || '';
  const password = document.getElementById('account-password')?.value || '';
  if (!login || !password) { toast(t('Enter your account name/email and password.')); return; }
  if (button) button.disabled = true;
  try {
    state.account = await api.login(login, password);
    document.getElementById('account-password')?.setAttribute('value', '');
    await loadAccountDashboard();
    toast(state.account?.persistenceWarning || lt`Welcome back, ${state.account?.username || login}.`);
  } finally {
    const passwordInput = document.getElementById('account-password');
    if (passwordInput) passwordInput.value = '';
    if (button?.isConnected) button.disabled = false;
  }
}
async function submitAccountRegistration(button) {
  const username = document.getElementById('register-username')?.value.trim() || '';
  const email = document.getElementById('register-email')?.value.trim() || '';
  const password = document.getElementById('register-password')?.value || '';
  const confirmPassword = document.getElementById('register-confirm')?.value || '';
  const acceptTestWarning = document.getElementById('register-test-warning')?.checked === true;

  clearRegistrationError();

  if (!username || !email || !password || !confirmPassword) {
    showRegistrationError(t('Complete all account fields first.'));
    return;
  }
  if (password !== confirmPassword) {
    showRegistrationError(t('The passwords do not match.'));
    return;
  }
  if (!acceptTestWarning) {
    showRegistrationError(t('Confirm that you understand this is a public test realm.'));
    return;
  }

  if (button) button.disabled = true;

  try {
    const result = await api.register(username, email, password, confirmPassword, acceptTestWarning);
    const passwordInput = document.getElementById('register-password');
    const confirmInput = document.getElementById('register-confirm');
    if (passwordInput) passwordInput.value = '';
    if (confirmInput) confirmInput.value = '';
    showAccountLogin(username, result?.message || t('Account created. You can now sign in.'));
  } catch (error) {
    showRegistrationError(tm(error?.message) || t('Account creation failed.'));
  } finally {
    if (button?.isConnected) button.disabled = false;
  }
}
function accountCharactersHtml() {
  if (!state.accountCharacters.length) return launcherI18n.html('<div class="account-empty"><img src="assets/ascension-emblem.webp" alt=""><h3>Your story begins here</h3><p>Create your first character in game, then refresh to see them here.</p></div>');
  return state.accountCharacters.map(character => {
    const name = character?.name || t('Unknown character');
    const level = Number.isFinite(Number(character?.level)) ? Number(character.level) : 0;
    const online = character?.online === true || Number(character?.online) === 1;
    return lh`<article class="account-character"><div class="character-level"><strong>${level}</strong><span>LEVEL</span></div><div class="character-identity"><h4>${escape(name)}</h4><p>${escape(accountPlayTime(character?.totalTime))}</p></div><span class="character-presence ${online ? 'is-online' : ''}"><i></i>${online ? t('Online') : t('Offline')}</span></article>`;
  }).join('');
}
function discordAccountHtml() {
  const link = state.discordLink;
  if (!link || link.available === false) {
    const message = link?.message || t('Discord account linking is currently unavailable.');
    return lh`<div class="setting-row"><span><span class="setting-title">Discord</span><span class="setting-description">${escape(tm(message))}</span></span><span class="inline-badge">UNAVAILABLE</span></div>`;
  }
  if (link.linked) {
    const display = link.globalName || link.username || t('Discord account');
    const handle = link.username ? `@${link.username}` : lt`ID ${link.userId}`;
    return lh`<div class="setting-row discord-linked"><span><span class="setting-title">${icon('discord')}${escape(display)}</span><span class="setting-description">${escape(handle)} · Linked ${escape(accountDate(link.linkedAt, t('Unknown')))}</span></span><span class="inline-badge">CONNECTED</span></div><div class="button-row"><button class="secondary-button" data-action="discord-account-unlink">Disconnect Discord</button></div>`;
  }
  return lh`<div class="setting-row"><span><span class="setting-title">${icon('discord')}Discord</span><span class="setting-description">Keep your community close. Connect your Discord account.</span></span><span class="inline-badge">NOT CONNECTED</span></div><div class="button-row"><button class="gold-button" data-action="discord-account-link">Connect Discord</button></div>`;
}
async function linkDiscordAccount(button) {
  const account = state.account;
  if (button?.isConnected) button.disabled = true;
  try {
    await api.discordLink();
    toast(t('Discord opened in your browser. Approve the connection there.'));
    for (let attempt = 0; attempt < 40; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 1500));
      if (state.account !== account || !button?.isConnected || !modal.open) return;
      const link = await api.discordLinkStatus();
      if (state.account !== account || !button?.isConnected || !modal.open) return;
      state.discordLink = link;
      if (link?.linked) {
        renderAccountDashboard();
        toast(t('Discord account connected.'));
        return;
      }
    }
    renderAccountDashboard();
    toast(t('Discord connection is still pending. Approve it in your browser, then use Refresh.'));
  } finally {
    if (button?.isConnected) button.disabled = false;
  }
}
function confirmDiscordUnlink() {
  const link = state.discordLink || {};
  const display = link.globalName || link.username || t('this Discord account');
  openModal(lh`${modalHeader(t('Disconnect Discord'), t('Account connection'))}<div class="modal-body"><p>Disconnect <strong>${escape(display)}</strong> from this Conquest account?</p><p>The active link will be removed, but the launcher backend will keep an audit-log entry recording that the account was unlinked.</p></div><div class="modal-footer"><button class="secondary-button" data-action="account-refresh">Cancel</button><button class="gold-button" data-action="discord-account-unlink-confirm">Disconnect Discord</button></div>`);
}
async function unlinkDiscordAccount(button) {
  if (button?.isConnected) button.disabled = true;
  try {
    await api.discordUnlink();
    await loadAccountDashboard();
    toast(t('Discord account disconnected.'));
  } finally {
    if (button?.isConnected) button.disabled = false;
  }
}
function renderAccountDashboard() {
  const overview = state.accountOverview || {};
  const username = overview.username || state.account?.username || t('Account');
  const joined = accountDate(overview.joinDate, t('Unknown'));
  const lastLogin = accountDate(overview.lastLogin);
  const count = state.accountCharacters.length;
  const totalTime = state.accountCharacters.reduce((sum, character) => sum + Math.max(0, Number(character?.totalTime) || 0), 0);
  openModal(lh`${modalHeader(t('My account'), 'Conquest of AzerothCore')}<div class="modal-body account-dashboard-body"><section class="account-hero"><img class="account-hero-crest" src="assets/ascension-emblem.webp" alt=""><div class="account-hero-copy"><span class="account-kicker">WELCOME BACK, ADVENTURER</span><h3>${escape(username)}</h3><p>${escape(overview.email || t('Your next adventure awaits in Azeroth.'))}</p></div><span class="account-session"><i></i>Signed in</span></section><div class="account-dashboard-grid"><section class="account-roster"><div class="account-section-heading"><h3>Your characters</h3><span>Characters: ${count}</span></div><div class="account-roster-list">${accountCharactersHtml()}</div><div class="account-playtime"><span>Time in Azeroth</span><strong>${escape(accountPlayTime(totalTime))}</strong></div></section><aside class="account-sidebar"><section class="account-details-card"><div class="account-section-heading"><h3>Account details</h3></div><dl><div><dt>Member since</dt><dd>${escape(joined)}</dd></div><div><dt>Last game login</dt><dd>${escape(lastLogin)}</dd></div></dl></section><section class="account-discord-card"><div class="account-section-heading"><h3>${icon('discord')}Stay connected</h3></div>${discordAccountHtml()}</section></aside></div></div><div class="modal-footer"><span class="account-footer-note">${icon('shield')}Your Azeroth. Your account.</span><button class="secondary-button" data-action="account-refresh">${icon('refresh')}Refresh</button><button class="secondary-button" data-action="account-logout">${icon('logout')}Sign out</button><button class="gold-button" data-action="dismiss-modal">Done</button></div>`, 'account-dashboard-dialog');
}
async function loadAccountDashboard() {
  const [overview, characters, discordLink] = await Promise.all([
    api.accountOverview(),
    api.accountCharacters(),
    api.discordLinkStatus().catch(error => ({ available: false, linked: false, message: tm(error?.message) || t('Discord account linking is unavailable.') }))
  ]);
  state.accountOverview = overview || null;
  state.accountCharacters = Array.isArray(characters) ? characters : [];
  state.discordLink = discordLink || null;
  renderAccountDashboard();
}
async function showAccount() {
  openModal(lh`${modalHeader(t('My account'), 'Conquest of AzerothCore')}<div class="modal-body"><div class="empty-panel">${icon('refresh')}<h2>Checking your account…</h2><p>Connecting to the launcher account service.</p></div></div>`);
  const account = await api.account();
  state.account = account;
  if (!account) { showAccountLogin(); return; }
  await loadAccountDashboard();
}
async function logoutAccount() {
  await api.logout();
  state.account = null; state.accountOverview = null; state.accountCharacters = []; state.discordLink = null;
  showAccountLogin('', t('You have been signed out.'));
}
function showTrailer() {
  openModal(lh`
    ${modalHeader(t('A world of adventure'), 'Conquest of AzerothCore')}

    <div class="modal-body">
      <div class="youtube-trailer">
		<iframe
		  src="https://www.youtube-nocookie.com/embed/JbP2Jy3VdEk?rel=0"
		  title="Conquest of AzerothCore Trailer"
		  referrerpolicy="strict-origin-when-cross-origin"
		  allow="accelerometer; autoplay; encrypted-media; picture-in-picture"
		  allowfullscreen>
		</iframe>
      </div>
    </div>

    <div class="modal-footer">
      <button class="gold-button" data-action="dismiss-modal">
        Return to Azeroth
      </button>
    </div>
  `, 'article-dialog');
}
function toggleRow(key, title, description) { return lh`<label class="setting-row"><span><span class="setting-title">${title}</span><span class="setting-description">${description}</span></span><input class="switch" type="checkbox" data-setting="${key}" ${state.settings[key] ? 'checked' : ''} aria-label="${title}"></label>`; }
function showSettings(tab = state.settingsTab) {
  state.settingsTab = tab;
  let body;
  if (tab === 'launcher') body = lh`<h3>Launcher settings</h3><p>Make yourself at home.</p><label class="setting-row"><span class="setting-title">Language</span><select data-setting="language" aria-label="Language">${languageOptions()}</select></label><label class="setting-row"><span class="setting-title">Start page</span><select data-setting="startPage" aria-label="Start page"><option value="home" ${state.settings.startPage === 'home' ? 'selected' : ''}>Home</option><option value="news" ${state.settings.startPage === 'news' ? 'selected' : ''}>News</option></select></label>${toggleRow('closeOnLaunch', t('Minimize on game launch'), t('Keep the launcher out of the way while you play.'))}${toggleRow('reducedMotion', t('Reduce motion'), t('Turn off interface animations and transitions.'))}<p class="credits">Settings are saved automatically on this computer.</p>`;
  else if (tab === 'game') body = lh`<h3>Conquest of AzerothCore</h3><p>Game installation and maintenance.</p><label class="form-label">Client folder</label><div class="path-field">${icon('folder')}<span>${escape(state.client.path || t('No client selected'))}</span></div><div class="button-row"><button class="gold-button" data-action="choose-client">Browse</button><button class="secondary-button" data-action="open-folder" ${state.client.installed ? '' : 'disabled'}>Open folder</button></div><div class="setting-row"><span><span class="setting-title">Client status</span><span class="setting-description">${state.client.installed ? t('Game executable found.') : t('Select the folder containing Ascension.exe.')}</span></span><span class="inline-badge">${state.client.installed ? t('READY') : t('NOT SET')}</span></div><div class="button-row"><button class="secondary-button" data-action="repair">${icon('shield')}Scan & repair</button><button class="secondary-button" data-action="check-updates">${icon('refresh')}Check for updates</button></div><p class="credits">Repair and updates require your client release service.</p>`;
  else body = lh`<h3>Conquest of AzerothCore</h3><p>Launcher version ${escape(state.version)}</p><div class="setting-row"><span class="setting-title">Platform</span><span class="setting-description">${window.launcher ? t('Windows desktop') : t('Browser')}</span></div>`;
  openModal(lh`${modalHeader(t('Settings'), 'Conquest of AzerothCore')}<div class="settings-grid"><aside class="settings-sidebar"><button data-settings-tab="launcher" class="${tab === 'launcher' ? 'active' : ''}">${icon('monitor')}Launcher</button><button data-settings-tab="game" class="${tab === 'game' ? 'active' : ''}">${icon('play')}Game client</button><button data-settings-tab="about" class="${tab === 'about' ? 'active' : ''}">${icon('info')}About</button><small>v${escape(state.version)}</small></aside><div class="settings-pane">${body}</div></div><div class="modal-footer"><button class="gold-button" data-action="dismiss-modal">Done</button></div>`, 'settings-dialog');
}
function showPopover(button, kind) {
  if (popoverRoot.dataset.open === kind && popoverRoot.childElementCount) { popoverRoot.innerHTML = ''; return; }
  let content = '';
  if (kind === 'play-options') content = lh`<div class="popover-label">GAME OPTIONS</div><button data-action="choose-client">${icon('folder')}Locate game</button><button data-action="open-folder">${icon('external')}Open game folder</button><hr><button data-action="check-updates">${icon('refresh')}Check for updates</button><button data-action="repair">${icon('shield')}Scan & repair</button><hr><button data-action="game-settings">${icon('settings')}Game settings</button>`;
  else if (kind === 'realms') content = lh`<div class="popover-label">YOUR GAMES</div><button class="selected" data-action="select-realm"><span class="realm-icon realm-icon-image"><img src="assets/ascension-emblem.webp" alt=""></span>Conquest of AzerothCore${icon('check')}</button><div class="popover-note">Your project’s client and realm.</div>`;
  else content = lh`<div class="popover-heading">Notifications</div><hr><div class="popover-note">No new notifications.</div>`;
  popoverRoot.dataset.open = kind; popoverRoot.innerHTML = lh`<div class="popover">${content}</div>`;
  const panel = popoverRoot.firstElementChild;
  // CSSOM placement is local trusted UI state, with no remote styles.
  const rect = button.getBoundingClientRect();
  panel.style.top = `${Math.min(rect.bottom + 8, innerHeight - panel.offsetHeight - 20)}px`;
  panel.style.left = `${Math.max(15, Math.min(rect.right - panel.offsetWidth, innerWidth - panel.offsetWidth - 15))}px`;
  fillIcons(panel);
}
function pendingUpdate(repair = false) {
  openModal(lh`${modalHeader(repair ? t('Scan & repair') : t('Client updates'))}<div class="modal-body"><p>${repair ? t('The launcher needs your published client manifest to check files and repair missing or damaged data.') : t('Your client release service has not been connected yet. Downloads and updates will be added after the design review.')}</p><div class="info-box">${icon('info')}<span>No game files have been changed.</span></div></div><div class="modal-footer"><button class="gold-button" data-action="dismiss-modal">Got it</button></div>`);
}
async function chooseClient() {
  const client = await api.chooseClient();
  if (!client) return;
  state.client = client; state.settings.installPath = client.path;
  state.addons = []; state.addonFolderCount = 0; state.addonClientPath = null; state.addonWarning = '';
  if (modal.open && modal.classList.contains('settings-dialog')) showSettings('game'); else closeModal();
  render(); if (state.page === 'addons') loadAddons(true);
  if (!client.installed) showInstall(); else toast(t('Client selected. Files will be checked before playing.'));
}
const actions = {
  minimize: () => api.window('minimize'), maximize: () => api.window('maximize'), close: () => api.window('close'),
  settings: () => showSettings('launcher'), 'game-settings': () => showSettings('game'),
  'dismiss-modal': closeModal,
  'choose-client': chooseClient,
  'open-folder': () => api.openFolder(),
  'check-updates': () => pendingUpdate(false), repair: () => pendingUpdate(true),
  play: async () => {
    if (state.client.running) { toast(t('Your game is already running.')); return; }
    if (!state.client.installed) { showInstall(); return; }
    await api.launch(); state.client.running = true; render();
  },
  'play-options': element => showPopover(element, 'play-options'),
  realms: element => showPopover(element, 'realms'),
  notifications: element => { document.querySelector('.notification-dot').hidden = true; showPopover(element, 'notifications'); },
  'select-realm': () => { popoverRoot.innerHTML = ''; state.page = 'home'; render(); },
  account: showAccount,
  register: showRegister,
  'account-back': () => showAccountLogin(),
  'account-login': button => submitAccountLogin(button),
  'account-register': button => submitAccountRegistration(button),
  'account-refresh': () => loadAccountDashboard(),
  'account-logout': logoutAccount,
  'discord-account-link': button => linkDiscordAccount(button),
  'discord-account-unlink': confirmDiscordUnlink,
  'discord-account-unlink-confirm': button => unlinkDiscordAccount(button),
  wiki: () => showService('wiki'), discord: () => showService('discord'), support: () => showService('support'),
  welcome: () => showArticle('welcome'), trailer: showTrailer,
  'database-reload': async () => {
    state.databaseStatus = 'loading'; state.databaseMessage = ''; updateDatabaseStatus();
    await api.reloadDatabase();
    requestAnimationFrame(syncDatabaseView);
  },
  'refresh-issues': () => loadIssues(true),
  'refresh-addons': () => loadAddons(true, true),
  'open-addons-folder': () => api.openAddonsFolder(),
  'report-bug': showBugReport,
  'submit-bug': submitBugForm,
  'open-issue': element => api.openIssue(Number(element.dataset.issueOpen))
};
document.addEventListener('click', event => {
  const button = event.target.closest('button');
  if (!event.target.closest('.popover') && !button?.matches('[data-action="realms"],[data-action="notifications"],[data-action="play-options"]')) popoverRoot.innerHTML = '';
  if (!button || button.disabled) return;
  if (button.dataset.page) { state.page = button.dataset.page; render(); main.scrollTop = 0; }
  else if (button.dataset.addonInstall) guarded(() => installAddon(button.dataset.addonInstall, button));
  else if (button.dataset.addonUninstall) confirmAddonUninstall(button.dataset.addonUninstall);
  else if (button.dataset.addonConfirmUninstall) guarded(() => uninstallAddon(button.dataset.addonConfirmUninstall, button));
  else if (button.dataset.addonDetails) showAddonDetails(button.dataset.addonDetails);
  else if (button.dataset.issueNumber) showIssue(Number(button.dataset.issueNumber));
  else if (button.dataset.article) showArticle(button.dataset.article);
  else if (button.dataset.settingsTab) showSettings(button.dataset.settingsTab);
  else if (button.dataset.newsTab) { state.newsTab = button.dataset.newsTab; render(); }
  else if (button.dataset.addonTab) { state.addonTab = button.dataset.addonTab; render(); }
  else if (button.dataset.external) guarded(() => api.external(button.dataset.external));
  else if (actions[button.dataset.action]) guarded(() => actions[button.dataset.action](button));
});
document.addEventListener('keydown', event => { if (event.key === 'Escape') popoverRoot.innerHTML = ''; });
document.addEventListener('input', event => {
  if (event.target.id === 'bug-search') { state.issueQuery = event.target.value; renderIssueResults(); }
  else if (event.target.id === 'addon-search') { state.addonQuery = event.target.value; renderAddonCatalog(); }
});
document.addEventListener('change', event => {
  const element = event.target;
  if (element.id === 'addon-category') { state.addonCategory = element.value; renderAddonCatalog(); return; }
  if (!element.dataset.setting) return;
  guarded(async () => {
    element.disabled = true;
    try {
      const patch = { [element.dataset.setting]: element.type === 'checkbox' ? element.checked : element.value };
      state.settings = await api.saveSettings(patch);
      if (element.dataset.setting === 'language') applyLanguage(state.settings.language);
      document.body.classList.toggle('motion-reduced', state.settings.reducedMotion);
      toast(t('Settings saved.'));
    } finally { element.disabled = false; }
  });
});
window.addEventListener('resize', () => { popoverRoot.innerHTML = ''; if (state.page === 'database') requestAnimationFrame(syncDatabaseView); });
main.addEventListener('scroll', () => { if (state.page === 'database') requestAnimationFrame(syncDatabaseView); });
api.onDatabaseStatus(status => {
  if (!status || typeof status !== 'object') return;
  state.databaseStatus = status.state === 'ready' || status.state === 'error' ? status.state : 'loading';
  state.databaseMessage = typeof status.message === 'string' ? status.message : '';
  updateDatabaseStatus();
});
api.onGameExit(() => { state.client.running = false; render(); toast(t('Your game has closed.')); });
async function start() {
  fillIcons();
  try {
    const data = await api.bootstrap(); Object.assign(state, data);
    launcherI18n.setLanguage(state.settings.language);
    state.page = state.settings.startPage || 'home';
    document.body.classList.toggle('motion-reduced', state.settings.reducedMotion);
    refreshLanguageShell();
  } catch (error) { toast(lt`Could not load launcher settings: ${tm(error.message)}`); }
  render();
}
window.addEventListener('DOMContentLoaded', start);
