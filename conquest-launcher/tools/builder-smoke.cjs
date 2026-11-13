// Copyright (C) 2026 Duff (Duff-SPP). GPL-3.0-only; see LICENSE and ATTRIBUTION.md at the repository root.
// Isolated renderer smoke test. No backend, user profile, or real client is used.
const { app, BrowserWindow, protocol, net, session } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const review = path.resolve(__dirname, '../.builder-review');
const publicRoot = path.resolve(__dirname, process.argv.includes('--production') ? '../.production/public' : '../public');
app.setPath('userData', path.join(review, 'profile'));
protocol.registerSchemesAsPrivileged([{ scheme: 'conquest', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);
app.whenReady().then(async () => {
  await fs.mkdir(review, { recursive: true });
  const errors = [], remote = [];
  session.defaultSession.webRequest.onBeforeRequest({ urls: ['https://*/*', 'http://*/*'] }, (details, callback) => { remote.push(details.url); callback({ cancel: true }); });
  protocol.handle('conquest', request => {
    const relative = decodeURIComponent(new URL(request.url).pathname).replace(/^\/+/, '');
    const target = path.resolve(publicRoot, relative);
    if (!target.startsWith(publicRoot + path.sep)) return new Response('', { status: 403 });
    return net.fetch(pathToFileURL(target).href);
  });
  const window = new BrowserWindow({ width: 1440, height: 1000, show: false, webPreferences: { backgroundThrottling: false, sandbox: true, contextIsolation: true, nodeIntegration: false } });
  window.webContents.on('console-message', (_event, level, message) => { if (level >= 3) errors.push(message); });
  window.webContents.on('did-fail-load', (_event, code, description) => errors.push(description));
  await window.loadURL('conquest://launcher/index.html');
  await window.webContents.executeJavaScript(`
    (async () => {
      const check = (value, message) => { if (!value) throw new Error(message); };
      const tick = () => new Promise(resolve => setTimeout(resolve, 60));
      document.querySelector('#modal').close();
      localStorage.removeItem('coa.builder.autosession.v1');
      localStorage.removeItem('coa.builder.saves.v1');
      document.querySelector('[data-page="builder"]').click();
      check(document.querySelectorAll('#class-select option').length === 21, 'all class options');
      const node = document.querySelector('.coa-builder .node.is-available[data-pane="class"]');
      check(node, 'available class node'); node.click();
      const selected = node.dataset.id;
      document.querySelector('#export-btn').click();
      const initial = JSON.parse(document.querySelector('#io-text').value);
      check(initial.classRanks.some(rank => String(rank.id) === selected && rank.rank === 1), 'purchase');
      document.querySelector('#io-dialog .dialog__close').click();
      document.querySelector('#save-btn').click(); await tick();
      document.querySelector('#save-name').value = 'Launcher smoke build';
      document.querySelector('#save-form').requestSubmit(); await tick();
      document.querySelector('#reset-btn').click();
      document.querySelector('#load-btn').click();
      document.querySelector('#export-btn').click();
      check(JSON.parse(document.querySelector('#io-text').value).code === initial.code, 'save/load: ' + document.querySelector('#notice').textContent + ' saved=' + localStorage.getItem('coa.builder.saves.v1'));
      document.querySelector('#io-dialog .dialog__close').click();
      node.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
      document.querySelector('#export-btn').click();
      check(JSON.parse(document.querySelector('#io-text').value).classRanks.length === 0, 'refund');
      document.querySelector('#io-dialog .dialog__close').click();
      for (const payload of [initial.code, JSON.stringify(initial)]) {
        document.querySelector('#import-btn').click(); document.querySelector('#io-text').value = payload;
        document.querySelector('#dialog-apply').click();
        check(!document.querySelector('#io-dialog').open, 'import accepted');
        document.querySelector('#export-btn').click();
        check(JSON.parse(document.querySelector('#io-text').value).code === initial.code, 'build round trip');
        document.querySelector('#io-dialog .dialog__close').click();
      }
      document.querySelector('[data-page="home"]').click();
      check(document.querySelector('.home-page'), 'Home still loads');
      document.querySelector('[data-page="news"]').click();
      check(document.querySelector('.news-page-grid'), 'News still loads');
      document.querySelector('[data-page="builder"]').click();
      document.querySelector('#export-btn').click();
      check(JSON.parse(document.querySelector('#io-text').value).code === initial.code, 'page switch preserves build');
      document.querySelector('#io-dialog .dialog__close').click();
      for (const name of ['Felsworn', 'Guardian', 'Pyromancer']) {
        const cls = COA_DATA.classes.find(cls => cls.name === name);
        const select = document.querySelector('#class-select'); select.value = String(cls.id); select.dispatchEvent(new Event('change'));
        const specs = document.querySelector('#spec-select');
        if (specs.options.length > 1) { specs.selectedIndex = 1; specs.dispatchEvent(new Event('change')); }
        check(document.querySelectorAll('.coa-builder .node').length > 0, name + ' tree');
        check(document.querySelector('#class-tree-title').textContent === name, name + ' title');
        for (let attempt = 0; attempt < 40 && !document.querySelector('.tree-pane__viewport').style.backgroundImage; attempt++) await tick();
        check(document.querySelector('.tree-pane__viewport').style.backgroundImage.includes('builder/assets/backgrounds/'), name + ' local background');
      }
      const missingTab = Object.entries(COA_DATA.entriesByTab).find(([, nodes]) => nodes.some(node => node.icon === 'inv_helm_crown_c_01_purple white'));
      const [classId, tabId] = missingTab[0].split(':');
      const select = document.querySelector('#class-select'); select.value = classId; select.dispatchEvent(new Event('change'));
      const specSelect = document.querySelector('#spec-select');
      if ([...specSelect.options].some(option => option.value === tabId)) { specSelect.value = tabId; specSelect.dispatchEvent(new Event('change')); }
      await tick();
      const missingNode = missingTab[1].find(node => node.icon === 'inv_helm_crown_c_01_purple white');
      const fallback = document.querySelector('.node[data-id="' + missingNode.id + '"] img');
      check(fallback && fallback.src.endsWith('/_missing.svg') && fallback.naturalWidth > 0, 'missing icon local fallback');
      const images = [...document.querySelectorAll('.coa-builder .node img')];
      check(images.every(img => img.complete && img.naturalWidth > 0), 'representative icons load');
      document.querySelector('#reset-btn').click();
      document.querySelector('#export-btn').click();
      const reset = JSON.parse(document.querySelector('#io-text').value);
      check(reset.classRanks.length === 0 && reset.specRanks.length === 0, 'reset');
      document.querySelector('#io-dialog .dialog__close').click();
      return { classes: document.querySelectorAll('#class-select option').length, visibleNodes: images.length, tested: ['purchase', 'refund', 'save/load', 'code/JSON import/export', 'page retention', 'class/spec switching', 'local backgrounds/icons', 'fallback', 'reset'] };
    })()
  `);
  window.setPosition(-20000, -20000);
  window.showInactive();
  window.webContents.invalidate();
  await new Promise(resolve => setTimeout(resolve, 500));
  const picture = await window.webContents.capturePage();
  await fs.writeFile(path.join(review, 'builder.png'), picture.toPNG());
  if (remote.length || errors.length) throw new Error(JSON.stringify({ remote, errors }));
  console.log('PASS native offline Builder smoke; screenshot: ' + path.join(review, 'builder.png'));
  window.destroy(); app.quit();
}).catch(error => { console.error(error); app.exit(1); });
