// Copyright (C) 2026 Duff (Duff-SPP). GPL-3.0-only; see LICENSE and ATTRIBUTION.md at the repository root.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const data = fs.readFileSync(path.join(root, '../resources/app.asar'));
const header = JSON.parse(data.subarray(16, 16 + data.readUInt32LE(12)));
const start = 8 + data.readUInt32LE(4);
const inventory = [];
function walk(files, prefix = '') {
  for (const [name, entry] of Object.entries(files)) {
    const relative = prefix + name;
    if (entry.files) { walk(entry.files, relative + '/'); continue; }
    inventory.push({ path: relative, size: entry.size });
    if (!relative.startsWith('renderer/') && !['package.json','desktop/preload.js'].includes(relative)) continue;
    const target = path.resolve(root, 'reference', relative);
    if (!target.startsWith(path.join(root, 'reference') + path.sep)) throw new Error('Unsafe archive path');
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, data.subarray(start + Number(entry.offset), start + Number(entry.offset) + entry.size));
  }
}
walk(header.files);
fs.writeFileSync(path.join(root, 'reference/inventory.json'), JSON.stringify(inventory, null, 2));
console.log(`Inspected ${inventory.length} archive entries. Reference files are excluded from the build.`);
