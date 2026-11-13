const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readGameProcesses } = require('../src/game-processes.cjs');

function fixture(processes, { openError = 0, imageError = 0, endError = 18 } = {}) {
  let index = -1, error = 0;
  const closed = [], opened = [];
  const fill = buffer => {
    index++;
    if (index === processes.length) { error = endError; return 0; }
    buffer.fill(0); buffer.writeUInt32LE(buffer.length);
    buffer.writeUInt32LE(index + 10, 8);
    buffer.write(processes[index].name, 44, 'utf16le');
    return 1;
  };
  return { closed, opened, native: {
    entrySize: 568, pidOffset: 8, nameOffset: 44,
    snapshot: (flags, pid) => { assert.equal(flags, 2); assert.equal(pid, 0); return 1; },
    first: (_snapshot, entry) => fill(entry), next: (_snapshot, entry) => fill(entry),
    open: (access, inherit, pid) => {
      assert.equal(access, 0x1000); assert.equal(inherit, 0); opened.push(pid);
      if (openError) { error = openError; return 0; }
      return pid;
    },
    image: (pid, flags, buffer, length) => {
      assert.equal(flags, 0); assert.equal(length.readUInt32LE(), buffer.length / 2);
      if (imageError) { error = imageError; return 0; }
      const value = processes[pid - 10].path;
      buffer.write(value, 0, 'utf16le'); length.writeUInt32LE(value.length); return 1;
    },
    close: handle => { closed.push(handle); return 1; }, error: () => error
  } };
}

test('native enumeration opens only candidate games, reads Unicode paths and closes handles', () => {
  const f = fixture([
    { name: 'unrelated.exe' },
    { name: 'ASCENSION.EXE', path: 'C:\\Jeux\\玩家\\Ascension.exe' },
    { name: 'Wow.exe', path: 'C:\\Other\\Wow.exe' }
  ]);
  assert.deepEqual(readGameProcesses(f), [
    { ExecutablePath: 'C:\\Jeux\\玩家\\Ascension.exe' }, { ExecutablePath: 'C:\\Other\\Wow.exe' }
  ]);
  assert.deepEqual(f.opened, [11, 12]);
  assert.deepEqual(f.closed, [11, 12, 1]);
});

test('no game processes is a successful empty list without shell output or JSON', () => {
  const f = fixture([]);
  assert.deepEqual(readGameProcesses(f), []);
  assert.deepEqual(f.closed, [1]);
});

test('processes exiting during enumeration are ignored; permissions and enumeration errors are explicit', () => {
  const process = [{ name: 'Ascension.exe', path: 'C:\\Game\\Ascension.exe' }];
  for (const options of [{ openError: 87 }, { imageError: 6 }, { imageError: 87 }]) {
    const f = fixture(process, options);
    assert.deepEqual(readGameProcesses(f), []);
    assert.ok(f.closed.includes(1));
  }
  for (const options of [{ openError: 5 }, { imageError: 5 }, { endError: 5 }]) {
    const f = fixture(process, options);
    assert.throws(() => readGameProcesses(f), /Windows error 5.*same permissions/);
    assert.ok(f.closed.includes(1));
    if (!options.openError) assert.ok(f.closed.includes(10));
  }
});

test('failed snapshots never enumerate or close an invalid handle', () => {
  const f = fixture([]);
  f.native.snapshot = () => BigInt.asUintN(process.arch === 'ia32' ? 32 : 64, -1n);
  f.native.error = () => 5;
  assert.throws(() => readGameProcesses(f), /Windows error 5/);
  assert.deepEqual(f.closed, []);
});

test('native process dependency is pinned and the Windows binary is configured for ASAR unpacking', () => {
  const pkg = require('../package.json');
  const lock = require('../package-lock.json');
  assert.equal(pkg.dependencies.koffi, '3.3.3');
  assert.equal(lock.packages[''].dependencies.koffi, pkg.dependencies.koffi);
  assert.ok(pkg.build.asarUnpack.includes('node_modules/@koromix/koffi-win32-x64/**'));
  assert.equal(lock.packages['node_modules/@koromix/koffi-win32-x64'].version, pkg.dependencies.koffi);
});
