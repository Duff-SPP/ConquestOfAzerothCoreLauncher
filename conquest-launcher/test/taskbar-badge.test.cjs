const test=require('node:test'),assert=require('node:assert/strict');
const {createTaskbarBadge}=require('../src/taskbar-badge.cjs');
test('Windows taskbar badge shows 1/2, clears at zero and avoids duplicate updates',()=>{
const calls=[];const window={isDestroyed:()=>false,setOverlayIcon:(image,description)=>calls.push({image,description})};
const image={createFromPath:path=>({path,isEmpty:()=>false})};
const update=createTaskbarBadge(()=>window,image,'assets','win32');
update(0);update(1);update(1);update(2);update(0);
assert.equal(calls.length,4);assert.match(calls[1].image.path,/notification-badge-1.png$/);assert.match(calls[2].image.path,/notification-badge-2.png$/);assert.equal(calls[3].image,null);
assert.throws(()=>update(3),/Invalid/);
createTaskbarBadge(()=>window,image,'assets','linux')(1);assert.equal(calls.length,4);
});
