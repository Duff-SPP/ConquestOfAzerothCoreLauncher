const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { sanitize } = require('../src/settings.cjs');
const { translateNative } = require('../src/launcher-language.cjs');

test('Spanish is selectable, persisted, complete, and available to native dialogs', async () => {
  const root = path.resolve(__dirname, '..');
  const languages = JSON.parse(await fs.readFile(path.join(root, 'localization/languages.json'), 'utf8'));
  const source = JSON.parse(await fs.readFile(path.join(root, 'localization/fr.json'), 'utf8'));
  const spanish = JSON.parse(await fs.readFile(path.join(root, 'localization/es-ES.json'), 'utf8'));

  assert.deepEqual(languages.find(language => language.code === 'es-ES'), {
    code: 'es-ES',
    name: 'Español',
    complete: true
  });
  assert.equal(sanitize({ language: 'es-ES' }).language, 'es-ES');
  assert.equal(Object.keys(spanish).length, Object.keys(source).length);
  assert.deepEqual(Object.keys(spanish).sort(), Object.keys(source).sort());

  for (const [key, value] of Object.entries(spanish)) {
    assert.equal(typeof value, 'string', key);
    assert.notEqual(value.trim(), '', key);
    const expected = [...key.matchAll(/\{(\d+)\}/g)].map(match => match[1]).sort();
    const actual = [...value.matchAll(/\{(\d+)\}/g)].map(match => match[1]).sort();
    assert.deepEqual(actual, expected, 'placeholder mismatch: ' + key);
  }

  assert.equal(translateNative('es-ES', 'Choose a game folder: empty or already installed'), 'Elige una carpeta del juego: vacía o con una instalación existente');
});
