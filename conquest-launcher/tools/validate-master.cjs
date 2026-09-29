#!/usr/bin/env node
const fs = require('node:fs/promises');
const path = require('node:path');
const { safePath, protectedPath, validateManifest, hashFile } = require('../src/release-format.cjs');
async function validateMaster(root) {
  root = path.resolve(root); const files = [];
  async function walk(prefix = '') {
    await safePath(root, prefix + '.probe', true);
    for (const entry of await fs.readdir(path.join(root, prefix), { withFileTypes: true })) {
      const relative = prefix + entry.name;
      if (protectedPath(relative)) continue;
      if (entry.isSymbolicLink()) throw new Error('Linked master files are not allowed: ' + relative);
      if (entry.isDirectory()) await walk(relative + '/');
      else if (entry.isFile()) {
        const file = await safePath(root, relative);
        files.push({path:relative,size:(await fs.stat(file)).size,sha256:await hashFile(file)});
      } else throw new Error('Unsupported master entry: ' + relative);
    }
  }
  await walk();validateManifest({schema:1,version:'validation',files});
  console.log(`Validated ${files.length} managed files, ${files.reduce((s,f)=>s+f.size,0)} bytes. Master unchanged. Interface/WTF/player files excluded.`);
  console.log('MPQ embedded addon contents require separate verification; this tool does not inspect or modify MPQs.');
}
if (require.main===module) {
  if (!process.argv[2]) { console.error('Usage: node tools/validate-master.cjs MASTER_FOLDER');process.exitCode=1; }
  else validateMaster(process.argv[2]).catch(e=>{console.error(e.message);process.exitCode=1;});
}
module.exports={validateMaster};
