// Isolated desktop smoke fixture. Not included in the player installer.
const { app, net } = require('electron');
require('electron').dialog.showErrorBox = (title, message) => console.error(`${title}: ${message}`);
const path = require('node:path');
const fs = require('node:fs/promises');
const { createHash } = require('node:crypto');
const root = process.env.COA_TEST_ROOT;
if (!root) throw new Error('COA_TEST_ROOT is required.');
// Process checks compare exact executable paths, so real clients in other folders do not interfere.
if (process.env.COA_PRODUCTION_TEST === '1') {
  // Run the exact production bundles with isolated services. These mocks are
  // test-only and are never packaged. No user's game is launched or stopped.
  Object.defineProperty(app, 'isPackaged', { value: true });
  Object.defineProperty(process, 'resourcesPath', { value: path.resolve(__dirname, '../src/assets') });
  const updater = require('electron-updater').autoUpdater;
  updater.checkForUpdates = async () => null;
}
app.setPath('userData', path.join(root, 'profile'));
const payloads = { 'Ascension.exe': Buffer.from('test fixture executable — never launched'), 'Data/enUS/locale-enUS.MPQ': Buffer.from('test locale archive') };
const files = Object.entries(payloads).map(([name, data]) => ({ path: name, size: data.length, sha256: createHash('sha256').update(data).digest('hex') }));
let signedIn = false;
const originalFetch = net.fetch.bind(net);
net.fetch = async (url, options = {}) => {
  const target = new URL(url instanceof Request ? url.url : url);
  // The launcher protocol still needs Chromium to read its local UI files.
  if (target.protocol === 'file:') return originalFetch(url, options);
  if (target.pathname.endsWith('/latest.json')) return Response.json({ schema: 1, version: 'smoke-1', files });
  if (target.pathname.includes('/objects/')) {
    const file = files.find(item => target.pathname.endsWith(item.sha256));
    return file ? new Response(payloads[file.path]) : new Response('', { status: 404 });
  }
  if (target.pathname === '/api/site-config') return Response.json({ previewMode: false });
  if (target.pathname === '/api/auth/login') { signedIn = true; return Response.json({ username: 'TESTPLAYER' }, { headers: { 'Set-Cookie': 'coa_launcher=fixture; Path=/; HttpOnly' } }); }
  if (target.pathname === '/api/community/discord') return Response.json({ guildId: '1546991088751874168', available: true, online: 123, members: 456 });
  if (target.pathname === '/api/auth/logout') { signedIn = false; return Response.json({}); }
  if (target.pathname === '/api/auth/session') return signedIn ? Response.json({ accountId: 1, username: 'TESTPLAYER' }) : new Response('', { status: 401 });
  return new Response('', { status: 404 });
};
fs.mkdir(path.join(root, 'profile'), { recursive: true }).then(() => require(process.env.COA_PRODUCTION_TEST === '1' ? '../.production/runtime/a.cjs' : '../src/main.cjs'));
