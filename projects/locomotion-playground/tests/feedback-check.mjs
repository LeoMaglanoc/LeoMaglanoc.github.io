// Integration diagnostic: actual WASM MPC and actual WASM MuJoCo feedback.
import {readFileSync,writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {gunzipSync} from 'node:zlib';
import {NativeMPCRuntime} from '../mpc/runtime.js';
import {ExplicitFinalizationRegistry} from '../mpc/finalization-compat.js';
import loadMujoco from '../../g1/vendor/mujoco.js';
import {writeQ,rotateVector} from '../src/contract.js';
const require=createRequire(import.meta.url),create=require('../mpc/vendor/casadi/casadi.js');
const json=name=>JSON.parse(readFileSync(new URL(name,import.meta.url)));
const rt=new NativeMPCRuntime();rt.config=json('../mpc/deployment.json');const originalRegistry=global.FinalizationRegistry;global.FinalizationRegistry=ExplicitFinalizationRegistry;try{rt.ca=await create();}finally{global.FinalizationRegistry=originalRegistry;}await rt.ca.load_nlpsol('ipopt');
for(const name of ['nlp','pack','bounds','decode'])rt[name]=rt.ca.Function.deserialize(gunzipSync(readFileSync(new URL(`../mpc/${name}.casadi.gz`,import.meta.url))).toString());
rt.solver=rt.ca.nlpsol('feedback','ipopt',rt.nlp,{expand:true,print_time:false,ipopt:{print_level:0,max_iter:200,tol:1e-5,mu_init:1e-4,bound_push:1e-7,sb:'yes'}});
rt.feedbackSolver=rt.solver;rt.backend='ipopt';
rt.seed=json('../mpc/native-fixture.json').solution;rt.seeds=json('../mpc/seeds.json');rt.previous=null;
const mj=await loadMujoco({wasmBinary:readFileSync(new URL('../../g1/vendor/mujoco.wasm',import.meta.url))});mj.FS.writeFile('/b2.xml',readFileSync(new URL('../robots/b2z1/scene.xml',import.meta.url),'utf8'));const model=mj.MjModel.from_xml_path('/b2.xml'),data=new mj.MjData(model),map=json('../robots/b2z1/joint-map.json');writeQ(rt.config.q0,data.qpos,map);mj.mj_forward(model,data);
const gait=process.env.MPC_GAIT||'stand',count=Number(process.env.MPC_STEPS||10),report=[];
for(let k=0;k<count;k++){
 const q=[...data.qpos.slice(0,3),...data.qpos.slice(4,7),data.qpos[3],...data.qpos.slice(7)],v=[...rotateVector(q,data.qvel.slice(0,3),true),...data.qvel.slice(3)];
 let r;try{r=rt.solve({q,v,time:data.time,command:[gait==='stand'?0:.1,0,0],gait,armVelocity:[0,0,0]});}catch(e){console.log('FAIL at',k,data.time,e.message);throw e;}
 if(global.gc){global.gc();await new Promise(resolve=>setTimeout(resolve,0));}
 report.push({step:k,t:data.time,height:data.qpos[2],solveMs:r.solveTimeMs,violation:r.constraintViolation});console.log(JSON.stringify(report.at(-1)));
 for(let step=0;step<(k%2?8:7);step++){
  for(const j of map.mapping){const i=j.pin_v-6,kp=i>=12?80:800,kd=i>=12?8:40,torque=r.torque[i]+kp*(r.qPrediction[1][j.pin_q]-data.qpos[j.mj_q])+kd*(r.vPrediction[1][j.pin_v]-data.qvel[j.mj_v]);data.ctrl[j.actuator]=Math.max(model.actuator_ctrlrange[j.actuator*2],Math.min(model.actuator_ctrlrange[j.actuator*2+1],torque));}
  mj.mj_step(model,data);
 }
}
if(!data.qpos.every(Number.isFinite)||data.qpos[2]<.3)throw new Error('Robot fell or became nonfinite');
writeFileSync(new URL(`../results/wasm-feedback-${gait}-${count}${global.gc?"-gc":""}.json`,import.meta.url),JSON.stringify(report,null,2));
