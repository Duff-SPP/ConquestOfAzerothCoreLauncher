const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs/promises');const path=require('node:path');const os=require('node:os');const {spawnSync}=require('node:child_process');
test('backend updater preserves custom publication root and denies additional download rules',async t=>{
 const script=await fs.readFile(path.join(__dirname,'../../update-backend.sh'),'utf8');const python=script.match(/<<'PY'\n([\s\S]*?)\nPY/)[1];const baseline=Buffer.from(python.match(/b64decode\('([^']+)'\)/)[1],'base64').toString();
 const executable=process.env.COA_TEST_PYTHON||(process.platform==='win32'?'python.exe':'python3');
 const available=spawnSync(executable,['--version'],{encoding:'utf8'});if(available.status!==0){t.skip('Python 3 is required for the backend-updater fixture check; set COA_TEST_PYTHON.');return;}
 const folder=await fs.mkdtemp(path.join(os.tmpdir(),'coa-nginx-'));t.after(()=>fs.rm(folder,{recursive:true,force:true}));const input=path.join(folder,'input'),output=path.join(folder,'output');const template=path.join(__dirname,'../../Conquest-Launcher-Backend/ubuntu/downloads.nginx.conf');
 const originalRoot=baseline.match(/alias\s+([^;]+)\/launcher\/latest\.yml/)[1];const custom=baseline.replaceAll(originalRoot,'/srv/coa/published');
 for(const content of [baseline,custom,custom.replace(/location ~ (\^\/downloads\/client\/objects\/[^ ]+)/, 'location ~ "$1"'),custom.replaceAll('\r\n','\n').replace(/\n/g,'\r\n')]){
  await fs.writeFile(input,content);const result=spawnSync(executable,['-c',python,input,template,output],{encoding:'utf8'});assert.equal(result.status,0,result.stderr);const generated=await fs.readFile(output,'utf8');assert.match(generated,/location \^~ \/downloads\/client\//);assert.doesNotMatch(generated,/alias .*\/client\//);assert.match(generated,/alias .*\/launcher\/latest\.yml;/);if(content.includes('/srv/'))assert.match(generated,/alias \/srv\/coa\/published\/launcher\/latest\.yml;/);
  await fs.writeFile(input,generated);const again=spawnSync(executable,['-c',python,input,template,output],{encoding:'utf8'});assert.equal(again.status,0,again.stderr);assert.equal(await fs.readFile(output,'utf8'),generated);
 }
 await fs.writeFile(input,custom+'\nlocation /private-download/ { return 403; }');const result=spawnSync(executable,['-c',python,input,template,output],{encoding:'utf8'});assert.equal(result.status,1);assert.match(result.stderr,/Unrecognized custom download rules/);
});
