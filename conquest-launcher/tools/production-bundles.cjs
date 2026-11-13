// Copyright (C) 2026 Duff (Duff-SPP). GPL-3.0-only; see LICENSE and ATTRIBUTION.md at the repository root.
const fs = require('node:fs/promises');
const path = require('node:path');
const esbuild = require('esbuild');
const obfuscator = require('javascript-obfuscator');

const root = path.resolve(__dirname, '..');
const bundleNames = ['runtime/a.cjs', 'runtime/b.cjs', 'public/c.js'];

async function generate() {
  await require('./generate-locales.cjs')();
  const catalogRoot = path.join(root, 'src/assets/AddonCatalog');
  const catalogEntries = await fs.readdir(catalogRoot, { withFileTypes: true });
  const catalogFolders = catalogEntries.filter(entry => entry.isDirectory()).map(entry => entry.name).sort();
  await fs.writeFile(path.join(catalogRoot, 'catalog-index.json'), JSON.stringify({ schema: 1, folders: catalogFolders }, null, 2) + '\n');
  const output = path.join(root, '.production');
  // Remove only our generated workspace directory, never an installed launcher.
  const previous = await fs.lstat(output).catch(error => { if (error.code !== 'ENOENT') throw error; });
  if (previous) {
    const resolvedRoot = await fs.realpath(root), resolvedOutput = await fs.realpath(output);
    if (previous.isSymbolicLink() || resolvedOutput.toLowerCase() !== path.join(resolvedRoot, '.production').toLowerCase()) throw new Error('Unsafe production staging directory.');
    await fs.rm(resolvedOutput, { recursive: true });
  }
  const common = {
    absWorkingDir: root, bundle: true, minify: true, sourcemap: false,
    sourcesContent: false, legalComments: 'none', write: false, logLevel: 'silent',
  };
  // Keep one directory level below the ASAR root, preserving config/public paths.
  // Electron's sandboxed preload may only require Electron, not local modules.
  const main = await fs.readFile(path.join(root, 'src/main.cjs'), 'utf8');
  const preloadPath = "path.join(__dirname, 'preload.cjs')";
  if (main.split(preloadPath).length !== 2) throw new Error('Review production preload path mapping.');
  const result = await esbuild.build({ ...common,
    stdin: { contents: main.replace(preloadPath, "path.join(__dirname, 'b.cjs')"), resolveDir: path.join(root, 'src'), sourcefile: 'entry.cjs' },
    platform: 'node', target: 'node22', format: 'cjs', packages: 'external',
    external: ['../launcher.config.json', '../package.json'],
  });
  const preload = await esbuild.build({ ...common, entryPoints: ['src/preload.cjs'], platform: 'node', target: 'node22', format: 'cjs', external: ['electron'] });
  // These classic scripts share lexical state and must retain their original order.
  // Importing them as two modules would silently split that state.
  const html = await fs.readFile(path.join(root, 'public/index.html'), 'utf8');
  const scripts = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map(match => match[1]);
  if (scripts.join(',') !== 'builder/data/coa-data.js,i18n.js,locales.js,builder/builder.js,app.js,updates.js,language-ui.js,auth-gate.js') throw new Error('Review renderer script ordering before packaging.');
  const rendererSource = (await Promise.all(scripts.filter(name => name !== 'builder/data/coa-data.js').map(name => fs.readFile(path.join(root, 'public', name), 'utf8')))).join('\n;\n');
  const renderer = await esbuild.build({ ...common, stdin: { contents: rendererSource, resolveDir: path.join(root, 'public'), sourcefile: 'ui.js' }, platform: 'browser', target: 'chrome120', format: 'iife' });
  // Obfuscate only our renderer. No eval, property renaming, anti-debugging,
  // control-flow flattening, dead code, console suppression or self-defence.
  const protectedRenderer = obfuscator.obfuscate(renderer.outputFiles[0].text, {
    target: 'browser-no-eval', compact: true, seed: 608,
    identifierNamesGenerator: 'hexadecimal', renameGlobals: false, renameProperties: false,
    stringArray: true, stringArrayThreshold: 0.35, stringArrayEncoding: [],
    stringArrayRotate: false, stringArrayShuffle: false, stringArrayCallsTransform: false,
    stringArrayWrappersCount: 1, stringArrayWrappersChainedCalls: false,
    controlFlowFlattening: false, deadCodeInjection: false, debugProtection: false,
    debugProtectionInterval: 0, selfDefending: false, disableConsoleOutput: false,
    splitStrings: false, transformObjectKeys: false, numbersToExpressions: false,
    simplify: false, unicodeEscapeSequence: false, sourceMap: false,
  }).getObfuscatedCode();
  const contents = [result.outputFiles[0].text, preload.outputFiles[0].text, protectedRenderer];
  for (let i = 0; i < bundleNames.length; i++) {
    const file = path.join(output, bundleNames[i]); await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, contents[i]);
  }
  await fs.writeFile(path.join(output, 'public/index.html'), productionHtml(html));
  await fs.copyFile(path.join(root, 'public/styles.css'), path.join(output, 'public/styles.css'));
  await fs.cp(path.join(root, 'public/builder'), path.join(output, 'public/builder'), { recursive: true, filter: file => path.basename(file) !== 'builder.js' });
  await fs.cp(path.join(root, 'public/assets'), path.join(output, 'public/assets'), {
    recursive: true, filter: async file => (await fs.lstat(file)).isDirectory() || /\.(ico|jpe?g|png|webp|woff2|mp3)$/i.test(file),
  });
  await copyLegalNotices(output);
  await fs.copyFile(path.join(root, 'launcher.config.json'), path.join(output, 'launcher.config.json'));
  const metadata = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
  await fs.writeFile(path.join(output, 'package.json'), JSON.stringify({ name: metadata.name, version: metadata.version, main: 'runtime/a.cjs' }));
  return { output, bundles: bundleNames };
}

async function copyLegalNotices(output) {
  const target = path.join(output, 'public/licenses');
  await fs.mkdir(target, { recursive: true });
  for (const name of ['LICENSE', 'COPYING', 'ATTRIBUTION.md', 'THIRD_PARTY_NOTICES.md']) {
    await fs.copyFile(path.join(root, '..', name), path.join(target, name));
  }
}

function productionHtml(html) {
  return html.replace(/  <script src="i18n.js"><\/script>[\s\S]*?<script src="auth-gate.js"><\/script>/, '  <script src="c.js"></script>');
}

module.exports = async () => { await generate(); console.log('Generated protected main, preload and renderer bundles (no source maps).'); };
module.exports.generate = generate;
module.exports.copyLegalNotices = copyLegalNotices;
module.exports.bundleNames = bundleNames;
module.exports.productionHtml = productionHtml;
if (require.main === module) module.exports().catch(error => { console.error(error); process.exitCode = 1; });
