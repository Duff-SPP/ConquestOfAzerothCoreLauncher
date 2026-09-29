const fs = require('node:fs/promises');
const path = require('node:path');

const defaults = Object.freeze({ language: 'en', startPage: 'home', closeOnLaunch: false, rememberClient: true, reducedMotion: false, sound: true, installPath: '' });
function sanitize(value) {
  const result = { ...defaults };
  if (!value || typeof value !== 'object') return result;
  if (['en', 'fr', 'es-ES', 'ru', 'zh-CN'].includes(value.language)) result.language = value.language;
  if (['home', 'news'].includes(value.startPage)) result.startPage = value.startPage;
  for (const key of ['closeOnLaunch', 'rememberClient', 'reducedMotion', 'sound']) {
    if (typeof value[key] === 'boolean') result[key] = value[key];
  }
  if (typeof value.installPath === 'string' && path.isAbsolute(value.installPath)) result.installPath = path.normalize(value.installPath);
  return result;
}
async function readSettings(file, warn = console.warn) {
  try {
    const value = JSON.parse(await fs.readFile(file, 'utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new SyntaxError('Invalid settings object.');
    const settings = sanitize(value);
    if (!settings.rememberClient) settings.installPath = '';
    return settings;
  } catch (error) {
    if (error.code === 'ENOENT') return { ...defaults };
    if (!(error instanceof SyntaxError)) throw error;
    const backup = file + '.corrupt-' + Date.now();
    await fs.copyFile(file, backup, require('node:fs').constants.COPYFILE_EXCL);
    warn(`Settings could not be read. The original was preserved at ${backup}. Defaults will be used; please select your client again.`);
    return { ...defaults };
  }
}
async function saveSettings(file, value) {
  const settings = sanitize(value);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file + '.tmp', JSON.stringify({ ...settings, installPath: settings.rememberClient ? settings.installPath : '' }, null, 2), 'utf8');
  await fs.rename(file + '.tmp', file);
  return settings;
}
function externalUrl(value) {
  if (typeof value !== 'string' || !value) throw new Error('This service has not been connected yet.');
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Service links must use HTTPS.');
  return url.href;
}
module.exports = { defaults, sanitize, readSettings, saveSettings, externalUrl };
