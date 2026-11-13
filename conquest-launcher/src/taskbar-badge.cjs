// Copyright (C) 2026 Duff (Duff-SPP). GPL-3.0-only; see LICENSE and ATTRIBUTION.md at the repository root.
const path = require('node:path');
function createTaskbarBadge(getWindow, nativeImage, assetsRoot, platform = process.platform) {
  let previous = null;
  return count => {
    if (!Number.isInteger(count) || count < 0 || count > 2) throw new Error('Invalid notification count.');
    const window = getWindow();
    if (platform !== 'win32' || !window || window.isDestroyed()) return;
    if (previous === count) return;
    const image = count ? nativeImage.createFromPath(path.join(assetsRoot, `notification-badge-${count}.png`)) : null;
    if (image && image.isEmpty()) throw new Error('Notification badge asset is missing.');
    window.setOverlayIcon(image, count ? `${count} pending update notification${count === 1 ? '' : 's'}` : '');
    previous = count;
  };
}
module.exports = { createTaskbarBadge };
