const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const vm = require('node:vm');

async function play(phase, responses, failUpdate = false, autoLaunchAfterUpdate = true) {
  const source = await fs.readFile(path.join(__dirname, '../public/updates.js'), 'utf8');
  const handler = source.slice(source.indexOf('actions.play = async'), source.indexOf('if (window.launcher)'));
  const calls = [];
  const context = { actions: {}, state: { settings: { autoLaunchAfterUpdate }, client: { installed: true, running: false }, clientProgress: { phase } },
    t: text => text, toast: () => {}, showInstall: () => calls.push('install'), render: () => {}, updateControls: () => {}, clientBusy: () => false,
    performClientUpdate: async () => { calls.push('update'); if (failUpdate === 'paused') return false; if (failUpdate) throw new Error('failed'); },
    api: { launch: async () => { calls.push('launch'); return responses.shift(); } }
  };
  vm.createContext(context); vm.runInContext(handler, context);
  let error; try { await context.actions.play(); } catch (e) { error = e; }
  return { calls, running: context.state.client.running, pending: context.state.playPending, error };
}
test('main button updates then launches without a second click', async () => {
  const result = await play('available', [{ running: true }]);
  assert.deepEqual(result.calls, ['update', 'launch']); assert.equal(result.running, true);
});

test('a paused update does not launch, and Resume can finish and launch', async () => {
  const paused = await play('paused', [], 'paused');
  assert.deepEqual(paused.calls, ['update']);
  assert.equal(paused.running, false);
  assert.equal(paused.error, undefined);
  assert.equal(paused.pending, false);
  const resumed = await play('paused', [{ running: true }]);
  assert.deepEqual(resumed.calls, ['update', 'launch']);
  assert.equal(resumed.running, true);
});
test('update discovered at launch is applied and launch retried once', async () => {
  const result = await play('ready', [{ needsUpdate: true }, { running: true }]);
  assert.deepEqual(result.calls, ['launch', 'update', 'launch']); assert.equal(result.running, true);
});
test('failed updates never launch and repeated release changes do not loop', async () => {
  const failed = await play('available', [], true);
  assert.deepEqual(failed.calls, ['update']); assert.equal(failed.running, false);
  const changed = await play('ready', [{ needsUpdate: true }, { needsUpdate: true }]);
  assert.equal(changed.running, false); assert.match(changed.error.message, /release changed/);
});

test('update-only preference stops after updating but explicit Play still launches', async () => {
  assert.deepEqual((await play('available', [], false, false)).calls, ['update']);
  assert.deepEqual((await play('ready', [{ needsUpdate: true }], false, false)).calls, ['launch', 'update']);
  const explicit = await play('ready', [{ running: true }], false, false);
  assert.deepEqual(explicit.calls, ['launch']); assert.equal(explicit.running, true);
});

test('Play ignores overlapping clicks and unlocks after completion', async () => {
  const source = await fs.readFile(path.join(__dirname, '../public/updates.js'), 'utf8');
  const handler = source.slice(source.indexOf('actions.play = async'), source.indexOf('if (window.launcher)'));
  let finish; let launches = 0;
  const context = { actions: {}, state: { client: { installed: true }, clientProgress: { phase: 'ready' } }, clientBusy: () => false, updateControls: () => {}, render: () => {},
    api: { launch: () => { launches++; return new Promise(resolve => { finish = resolve; }); } } };
  vm.createContext(context); vm.runInContext(handler, context);
  const first = context.actions.play(); await context.actions.play();
  assert.equal(launches, 1); assert.equal(context.state.playPending, true);
  finish({ running: true }); await first;
  assert.equal(context.state.playPending, false);
  assert.equal((await play('available', [], true)).pending, false);
  assert.equal((await play('available', [], false, false)).pending, false);
});
