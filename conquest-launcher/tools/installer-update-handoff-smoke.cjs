// Copyright (C) 2026 Duff (Duff-SPP). GPL-3.0-only; see LICENSE and ATTRIBUTION.md at the repository root.
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { NsisScriptGenerator } = require('app-builder-lib/out/targets/nsis/nsisScriptGenerator.js');
const exec = promisify(execFile);

async function find(root, predicate) {
  for (const entry of await fs.readdir(root, { withFileTypes: true })) {
    const target = path.join(root, entry.name);
    if (entry.isFile() && predicate(target)) return target;
    if (entry.isDirectory()) { const result = await find(target, predicate); if (result) return result; }
  }
}
const quote = value => value.replace(/\$/g, '$$$$');

async function main() {
  if (process.platform !== 'win32') throw new Error('This verification requires Windows.');
  const project = path.resolve(__dirname, '..');
  const cache = path.join(process.env.LOCALAPPDATA, 'electron-builder/Cache');
  const compiler = await find(cache, file => path.basename(file) === 'makensis.exe');
  const plugin = await find(cache, file => path.basename(file) === 'nsProcess.dll' && path.dirname(file).endsWith('x86-unicode'));
  if (!compiler || !plugin) throw new Error('Build once to populate the NSIS cache.');
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'coa-update-handoff-'));
  const flags = new NsisScriptGenerator(); flags.flags(['updated']);
  try {
    for (const scenario of [
      { name: 'real-process-check', mock: '', args: [], code: 0 },
      { name: 'slow-update-shutdown', mock: 'IntOp $checks $checks + 1\n StrCpy $R0 0\n ${If} $checks > 24\n StrCpy $R0 603\n ${EndIf}', args: ['--updated'], code: 0, minimumMs: 5500 },
      { name: 'manual-running-refuses', mock: 'StrCpy $R0 0', args: [], code: 2 },
      { name: 'detection-error-refuses', mock: 'StrCpy $R0 608', args: ['--updated'], code: 2 },
    ]) {
      const setup = path.join(root, scenario.name + '.exe');
      const result = path.join(root, scenario.name + '.txt');
      const script = `Unicode true
Name "Isolated launcher update handoff check"
OutFile "${quote(setup)}"
RequestExecutionLevel user
SilentInstall silent
!include "LogicLib.nsh"
!include "${quote(path.join(project, 'node_modules/app-builder-lib/templates/nsis/include/StdUtils.nsh'))}"
!addplugindir /x86-unicode "${quote(path.dirname(plugin))}"
${flags.build()}
!define PRODUCT_FILENAME "ConquestOfAzeroth"
!define BUILD_RESOURCES_DIR "${quote(root)}"
Var checks
${scenario.mock ? '!macro coaFindLauncherProcess\n' + scenario.mock + '\n!macroend' : ''}
!include "${quote(path.join(project, 'build/preserve-files.nsh'))}"
Section
 StrCpy $checks 0
 !insertmacro customCheckAppRunning
 FileOpen $0 "${quote(result)}" w
 FileWrite $0 "passed"
 FileClose $0
SectionEnd
`;
      const nsi = path.join(root, scenario.name + '.nsi');
      await fs.writeFile(nsi, '\ufeff' + script);
      await exec(compiler, ['/V2', nsi], { windowsHide: true, timeout: 30000 });
      const started = Date.now();
      let code = 0;
      try { await exec(setup, ['/S', ...scenario.args], { windowsHide: true, timeout: 40000 }); }
      catch (error) { if (typeof error.code !== 'number') throw error; code = error.code; }
      assert.equal(code, scenario.code, scenario.name);
      if (scenario.code === 0) assert.equal(await fs.readFile(result, 'utf8'), 'passed');
      else await assert.rejects(fs.stat(result), { code: 'ENOENT' });
      if (scenario.minimumMs) assert.ok(Date.now() - started >= scenario.minimumMs, 'slow shutdown must actually wait beyond the old five-second limit');
      console.log('PASS ' + scenario.name);
    }
  } finally {
    // Only the exact temporary directory created above can be removed.
    const resolved = await fs.realpath(root);
    assert.equal(resolved.toLowerCase(), path.resolve(root).toLowerCase());
    assert.equal(path.dirname(resolved).toLowerCase(), path.resolve(os.tmpdir()).toLowerCase());
    await fs.rm(resolved, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
