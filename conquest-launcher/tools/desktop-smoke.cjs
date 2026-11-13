// Copyright (C) 2026 Duff (Duff-SPP). GPL-3.0-only; see LICENSE and ATTRIBUTION.md at the repository root.
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const { _electron } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
async function run() {
  const root = await fs.mkdtemp(path.join(require('node:os').tmpdir(), 'coa-desktop-'));
  await fs.mkdir(path.join(root, 'game'), { recursive: true });
  const environment = { ...process.env, COA_TEST_ROOT: root }; delete environment.ELECTRON_RUN_AS_NODE;
  const electron = await _electron.launch({ executablePath: require('electron'), args: [path.resolve(__dirname, '../test/desktop-harness.cjs')], env: environment, timeout: 30000 });
  electron.process().stderr.on('data', chunk => process.stderr.write(chunk));
  try {
    const sendProgress = async status => {
      await electron.evaluate(({ BrowserWindow }, value) => BrowserWindow.getAllWindows()[0].webContents.send('launcher:client-progress', value), status);
      await page.waitForFunction(phase => document.getElementById('client-update-progress')?.dataset.phase === phase, status.phase);
    };
    const page = await electron.firstWindow(); const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.waitForSelector('.play-button');
    await page.waitForFunction(() => document.querySelector('.discord-name small')?.textContent.includes('123'));
    await electron.evaluate(({ shell }) => { global.__smokeExternal = ''; shell.openExternal = async url => { global.__smokeExternal = url; }; });
    await page.locator('.discord-card').click();
    assert.equal(await electron.evaluate(() => global.__smokeExternal), '');
    await page.locator('[data-external="discord"]').click();
    assert.equal(await electron.evaluate(() => global.__smokeExternal), 'https://discord.gg/UV4engmU96');
    await page.locator('.modal-close').click();
    await page.waitForFunction(() => document.getElementById('client-update-progress')?.textContent.includes('available to install'));
    await page.screenshot({ path: path.join(root, 'home.png'), animations: 'disabled' });
    await page.locator('.account-button').click();
    await page.locator('#account-login').fill('testplayer'); await page.locator('#account-password').fill('fixture-only');
    await page.locator('#launcher-login [type=submit]').click();
    await page.getByText('You are signed in to Conquest of AzerothCore.', { exact: true }).waitFor();
    await page.screenshot({ path: path.join(root, 'account.png'), animations: 'disabled' });
    await page.locator('.modal-close').click();
    await electron.evaluate(({ dialog }, game) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [game] }); }, path.join(root, 'game'));
    await page.locator('.locate-client').click();
    await page.locator('[data-action="install-selected-client"]').click();
    await page.waitForFunction(() => document.querySelector('.play-title')?.textContent === 'Play', { timeout: 30000 });
    await assert.rejects(fs.stat(path.join(root, 'game/Interface/AddOns')), { code: 'ENOENT' });
    await fs.mkdir(path.join(root, 'game/Interface/AddOns/PlayerCustom'), { recursive: true });
    await fs.writeFile(path.join(root, 'game/Interface/AddOns/PlayerCustom/PlayerCustom.toc'), '## Title: Player custom addon');
    assert.equal(await fs.readFile(path.join(root, 'game/Data/enUS/realmlist.wtf'), 'utf8'), 'set realmlist logon.coa-development.org\n');
    const saved = JSON.parse(await fs.readFile(path.join(root, 'profile/settings.json'), 'utf8'));
    assert.equal(saved.installPath, path.join(root, 'game'));
    // Render the intermediate progress state deterministically; the fixture is
    // too small to reliably screenshot a live staging event.
    await sendProgress({ phase: 'staging', message: 'Preparing Data/patch.MPQ', bytes: 50, totalBytes: 100 });
    assert.equal(await page.locator('.play-title').textContent(), 'Preparing');
    assert.equal(await page.locator('.play-button').isDisabled(), true);
    assert.equal(await page.locator('[data-action="pause-client"]').isVisible(), true);
    await page.screenshot({ path: path.join(root, 'staging.png'), animations: 'disabled' });
    for (const phase of ['downloading', 'verifying', 'staging', 'applying', 'finalizing', 'installing-required-addons', 'pausing']) {
      await sendProgress({ phase, message: 'Phase check', bytes: 100, totalBytes: 100 });
      assert.equal(await page.locator('.play-button').isDisabled(), true);
      assert.notEqual(await page.locator('.download-percent').textContent(), '100%');
      assert.equal(await page.locator('[data-action="pause-client"]').isVisible(), ['downloading', 'verifying', 'staging'].includes(phase));
    }
    await sendProgress({ phase: 'ready', message: 'Client ready.' });
    assert.equal(await page.locator('.download-percent').textContent(), '100%');
    await page.locator('.utility-right [data-action="settings"]').click();
    await page.getByText('Check launcher updates', { exact: true }).waitFor();
    assert.equal(await page.locator('#launcher-restart').isVisible(), false);
    assert.equal(await page.locator('[data-setting="closeOnLaunch"]').count(), 0);
    await page.screenshot({ path: path.join(root, 'settings.png'), animations: 'disabled' });
    await page.locator('.modal-close').click();
    await page.locator('[data-page="addons"]').click();
    await page.getByText('Player custom addon', { exact: true }).waitFor({ timeout: 120000 });
    assert.equal(await page.locator('[data-action="mandatory-addons"]').count(), 0);
    await page.locator('[data-addon-tab="installed"]').click();
    await page.getByText('Player custom addon', { exact: true }).waitFor();
    assert.equal(await page.locator('[data-addon-install="local:PlayerCustom"]').count(), 0);
    await page.screenshot({ path: path.join(root, 'mandatory-addons.png'), animations: 'disabled' });
    assert.deepEqual(errors, []);
    console.log('Desktop smoke passed: home, native account login, install controls, progress, verified files, realmlist, and settings. Screenshots: ' + root);
  } finally { await electron.close(); }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
