const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { defaults, sanitize, readSettings, saveSettings } = require('../src/settings.cjs');

test('fresh and invalid settings prompt; older supported saved languages migrate without a prompt', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'coa-language-test-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const file = path.join(directory, 'settings.json');
  assert.equal((await readSettings(file)).languageSelected, false);
  assert.equal(sanitize({}).languageSelected, false);
  assert.equal(sanitize({ language: 'invalid', languageSelected: true }).languageSelected, false);
  for (const language of ['en', 'fr', 'es-ES', 'ru', 'zh-CN']) {
    assert.equal(sanitize({ language }).languageSelected, true);
    assert.equal(sanitize({ language }).language, language);
  }
  await saveSettings(file, { ...defaults, hdPatches: false });
  assert.equal((await readSettings(file)).languageSelected, false, 'unrelated saves must not dismiss first-start selection');
  await saveSettings(file, { ...defaults, language: 'fr', languageSelected: true });
  const saved = await readSettings(file);
  assert.equal(saved.languageSelected, true);
  assert.equal(saved.language, 'fr');
});

test('first-start selection saves before closing; failed saves keep the popup open', async () => {
  const source = await fs.readFile(path.join(__dirname, '../public/language-ui.js'), 'utf8');
  const calls = [], select = { value: 'ru' }, button = { disabled: false };
  const context = vm.createContext({ actions: {}, state: { settings: { ...defaults } },
    document: { getElementById: () => select }, launcherI18n: { languages: [{ code: 'ru' }] },
    api: { saveSettings: async patch => { calls.push('save'); return { ...defaults, ...patch, languageSelected: true }; } },
    closeModal: () => calls.push('close'), applyLanguage: code => calls.push(code),
  });
  vm.runInContext(source.slice(source.indexOf("actions['confirm-first-language']")), context);
  await context.actions['confirm-first-language'](button);
  assert.deepEqual(calls, ['save', 'close', 'ru']);
  assert.equal(button.disabled, false);
  calls.length = 0;
  context.api.saveSettings = async () => { throw new Error('Disk unavailable'); };
  await assert.rejects(context.actions['confirm-first-language'](button), /Disk unavailable/);
  assert.deepEqual(calls, []);
  assert.equal(button.disabled, false);
});
