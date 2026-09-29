const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
test('realm setup failure leaves an actionable error and retry reaches ready', async()=>{
 const main=fs.readFileSync(require.resolve('../src/main.cjs'),'utf8');let handler,status,fail=true;
 const ctx={handle:(_,fn)=>handler=fn,config:{localDownloadDemo:false},settings:{installPath:'fixture'},requireIdleClient:async()=>{},probeClientFolder:async()=>{},clientUpdater:{update:async()=>{status={phase:'finalizing'}},emit:(phase,message)=>{status={phase,message}}},mutateClient:fn=>fn(),configureRealm:async()=>{if(fail)throw Error('access denied');},clientInfo:async()=>({installed:true})};
 vm.createContext(ctx);vm.runInContext(main.slice(main.indexOf("  handle('launcher:client-update'"),main.indexOf("  handle('launcher:client-pause'")),ctx);
 await assert.rejects(handler(false),/access denied/);assert.equal(status.phase,'error');assert.match(status.message,/realm setup failed/);
 fail=false;assert.equal((await handler(false)).installed,true);assert.equal(status.phase,'ready');
});

test('addon inventory refreshes for a changed client and discards an old in-flight result',async()=>{
 const source=fs.readFileSync(require.resolve('../public/app.js'),'utf8');let calls=0,release;
 const ctx={state:{client:{path:'B'},addonClientPath:'A',addonLoading:false,addons:[{id:'A'}],page:'home'},api:{addons:async()=>{calls++;return{packages:[{id:'B'}]};}},renderAddonCatalog(){},render(){}};
 vm.createContext(ctx);vm.runInContext(source.slice(source.indexOf('async function loadAddons('),source.indexOf('function showAddonDetails(')),ctx);
 await ctx.loadAddons();assert.equal(calls,1);assert.equal(ctx.state.addons[0].id,'B');
 ctx.api.addons=()=>new Promise(resolve=>{release=resolve;});const pending=ctx.loadAddons(true);
 ctx.state.client.path='C';ctx.state.addons=[];release({packages:[{id:'stale B'}]});await pending;
 assert.equal(ctx.state.addons.length,0);assert.equal(ctx.state.addonLoading,false);
 ctx.api.addons=async()=>({packages:[{id:'C'}]});await ctx.loadAddons();assert.equal(ctx.state.addons[0].id,'C');
});
