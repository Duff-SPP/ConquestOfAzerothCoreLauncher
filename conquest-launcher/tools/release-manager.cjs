#!/usr/bin/env node
const fs = require('node:fs/promises');
const path = require('node:path');
const readline = require('node:readline/promises');
const { publishClient } = require('./publish-client.cjs');
const { publishLauncher } = require('./publish-launcher.cjs');
const { atomicJson, validateManifest } = require('../src/release-format.cjs');

async function menu() {
  const terminal = readline.createInterface({ input: process.stdin, output: process.stdout });
  const configFile = path.resolve(__dirname, '../publishing.local.json');
  let config;
  try { config = JSON.parse(await fs.readFile(configFile, 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const ask = async (label, fallback = '') => (await terminal.question(`${label}${fallback ? ` [${fallback}]` : ''}: `)).trim() || fallback;
  try {
    console.log('\nConquest of AzerothCore — Release manager\n');
    if (!config) {
      console.log('One-time setup. These folders stay private; players receive published copies.');
      config = {
        master: await ask('Master client folder', '/srv/coa/master-client'),
        published: await ask('Published downloads folder', '/srv/coa/published'),
        launcherBundle: await ask('Uploaded launcher-release folder', '/srv/coa/launcher-release')
      };
      for (const value of Object.values(config)) if (!path.isAbsolute(value)) throw new Error('Use absolute folder paths.');
      await atomicJson(configFile, config);
    }
    while (true) {
      console.log(`\nMaster client: ${config.master}\nDownloads: ${config.published}\n\n1. Publish client update\n2. Publish launcher update\n3. Show current releases\n4. Restore a previous client release\n0. Exit`);
      const choice = await ask('Choose');
      try {
        if (choice === '0') break;
        if (choice === '1') {
          const version = await ask('Release name', new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14));
          console.log('Finish all uploads before continuing. No other changes should be made to the master folder during publishing.');
          if ((await ask('Publish now? Type YES')).toUpperCase() === 'YES') await publishClient(config.master, config.published, version);
        } else if (choice === '2') {
          config.launcherBundle = await ask('Launcher release bundle folder', config.launcherBundle);
          if ((await ask('Publish this launcher to players? Type YES')).toUpperCase() === 'YES') await publishLauncher(config.launcherBundle, config.published);
          await atomicJson(configFile, config);
        } else if (choice === '3') {
          for (const relative of ['client/latest.json', 'launcher/latest.yml']) {
            try { const raw = await fs.readFile(path.join(config.published, relative), 'utf8'); console.log(relative.endsWith('.json') ? `Client: ${JSON.parse(raw).version}` : raw); }
            catch (error) { if (error.code === 'ENOENT') console.log(`${relative}: not published yet`); else throw error; }
          }
        } else if (choice === '4') {
          const folder = path.join(config.published, 'client/releases');
          const releases = (await fs.readdir(folder)).filter(name => /^[a-zA-Z0-9._-]+\.json$/.test(name));
          console.log(releases.join('\n'));
          const name = await ask('Exact release filename');
          if (!releases.includes(name)) throw new Error('Choose one of the listed releases.');
          const manifest = validateManifest(JSON.parse(await fs.readFile(path.join(folder, name), 'utf8')));
          if ((await ask(`Publish ${manifest.version} again? Type YES`)).toUpperCase() !== 'YES') continue;
          const lockFile = path.join(config.published, '.publish.lock'); const lock = await fs.open(lockFile, 'wx');
          try { await atomicJson(path.join(config.published, 'client/latest.json'), manifest); }
          finally { await lock.close(); await fs.unlink(lockFile); }
          console.log(`Client ${manifest.version} is now current.`);
        }
      } catch (error) { console.error(`\nCould not publish: ${error.message}\nThe previous published release remains available unless the new release was already committed.`); }
    }
  } finally { terminal.close(); }
}
menu().catch(error => { console.error(error.message); process.exitCode = 1; });
