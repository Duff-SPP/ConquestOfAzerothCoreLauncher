const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
test('notification sound respects mute, deduplicates events, throttles and tolerates missing audio',()=>{
const s=fs.readFileSync(require.resolve('../public/updates.js'),'utf8');let plays=0,now=0;
const ctx={state:{settings:{sound:true}},performance:{now:()=>now},Audio:function(src){assert.equal(src,'assets/sounds/notification.mp3');this.play=()=>{plays++;return Promise.reject(new Error('missing file'));};}};
vm.createContext(ctx);vm.runInContext(s.slice(s.indexOf('const soundedNotifications'),s.indexOf('function downloadTiming')),ctx);
ctx.playNotificationSound('client','one');assert.equal(plays,1);
now=3000;ctx.playNotificationSound('client','one');assert.equal(plays,1);
ctx.state.settings.sound=false;ctx.playNotificationSound('client','two');assert.equal(plays,1);
ctx.state.settings.sound=true;ctx.playNotificationSound('launcher','three');assert.equal(plays,2);
ctx.playNotificationSound('launcher','four');assert.equal(plays,2);
now=6000;ctx.playNotificationSound('launcher','five');assert.equal(plays,3);
});
