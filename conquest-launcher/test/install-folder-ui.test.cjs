const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

test('folder selection requires clear confirmation and never downloads or reopens the picker implicitly', async () => {
  const source = fs.readFileSync(path.join(__dirname, '../public/updates.js'), 'utf8');
  let html = '', picks = 0, downloads = 0, closed = 0;
  let chosen = { path: 'C:/Games/CoA', installed: false };
  const context = vm.createContext({
    state: { client: { path: '', installed: false }, settings: {}, page: 'home' }, actions: {},
    api: { chooseInstall: async () => { picks++; return chosen; } },
    t: text => text, escape: text => text, icon: () => '', modalHeader: () => '',
    lh: (parts, ...values) => parts.reduce((text, part, index) => text + part + (values[index] ?? ''), ''),
    openModal: (text, type) => { html = text; assert.equal(type, 'install-dialog'); },
    render: () => {}, closeModal: () => { closed++; }, toast: () => {},
    performClientUpdate: async () => { downloads++; },
  });
  vm.runInContext(source.slice(source.indexOf('showInstall = function'), source.indexOf('showAccount = function')), context);
  vm.runInContext(source.slice(source.indexOf("actions['install-selected-client']"), source.indexOf('actions.logout')), context);
  context.showInstall();
  assert.match(html, /Choose game folder/);
  assert.doesNotMatch(html, /Locate existing client|Change folder/);
  await context.actions['choose-install-folder']();
  assert.match(html, /C:\/Games\/CoA/);
  assert.match(html, /Download client here/);
  assert.match(html, /Change folder/);
  assert.equal(downloads, 0);
  await context.actions['install-selected-client']();
  assert.equal(downloads, 1);
  assert.equal(picks, 1);
  chosen = { path: 'C:/Games/Existing', installed: true };
  await context.actions['choose-install-folder']();
  assert.match(html, /Use this client/);
  assert.doesNotMatch(html, /data-action="install-selected-client"/);
  context.actions['use-selected-client']();
  assert.equal(downloads, 1);
  assert.equal(closed, 1);
  const previous = html;
  chosen = null;
  await context.actions['choose-install-folder']();
  assert.equal(html, previous);
  assert.equal(context.state.client.path, 'C:/Games/Existing');
});
