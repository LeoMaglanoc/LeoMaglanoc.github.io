import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateRollout,writeQ,writeV,interpolateQ,rotateVector} from '../src/contract.js';
const read=p=>JSON.parse(readFileSync(new URL(p,import.meta.url)));
const map=read('../robots/b2z1/joint-map.json');
for(const gait of ['stand','walk','trot'])test(`${gait} native export round trip`,()=>{
 const r=validateRollout(read(`../results/${gait}.json`),map);
 assert.ok(r.frames.every(f=>f.constraint_violation<1e-3));
 for(const i of [0,29,r.frames.length-1]){
  const q=new Float64Array(23),v=new Float64Array(22),frame=r.frames[i];writeQ(frame.q,q,map);writeV(frame.q,frame.v,v,map);
  for(const j of map.mapping){assert.equal(q[j.mj_q],frame.q[j.pin_q]);assert.equal(v[j.mj_v],frame.v[j.pin_v]);}
  assert.deepEqual([...q.slice(3,7)],[frame.q[6],...frame.q.slice(3,6)]);
 }
});
test('reject duplicate mapping and mismatched dimensions',()=>{
 const r=read('../results/trot.json');const bad=structuredClone(map);bad.mapping[1].mj_q=bad.mapping[0].mj_q;
 assert.throws(()=>validateRollout(r,bad));r.frames[0].tau.pop();assert.throws(()=>validateRollout(r,map));
});
test('quaternion interpolation and local/world velocity conventions',()=>{
 const q=[0,0,0,0,0,Math.SQRT1_2,Math.SQRT1_2];assert.ok(Math.abs(rotateVector(q,[1,0,0])[1]-1)<1e-12);
 const anti=q.map((v,i)=>i>=3?-v:v),mid=interpolateQ(q,anti,.5);assert.ok(mid.every(Number.isFinite));assert.ok(Math.abs(mid.slice(3).reduce((s,v)=>s+v*v,0)-1)<1e-12);
 const back=rotateVector(q,rotateVector(q,[1,2,3]),true);back.forEach((v,i)=>assert.ok(Math.abs(v-[1,2,3][i])<1e-12));
});
