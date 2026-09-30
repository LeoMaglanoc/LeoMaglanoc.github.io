import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Simulation} from '../src/simulation.js';
import {PARAMS,mix} from '../src/drone.js';
const xml=await readFile(new URL('../models/crazyflie.xml',import.meta.url),'utf8');
const sim=await new Simulation().init(xml);
test('gravity, hover, differential roll/pitch/yaw, floor and deterministic reset',()=>{
 sim.reset();for(let i=0;i<50;i++)sim.step();assert.ok(sim.state.p[2]<1.35);
 sim.reset();sim.motors.set(mix([PARAMS.mass*9.81,0,0,0]));for(let i=0;i<750;i++)sim.step();assert.ok(Math.abs(sim.state.p[2]-1.5)<.02);
 for(let axis=1;axis<4;axis++){sim.reset();const w=[PARAMS.mass*9.81,0,0,0];w[axis]=.0002;sim.motors.set(mix(w));for(let i=0;i<10;i++)sim.step();assert.ok(sim.state.omega[axis-1]>0);}
 sim.reset();for(let i=0;i<500;i++)sim.step();assert.ok(sim.state.p[2]>.005&&sim.state.p[2]<.1);
 sim.reset();assert.deepEqual([...sim.state.p],[0,0,1.5]);assert.equal(sim.data.time,0);
});
