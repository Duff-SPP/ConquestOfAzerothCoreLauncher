// Copyright (C) 2026 Duff (Duff-SPP). GPL-3.0-only; see LICENSE and ATTRIBUTION.md at the repository root.
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { safePath, statOrNull } = require('./release-format.cjs');

async function validateClientFolder(directory, executable, forbidden = []) {
  const resolved = path.resolve(directory);
  if (forbidden.some(item => item && path.resolve(item).toLowerCase() === resolved.toLowerCase())) {
    throw new Error('Create or select a dedicated game folder, such as C:\\Games\\Conquest of AzerothCore.');
  }
  const entries = await fs.readdir(resolved);
  const executablePath = await safePath(resolved, path.basename(executable));
  const executableStat = await statOrNull(executablePath);
  if (entries.length && !executableStat && !entries.some(name => name.toLowerCase() === '.coa-launcher')) {
    throw new Error(`Choose an empty folder or an existing client folder containing ${executable}.`);
  }
  await probeClientFolder(resolved);
  return resolved;
}

async function probeClientFolder(directory) {
  const probe = await safePath(directory, `.coa-launcher/write-test-${randomUUID()}`, true);
  const renamed = probe + '.renamed';
  let current;
  try {
    await fs.mkdir(path.dirname(probe), { recursive: true });
    const handle = await fs.open(probe, 'wx');
    current = probe;
    try { await handle.writeFile('write test'); } finally { await handle.close(); }
    await fs.rename(probe, renamed); current = renamed;
    await fs.unlink(renamed); current = null;
  } catch (error) {
    if (['EPERM', 'EACCES', 'EROFS'].includes(error.code)) {
      throw new Error(`The launcher cannot write to "${directory}". Choose a writable game folder, such as C:\\Games\\Conquest of AzerothCore, using Change game location.`);
    }
    throw error;
  } finally {
    if (current) await fs.unlink(current).catch(() => {});
  }
}
module.exports = { validateClientFolder, probeClientFolder };
