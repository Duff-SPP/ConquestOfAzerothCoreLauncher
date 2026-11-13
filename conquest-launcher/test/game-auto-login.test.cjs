const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { Portal } = require('../src/portal.cjs');
const { launchGame } = require('../src/game-launch.cjs');
const { defaults, sanitize, saveSettings, readSettings } = require('../src/settings.cjs');

function fixture(options = {}) {
  const state = { loginStatus: 200, sessionStatus: 200, logoutStatus: 200 };
  const portal = new Portal('https://launcher.example/', { ...options, fetchImpl: async url => {
    if (url.pathname === '/api/site-config') return new Response('{}');
    if (url.pathname === '/api/auth/login') return new Response('{}', { status: state.loginStatus, headers: { 'Set-Cookie': 'coa_portal=session-only; Path=/' } });
    if (url.pathname === '/api/auth/logout') return new Response('{}', { status: state.logoutStatus });
    return new Response(JSON.stringify({ username: 'PLAYER', accountId: 1 }), { status: state.sessionStatus });
  } });
  return { portal, state };
}

test('auto-login is opt-in, persists only the boolean, and never serializes game credentials', async t => {
  assert.equal(defaults.autoLoginGame, false);
  assert.equal(sanitize({ autoLoginGame: 'true' }).autoLoginGame, false);
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'coa-auto-login-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const settingsFile = path.join(root, 'settings.json');
  await saveSettings(settingsFile, { autoLoginGame: true });
  assert.equal((await readSettings(settingsFile)).autoLoginGame, true);
  const secret = 'test-only-secret';
  const sessionFile = path.join(root, 'session.bin');
  const { portal } = fixture({ sessionFile, encrypt: value => Buffer.from(value), decrypt: value => value.toString() });
  await portal.login('player@example.com', secret);
  assert.equal(portal.getGameLogin(), null);
  const account = await portal.login('player@example.com', secret, { rememberForGame: true });
  assert.deepEqual(portal.getGameLogin(), { username: 'PLAYER', password: secret });
  assert.equal(JSON.stringify(account).includes(secret), false);
  assert.equal(JSON.stringify(portal).includes(secret), false);
  assert.equal((await fs.readFile(sessionFile, 'utf8')).includes(secret), false);
  assert.equal((await fs.readFile(settingsFile, 'utf8')).includes(secret), false);
  const restarted = fixture({ sessionFile, decrypt: value => value.toString() }).portal;
  await restarted.account();
  assert.equal(restarted.getGameLogin(), null);
});

test('failed sign-in, session expiry and logout clear retained game credentials', async () => {
  const { portal, state } = fixture();
  const signIn = () => portal.login('player@example.com', 'test-only-secret', { rememberForGame: true });
  await signIn();
  state.loginStatus = 401;
  await assert.rejects(signIn());
  assert.equal(portal.getGameLogin(), null);
  state.loginStatus = 200;
  await signIn();
  state.sessionStatus = 401;
  assert.equal(await portal.account(), null);
  assert.equal(portal.getGameLogin(), null);
  state.sessionStatus = 200;
  await signIn();
  state.logoutStatus = 500;
  await assert.rejects(portal.logout());
  assert.equal(portal.getGameLogin(), null);
});

test('disabling while sign-in is in flight prevents credentials being retained later', async () => {
  let finish;
  const portal = new Portal('https://launcher.example/', { fetchImpl: async url => {
    if (url.pathname === '/api/site-config') return new Response('{}');
    if (url.pathname === '/api/auth/login') return new Promise(resolve => { finish = () => resolve(new Response('{}')); });
    return new Response('{"username":"PLAYER"}');
  } });
  const pending = portal.login('player', 'test-only-secret', { rememberForGame: true });
  await new Promise(setImmediate);
  portal.clearGameLogin();
  finish(); await pending;
  assert.equal(portal.getGameLogin(), null);
});

test('client receives verified literal login arguments and HD preference without shell interpolation', async () => {
  const password = 'test "quote" \\ &';
  const child = new EventEmitter(); child.pid = 1234; child.unref = () => {};
  const pid = await launchGame('C:\\Game\\Ascension.exe', {
    hdPatches: false, getAutoLogin: () => ({ username: 'PLAYER', password }), onLaunched() {},
    spawnProcess: (file, args, options) => {
      assert.equal(file, 'C:\\Game\\Ascension.exe');
      assert.deepEqual(args, ['-hd', '0', '--login', 'PLAYER', '--password', password, '--autologin', '1']);
      assert.equal(options.shell, false);
      process.nextTick(() => child.emit('spawn'));
      return child;
    }
  });
  assert.equal(pid, 1234);
});

test('synchronous and asynchronous launch errors never expose credentials or full launch arguments', async () => {
  const password = 'test-only-secret';
  for (const asynchronous of [false, true]) {
    await assert.rejects(launchGame('C:\\Game\\Ascension.exe', {
      getAutoLogin: () => ({ username: 'PLAYER', password }), onLaunched() {},
      spawnProcess: () => {
        const error = new Error(`command --password ${password}`);
        if (!asynchronous) throw error;
        const child = new EventEmitter();
        process.nextTick(() => child.emit('error', error));
        return child;
      }
    }), error => !error.message.includes(password) && !error.message.includes('--password'));
  }
});

test('main-process setting clears credentials when disabled; launch revalidates account identity', async () => {
  const source = await fs.readFile(path.join(__dirname, '../src/main.cjs'), 'utf8');
  const handlers = new Map(), launches = [];
  const { portal } = fixture();
  const context = vm.createContext({ settings: { ...defaults }, portal, handle: (name, fn) => handlers.set(name, fn),
    persist: async value => { context.settings = sanitize(value); return context.settings; },
    requireIdleClient: async () => {}, clientInfo: async () => ({ installed: true, path: 'C:\\Game' }),
    game: null, config: { localDownloadDemo: true, clientExecutable: 'Ascension.exe', realmlist: 'logon.example' },
    clearClientCache: async () => {}, gameCredentials: { read: async () => null, write: async () => {} },
    configureClientGraphics: async () => {}, mutateClient: action => action(), configureRealm: async () => {},
    launchGame: async (_file, options) => { launches.push(options.getAutoLogin()); return 1234; },
    path: path.win32, setInterval: () => ({ unref() {} })
  });
  vm.runInContext(source.slice(source.indexOf("handle('launcher:settings'"), source.indexOf("handle('launcher:choose-client'")), context);
  vm.runInContext(source.slice(source.indexOf("handle('launcher:login'"), source.indexOf("handle('launcher:register'")), context);
  vm.runInContext(source.slice(source.indexOf("handle('launcher:launch'"), source.indexOf("handle('launcher:open-folder'")), context);
  await handlers.get('launcher:settings')({ autoLoginGame: true });
  await assert.rejects(handlers.get('launcher:launch')(), /Sign into the launcher again/);
  assert.equal(launches.length, 0);
  await handlers.get('launcher:login')('player@example.com', 'test-only-secret');
  await handlers.get('launcher:launch')();
  assert.deepEqual(launches[0], { username: 'PLAYER', password: 'test-only-secret' });
  context.game = null;
  await handlers.get('launcher:settings')({ autoLoginGame: false });
  assert.equal(portal.getGameLogin(), null);
  await handlers.get('launcher:launch')();
  assert.equal(launches[1], null);
});
