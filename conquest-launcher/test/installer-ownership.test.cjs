const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { createHash } = require('node:crypto');
const { generate } = require('../tools/installer-ownership.cjs');

test('installer ownership embeds exact hashes and removes unsafe legacy cleanup', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'coa-ownership-test-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const payload = path.join(root, 'payload'); const build = path.join(root, 'build');
  await fs.mkdir(path.join(payload, 'resources/nested'), { recursive: true });
  await fs.writeFile(path.join(payload, 'ConquestOfAzeroth.exe'), 'launcher');
  await fs.writeFile(path.join(payload, 'resources/app.asar'), 'app');
  await fs.writeFile(path.join(payload, 'resources/nested/æøå.txt'), 'unicode file');
  const templates = path.resolve(__dirname, '../node_modules/app-builder-lib/templates/nsis');
  const files = await generate(payload, build, templates);
  assert.equal(files.length, 3);
  const manifest = await fs.readFile(path.join(build, 'coa-owned.txt'), 'utf16le');
  assert.ok(manifest.startsWith('\ufeff'));
  assert.ok(manifest.includes(createHash('sha256').update('unicode file').digest('hex') + '|resources\\nested\\æøå.txt'));
  const install = await fs.readFile(path.join(build, 'safe-installSection.nsh'), 'utf8');
  assert.match(install, /!insertmacro coaPrepareUpgrade/);
  assert.doesNotMatch(install, /!insertmacro uninstallOldVersion/);
  const uninstall = await fs.readFile(path.join(build, 'safe-uninstaller.nsh'), 'utf8');
  assert.match(uninstall, /!insertmacro customRemoveFiles/);
  assert.doesNotMatch(uninstall, /RMDir\s+\/r|--delete-app-data|atomicRMDir/);
  assert.match(uninstall, /StrCpy \$INSTDIR "\$coaInitialInstDir"/);
  assert.ok(uninstall.indexOf('!insertmacro customRemoveFiles') < uninstall.indexOf('DeleteRegKey SHELL_CONTEXT'));
  const preserve = await fs.readFile(path.join(__dirname, '../build/preserve-files.nsh'), 'utf8');
  assert.doesNotMatch(preserve, /Delete \/REBOOTOK/);
  assert.match(preserve, /CreateFileW/);
  assert.doesNotMatch(preserve, /_KillProcess|Stop-Process/);
  const preparation = preserve.slice(preserve.indexOf('!macro coaPrepareUpgrade'), preserve.indexOf('!macro customRemoveFiles'));
  assert.ok(preparation.indexOf('SetOutPath "$PLUGINSDIR"') < preparation.indexOf('File /oname=coa-owned.txt'),
    'Ownership extraction must use the temporary directory, not a previous install output directory');
  assert.match(preparation, /File \/oname=coa-owned\.txt[^\n]+\n\s*IfErrors coaPreserveFailed/);
  assert.match(preparation, /Call coaCheckPath\s*StrCpy \$coaFailure "[^\n]*linked\/reparse path: \$coaCheck/);
  assert.match(preparation, /Could not hash an existing launcher file: \$INSTDIR\\\$coaRelative/);
  assert.doesNotMatch(preparation, /Could not read the embedded ownership manifest\./);
  assert.match(preparation, /SetOutPath "\$coaPreviousOutDir"/);
  const removal = preserve.slice(preserve.indexOf('!macro customRemoveFiles'));
  const opens = [...removal.matchAll(/^\s*FileOpen \$coaHandle .*$/gm)];
  assert.equal(opens.length, 4);
  for (const open of opens) {
    assert.match(removal.slice(0, open.index), /ClearErrors\s*$/,
      'Manifest opens must not inherit errors from initialization or end-of-file');
  }
  for (const manifest of ['ownership', 'directory']) {
    assert.ok(removal.includes(`The embedded launcher ${manifest} manifest could not be extracted.`));
  }
  const script = await fs.readFile(path.join(build, 'safe-installer.nsi'), 'utf8');
  assert.match(script, /BUILD_RESOURCES_DIR.*safe-installSection/);
  assert.match(script, /BUILD_RESOURCES_DIR.*safe-uninstaller/);
  const changedTemplates = path.join(root, 'changed');
  await fs.cp(templates, changedTemplates, { recursive: true });
  await fs.appendFile(path.join(changedTemplates, 'installSection.nsh'), '\n; dependency changed');
  await assert.rejects(generate(payload, build, changedTemplates), /template changed/);
});
