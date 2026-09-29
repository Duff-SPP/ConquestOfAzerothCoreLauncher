const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { Portal } = require('../src/portal.cjs');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
test('concurrent startup requests wait for the saved session; PTR registration needs no CAPTCHA', async t => {
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
    }
    return new Response(JSON.stringify(url.pathname === '/api/site-config' ? { registrationEnabled: true, turnstileEnabled: false } : { username: 'PLAYER' }));
  }});
  await Promise.all([portal.account(), portal.overview(), portal.characters()]);
  await portal.register('player', 'player@example.com', 'password', 'password', true);
  assert.equal(registrations, 1);
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
  assert.deepEqual(await portal.login('player', 'password'), { accountId: 1, username: 'PLAYER' });
  await portal.logout(); assert.equal(await portal.account(), null);
  preview = true; await assert.rejects(portal.login('player', 'password'), /preview mode/);
  assert.throws(() => new Portal('http://example.com'), /HTTPS/);
});
