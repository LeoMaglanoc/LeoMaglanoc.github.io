import test from 'node:test';
import assert from 'node:assert/strict';
import {controlBoundary,controlReady,canStep} from '../src/timing.js';
test('15 ms controls and 2 ms physics progress through floating-point boundaries',()=>{
 let time=0;
 for(let k=0;k<120;k++){
  const last=time,target=controlBoundary(last);let steps=0;
  while(canStep(time,target)){time+=.002;steps++;}
  assert.equal(steps,k%2?8:7);
  assert.ok(controlReady(time,last),'control request must not deadlock at a boundary');
  assert.ok(time<=target+1e-9);
 }
 assert.ok(Math.abs(time-1.8)<1e-9);
});
test('control cannot advance before its bounded action interval',()=>{
 assert.equal(controlReady(.026,.014),false);
 assert.equal(controlReady(.030000000000000013,.014),true);
 assert.equal(canStep(.028,.03),true);
 assert.equal(canStep(.03,.03),false);
});
