const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { createHash } = require('node:crypto');
const { publishClient } = require('../tools/publish-client.cjs');
const { ClientUpdater } = require('../src/client-updater.cjs');
const { validateManifest, safePath, atomicJson, hashFile } = require('../src/release-format.cjs');
const { configureRealm } = require('../src/game-safety.cjs');

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'coa-update-test-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const master = path.join(root, 'master'); const output = path.join(root, 'published'); const client = path.join(root, 'player');
  await fs.mkdir(path.join(master, 'Data/enUS'), { recursive: true }); await fs.mkdir(client);
  await fs.writeFile(path.join(master, 'Ascension.exe'), 'test executable');
  await fs.writeFile(path.join(master, 'Data/patch-A.MPQ'), 'original patch');
  await fs.writeFile(path.join(master, 'Data/enUS/realmlist.wtf'), 'set realmlist old.invalid');
  const requests = [];
  const server = http.createServer(async (req, res) => {
    try {
      const relative = new URL(req.url, 'http://localhost').pathname.slice(1);
      const file = path.join(output, relative); const data = await fs.readFile(file);
      if (relative.includes('/objects/')) requests.push({ path: relative, range: req.headers.range });
      if (req.headers.range) {
        const start = Number(req.headers.range.match(/^bytes=(\d+)-$/)?.[1]);
        res.writeHead(206, { 'Content-Range': `bytes ${start}-${data.length - 1}/${data.length}`, 'Content-Length': data.length - start }); res.end(data.subarray(start));
      } else { res.writeHead(200, { 'Content-Length': data.length }); res.end(data); }
    } catch { res.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const updater = new ClientUpdater(`http://127.0.0.1:${server.address().port}/client/latest.json`, { allowLocalHttp: true });
  return { root, master, output, client, requests, updater };
}

test('minimum launcher version is opt-in and blocks incompatible downloads and cached fallback', async t => {
  const f = await fixture(t);
  const release = await publishClient(f.master, f.output, 'compatibility', () => {}, { minimumLauncherVersion: '0.6.7' });
  assert.equal(release.minimumLauncherVersion, '0.6.7');
  f.updater.launcherVersion = '0.6.6';
  await assert.rejects(f.updater.check(''), /requires launcher 0.6.7/);
  await assert.rejects(f.updater.update(f.client), /requires launcher 0.6.7/);
  assert.equal(f.requests.length, 0);
  await atomicJson(path.join(f.client, '.coa-launcher/state.json'), release);
  const originalFetch = f.updater.fetch;
  f.updater.fetch = async () => { throw new TypeError('offline'); };
  await assert.rejects(f.updater.check(f.client, false, true), /requires launcher 0.6.7/);
  f.updater.fetch = originalFetch; f.updater.launcherVersion = '0.6.7';
  await f.updater.update(f.client); assert.equal(f.updater.status.phase, 'ready');
  f.updater.launcherVersion = '0.6.10'; assert.equal((await f.updater.check(f.client)).needsUpdate, false);
  const unrestricted = await publishClient(f.master, f.output, 'unrestricted', () => {});
  assert.equal(unrestricted.minimumLauncherVersion, undefined);
  f.updater.launcherVersion = '0.6.0'; assert.equal((await f.updater.check(f.client)).needsUpdate, false);
  for (const invalid of [null, '', 'latest', '0.6', '0.06.7', '0.6.7-beta']) {
    assert.throws(() => validateManifest({ ...release, minimumLauncherVersion: invalid }), /version/);
  }
});

test('install, patch, repair, remove obsolete managed files and preserve player-owned content', async t => {
  const f = await fixture(t);
  await fs.mkdir(path.join(f.master, 'WTF')); await fs.writeFile(path.join(f.master, 'WTF/Config.wtf'), 'owner secret');
  const v1 = await publishClient(f.master, f.output, '1', () => {});
  assert.equal(v1.files.length, 2);
  await f.updater.update(f.client);
  assert.equal((await f.updater.check(f.client)).needsUpdate, false);
  await fs.mkdir(path.join(f.client, 'WTF')); await fs.writeFile(path.join(f.client, 'WTF/Config.wtf'), 'player settings');
  const personal = ['WTF/Account/player/SavedVariables/settings.lua', 'Screenshots/player.jpg', 'Interface/AddOns/Manual/Manual.lua', 'Data/patch-WB1.MPQ.disabled', 'dxgi.dll', 'dxvk.conf', 'helper.exe'];
  for (const name of personal) { const target = path.join(f.client, name); await fs.mkdir(path.dirname(target), { recursive: true }); await fs.writeFile(target, 'player bytes'); }
  await fs.writeFile(path.join(f.client, 'Data/patch-personal.MPQ'), 'player file');
  await fs.writeFile(path.join(f.master, 'Data/patch-A.MPQ'), 'new patch');
  await fs.writeFile(path.join(f.master, 'Data/patch-B.MPQ'), 'new extra');
  await publishClient(f.master, f.output, '2', () => {});
  f.requests.length = 0;
  await f.updater.update(f.client);
  assert.equal(f.requests.length, 2, 'only changed and added files download');
  assert.equal(await fs.readFile(path.join(f.client, 'Data/patch-A.MPQ'), 'utf8'), 'new patch');
  await fs.writeFile(path.join(f.client, 'Ascension.exe'), 'corrupt exe');
  assert.equal((await f.updater.check(f.client, true)).needsUpdate, true);
  await f.updater.update(f.client, true);
  await fs.unlink(path.join(f.master, 'Data/patch-B.MPQ'));
  await publishClient(f.master, f.output, '3', () => {});
  await f.updater.update(f.client);
  await assert.rejects(fs.stat(path.join(f.client, 'Data/patch-B.MPQ')), { code: 'ENOENT' });
  assert.equal(await fs.readFile(path.join(f.client, 'WTF/Config.wtf'), 'utf8'), 'player settings');
  assert.equal(await fs.readFile(path.join(f.client, 'Data/patch-personal.MPQ'), 'utf8'), 'player file');
  for (const name of personal) assert.equal(await fs.readFile(path.join(f.client, name), 'utf8'), 'player bytes');
  assert.equal((await f.updater.check(f.client)).needsUpdate, false);
});

test('partial downloads resume using the correct byte range', async t => {
  const f = await fixture(t); const release = await publishClient(f.master, f.output, '1', () => {});
  const file = release.files.find(item => item.path === 'Ascension.exe');
  await fs.mkdir(path.join(f.client, '.coa-launcher/downloads'), { recursive: true });
  await fs.writeFile(path.join(f.client, '.coa-launcher/downloads', file.sha256 + '.part'), 'test ');
  await f.updater.update(f.client);
  assert.ok(f.requests.some(req => req.range === 'bytes=5-'));
  assert.equal(await hashFile(path.join(f.client, 'Ascension.exe')), file.sha256);
});

test('bad downloads never overwrite a working client and a later retry repairs them', async t => {
  const f = await fixture(t); await publishClient(f.master, f.output, '1', () => {}); await f.updater.update(f.client);
  await fs.writeFile(path.join(f.master, 'Ascension.exe'), 'new executable');
  const release = await publishClient(f.master, f.output, '2', () => {});
  const file = release.files.find(item => item.path === 'Ascension.exe');
  await fs.writeFile(path.join(f.output, 'client/objects', file.sha256), 'bad executable');
  await assert.rejects(f.updater.update(f.client), /verification/);
  assert.equal(await fs.readFile(path.join(f.client, 'Ascension.exe'), 'utf8'), 'test executable');
  await fs.copyFile(path.join(f.master, 'Ascension.exe'), path.join(f.output, 'client/objects', file.sha256));
  await f.updater.update(f.client);
  assert.equal(await fs.readFile(path.join(f.client, 'Ascension.exe'), 'utf8'), 'new executable');
});

test('crashed replacement rolls back and recovery is repeatable', async t => {
  const f = await fixture(t); await publishClient(f.master, f.output, '1', () => {}); await f.updater.update(f.client);
  const dir = path.join(f.client, '.coa-launcher'); await fs.mkdir(path.join(dir, 'backup'), { recursive: true });
  await fs.rename(path.join(f.client, 'Ascension.exe'), path.join(dir, 'backup/0'));
  await fs.writeFile(path.join(f.client, 'Ascension.exe'), 'interrupted update');
  await fs.writeFile(path.join(f.client, 'new-file'), 'new file');
  await atomicJson(path.join(dir, 'transaction.json'), { phase: 'applying', entries: [{ path: 'Ascension.exe', existed: true, remove: false }, { path: 'new-file', existed: false, remove: false }] });
  await f.updater.recover(f.client); await f.updater.recover(f.client);
  assert.equal(await fs.readFile(path.join(f.client, 'Ascension.exe'), 'utf8'), 'test executable');
  await assert.rejects(fs.stat(path.join(f.client, 'new-file')), { code: 'ENOENT' });
});

test('release validation rejects traversal, Windows aliases, protected paths and conflicting paths', () => {
  const file = name => ({ path: name, size: 1, sha256: 'a'.repeat(64) });
  for (const name of ['../escape', 'C:/escape', '/escape', 'Data\\escape', 'Data/a:stream', 'CON.txt', 'Data/a.', 'WTF/Config.wtf', 'Interface/AddOns/x', '.coa-launcher/state.json', 'Data/enUS/realmlist.wtf']) {
    assert.throws(() => validateManifest({ schema: 1, version: '1', files: [file('Ascension.exe'), file(name)] }), undefined, name);
  }
  assert.throws(() => validateManifest({ schema: 1, version: '1', files: [file('Ascension.exe'), file('ascension.EXE')] }));
  assert.throws(() => validateManifest({ schema: 1, version: '1', files: [file('Ascension.exe'), file('Data'), file('Data/a')] }));
});

test('linked folders cannot escape the selected game folder', async t => {
  const f = await fixture(t); const outside = path.join(f.root, 'outside'); await fs.mkdir(outside);
  await fs.symlink(outside, path.join(f.client, 'Data'), 'junction');
  await assert.rejects(safePath(f.client, 'Data/escape'), /Linked/);
});

test('publishing keeps old releases immutable and fails if the master changes mid-publish', async t => {
  const f = await fixture(t); const first = await publishClient(f.master, f.output, '1', () => {});
  await fs.writeFile(path.join(f.master, 'Ascension.exe'), 'changed executable');
  let mutation;
  await assert.rejects(publishClient(f.master, f.output, '2', relative => {
    if (relative === 'Hashed Ascension.exe') mutation = fs.writeFile(path.join(f.master, 'Ascension.exe'), 'changed again and longer');
  }), /changed/);
  await mutation;
  assert.equal(JSON.parse(await fs.readFile(path.join(f.output, 'client/latest.json'), 'utf8')).version, '1');
  const exe = first.files.find(item => item.path === 'Ascension.exe');
  assert.equal(await hashFile(path.join(f.output, 'client/objects', exe.sha256)), exe.sha256);
});

test('realm configuration targets locale files and keeps a backup', async t => {
  const f = await fixture(t); await configureRealm(f.master, 'logon.coa-development.org');
  assert.equal(await fs.readFile(path.join(f.master, 'Data/enUS/realmlist.wtf'), 'utf8'), 'set realmlist logon.coa-development.org\r\n');
  assert.equal(await fs.readFile(path.join(f.master, '.coa-launcher/realmlist-backups/Data/enUS/realmlist.wtf'), 'utf8'), 'set realmlist old.invalid');
});

test('runtime log is excluded from publishing and ignored in legacy manifests and state', async t => {
  const f = await fixture(t);
  await fs.writeFile(path.join(f.master, 'MemoryBridge.log'), 'master log');
  const release = await publishClient(f.master, f.output, 'runtime-log', () => {});
  assert.equal(release.files.some(file => file.path === 'MemoryBridge.log'), false);
  const legacy = { ...release, files: [...release.files, { path: 'MemoryBridge.log', size: 10, sha256: createHash('sha256').update('master log').digest('hex') }] };
  await atomicJson(path.join(f.output, 'client/latest.json'), legacy);
  await f.updater.update(f.client);
  await fs.writeFile(path.join(f.client, 'MemoryBridge.log'), 'player log');
  await atomicJson(path.join(f.client, '.coa-launcher/state.json'), legacy);
  assert.equal((await f.updater.check(f.client)).needsUpdate, false);
  await f.updater.update(f.client);
  assert.equal(await fs.readFile(path.join(f.client, 'MemoryBridge.log'), 'utf8'), 'player log');
});

test('invalid state structure does not prevent a full repair', async t => {
  const f = await fixture(t); await publishClient(f.master, f.output, 'repair-state', () => {});
  await f.updater.update(f.client);
  await atomicJson(path.join(f.client, '.coa-launcher/state.json'), { schema: 1, files: [null] });
  await fs.writeFile(path.join(f.client, 'Ascension.exe'), 'broken');
  assert.equal((await f.updater.check(f.client, true)).needsUpdate, true);
  await f.updater.update(f.client, true);
  assert.equal((await f.updater.check(f.client)).needsUpdate, false);
});

test('space estimate credits cached downloads and counts duplicate objects once', async t => {
  const f = await fixture(t);
  const file = { path: 'Ascension.exe', size: 10, sha256: 'a'.repeat(64) };
  const part = path.join(f.client, '.coa-launcher/downloads', file.sha256 + '.part');
  await fs.mkdir(path.dirname(part), { recursive: true }); await fs.writeFile(part, '123456789');
  assert.equal(await f.updater.requiredSpace(f.client, { changes: [file], bytes: 10 }), 11 + 256 * 1024 ** 2);
  assert.equal(await f.updater.requiredSpace(f.client, { changes: [file, { ...file, path: 'copy.exe' }], bytes: 20 }), 21 + 256 * 1024 ** 2);
});

test('staging reports its own progress, can pause, and resumes without redownloading', async t => {
  const f = await fixture(t); await publishClient(f.master, f.output, 'staging', () => {});
  const phases = [];
  f.updater.notify = status => { phases.push(status.phase); if (status.phase === 'staging') f.updater.cancel(); };
  await assert.rejects(f.updater.update(f.client));
  assert.equal(f.updater.status.phase, 'paused');
  await assert.rejects(fs.stat(path.join(f.client, 'Ascension.exe')), { code: 'ENOENT' });
  const downloaded = f.requests.length;
  f.updater.notify = status => phases.push(status.phase);
  await f.updater.update(f.client);
  assert.equal(f.requests.length, downloaded);
  assert.ok(phases.includes('staging')); assert.ok(phases.includes('applying'));
  assert.equal((await f.updater.check(f.client)).needsUpdate, false);
});

test('launch fallback verifies cached release and refuses damaged or unknown clients', async t => {
  const f = await fixture(t); await publishClient(f.master, f.output, 'offline', () => {});
  await f.updater.update(f.client);
  f.updater.fetch = async () => { throw new TypeError('fetch failed'); };
  const ready = await f.updater.check(f.client, false, true);
  assert.equal(ready.needsUpdate, false); assert.match(ready.warnings[0], /unavailable/);
  await assert.rejects(f.updater.check(f.client), /fetch failed/);
  await fs.writeFile(path.join(f.client, 'Ascension.exe'), 'broken');
  await assert.rejects(f.updater.check(f.client, false, true), /needs repair/);
  await atomicJson(path.join(f.client, '.coa-launcher/state.json'), {});
  await assert.rejects(f.updater.check(f.client, false, true), /no verified client release/);
});

test('launch fallback does not bypass invalid manifests or explicit server rejections', async t => {
  const f = await fixture(t); await publishClient(f.master, f.output, 'offline-rejections', () => {});
  await f.updater.update(f.client);
  f.updater.fetch = async () => new Response('{}', { status: 200 });
  await assert.rejects(f.updater.check(f.client, false, true), /Invalid client release/);
  f.updater.fetch = async () => new Response('', { status: 403 });
  await assert.rejects(f.updater.check(f.client, false, true), /HTTP 403/);
  f.updater.fetch = async () => new Response('', { status: 503 });
  assert.equal((await f.updater.check(f.client, false, true)).needsUpdate, false);
});

test('legacy interrupted log replacement recovers without deleting a live player log', async t => {
  const f = await fixture(t);
  const log = path.join(f.client, 'MemoryBridge.log');
  const backup = path.join(f.client, '.coa-launcher/backup/0');
  const journal = path.join(f.client, '.coa-launcher/transaction.json');
  await fs.mkdir(path.dirname(backup), { recursive: true });
  const record = { phase: 'applying', entries: [{ path: 'MemoryBridge.log', existed: true, remove: false }] };
  await fs.writeFile(backup, 'original log'); await atomicJson(journal, record);
  await f.updater.recover(f.client);
  assert.equal(await fs.readFile(log, 'utf8'), 'original log');
  await fs.writeFile(backup, 'older backup'); await fs.writeFile(log, 'current player log'); await atomicJson(journal, record);
  await f.updater.recover(f.client);
  assert.equal(await fs.readFile(log, 'utf8'), 'current player log');
});

test('network completion is followed by verification, staging, applying and finalization before ready', async t => {
  const f = await fixture(t);
  await fs.writeFile(path.join(f.master, 'WowError.exe'), 'last executable');
  await publishClient(f.master, f.output, 'phases', () => {});
  const statuses = [];
  f.updater.notify = status => statuses.push(status);
  await f.updater.update(f.client, false, true);
  assert.equal(statuses.some(s => s.phase === 'ready'), false, 'addon integration defers readiness');
  assert.equal(statuses.at(-1).phase, 'finalizing');
  const networkEnd = statuses.findLastIndex(s => s.phase === 'downloading' && s.bytes === s.totalBytes);
  assert.ok(networkEnd >= 0);
  const remaining = statuses.slice(networkEnd + 1).map(s => s.phase);
  for (const phase of ['verifying', 'staging', 'applying', 'finalizing']) assert.ok(remaining.includes(phase), phase);
  assert.equal(await fs.readFile(path.join(f.client, 'Ascension.exe'), 'utf8'), 'test executable');
  for (const file of (await f.updater.readState(f.client)).files) assert.equal(await hashFile(path.join(f.client, file.path)), file.sha256);
  assert.deepEqual(await fs.readdir(path.join(f.client, '.coa-launcher/downloads')), []);
});

test('a blocked final rename restores the existing WowError and never signals ready; retry succeeds', async t => {
  const f = await fixture(t);
  await fs.writeFile(path.join(f.master, 'WowError.exe'), 'old error tool');
  await publishClient(f.master, f.output, 'old-error-tool', () => {}); await f.updater.update(f.client);
  await fs.writeFile(path.join(f.master, 'WowError.exe'), 'new error tool');
  const release = await publishClient(f.master, f.output, 'new-error-tool', () => {});
  const originalRename = fs.rename; let blocked = false; const statuses = [];
  const rename = t.mock.method(fs, 'rename', async (from, to) => {
    if (!blocked && String(from).includes(`${path.sep}stage${path.sep}`) && String(to).endsWith('WowError.exe')) {
      blocked = true; const error = new Error('EPERM: locked WowError.exe'); error.code = 'EPERM'; throw error;
    }
    return originalRename(from, to);
  });
  f.updater.notify = status => statuses.push(status);
  await assert.rejects(f.updater.update(f.client), /locked WowError/);
  assert.equal(blocked, true); assert.equal(f.updater.status.phase, 'error');
  assert.equal(statuses.some(status => status.phase === 'ready'), false);
  assert.equal(await fs.readFile(path.join(f.client, 'WowError.exe'), 'utf8'), 'old error tool');
  rename.mock.restore(); await f.updater.update(f.client);
  for (const file of release.files) assert.equal(await hashFile(path.join(f.client, file.path)), file.sha256);
  assert.equal(f.updater.status.phase, 'ready');
});

test('duplicate objects use one download and totals stay stable across pause and resume', async t => {
  const f = await fixture(t);
  await fs.copyFile(path.join(f.master, 'Ascension.exe'), path.join(f.master, 'WowError.exe'));
  const release = await publishClient(f.master, f.output, 'duplicates', () => {});
  const expected = [...new Map(release.files.map(file => [file.sha256, file.size])).values()].reduce((a,b) => a+b,0);
  const statuses = [];
  let paused = false;
  f.updater.notify = s => { statuses.push(s); if (s.phase === 'verifying' && !paused) { paused = true; f.updater.cancel(); } };
  await assert.rejects(f.updater.update(f.client));
  assert.equal(f.updater.status.phase, 'paused');
  f.updater.notify = s => statuses.push(s);
  await f.updater.update(f.client);
  for (const s of statuses.filter(s => s.phase === 'downloading' && s.totalBytes !== undefined)) {
    assert.equal(s.totalBytes, expected); assert.ok(s.bytes <= expected);
  }
  assert.equal(f.requests.length, 2, 'cached complete object is verified and duplicates are reused');
  assert.equal(await hashFile(path.join(f.client, 'Ascension.exe')), await hashFile(path.join(f.client, 'WowError.exe')));
});

test('server ignoring Range restarts safely instead of appending duplicate bytes', async t => {
  const f = await fixture(t);
  const release = await publishClient(f.master, f.output, 'ignore-range', () => {});
  const file = release.files.find(file => file.path === 'Ascension.exe');
  const part = path.join(f.client, '.coa-launcher/downloads', file.sha256 + '.part');
  await fs.mkdir(path.dirname(part), {recursive:true}); await fs.writeFile(part, 'test ');
  f.updater.fetch = (url, options) => fetch(url, { ...options, headers: {} });
  const statuses = []; f.updater.notify = status => statuses.push(status);
  await f.updater.update(f.client);
  const total = release.files.reduce((sum, item) => sum + item.size, 0);
  const progress = statuses.filter(status => status.phase === 'downloading' && status.totalBytes !== undefined);
  assert.equal(progress[0].bytes, 0, 'HTTP 200 discards the old partial credit');
  for (const status of progress) { assert.equal(status.totalBytes, total); assert.ok(status.bytes <= total); }
  assert.equal(await hashFile(path.join(f.client, 'Ascension.exe')), file.sha256);
});

test('half-file pause and launcher restart retain exact 206 totals and clean finalized partials', async t => {
  const f = await fixture(t);
  const data = Buffer.alloc(2 * 1024 * 1024, 37), half = data.length / 2;
  await fs.writeFile(path.join(f.master, 'Ascension.exe'), data);
  const release = await publishClient(f.master, f.output, 'restart', () => {});
  const file = release.files.find(item => item.path === 'Ascension.exe');
  const total = release.files.reduce((sum, item) => sum + item.size, 0);
  const originalFetch = f.updater.fetch;
  f.updater.fetch = async (url, options) => {
    if (!String(url).endsWith(file.sha256)) return originalFetch(url, options);
    return new Response(new ReadableStream({ start(controller) {
      controller.enqueue(data.subarray(0, half));
      options.signal.addEventListener('abort', () => controller.error(options.signal.reason), { once: true });
    } }));
  };
  const statuses = [];
  f.updater.notify = status => {
    statuses.push(status);
    if (status.phase === 'downloading' && status.bytes === half) f.updater.cancel();
  };
  // The normal 200ms progress throttle must elapse before the fixture delivers its body.
  const partialFetch = f.updater.fetch;
  f.updater.fetch = async (...args) => {
    const response = await partialFetch(...args);
    if (!String(args[0]).endsWith(file.sha256)) return response;
    const reader = response.body.getReader();
    return new Response(new ReadableStream({ async pull(controller) {
      await new Promise(resolve => setTimeout(resolve, 220));
      try { const next = await reader.read(); if (next.done) controller.close(); else controller.enqueue(next.value); }
      catch (error) { controller.error(error); }
    }, cancel: reason => reader.cancel(reason) }));
  };
  await assert.rejects(f.updater.update(f.client));
  assert.equal(f.updater.status.phase, 'paused');
  const restarted = new ClientUpdater(f.updater.url, { allowLocalHttp: true, notify: status => statuses.push(status) });
  assert.equal((await restarted.check(f.client)).bytes, total);
  const part = path.join(f.client, '.coa-launcher/downloads', file.sha256 + '.part');
  assert.equal((await fs.stat(part)).size, half);
  await restarted.update(f.client);
  assert.ok(f.requests.some(request => request.range === `bytes=${half}-`));
  for (const status of statuses.filter(item => item.phase === 'downloading' && item.totalBytes !== undefined)) {
    assert.equal(status.totalBytes, total); assert.ok(status.bytes >= 0 && status.bytes <= total);
    if (status.bytes === half) assert.equal(status.totalBytes - status.bytes, half + release.files.find(item => item.path !== file.path).size);
  }
  assert.equal(await hashFile(path.join(f.client, 'Ascension.exe')), file.sha256);
  assert.deepEqual(await fs.readdir(path.dirname(part)), []);
  assert.equal(restarted.status.phase, 'ready');
});

test('corrupt partial is rejected by the final hash then restarted without trusting its prefix', async t => {
  const f = await fixture(t);
  const release = await publishClient(f.master, f.output, 'corrupt-partial', () => {});
  const file = release.files.find(item => item.path === 'Ascension.exe');
  const part = path.join(f.client, '.coa-launcher/downloads', file.sha256 + '.part');
  await fs.mkdir(path.dirname(part), { recursive: true }); await fs.writeFile(part, 'BAD!!');
  await f.updater.update(f.client);
  const requests = f.requests.filter(request => request.path.endsWith(file.sha256));
  assert.deepEqual(requests.map(request => request.range), ['bytes=5-', undefined]);
  assert.equal(await hashFile(path.join(f.client, file.path)), file.sha256);
});

test('pause interrupts an active network body, closes the partial and resumes its exact range', async t => {
  const f = await fixture(t);
  const release = await publishClient(f.master, f.output, 'network-pause', () => {});
  const file = release.files.find(file => file.path === 'Ascension.exe');
  const actualFetch = f.updater.fetch;
  f.updater.fetch = async (url, options) => {
    if (!String(url).endsWith(file.sha256)) return actualFetch(url, options);
    return new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(Buffer.from('test '));
        options.signal.addEventListener('abort', () => controller.error(options.signal.reason), {once:true});
        setTimeout(() => f.updater.cancel(), 30);
      }
    }));
  };
  await assert.rejects(f.updater.update(f.client));
  assert.equal(f.updater.status.phase, 'paused');
  const part = path.join(f.client, '.coa-launcher/downloads', file.sha256 + '.part');
  assert.equal(await fs.readFile(part,'utf8'), 'test ');
  f.updater.fetch = actualFetch;
  await f.updater.update(f.client);
  assert.ok(f.requests.some(request => request.range === 'bytes=5-'));
  assert.equal(await hashFile(path.join(f.client,'Ascension.exe')),file.sha256);
});

test('invalid resume ranges never reach application and an interrupted commit restores the old executable', async t => {
  const f = await fixture(t);
  await publishClient(f.master,f.output,'old',()=>{}); await f.updater.update(f.client);
  await fs.writeFile(path.join(f.master,'Ascension.exe'),'replacement executable');
  const release=await publishClient(f.master,f.output,'new',()=>{});
  const file=release.files.find(file=>file.path==='Ascension.exe');
  const originalFetch=f.updater.fetch;
  f.updater.fetch=async (url,options)=>String(url).endsWith(file.sha256) ? new Response('x',{status:206,headers:{'Content-Range':'bytes 1-1/2'}}) : originalFetch(url,options);
  await assert.rejects(f.updater.update(f.client),/invalid resume range/);
  assert.equal(await fs.readFile(path.join(f.client,'Ascension.exe'),'utf8'),'test executable');
  f.updater.fetch=originalFetch;
  let injected=false;
  f.updater.notify=status=>{if(status.phase==='applying' && status.completed===0 && !injected){injected=true;throw new Error('Injected commit interruption');}};
  await assert.rejects(f.updater.update(f.client),/Injected commit/);
  assert.equal(await fs.readFile(path.join(f.client,'Ascension.exe'),'utf8'),'test executable');
  f.updater.notify=()=>{}; await f.updater.update(f.client);
  assert.equal(await hashFile(path.join(f.client,'Ascension.exe')),file.sha256);
});
