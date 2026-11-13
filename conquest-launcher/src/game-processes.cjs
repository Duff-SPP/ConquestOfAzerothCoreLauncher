// Copyright (C) 2026 Duff (Duff-SPP). GPL-3.0-only; see LICENSE and ATTRIBUTION.md at the repository root.
let nativeApi;

function loadNativeApi() {
  if (nativeApi) return nativeApi;
  const koffi = require('koffi');
  const kernel = koffi.load('kernel32.dll');
  const entry = koffi.struct({
    dwSize: 'uint32_t', cntUsage: 'uint32_t', th32ProcessID: 'uint32_t',
    th32DefaultHeapID: 'uintptr_t', th32ModuleID: 'uint32_t', cntThreads: 'uint32_t',
    th32ParentProcessID: 'uint32_t', pcPriClassBase: 'int32_t', dwFlags: 'uint32_t',
    szExeFile: koffi.array('uint16_t', 260)
  });
  const bind = (name, result, args) => kernel.func('__stdcall', name, result, args);
  nativeApi = {
    snapshot: bind('CreateToolhelp32Snapshot', 'uintptr_t', ['uint32_t', 'uint32_t']),
    first: bind('Process32FirstW', 'int', ['uintptr_t', 'void *']),
    next: bind('Process32NextW', 'int', ['uintptr_t', 'void *']),
    open: bind('OpenProcess', 'uintptr_t', ['uint32_t', 'int', 'uint32_t']),
    image: bind('QueryFullProcessImageNameW', 'int', ['uintptr_t', 'uint32_t', 'void *', 'void *']),
    close: bind('CloseHandle', 'int', ['uintptr_t']),
    error: bind('GetLastError', 'uint32_t', []),
    entrySize: koffi.sizeof(entry), pidOffset: koffi.offsetof(entry, 'th32ProcessID'),
    nameOffset: koffi.offsetof(entry, 'szExeFile')
  };
  return nativeApi;
}

function processError(code) {
  return new Error(`Could not inspect running game processes (Windows error ${code}). Close any game clients and run the launcher with the same permissions as the game.`);
}

function readGameProcesses({ native = loadNativeApi() } = {}) {
  const snapshot = native.snapshot(0x00000002, 0); // TH32CS_SNAPPROCESS
  if (!snapshot || BigInt(snapshot) === BigInt.asUintN(process.arch === 'ia32' ? 32 : 64, -1n)) throw processError(native.error());
  const entries = [];
  const entry = Buffer.alloc(native.entrySize);
  entry.writeUInt32LE(entry.length);
  const image = Buffer.alloc(32768 * 2);
  const length = Buffer.alloc(4);
  try {
    let found = native.first(snapshot, entry);
    if (!found && native.error() !== 18) throw processError(native.error());
    while (found) {
      const name = entry.toString('utf16le', native.nameOffset, native.nameOffset + 520).split('\0', 1)[0].toLowerCase();
      if (name === 'ascension.exe' || name === 'wow.exe') {
        const process = native.open(0x1000, 0, entry.readUInt32LE(native.pidOffset)); // PROCESS_QUERY_LIMITED_INFORMATION
        if (!process) {
          const error = native.error();
          if (error !== 87) throw processError(error); // Process exited since the snapshot.
        } else {
          try {
            length.writeUInt32LE(image.length / 2);
            if (native.image(process, 0, image, length)) {
              const characters = length.readUInt32LE();
              if (!characters || characters >= image.length / 2) throw processError(122);
              entries.push({ ExecutablePath: image.toString('utf16le', 0, characters * 2) });
            } else {
              const error = native.error();
              if (error !== 6 && error !== 87) throw processError(error);
            }
          } finally { native.close(process); }
        }
      }
      found = native.next(snapshot, entry);
      if (!found && native.error() !== 18) throw processError(native.error());
    }
  } finally { native.close(snapshot); }
  return entries;
}

module.exports = { readGameProcesses };
