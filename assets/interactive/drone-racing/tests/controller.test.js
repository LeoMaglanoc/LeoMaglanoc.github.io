import {test} from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {Simulation} from '../src/simulation.js';import {FlightController} from '../src/controller.js';import {yawOf,angleDifference} from '../src/math.js';
const sim=await new Simulation().init(await readFile(new URL('../models/crazyflie.xml',import.meta.url),'utf8'));
const ctrl=new FlightController();
function run(ref,seconds){for(let i=0;i<seconds/sim.dt;i++){ctrl.command(sim.state,ref,sim.dt,null,sim.motors);sim.step();}}
for(const [name,p,yaw,disturbance] of [['hover',[0,0,1.5],0,null],['altitude step',[0,0,2.5],0,null],['x step',[1,0,1.5],0,null],['yaw step',[0,0,1.5],Math.PI/2,null],['roll recovery',[0,0,1.5],0,'roll'],['velocity recovery',[0,0,1.5],0,'velocity']]) {
 test(name,()=>{sim.reset();ctrl.reset();if(disturbance==='roll'){sim.data.qpos[3]=Math.cos(.15);sim.data.qpos[4]=Math.sin(.15);sim.mj.mj_forward(sim.model,sim.data);}if(disturbance==='velocity')sim.impulse();run({p,v:[0,0,0],a:[0,0,0],yaw},6);assert.ok(Math.hypot(...p.map((x,i)=>x-sim.state.p[i]))<.1,JSON.stringify([...sim.state.p]));assert.ok(Math.abs(angleDifference(yaw,yawOf(sim.state.q)))<.04);});
}
test('three minutes stable hover and controller reset',()=>{sim.reset();ctrl.reset();run({p:[0,0,1.5],v:[0,0,0],a:[0,0,0],yaw:0},180);assert.ok(Math.abs(sim.state.p[2]-1.5)<.01);ctrl.reset();assert.ok(ctrl.integral.every(x=>x===0));});
