const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');

const required = [
  "Notifications",
  "Launcher and client updates",
  "Client update",
  "AVAILABLE",
  "Client update available",
  "An updated client release is ready to download.",
  "{0} files · {1}",
  "Update now",
  "Launcher update",
  "READY",
  "Launcher {0}",
  "Launcher update ready",
  "Restart the launcher to install the downloaded update.",
  "Restart & update",
  "DOWNLOADING",
  "Launcher update downloading",
  "No update notifications.",
  "Launcher and client updates will appear here when action is needed.",
  "Notifications, update available",
  "Added update notifications for client releases and launcher updates.",
  "Launcher update progress"
];

test('notification bell reflects existing client and launcher updater state', async () => {
  const root = path.resolve(__dirname, '..');
  const app = await fs.readFile(path.join(root, 'public/app.js'), 'utf8');
  const updates = await fs.readFile(path.join(root, 'public/updates.js'), 'utf8');

  assert.match(app, /window\.launcherNotifications\?\.html\?\.\(\)/);
  assert.match(app, /notifications: element => showPopover\(element, 'notifications'\)/);
  assert.doesNotMatch(app, /notification-dot'\)\.hidden = true/);

  assert.match(updates, /state\.clientProgress\.phase === 'available'/);
  assert.match(updates, /state\.launcherUpdate\.phase === 'downloaded'/);
  assert.match(updates, /state\.launcherUpdate\.phase === 'downloading'/);
  assert.match(updates, /data-action="check-updates"/);
  assert.match(updates, /data-action="launcher-install"/);
  assert.match(updates, /state\.clientUpdatePlan = await api\.checkClient\(false\)/);
  assert.match(updates, /dot\.hidden = !actionable/);
  assert.match(updates, /t\('UPDATE READY'\)/);
  assert.match(updates, /<progress class="notification-progress"/);
  assert.doesNotMatch(updates, /notification-progress[^\n]*style=/);

  const french = JSON.parse(await fs.readFile(path.join(root, 'localization', 'fr.json'), 'utf8'));
  assert.equal(french.READY, 'PRÊT');

  for (const code of ['fr', 'ru', 'zh-CN']) {
    const catalog = JSON.parse(await fs.readFile(path.join(root, 'localization', code + '.json'), 'utf8'));
    for (const key of required) {
      assert.equal(typeof catalog[key], 'string', code + ' is missing: ' + key);
      assert.notEqual(catalog[key].trim(), '', code + ' has an empty translation: ' + key);
    }
  }
});
