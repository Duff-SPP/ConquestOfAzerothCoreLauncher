const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function fixture() {
  const source = fs.readFileSync(path.join(__dirname, '../src/main.cjs'), 'utf8');
  const sent = [], external = [], partitions = [], views = [], handlers = new Map();
  const context = vm.createContext({
    URL, Map, setImmediate, config: require('../launcher.config.json'),
    embeddedViews: new Map(),
    window: { isDestroyed: () => false, webContents: { send: (...args) => sent.push(args) }, contentView: { addChildView: () => {} }, getContentBounds: () => ({ width: 1200, height: 800 }) },
    session: { fromPartition: key => { partitions.push(key); return { setPermissionRequestHandler: () => {}, setPermissionCheckHandler: () => {} }; } },
    trustedHttps: value => { const url = new URL(value); if (url.protocol !== 'https:') throw new Error('HTTPS required'); return url; },
    shell: { openExternal: async url => external.push(url) },
    handle: (name, callback) => handlers.set(name, callback),
    WebContentsView: class {
      constructor(options) {
        this.options = options; this.events = new Map(); this.loads = [];
        this.webContents = { isDestroyed: () => false, setWindowOpenHandler: fn => { this.popup = fn; }, on: (name, fn) => this.events.set(name, fn), loadURL: async url => this.loads.push(url), reload: () => { this.reloaded = true; } };
        views.push(this);
      }
      setVisible(value) { this.visible = value; }
      setBounds(value) { this.bounds = value; }
      setBackgroundColor() {}
      setBorderRadius() {}
    },
  });
  vm.runInContext(source.slice(source.indexOf('function sendDatabaseStatus('), source.indexOf('async function readIssues(')), context);
  vm.runInContext(source.slice(source.indexOf("  handle('launcher:database-view'"), source.indexOf("  handle('launcher:issues'")), context);
  return { context, sent, external, partitions, views, handlers };
}

test('Armory embeds its configured URL, keeps its own session and switches safely with Database', async () => {
  const f = fixture();
  const show = f.handlers.get('launcher:database-view');
  const bounds = { x: 50, y: 200, width: 1000, height: 500 };
  await show({ visible: true, page: 'armory', bounds });
  const armory = f.views[0];
  assert.deepEqual(armory.loads, ['https://coa-development.org/armory/']);
  assert.equal(armory.visible, true);
  assert.equal(armory.options.webPreferences.nodeIntegration, false);
  assert.equal(armory.options.webPreferences.sandbox, true);
  await show({ visible: true, page: 'database', bounds });
  assert.equal(armory.visible, false);
  assert.equal(f.views[1].visible, true);
  await show({ visible: true, page: 'armory', bounds });
  assert.equal(f.views.length, 2, 'views are reused without resetting browsing');
  assert.equal(f.views[1].visible, false);
  assert.deepEqual(f.partitions, ['coa-armory', 'coa-database']);
  await f.handlers.get('launcher:database-reload')('armory');
  assert.equal(armory.reloaded, true);
  await show({ visible: false });
  assert.ok(f.views.every(view => !view.visible));
  assert.deepEqual(f.external, []);
  await assert.rejects(show({ visible: true, page: 'unknown', bounds }), /Unknown embedded page/);
});

test('embedded failures retain error status and navigation stays restricted to trusted HTTPS', () => {
  const f = fixture();
  const view = f.context.ensureDatabaseView('armory');
  view.events.get('did-start-loading')();
  view.events.get('did-fail-load')({}, -105, 'Connection failed', '', true);
  view.events.get('did-stop-loading')();
  assert.equal(f.sent.at(-1)[1].state, 'error');
  assert.equal(f.sent.at(-1)[1].page, 'armory');
  let blocked = false;
  view.events.get('will-navigate')({ url: 'file:///C:/private', preventDefault: () => { blocked = true; } });
  assert.equal(blocked, true);
  blocked = false;
  view.events.get('will-navigate')({ url: 'https://coa-development.org/armory/character/1', preventDefault: () => { blocked = true; } });
  assert.equal(blocked, false);
});

test('renderer embeds Armory and does not display it over dialogs or other pages', () => {
  const source = fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8');
  const calls = [];
  const state = { page: 'armory' }, modal = { open: false };
  const context = vm.createContext({ state, modal, window: { launcher: {} },
    document: { getElementById: () => ({ getBoundingClientRect: () => ({ left: 10, top: 100, width: 900, height: 500 }) }) },
    api: { databaseView: async request => calls.push(request) }, guarded: action => action(),
    t: value => value, icon: value => value,
    lh: (strings, ...values) => strings.reduce((text, part, i) => text + part + (values[i] ?? ''), ''),
  });
  const headerStart = source.indexOf('const titleBlock =');
  vm.runInContext(source.slice(headerStart, source.indexOf('\n', headerStart)), context);
  vm.runInContext(source.slice(source.indexOf('function isEmbeddedPage('), source.indexOf('function formatIssueDate(')), context);
  vm.runInContext(source.slice(source.indexOf('function syncDatabaseView('), source.indexOf('function showIssue(')), context);
  assert.match(context.databasePage(), /data-action="database-reload"/);
  assert.doesNotMatch(context.databasePage(), /data-external=/);
  assert.doesNotMatch(context.databasePage(), /undefined|page-description/);
  assert.match(vm.runInContext("titleBlock('Database', 'Browse items')", context), /class="page-description">Browse items<\/p>/);
  context.syncDatabaseView();
  assert.equal(calls[0].page, 'armory');
  modal.open = true;
  context.syncDatabaseView();
  modal.open = false; state.page = 'home';
  context.syncDatabaseView();
  assert.equal(calls.length, 1);
});
