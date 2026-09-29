const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');
const { publishClient } = require('./publish-client.cjs');
const { ClientUpdater } = require('../src/client-updater.cjs');
async function run() {
  const root = path.resolve(__dirname, '../test-output/backend-' + Date.now());
  const master = path.join(root, 'master'); const output = path.join(root, 'published'); const player = path.join(root, 'player');
  await fs.mkdir(master, { recursive: true }); await fs.writeFile(path.join(master, 'Ascension.exe'), 'backend route fixture');
  const release = await publishClient(master, output, 'backend-1', () => {});
  const reserve = http.createServer(); await new Promise(resolve => reserve.listen(0, '127.0.0.1', resolve));
  const port = reserve.address().port; await new Promise(resolve => reserve.close(resolve));
  const site = path.resolve(__dirname, '../../Conquest-Launcher-Backend');
  const proc = spawn('dotnet', [path.join(site, 'bin/Debug/net8.0/Conquest.Launcher.Backend.dll'), '--urls', `http://127.0.0.1:${port}`, '--LocalTesting=true', '--Accounts:RegistrationEnabled=false', '--ConnectionStrings:AuthDatabase=', '--ConnectionStrings:CharactersDatabase=', `--Launcher:PublishedRoot=${output}`, `--DataProtection:KeysPath=${path.join(root, 'keys')}`], { cwd: site, windowsHide: true, env: { ...process.env, ASPNETCORE_ENVIRONMENT: 'Development' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = ''; proc.stdout.on('data', data => { log = (log + data).slice(-5000); }); proc.stderr.on('data', data => { log = (log + data).slice(-5000); });
  const base = `http://127.0.0.1:${port}`;
  try {
    let ready = false;
    for (let i = 0; i < 100; i++) {
      try { const response = await fetch(base + '/health'); if (response.ok) { ready = true; break; } } catch {}
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    if (!ready) throw new Error('Backend test host did not start: ' + log);
    const manifest = await fetch(base + '/downloads/client/latest.json');
    assert.equal(manifest.status, 200); assert.equal(manifest.headers.get('cache-control'), 'no-store');
    assert.equal((await manifest.json()).version, 'backend-1');
    const binaryUrl = base + '/downloads/client/objects/' + release.files[0].sha256;
    const range = await fetch(binaryUrl, { headers: { Range: 'bytes=8-' } });
    assert.equal(range.status, 206); assert.match(range.headers.get('content-range'), /^bytes 8-/); assert.equal(await range.text(), 'route fixture');
    assert.equal((await fetch(base + '/downloads/launcher/private.env')).status, 404);
    assert.equal((await fetch(base + '/downloads/client/objects/not-a-hash')).status, 404);
    assert.equal((await fetch(base + '/api/auth/session')).status, 401);
    assert.equal((await fetch(base + '/health').then(response => response.json())).service, 'conquest-launcher-backend');
    const configuration = await fetch(base + '/api/site-config').then(response => response.json());
    assert.equal(configuration.previewMode, false);
    assert.equal((await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CoA-Request': '1' }, body: JSON.stringify({ login: 'PREVIEW', password: 'fake' }) })).status, 503, 'no simulated account bypass');
    assert.equal((await fetch(base + '/api/account/characters')).status, 401);
    assert.equal((await fetch(base + '/api/register', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CoA-Request': '1' }, body: '{}' })).status, 503);
    const updater = new ClientUpdater(base + '/downloads/client/latest.json', { allowLocalHttp: true });
    await updater.update(player);
    assert.equal(await fs.readFile(path.join(player, 'Ascension.exe'), 'utf8'), 'backend route fixture');
    if (process.env.PLAYWRIGHT_MODULE) {
      const { chromium } = require(process.env.PLAYWRIGHT_MODULE);
      const browser = await chromium.launch({ channel: 'msedge', headless: true });
      try {
        const page = await browser.newPage(); const errors = []; const submissions = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.route('https://challenges.cloudflare.com/**', route => route.abort());
        await page.route('**/api/**', async route => {
          const endpoint = new URL(route.request().url()).pathname;
          let data = {}; let status = 200;
          if (endpoint === '/api/site-config') data = { registrationEnabled: true, turnstileEnabled: false, passwordResetEnabled: true };
          else if (endpoint === '/api/auth/session') status = 401;
          else if (endpoint === '/api/auth/login') data = { accountId: 1, username: 'TESTPLAYER' };
          else if (endpoint === '/api/account/characters') data = [{ name: 'Testhero', level: 10, online: false }];
          else if (endpoint === '/api/register') { submissions.push(route.request().postDataJSON()); data = { message: 'Account created.' }; }
          await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
        });
        await page.goto(base + '/#register');
        await page.locator('[name=username]').fill('testplayer'); await page.locator('[name=email]').fill('test@example.invalid');
        await page.locator('[name=password]').fill('fixture123'); await page.locator('[name=confirmPassword]').fill('fixture123');
        await page.locator('[name=acceptTestWarning]').check(); await page.locator('form button').click();
        await page.getByText('Account created.', { exact: true }).waitFor();
        assert.equal(submissions[0].acceptTestWarning, true);
        await page.locator('a[href="#account"]').click();
        await page.locator('[name=login]').fill('testplayer'); await page.locator('[name=password]').fill('fixture123'); await page.locator('form button').click();
        await page.getByText('Testhero — level 10', { exact: true }).waitFor();
        await page.screenshot({ path: path.join(root, 'account-page.png'), fullPage: true });
        assert.deepEqual(errors, []);
        console.log('Independent account page passed: registration form, sign-in, character display, and no JavaScript errors (fixture API).');
      } finally { await browser.close(); }
    }
    console.log('Backend smoke passed: real ASP.NET manifest, range responses, download install, cache policy, private path rejection, and unauthenticated account rejection.');
  } finally { proc.kill(); await new Promise(resolve => { if (proc.exitCode !== null) resolve(); else proc.once('exit', resolve); }); }
}
run().catch(error => { console.error(error.message); process.exitCode = 1; });
