// Copyright (C) 2026 Duff (Duff-SPP). GPL-3.0-only; see LICENSE and ATTRIBUTION.md at the repository root.
const fs = require('node:fs/promises');
const path = require('node:path');
const { safePath, statOrNull } = require('./release-format.cjs');

async function clearClientCache(root) {
  if (!root) throw new Error('Choose your installed client first.');
  const executable = await safePath(root, 'Ascension.exe');
  if (!(await statOrNull(executable))) throw new Error('Choose your installed client first.');
  // Check the selected root and Cache path for junctions before any deletion.
  const probe = await safePath(root, 'Cache/.cache-check', true);
  const cache = path.dirname(probe);
  if (cache !== path.join(path.resolve(root), 'Cache')) throw new Error('Invalid client cache folder.');
  if (!(await statOrNull(cache))) return { cleared: false };
  async function inspect(folder) {
    for (const entry of await fs.readdir(folder, { withFileTypes: true })) {
      const target = path.join(folder, entry.name);
      const stat = await fs.lstat(target);
      if (stat.isSymbolicLink()) throw new Error('Linked folders/files are not supported in the client cache.');
      if (stat.isDirectory()) await inspect(target);
      else if (!stat.isFile()) throw new Error('Unsupported file in the client cache.');
    }
  }
  await inspect(cache);
  await fs.rm(cache, { recursive: true, force: false });
  return { cleared: true };
}
module.exports = { clearClientCache };
