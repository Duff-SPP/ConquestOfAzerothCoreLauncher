const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
test('addon cleanup reminder repeats until explicitly dismissed and opens installed addons without removing files',async()=>{
const source=fs.readFileSync(require('node:path').join(__dirname,'../public/app.js'),'utf8');
const start=source.indexOf('const addonCleanupNoticeKey =');
const end=source.indexOf("window.addEventListener('DOMContentLoaded', start);",start);
const store=new Map();let shown=0,closed=0,rendered=0;
const state={page:'home',addonTab:'browse',client:{path:'client'},settings:{addonCleanupDismissed:false}};
let packages=[{catalog:false,managed:true,status:'installed'}];
const context={api:{addons:async()=>({packages})},modal:{open:false},state,actions:{},localStorage:{getItem:key=>store.get(key),setItem:(key,value)=>store.set(key,value)},t:value=>value,icon:()=>'',modalHeader:()=>'',lh:(parts,...values)=>parts.reduce((value,part,i)=>value+part+(values[i]||''),''),openModal:()=>shown++,closeModal:()=>closed++,render:()=>rendered++};
vm.createContext(context);vm.runInContext(source.slice(start,end),context);
context.modal.open=true;await context.showAddonCleanupReminder();assert.equal(shown,0);
context.modal.open=false;await context.showAddonCleanupReminder();assert.equal(shown,1);
await context.showAddonCleanupReminder();assert.equal(shown,2);
packages=[];await context.showAddonCleanupReminder();assert.equal(shown,2);
packages=[{catalog:false,managed:false,status:'installed'},{catalog:false,managed:true,status:'not-installed'}];await context.showAddonCleanupReminder();assert.equal(shown,2);
packages=[{catalog:false,managed:true,status:'installed'}];
store.set('coa.addon-catalog-cleanup.0.7.2','seen');
await context.showAddonCleanupReminder();assert.equal(shown,2);
store.clear();state.settings.addonCleanupDismissed=true;
await context.showAddonCleanupReminder();assert.equal(shown,2);
context.actions['review-old-addons']();assert.equal(state.page,'addons');assert.equal(state.addonTab,'installed');assert.equal(closed,1);assert.equal(rendered,1);
});

test('cleanup checkbox is wired to saved settings and survives a launcher restart',async t=>{
const fsp=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const root=await fsp.mkdtemp(path.join(os.tmpdir(),'coa-cleanup-settings-'));
t.after(()=>fsp.rm(root,{recursive:true,force:true}));
const {defaults,saveSettings,readSettings,sanitize}=require('../src/settings.cjs');
const file=path.join(root,'settings.json');
assert.equal(sanitize({}).addonCleanupDismissed,false);
await saveSettings(file,{...defaults,addonCleanupDismissed:true});
assert.equal((await readSettings(file)).addonCleanupDismissed,true);
const source=fs.readFileSync(require('node:path').join(__dirname,'../public/app.js'),'utf8');
assert.match(source,/id="dismiss-addon-cleanup-permanently" data-setting="addonCleanupDismissed"/);
assert.match(fs.readFileSync(require.resolve('../src/main.cjs'),'utf8'),/'addonCleanupDismissed'/);
});
