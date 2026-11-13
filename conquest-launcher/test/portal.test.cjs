const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { Portal } = require('../src/portal.cjs');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

test('preserves joined Electron session cookie chunks and clears them on logout', async () => {
  const portal = new Portal('https://launcher.example/', { cookieName: 'coa_launcher', fetchImpl: async (url, options) => {
    assert.equal(options.credentials, 'omit');
    if (url.pathname === '/api/auth/login') return new Response('{}', { headers: {
      'Set-Cookie': 'coa_launcher=chunks-2; Expires=Wed, 30 Sep 2026 12:00:00 GMT; Path=/, coa_launcherC1=one; Path=/, coa_launcherC2=two; Path=/, other=ignored; Path=/'
    } });
    assert.equal(options.headers.Cookie, 'coa_launcher=chunks-2; coa_launcherC1=one; coa_launcherC2=two');
    return new Response('{}', { headers: { 'Set-Cookie': 'coa_launcher=; Path=/, coa_launcherC1=; Path=/, coa_launcherC2=; Path=/' } });
  } });
  await portal.request('/api/auth/login', {});
  await portal.logout();
  assert.equal(portal.cookie, '');
});
test('concurrent startup requests wait for the saved session; registration preserves the deployed API contract', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'coa-session-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const sessionFile = path.join(root, 'session');
  await fs.writeFile(sessionFile, 'coa_launcher=restored');
  let registrations = 0;
  const portal = new Portal('https://launcher.example/', { sessionFile, decrypt: data => data.toString(), cookieName: 'coa_launcher', fetchImpl: async (url, options) => {
    assert.equal(options.headers.Cookie, 'coa_launcher=restored');
    if (url.pathname === '/api/register') {
      registrations++;
      assert.equal(JSON.parse(options.body).turnstileToken, '');
      assert.equal(JSON.parse(options.body).acceptTestWarning, true);
    }
    return new Response(JSON.stringify(url.pathname === '/api/site-config' ? { registrationEnabled: true, turnstileEnabled: false } : { username: 'PLAYER' }));
  }});
  await Promise.all([portal.account(), portal.overview(), portal.characters()]);
  await assert.rejects(portal.register('player', 'player@example.com', 'password', 'password', false), /live and PTR realms/);
  assert.equal(registrations, 0);
  await portal.register('player', 'player@example.com', 'password', 'password', true);
  assert.equal(registrations, 1);
});
test('overlapping session renewals preserve the latest saved login', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'coa-session-race-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const sessionFile = path.join(root, 'session');
  let releaseWrite, firstWriteStarted;
  const blocked = new Promise(resolve => { releaseWrite = resolve; });
  const started = new Promise(resolve => { firstWriteStarted = resolve; });
  let writes = 0;
  const source = await fs.readFile(path.join(__dirname, '../src/portal.cjs'), 'utf8');
  const context = { module: { exports: {} }, URL, AbortSignal, require: name => {
    assert.equal(name, 'node:fs/promises');
    return { ...fs, writeFile: async (...args) => {
      writes++;
      await fs.writeFile(...args);
      if (writes === 1) { firstWriteStarted(); await blocked; }
    } };
  } };
  require('node:vm').runInNewContext(source, context);
  let responseNumber = 0;
  const portal = new context.module.exports.Portal('https://launcher.example/', {
    sessionFile, cookieName: 'coa_launcher', encrypt: value => Buffer.from(value), decrypt: value => value.toString(),
    fetchImpl: async () => new Response('{}', { headers: { 'Set-Cookie': `coa_launcher=renewal-${++responseNumber}; Path=/` } })
  });
  const first = portal.overview();
  await started;
  const second = portal.characters();
  try {
    await new Promise(setImmediate);
    assert.equal(responseNumber, 2, 'HTTP requests may overlap');
    assert.equal(writes, 1, 'session writes must not overlap');
  } finally { releaseWrite(); await Promise.all([first, second]); }
  assert.equal(await fs.readFile(sessionFile, 'utf8'), 'coa_launcher=renewal-2');
  assert.equal(portal.persistenceWarning, '');
  await portal.logout();
  await assert.rejects(fs.stat(sessionFile), { code: 'ENOENT' });
});

test('portal logs in with existing API, keeps cookies outside UI and clears the session on logout', async t => {
  let preview = false;
  const server = http.createServer(async (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/api/site-config') return res.end(JSON.stringify({ previewMode: preview }));
    assert.equal(req.headers['x-coa-request'], '1');
    if (req.url === '/api/auth/login') {
      let raw = ''; for await (const chunk of req) raw += chunk;
      assert.deepEqual(JSON.parse(raw), { login: 'player', password: 'password' });
      res.setHeader('Set-Cookie', 'coa_launcher=test-session; Path=/; HttpOnly; SameSite=Strict'); return res.end('{}');
    }
    if (req.headers.cookie !== 'coa_launcher=test-session') { res.statusCode = 401; return res.end('{}'); }
    if (req.url.endsWith('/logout')) return res.end('{}');
    res.end(JSON.stringify({ accountId: 1, username: 'PLAYER' }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const portal = new Portal(`http://127.0.0.1:${server.address().port}/`, { allowLocalHttp: true, cookieName: 'coa_launcher' });
  assert.equal(await portal.account(), null);
  assert.deepEqual(await portal.login('player', 'password'), { accountId: 1, username: 'PLAYER', persistenceWarning: '' });
  await portal.logout(); assert.equal(await portal.account(), null);
  preview = true; await assert.rejects(portal.login('player', 'password'), /preview mode/);
  assert.throws(() => new Portal('http://example.com'), /HTTPS/);
});
