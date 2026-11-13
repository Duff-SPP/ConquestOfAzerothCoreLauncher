const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../public/updates.js'), 'utf8');

test('speed excludes resumed bytes, estimates remaining download time, and resets across retries and phases', () => {
  const context = vm.createContext({ performance: { now: () => 0 } });
  vm.runInContext(source.slice(source.indexOf('let downloadSample ='), source.indexOf('function notificationCenterHtml(')), context);
  const mb = 1024 ** 2;
  const sample = (bytes, time, phase = 'downloading', totalBytes = 100 * mb) => context.downloadTiming({ bytes, totalBytes, phase }, time);
  assert.equal(sample(40 * mb, 0).seconds, null);
  const timing = sample(42 * mb, 1000);
  assert.equal(timing.rate, 2 * mb);
  assert.equal(timing.seconds, 29);
  assert.equal(context.remainingTimeLabel(timing.seconds), '00:00:29');
  assert.equal(context.remainingTimeLabel(3661), '01:01:01');
  assert.equal(sample(0, 1200).seconds, null, 'retry rollback must reset the rate');
  assert.equal(sample(0, 1400, 'paused'), null);
  assert.equal(sample(60 * mb, 2000).seconds, null, 'resume must start a fresh baseline');
  assert.equal(sample(62 * mb, 3000).seconds, 19);
  assert.equal(sample(62 * mb, 3100, 'verifying'), null);
  assert.equal(sample(62 * mb, 3200, 'ready'), null);
  assert.equal(sample(0, 3300, 'downloading', 0), null);
});

test('Repair displays its explanation before invoking the strict scan', async () => {
  let html = '', scans = 0, force;
  const tag = (strings, ...values) => strings.reduce((out, part, i) => out + part + (values[i] ?? ''), '');
  const context = vm.createContext({ actions: {}, t: value => value, lh: tag, icon: value => value,
    modalHeader: value => value, openModal: value => { html = value; },
    pendingUpdate: async value => { ++scans; force = value; },
  });
  vm.runInContext(source.slice(source.indexOf('actions.repair ='), source.indexOf("actions['pause-client']")), context);
  context.actions.repair();
  assert.equal(scans, 0);
  assert.match(html, /customized managed DLLs/);
  assert.match(html, /Published patch filenames are restored/);
  assert.match(html, /extra unmanaged files are preserved/);
  assert.match(html, /data-action="dismiss-modal"/);
  await context.actions['confirm-client-repair']();
  assert.equal(scans, 1);
  assert.equal(force, true);
});
