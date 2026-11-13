// Copyright (C) 2026 Duff (Duff-SPP). GPL-3.0-only; see LICENSE and ATTRIBUTION.md at the repository root.
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { execFile, spawn } = require('node:child_process');
const { promisify } = require('node:util');
const { generate } = require('./installer-ownership.cjs');
const exec = promisify(execFile);

async function find(root, name) {
  for (const entry of await fs.readdir(root, { withFileTypes: true })) {
    const file = path.join(root, entry.name);
    if (entry.isFile() && entry.name === name) return file;
    if (entry.isDirectory()) {
      const result = await find(file, name);
      if (result) return result;
    }
  }
}

function nsisPath(value) {
  // NSIS uses dollar escapes; a backslash is already literal.
  return value.replace(/\$/g, () => '$$');
}

async function exists(file) {
  return fs.stat(file).then(() => true, () => false);
}

async function waitForOutcome(successFile, failureFile, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await exists(successFile)) return { ok: true };
    if (await exists(failureFile)) {
      return { ok: false, reason: await fs.readFile(failureFile, 'utf8').catch(() => 'unknown fixture failure') };
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  return { ok: false, reason: 'Timed out waiting for the temporary NSIS uninstaller process to finish.' };
}

async function compileFixture({ project, root, build, payload, game, compiler, pluginDir, name }) {
  const setup = path.join(root, `${name}-setup.exe`);
  const finished = path.join(root, `${name}-uninstall-finished.txt`);
  const failed = path.join(root, `${name}-uninstall-failed.txt`);
  const registry = 'Software\\CoAInstallerSmoke\\' + path.basename(root);
  const script = `Unicode true
Name "CoA isolated safety fixture"
OutFile "${nsisPath(setup)}"
RequestExecutionLevel user
SilentInstall silent
SilentUnInstall silent
SetCompressor /SOLID lzma
!include "LogicLib.nsh"
!include "${nsisPath(path.join(project, 'node_modules/app-builder-lib/templates/nsis/include/StdUtils.nsh'))}"
!addplugindir /x86-unicode "${nsisPath(pluginDir)}"
!define PRODUCT_FILENAME "ConquestOfAzeroth"
!define BUILD_RESOURCES_DIR "${nsisPath(build)}"
!define COA_SMOKE_FAILURE_FILE "${nsisPath(failed)}"
!include "${nsisPath(path.join(project, 'build/preserve-files.nsh'))}"
!insertmacro coaFunctions ""
!insertmacro coaFunctions "un."
Section
  StrCpy $INSTDIR "${nsisPath(game)}"
  !insertmacro coaPrepareUpgrade
  SetOutPath "$INSTDIR"
  File /r "${nsisPath(payload)}\\*.*"
  WriteUninstaller "$INSTDIR\\Uninstall ConquestOfAzeroth.exe"
  WriteRegStr HKCU "${registry}" "InstallLocation" "$INSTDIR"
SectionEnd
Section "Uninstall"
  StrCpy $INSTDIR "${nsisPath(game)}"
  !insertmacro customRemoveFiles
  DeleteRegKey HKCU "${registry}"
  FileOpen $0 "${nsisPath(finished)}" w
  FileWrite $0 "complete"
  FileClose $0
SectionEnd
`;
  const nsi = path.join(root, `${name}.nsi`);
  await fs.writeFile(nsi, '\ufeff' + script, 'utf8');
  await exec(compiler, ['/V2', nsi], { windowsHide: true, timeout: 60000 });
  return { setup, finished, failed, registry };
}

async function expectMissing(file) {
  assert.equal(await exists(file), false, `Expected removed: ${file}`);
}

async function expectPresent(file) {
  assert.equal(await exists(file), true, `Expected preserved: ${file}`);
}

async function main() {
  if (process.platform !== 'win32') throw new Error('This smoke test is Windows-only.');

  const project = path.resolve(__dirname, '..');
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'coa-uninstall-safety-'));
  const payload = path.join(root, 'payload');
  const build = path.join(root, 'build');
  const game = path.join(root, 'Launcher with spaces');

  try {
    await fs.mkdir(path.join(payload, 'resources/AddonCatalog/Test'), { recursive: true });
    await fs.writeFile(path.join(payload, 'ConquestOfAzeroth.exe'), 'new launcher bytes');
    await fs.writeFile(path.join(payload, 'resources/app.asar'), 'new application bytes');
    await fs.writeFile(path.join(payload, 'resources/settings.txt'), 'bundled settings');
    await fs.writeFile(path.join(payload, 'resources/AddonCatalog/Test/addon.lua'), 'bundled addon');

    await generate(payload, build, path.join(project, 'node_modules/app-builder-lib/templates/nsis'));

    const installSource = await fs.readFile(path.join(build, 'safe-installSection.nsh'), 'utf8');
    const uninstallSource = await fs.readFile(path.join(build, 'safe-uninstaller.nsh'), 'utf8');
    const preserveSource = await fs.readFile(path.join(project, 'build/preserve-files.nsh'), 'utf8');
    const preserveCode = preserveSource.split(/\r?\n/).filter(line => !/^\s*;/.test(line)).join('\n');
    assert.doesNotMatch(preserveCode, /\$\{(?:APP_EXECUTABLE_FILENAME|UNINSTALL_FILENAME)\}/, 'early include must not expand late defines');
    assert.match(preserveSource, /PRODUCT_FILENAME/, 'preserve-files.nsh must use electron-builder command-line PRODUCT_FILENAME');
    assert.doesNotMatch(installSource, /!insertmacro\s+uninstallOldVersion/i);
    assert.doesNotMatch(uninstallSource, /RMDir\s+\/r|--delete-app-data|atomicRMDir/i);
    assert.doesNotMatch(preserveSource, /RMDir\s+\/r/i);

    const cache = path.join(process.env.LOCALAPPDATA, 'electron-builder/Cache');
    const compiler = await find(cache, 'makensis.exe');
    const plugin = await find(cache, 'StdUtils.dll');
    if (!compiler || !plugin) throw new Error('Build once to populate the NSIS tool cache.');
    const pluginDir = path.join(path.dirname(path.dirname(plugin)), 'x86-unicode');

    const fixture = await compileFixture({ project, root, build, payload, game, compiler, pluginDir, name: 'normal' });
    await exec(fixture.setup, [], { windowsHide: true, timeout: 60000 });

    // Prove the fixture actually installed before testing removal.
    await expectPresent(path.join(game, 'ConquestOfAzeroth.exe'));
    await expectPresent(path.join(game, 'resources', 'app.asar'));
    await expectPresent(path.join(game, 'Uninstall ConquestOfAzeroth.exe'));
    await fs.writeFile(path.join(game, 'resources/app.asar'), 'older application bytes');
    await exec(fixture.setup, [], { windowsHide: true, timeout: 60000 });
    assert.equal(await fs.readFile(path.join(game, 'resources/app.asar'), 'utf8'), 'new application bytes');

    // Unknown/player-owned files must survive, even inside known directories.
    await fs.writeFile(path.join(game, 'KEEP-ME.txt'), 'player-owned');
    await fs.mkdir(path.join(game, '.coa-preserved'), { recursive: true });
    await fs.writeFile(path.join(game, '.coa-preserved', 'backup.txt'), 'preserved backup');
    await fs.writeFile(path.join(game, 'resources', 'player-note.txt'), 'unknown nested file');

    // A launcher-owned file remains launcher-owned after modification and should uninstall.
    await fs.writeFile(path.join(game, 'resources', 'settings.txt'), 'player modified launcher-owned file');

    // NSIS uninstallers transparently copy themselves to TEMP and the original
    // process exits before the temporary copy finishes. Therefore execFile alone
    // is not a completion signal; wait for a marker written by the real temp copy.
    await exec(path.join(game, 'Uninstall ConquestOfAzeroth.exe'), ['/S'], { windowsHide: true, timeout: 60000 });
    const outcome = await waitForOutcome(fixture.finished, fixture.failed);
    if (!outcome.ok) throw new Error(`Fixture uninstall failed: ${outcome.reason}`);

    assert.equal(await fs.readFile(fixture.finished, 'utf8'), 'complete');
    await expectMissing(path.join(game, 'ConquestOfAzeroth.exe'));
    await expectMissing(path.join(game, 'resources', 'app.asar'));
    await expectMissing(path.join(game, 'resources', 'settings.txt'));
    await expectMissing(path.join(game, 'resources', 'AddonCatalog', 'Test', 'addon.lua'));
    await expectMissing(path.join(game, 'Uninstall ConquestOfAzeroth.exe'));
    await expectPresent(path.join(game, 'KEEP-ME.txt'));
    await expectPresent(path.join(game, '.coa-preserved', 'backup.txt'));
    await expectPresent(path.join(game, 'resources', 'player-note.txt'));

    const registered = async () => exec('reg.exe', ['query', 'HKCU\\' + fixture.registry, '/reg:32'], { windowsHide: true }).then(() => true, () => false);
    assert.equal(await registered(), false);
    // Locked-file failure must keep registration and allow a later retry.
    await exec(fixture.setup, [], { windowsHide: true, timeout: 60000 });
    await fs.unlink(fixture.finished);
    const locker = spawn('powershell.exe', ['-NoProfile', '-Command', "$h=[System.IO.File]::Open($env:COA_TEST_LOCK,'Open','Read','Read'); [Console]::WriteLine('READY'); [Console]::ReadLine() | Out-Null; $h.Dispose()"], {
      windowsHide: true, env: { ...process.env, COA_TEST_LOCK: path.join(game, 'resources/settings.txt') }, stdio: ['pipe', 'pipe', 'pipe'],
    });
    try {
      await new Promise((resolve, reject) => { const timer = setTimeout(() => reject(Error('Lock helper timeout')), 10000); locker.once('error', reject); locker.stdout.once('data', () => { clearTimeout(timer); resolve(); }); });
      await exec(path.join(game, 'Uninstall ConquestOfAzeroth.exe'), ['/S'], { windowsHide: true, timeout: 60000 });
      const blocked = await waitForOutcome(fixture.finished, fixture.failed);
      assert.equal(blocked.ok, false); assert.match(blocked.reason, /locked|not deletable/);
      assert.equal(await registered(), true);
      await expectPresent(path.join(game, 'ConquestOfAzeroth.exe'));
    } finally {
      locker.stdin.end('\n'); await new Promise(resolve => locker.once('exit', resolve));
    }
    await fs.unlink(fixture.failed);
    // Simulate an earlier partial uninstall: absence of the EXE must not prevent retry.
    await fs.unlink(path.join(game, 'ConquestOfAzeroth.exe'));
    await exec(path.join(game, 'Uninstall ConquestOfAzeroth.exe'), ['/S'], { windowsHide: true, timeout: 60000 });
    assert.equal((await waitForOutcome(fixture.finished, fixture.failed)).ok, true);
    assert.equal(await registered(), false);
    await expectMissing(path.join(game, 'Uninstall ConquestOfAzeroth.exe'));
    await expectPresent(path.join(game, 'KEEP-ME.txt'));

    console.log('Installer safety smoke passed: upgrade, modified-file removal, self-removal, unknown/backup preservation, locked-file registration retention and partial-uninstall retry.');
  } finally {
    console.log('Installer safety fixture retained: ' + root);
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
