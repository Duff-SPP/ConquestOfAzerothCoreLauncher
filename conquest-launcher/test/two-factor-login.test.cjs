const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { Portal } = require('../src/portal.cjs');

test('2FA retries accept OTP/recovery codes and retain game credentials only after verification', async () => {
  let sessionReads = 0;
  const bodies = [];
  const portal = new Portal('https://launcher.example/', { cookieName: 'coa_launcher', fetchImpl: async (url, options) => {
    if (url.pathname === '/api/site-config') return Response.json({});
    if (url.pathname === '/api/auth/session') { sessionReads++; return Response.json({ username: 'PLAYER' }); }
    const body = JSON.parse(options.body); bodies.push(body);
    if (body.code !== '123456' && body.code !== 'recovery-code') return Response.json({ twoFactorRequired: true, message: body.code ? 'That code is not right.' : 'Enter a code.' }, { status: 403, headers: { 'Set-Cookie': 'coa_launcher=must-not-save' } });
    return Response.json({ username: 'PLAYER' }, { headers: { 'Set-Cookie': 'coa_launcher=verified' } });
  }});
  assert.equal((await portal.login('player', 'password', { rememberForGame: true })).twoFactorRequired, true);
  assert.equal(portal.cookie, ''); assert.equal(portal.getGameLogin(), null); assert.equal(sessionReads, 0);
  assert.equal((await portal.login('player', 'password', { rememberForGame: true, code: 'wrong' })).message, 'That code is not right.');
  assert.equal(portal.getGameLogin(), null); assert.equal(sessionReads, 0);
  assert.equal((await portal.login('player', 'password', { rememberForGame: true, code: '123456' })).username, 'PLAYER');
  assert.deepEqual(portal.getGameLogin(), { username: 'PLAYER', password: 'password' });
  assert.equal(portal.cookie, 'coa_launcher=verified');
  await portal.login('player', 'password', { code: ' recovery-code ' });
  assert.equal(bodies.at(-1).code, 'recovery-code'); assert.equal(portal.getGameLogin(), null);
  await assert.rejects(portal.login('player', 'password', { code: {} }), /authenticator/);
});

test('login UI preserves password for a challenge, retries code, clears secrets on success and rate limits', async () => {
  const app = fs.readFileSync(require.resolve('../public/app.js'), 'utf8');
  const source = app.slice(app.indexOf('async function submitAccountLogin('), app.indexOf('async function submitAccountRegistration('));
  const nodes = Object.fromEntries(['account-login', 'account-password', 'account-code', 'login-two-factor', 'login-error'].map(id => [id, { value: '', hidden: true, focus() {}, setAttribute() {} }]));
  nodes['account-login'].value = 'player'; nodes['account-password'].value = 'password';
  const calls = []; let mode = 'challenge'; let dashboards = 0;
  const context = { document: { getElementById: id => nodes[id] }, state: {}, api: { login: async (...args) => { calls.push(args); if (mode === 'limit') throw Error('Too many attempts.'); return mode === 'challenge' ? { twoFactorRequired: true, message: 'Code needed' } : { username: 'PLAYER' }; } }, t: x => x, tm: x => x, lt: x => x, toast() {}, loadAccountDashboard: async () => { dashboards++; } };
  vm.runInNewContext(source, context);
  const button = { isConnected: true };
  await context.submitAccountLogin(button);
  assert.equal(nodes['login-two-factor'].hidden, false); assert.equal(nodes['account-password'].value, 'password'); assert.equal(context.state.account, undefined); assert.equal(dashboards, 0); assert.equal(button.disabled, false);
  nodes['account-code'].value = '123456'; mode = 'success';
  await context.submitAccountLogin(button);
  assert.deepEqual(calls[1], ['player', 'password', '123456', true]); assert.equal(dashboards, 1); assert.equal(nodes['account-password'].value, ''); assert.equal(nodes['account-code'].value, '');
  nodes['account-password'].value = 'password'; nodes['account-code'].value = 'wrong'; mode = 'limit';
  await context.submitAccountLogin(button);
  assert.equal(nodes['account-password'].value, ''); assert.equal(nodes['account-code'].value, ''); assert.equal(nodes['login-error'].textContent, 'Too many attempts.');
});
