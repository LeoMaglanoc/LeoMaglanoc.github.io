// Runs the same exported robot functions and Fatrop backend used by the worker.
// Node requires the pinned package; no optimizer or dynamics are reimplemented.
import {gunzipSync} from 'node:zlib';
import {createRequire} from 'node:module';import {readFileSync,writeFileSync} from 'node:fs';import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),create=require('../mpc/vendor/casadi/casadi.js');
const ca=await create();await ca.load_nlpsol('fatrop');
const load=name=>ca.Function.deserialize(gunzipSync(readFileSync(new URL(`../mpc/${name}.casadi.gz`,import.meta.url))).toString());
const nlp=load('nlp'),pack=load('pack'),bounds=load('bounds'),decode=load('decode');
const config=JSON.parse(readFileSync(new URL('../mpc/deployment.json',import.meta.url))),fixture=JSON.parse(readFileSync(new URL('../mpc/native-fixture.json',import.meta.url)));
const params=config.inputs.slice(0,14).map((x,i)=>{const m=ca.DM(config.initial.slice(x.offset,x.offset+x.size));return i===3||i===4?ca.reshape(m,4,14):m;});
const p=pack.call(params)[0],[lb,ub]=bounds.call([p]);
const solver=ca.nlpsol('wb','fatrop',nlp,{expand:true,structure_detection:'auto',equality:config.equality,print_time:false,fatrop:{print_level:0,max_iter:50,tol:1e-3,mu_init:1e-4}});
let warm=ca.DM(fixture.solution);const reports=[];
for(let i=0;i<3;i++){
 const start=performance.now(),sol=solver.call({p,x0:warm,lbg:lb,ubg:ub}),latency=performance.now()-start;
 const actual=decode.call([sol.x,...params])[0].elements();assert.ok(actual.every(Number.isFinite));assert.ok(actual.at(-1)<1e-3);
 const maxError=Math.max(...actual.map((x,i)=>Math.abs(x-fixture.decoded[i])));assert.ok(maxError<.05,`Native/WASM difference ${maxError}`);
 reports.push({solveMs:latency,maxNativeDecodedError:maxError,constraintViolation:actual.at(-1)});warm=sol.x;
}
writeFileSync(new URL('../results/wasm-node.json',import.meta.url),JSON.stringify(reports,null,2));console.log(JSON.stringify(reports));
