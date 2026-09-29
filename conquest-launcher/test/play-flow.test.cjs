const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const vm = require('node:vm');

async function play(phase, responses, failUpdate = false) {
  const source = await fs.readFile(path.join(__dirname, '../public/updates.js'), 'utf8');
  const handler = source.slice(source.indexOf('actions.play = async'), source.indexOf('if (window.launcher)'));
  const calls = [];
  const context = { actions: {}, state: { client: { installed: true, running: false }, clientProgress: { phase } },
    toast: () => {}, showInstall: () => calls.push('install'), render: () => {},
    performClientUpdate: async () => { calls.push('update'); if (failUpdate) throw new Error('failed'); },
    api: { launch: async () => { calls.push('launch'); return responses.shift(); } }
  };
  vm.createContext(context); vm.runInContext(handler, context);
  let error; try { await context.actions.play(); } catch (e) { error = e; }
  return { calls, running: context.state.client.running, error };
}
test('main button updates then launches without a second click', async () => {
  const result = await play('available', [{ running: true }]);
  assert.deepEqual(result.calls, ['update', 'launch']); assert.equal(result.running, true);
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
