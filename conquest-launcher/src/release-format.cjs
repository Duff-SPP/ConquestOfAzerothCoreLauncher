const fs = require('node:fs/promises');
const { createReadStream } = require('node:fs');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');

function filePath(value) {
  if (typeof value !== 'string' || value.length > 220 || !value || value.includes('\\')) throw new Error('Invalid release path.');
  for (const part of value.split('/')) {
    if (!part || part === '.' || part === '..' || /[<>:"|?*\x00-\x1f]/.test(part) || /[. ]$/.test(part) || /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(part)) throw new Error(`Unsafe release path: ${value}`);
  }
  return value;
}
function runtimePath(value) { return /^(MemoryBridge|Ascension_d3d9)\.log$/i.test(value); }
function protectedPath(value) {
  return runtimePath(value) || /^(wtf|savedvariables|cache|logs|errors|screenshots|interface|\.coa-launcher)(\/|$)/i.test(value) || /(^|\/)realmlist\.wtf$/i.test(value) || /(^|\/)\./.test(value);
}
function launcherVersionParts(value) {
  if (typeof value !== 'string' || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value)) throw new Error('Invalid minimum launcher version; use major.minor.patch.');
  const parts = value.split('.').map(Number);
  if (!parts.every(Number.isSafeInteger)) throw new Error('Invalid launcher version.');
  return parts;
}
function requireCompatibleLauncher(manifest, version) {
  if (manifest.minimumLauncherVersion === undefined) return;
  const minimum = launcherVersionParts(manifest.minimumLauncherVersion), current = launcherVersionParts(version);
  for (let i = 0; i < 3; i++) {
    if (current[i] > minimum[i]) return;
    if (current[i] < minimum[i]) throw new Error(`This client release requires launcher ${manifest.minimumLauncherVersion} or newer. Open Settings, check launcher updates, then Restart & update before downloading the client.`);
  }
}
function validateManifest(data) {
  if (!data || data.schema !== 1 || typeof data.version !== 'string' || !/^[a-zA-Z0-9._-]{1,80}$/.test(data.version) || !Array.isArray(data.files) || data.files.length < 1 || data.files.length > 100000) throw new Error('Invalid client release manifest.');
  const names = new Set();
  if (data.minimumLauncherVersion !== undefined) launcherVersionParts(data.minimumLauncherVersion);
  let total = 0;
  for (const file of data.files) {
    if (!file || typeof file !== 'object') throw new Error('Invalid release file.');
    filePath(file.path);
    // Older published releases and installed state include these player-owned logs.
    // Forget ownership without deleting it or requiring the host to republish first.
    if (runtimePath(file.path)) continue;
    if (protectedPath(file.path) || !Number.isSafeInteger(file.size) || file.size < 0 || !/^[a-f0-9]{64}$/.test(file.sha256)) throw new Error(`Invalid release file: ${file.path}`);
    const key = file.path.toLowerCase();
    if (names.has(key)) throw new Error(`Duplicate release path: ${file.path}`);
    names.add(key);
    total += file.size;
  }
  for (const name of names) {
    const segments = name.split('/');
    while (segments.length > 1) { segments.pop(); if (names.has(segments.join('/'))) throw new Error('File and directory paths conflict.'); }
  }
  if (!Number.isSafeInteger(total) || !names.has('ascension.exe')) throw new Error('Release must contain Ascension.exe and valid file sizes.');
  return { ...data, files: data.files.filter(file => !runtimePath(file.path)) };
}
async function statOrNull(file) {
  try { return await fs.lstat(file); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
async function safePath(root, relative, internal = false) {
  filePath(relative);
  if (!internal && protectedPath(relative)) throw new Error('Player-owned files cannot be patched.');
  const absolute = path.resolve(root);
  // Reject junctions/symlinks throughout the full chain, including the selected root.
  const target = path.join(absolute, ...relative.split('/'));
  const parsed = path.parse(target);
  let current = parsed.root;
  const segments = target.slice(parsed.root.length).split(path.sep);
  for (let i = 0; i < segments.length; i++) {
    current = path.join(current, segments[i]);
    const stat = await statOrNull(current);
    if (stat?.isSymbolicLink()) throw new Error(`Linked folders/files are not supported: ${current}`);
    if (stat && i < segments.length - 1 && !stat.isDirectory()) throw new Error(`Expected a folder: ${current}`);
    if (stat && i === segments.length - 1 && !stat.isFile()) throw new Error(`Expected a file: ${current}`);
  }
  return target;
}
async function hashFile(file, signal, report = () => {}) {
  const hash = createHash('sha256');
  let bytes = 0; let last = 0;
  for await (const chunk of createReadStream(file, { signal })) {
    signal?.throwIfAborted(); hash.update(chunk); bytes += chunk.length;
    if (Date.now() - last >= 200) { report(bytes); last = Date.now(); }
  }
  report(bytes);
  return hash.digest('hex');
}
async function atomicJson(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temp = file + '.' + randomUUID() + '.tmp';
  const handle = await fs.open(temp, 'wx');
  try { await handle.writeFile(JSON.stringify(value, null, 2) + '\n'); await handle.sync(); }
  finally { await handle.close(); }
  try { await fs.rename(temp, file); } catch (error) { await fs.unlink(temp).catch(() => {}); throw error; }
}
module.exports = { filePath, runtimePath, protectedPath, validateManifest, launcherVersionParts, requireCompatibleLauncher, statOrNull, safePath, hashFile, atomicJson };
