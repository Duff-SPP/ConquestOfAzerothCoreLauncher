Conquest Launcher 0.6.8 uninstall production fix v4

WHY v4 EXISTS
-------------
electron-builder prepends nsis.include files before installer.nsi includes common.nsh.
APP_EXECUTABLE_FILENAME and UNINSTALL_FILENAME are created by common.nsh, so a
top-level compile-time requirement for those symbols makes the production NSIS
build fail even though the disposable smoke fixture can define them manually.

v4 makes preserve-files.nsh depend only on electron-builder command-line defines
that already exist before custom includes: PRODUCT_FILENAME and BUILD_RESOURCES_DIR.
It derives the executable/uninstaller names directly from PRODUCT_FILENAME.

FILES TO REPLACE
----------------
build\preserve-files.nsh
tools\installer-safety-smoke.cjs

DO NOT replace tools\installer-ownership.cjs; keep the current production-fix version.

TEST ORDER
----------
node --check tools/installer-safety-smoke.cjs
node --test test/installer-ownership.test.cjs
node -e "const p=require('node:path');require('./tools/installer-ownership.cjs').generate(p.resolve('dist/win-unpacked'),p.resolve('build'),p.resolve('node_modules/app-builder-lib/templates/nsis')).then(f=>console.log('Generated safe installer files for '+f.length+' owned files.')).catch(e=>{console.error(e);process.exitCode=1})"
node tools/installer-safety-smoke.cjs

Only after all tests pass, rebuild the prepackaged NSIS installer.
