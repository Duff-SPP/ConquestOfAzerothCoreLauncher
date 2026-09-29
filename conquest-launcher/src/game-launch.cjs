const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const path = require('node:path');
const execute = promisify(execFile);

async function launchGame(executable, { run = execute, elevated = false } = {}) {
  if (!path.win32.isAbsolute(executable) || path.win32.extname(executable).toLowerCase() !== '.exe') {
    throw new Error('Select a valid absolute game executable path.');
  }
  // Encode path data separately so spaces, quotes and PowerShell syntax remain literal.
  const encode = value => Buffer.from(value, 'utf8').toString('base64');
  const directory = path.win32.dirname(executable);
  const script = `
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$ErrorActionPreference = 'Stop'
try {
  $start = New-Object System.Diagnostics.ProcessStartInfo
  $start.FileName = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${encode(executable)}'))
  $start.WorkingDirectory = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${encode(directory)}'))
  $start.UseShellExecute = $true
  ${elevated ? "$start.Verb = 'runas'" : "$start.Verb = 'open'"}
  $started = [System.Diagnostics.Process]::Start($start)
  if ($null -eq $started) { throw 'Windows returned no game process.' }
  @{ ok = $true; pid = $started.Id } | ConvertTo-Json -Compress
  $started.Dispose()
} catch {
  $failure = $_.Exception
  while ($null -ne $failure.InnerException) { $failure = $failure.InnerException }
  $code = 0
  if ($failure -is [System.ComponentModel.Win32Exception]) { $code = $failure.NativeErrorCode }
  @{ ok = $false; code = $code; message = $failure.Message } | ConvertTo-Json -Compress
}`;
  const powershell = path.win32.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  let stdout;
  try {
    ({ stdout } = await run(powershell, ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], {
      windowsHide: true, cwd: directory, maxBuffer: 65536
    }));
  } catch (error) {
    throw new Error(`Windows game launch helper failed (${error.code || 'unknown error'}). Could not start ${executable}.`);
  }
  let result;
  try { result = JSON.parse(stdout.trim()); } catch {
    throw new Error('Windows returned an unreadable game launch result. Check whether the game opened before retrying.');
  }
  if (result?.ok === true && Number.isSafeInteger(result.pid) && result.pid > 0) return result.pid;
  // Retry only when Windows explicitly requires elevation, never for generic denial.
  if (result?.code === 740 && !elevated) return launchGame(executable, { run, elevated: true });
  if (result?.code === 1223) throw new Error('Game launch cancelled at the Windows permission prompt.');
  if (result?.code === 5) throw new Error(`Windows denied access to ${executable}. Check its permissions and Windows Security history.`);
  if (result?.code === 2 || result?.code === 3) throw new Error(`Windows could not find ${executable}. Check the selected game folder.`);
  throw new Error(`Windows could not start ${executable}: ${result?.message || 'No game process was returned.'}`);
}

module.exports = { launchGame };
