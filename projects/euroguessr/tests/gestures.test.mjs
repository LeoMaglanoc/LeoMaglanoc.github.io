import test from 'node:test';
import assert from 'node:assert/strict';
import {photoStep,clampPhoto,mapStep,pointerGestures} from '../src/gestures.js';
test('photo pinch keeps the point under its midpoint and clamps at fitted size',()=>{
 const s=photoStep({scale:1,x:0,y:0},2,{x:50,y:20});
 assert.deepEqual(s,{scale:2,x:-50,y:-20});
 assert.deepEqual(photoStep(s,.5,{x:50,y:20}),{scale:1,x:0,y:0});
 assert.deepEqual(clampPhoto({scale:8,x:999,y:-999},{width:400,height:300},{width:400,height:200}),{scale:4,x:600,y:-250});
 assert.deepEqual(clampPhoto({scale:1,x:99,y:99},{width:400,height:300},{width:400,height:200}),{scale:1,x:0,y:0});
});
test('map pinch anchors coordinates and translates in the new scale',()=>{
 const view=[0,0,700,630], anchor={x:300,y:250};
 const z=mapStep(view,2,anchor);
 assert.equal((anchor.x-z[0])/z[2],anchor.x/700);
 assert.equal((anchor.y-z[1])/z[3],anchor.y/630);
 assert.deepEqual(mapStep(z,.5,anchor),view);
 assert.deepEqual(mapStep(z,1,anchor,{x:10,y:10}),[140,115,350,315]);
});
test('pinch never taps after one pointer remains; rebasing avoids jumps; cancellation never taps',()=>{
 const handlers={},changes=[];let taps=0;
 const el={addEventListener(k,v){handlers[k]=v;},setPointerCapture(){}};
 pointerGestures(el,{change:v=>changes.push(v),tap:()=>taps++});
 const e=(id,x,y,type)=>({pointerId:id,clientX:x,clientY:y,button:0,target:{closest:()=>false},type});
 handlers.pointerdown(e(1,10,10)); handlers.pointerdown(e(2,30,10));
 handlers.pointermove(e(2,50,10));assert.equal(changes[0].factor,2);
 handlers.pointerup(e(2,50,10,'pointerup'));handlers.pointermove(e(1,11,10));
 assert.equal(changes[1].factor,1);assert.deepEqual(changes[1].delta,{x:1,y:0});
 handlers.pointerup(e(1,11,10,'pointerup'));assert.equal(taps,0);
 handlers.pointerdown(e(3,10,10));handlers.pointercancel(e(3,10,10,'pointercancel'));assert.equal(taps,0);
 handlers.pointerdown(e(4,10,10));handlers.pointerup(e(4,10,10,'pointerup'));assert.equal(taps,1);
});
