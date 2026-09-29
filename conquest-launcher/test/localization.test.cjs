const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');

const required = [
  "Mandatory",
  "Release history from version 0.6.1 onward.",
  "Added multilingual launcher support with saved language selection for English, French, Russian, and Simplified Chinese.",
  "Improved installer and uninstaller ownership, locking, registration, and build handling to better protect player files.",
  "Improved production bundle protection while preserving launcher update compatibility.",
  "Added optional minimum launcher compatibility checks and expanded downloader regression coverage.",
  "Improved addon backup and recovery, dependency handling, stale inventory refresh, and realm setup retry behavior.",
  "Added player addon inventory and removed automatic required-addon synchronization so custom addons stay under player control.",
  "Improved download, verification, preparation, cancellation, resume, and progress handling.",
  "Introduced automatic required-addon installation; this behavior was later removed in version 0.6.5.",
  "Added launcher file ownership tracking and safer preservation during install, upgrade, and uninstall.",
  "Improved folder selection and installation flow, preserved MemoryBridge.log, and smoothed the transition from updating to ready to play."
];

test('saved language restores the shell and release history is localized', async () => {
  const root = path.resolve(__dirname, '..');
  const app = await fs.readFile(path.join(root, 'public/app.js'), 'utf8');

  assert.match(app, /launcherI18n\.setLanguage\(state\.settings\.language\);[\s\S]*?refreshLanguageShell\(\);/);
  assert.doesNotMatch(app, /addon\.mandatory \? ' · Mandatory'/);

  for (const version of ['0.6.8', '0.6.7', '0.6.6', '0.6.5', '0.6.4', '0.6.3', '0.6.2', '0.6.1']) {
    assert.match(app, new RegExp("version: '" + version.replaceAll('.', '\\.') + "'"));
  }

  for (const code of ['fr', 'ru', 'zh-CN']) {
    const catalog = JSON.parse(await fs.readFile(path.join(root, 'localization', code + '.json'), 'utf8'));
    for (const key of required) {
      assert.equal(typeof catalog[key], 'string', code + ' is missing: ' + key);
      assert.notEqual(catalog[key].trim(), '', code + ' has an empty translation: ' + key);
    }
  }
});
