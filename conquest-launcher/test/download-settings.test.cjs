const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const { DownloadThrottle } = require('../src/download-throttle.cjs');
const { defaults, sanitize, saveSettings, readSettings } = require('../src/settings.cjs');

test('speed limits default to unlimited, validate numbers, and persist across restarts', async t => {
  assert.equal(defaults.downloadLimitMBps, 0);
  for (const value of ['5', -1, Infinity, NaN, null, 0.01, 10001]) assert.equal(sanitize({ downloadLimitMBps: value }).downloadLimitMBps, 0);
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'coa-download-settings-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const file = path.join(root, 'settings.json');
  for (const value of [0.1, 2.5, 10000, 0]) {
    await saveSettings(file, { downloadLimitMBps: value });
    assert.equal((await readSettings(file)).downloadLimitMBps, value);
  }
});

test('throttle budgets new bytes only, responds to setting changes, and allows unlimited', async () => {
  let now = 0, rate = 1000, waits = 0;
  const throttle = new DownloadThrottle(() => rate, { now: () => now, wait: async ms => { now += ms; waits++; } });
  const signal = new AbortController().signal;
  await throttle.consume(1000, signal);
  assert.equal(now, 1000);
  now += 10000; // Network idle must not accumulate a burst allowance.
  await throttle.consume(500, signal);
  assert.equal(now, 11500);
  rate = 0;
  const previous = waits;
  await throttle.consume(100000, signal);
  assert.equal(waits, previous);
  rate = 1000;
  throttle.wait = async ms => { now += ms; rate = 0; };
  const start = now;
  await throttle.consume(100000, signal);
  assert.equal(now - start, 200, 'removing the limit takes effect within one interval');
});

test('pause interrupts a throttle wait without waiting for the speed budget', async () => {
  const controller = new AbortController();
  const throttle = new DownloadThrottle(() => 1);
  const pending = throttle.consume(100000, controller.signal);
  controller.abort();
  await assert.rejects(pending, { name: 'AbortError' });
});

test('numeric settings reach the main process as numbers, and invalid API patches are rejected', async () => {
  const main = await fs.readFile(path.join(__dirname, '../src/main.cjs'), 'utf8');
  const handlers = new Map();
  const context = vm.createContext({ settings: { ...defaults }, handle: (name, action) => handlers.set(name, action),
    persist: async value => { context.settings = sanitize(value); return context.settings; }
  });
  vm.runInContext(main.slice(main.indexOf("handle('launcher:settings'"), main.indexOf("handle('launcher:choose-client'")), context);
  await handlers.get('launcher:settings')({ downloadLimitMBps: 2.5 });
  assert.equal(context.settings.downloadLimitMBps, 2.5);
  await assert.rejects(handlers.get('launcher:settings')({ downloadLimitMBps: '2.5' }), /0 for unlimited/);
  const app = await fs.readFile(path.join(__dirname, '../public/app.js'), 'utf8');
  const events = new Map();
  let saved;
  const renderer = vm.createContext({ document: { addEventListener: (name, fn) => events.set(name, fn), body: { classList: { toggle() {} } } },
    state: { settings: {} }, guarded: action => action(), api: { saveSettings: async patch => { saved = patch; return patch; } }, t: value => value, toast() {}
  });
  vm.runInContext(app.slice(app.indexOf("document.addEventListener('change'"), app.indexOf("window.addEventListener('resize'")), renderer);
  const element = { dataset: { setting: 'downloadLimitMBps' }, type: 'number', value: '3.5', checkValidity: () => true };
  events.get('change')({ target: element });
  await new Promise(setImmediate);
  assert.equal(saved.downloadLimitMBps, 3.5);
  assert.equal(element.disabled, false);
});

test('paused updates resolve normally over IPC, while real failures are preserved', async () => {
  const main = await fs.readFile(path.join(__dirname, '../src/main.cjs'), 'utf8');
  const handlers = new Map();
  let paused = true;
  const context = vm.createContext({ handle: (name, action) => handlers.set(name, action), config: {}, settings: { installPath: 'C:\\Game' },
    requireIdleClient: async () => {}, probeClientFolder: async () => {}, clientInfo: async () => ({}),
    clientUpdater: { update: async () => { throw Object.assign(new Error('cancelled'), { code: paused ? 'CLIENT_PAUSED' : 'DISK_ERROR' }); }, emit: () => assert.fail('must not report ready') }
  });
  vm.runInContext(main.slice(main.indexOf("handle('launcher:client-update'"), main.indexOf("handle('launcher:client-pause'")), context);
  assert.equal((await handlers.get('launcher:client-update')(false)).paused, true);
  paused = false;
  await assert.rejects(handlers.get('launcher:client-update')(false), /cancelled/);
});

test('Pause retains repair mode; Resume waits for old IPC cleanup and then succeeds', async () => {
  const source = await fs.readFile(path.join(__dirname, '../public/updates.js'), 'utf8');
  let finishUpdate, finishInfo;
  const forces = [];
  const context = vm.createContext({ state: { config: {}, client: { installed: true }, clientProgress: { phase: 'available' } },
    closeModal() {}, render() {}, updateControls() {}, t: value => value, toast: () => assert.fail('pause is not a completed update'),
    api: { updateClient: force => { forces.push(force); return new Promise(resolve => { finishUpdate = resolve; }); }, clientInfo: () => new Promise(resolve => { finishInfo = resolve; }) }
  });
  vm.runInContext(source.slice(source.indexOf('async function performClientUpdate('), source.indexOf('pendingUpdate = async')), context);
  const first = context.performClientUpdate(true);
  context.state.clientProgress.phase = 'paused';
  finishUpdate({ paused: true });
  await new Promise(setImmediate);
  assert.equal(context.state.clientUpdatePending, true);
  assert.equal(await context.performClientUpdate(), false);
  assert.equal(forces.length, 1);
  finishInfo({ installed: true });
  assert.equal(await first, false);
  assert.equal(context.state.clientUpdatePending, false);
  context.toast = () => {};
  context.api.clientInfo = async () => ({ installed: true });
  context.api.updateClient = async force => { forces.push(force); return { installed: true }; };
  assert.equal(await context.performClientUpdate(), true);
  assert.deepEqual(forces, [true, true]);
});
