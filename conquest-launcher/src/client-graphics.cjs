// Copyright (C) 2026 Duff (Duff-SPP). GPL-3.0-only; see LICENSE and ATTRIBUTION.md at the repository root.
const fs = require('node:fs/promises');
const { safePath, statOrNull } = require('./release-format.cjs');

async function configureClientGraphics(root, compatibility = false, disableEnhancements = false) {
  const moves = [];
  for (const name of ['d3d9.dll', 'dxgi.dll']) {
  const disable = name === 'd3d9.dll' ? compatibility === true : disableEnhancements === true;
  const active = await safePath(root, name);
  const disabled = await safePath(root, name + '.DISABLED');
  const activeStat = await statOrNull(active);
  const disabledStat = await statOrNull(disabled);
  if (activeStat && disabledStat) throw new Error('Graphics compatibility could not be applied because conflicting renderer files exist. Contact support before trying again.');
  const source = disable ? active : disabled;
  const target = disable ? disabled : active;
  if (disable ? activeStat : disabledStat) moves.push({ source, target });
  }
  // Check both DLLs for conflicts before changing either of them.
  for (const { source, target } of moves) {
  // Move without replacing an existing destination, even if another program creates it.
  try { await fs.link(source, target); }
  catch (error) {
    if (!['EPERM', 'ENOTSUP', 'EOPNOTSUPP', 'EXDEV', 'EINVAL', 'EISDIR'].includes(error.code)) throw error;
    await fs.copyFile(source, target, require('node:fs').constants.COPYFILE_EXCL);
  }
  await fs.unlink(source);
  }
}

module.exports = { configureClientGraphics };
