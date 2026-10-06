import {controlBoundary,controlReady,canStep} from '../timing.js';
import {MPCWorkerClient} from '../../mpc/client.js?v=3';
import loadMujoco from '../../../g1/vendor/mujoco.js';
import { G1Renderer } from '../../../g1/src/renderer.js';
import * as THREE from 'three';
import { validateRollout, writeQ, writeV, interpolateQ, rotateVector } from '../contract.js';
const position = v => new THREE.Vector3(v[0],v[2],-v[1]);
async function json(url) { const r=await fetch(url); if(!r.ok) throw new Error(`${url.pathname}: ${r.status}`);return r.json(); }
export class B2Z1MPCMode {
  constructor() {this.disposed=false;this.paused=false;this.generation=0;this.abort=new AbortController();this.replay='kinematic';this.playTime=0;this.lastFrame=null;this.physicsTime=0;this.keys=new Set();this.command=[0,0,0];this.latencies=[];this.rate=.01;}
  async init(container) {
    container.append(document.getElementById('b2-template').content.cloneNode(true));
    this.root=container.querySelector('.b2-stage');
    this.el=id=>this.root.querySelector(`#${id}`);
    this.map=await json(new URL('../../robots/b2z1/joint-map.json',import.meta.url));
    this.mj=await loadMujoco();
    if(this.disposed)return;
    const r=await fetch(new URL('../../robots/b2z1/scene.xml',import.meta.url));if(!r.ok)throw new Error('B2 model unavailable');if(this.disposed)return;
    this.mj.FS.writeFile('/b2z1.xml',await r.text());
    this.model=this.mj.MjModel.from_xml_path('/b2z1.xml');this.data=new this.mj.MjData(this.model);this.ghostData=new this.mj.MjData(this.model);
    if(this.model.nq!==23 || this.model.nv!==22 || this.model.nu!==16) throw new Error('MuJoCo state dimensions differ from native');
    for(const j of this.map.mapping) {
      const joint=this.mj.mj_name2id(this.model,this.mj.mjtObj.mjOBJ_JOINT.value,j.name);
      const actuator=this.mj.mj_name2id(this.model,this.mj.mjtObj.mjOBJ_ACTUATOR.value,j.name);
      if(joint<0 || this.model.jnt_qposadr[joint]!==j.mj_q)throw new Error(`Joint address mismatch: ${j.name}`);
      if(actuator!==j.actuator)throw new Error(`Actuator mismatch: ${j.name}`);
    }
    this.footBodies=this.map.feet.map(name=>this.model.body(name).id);
    this.renderer=new G1Renderer(this.el('b2-canvas'));this.renderer.buildModel(this.model);this.renderer.scene.children.find(o=>o.geometry instanceof THREE.PlaneGeometry).position.y=this.map.floor_height-.002;this.renderer.controls.target.set(0,.5,0);this.renderer.camera.position.set(2.1,1.5,2.5);
    this.arrows=this.footBodies.map(()=>{const a=new THREE.ArrowHelper(new THREE.Vector3(0,1,0),new THREE.Vector3(),.1,0xbcf568,.04,.025);this.renderer.scene.add(a);return a;});
    this.horizons=[2,5,9,14].map(()=>{const line=new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(new Float32Array(this.model.nbody*6),3)),new THREE.LineBasicMaterial({color:0x9ce6c0,transparent:true,opacity:.25}));this.renderer.scene.add(line);return line;});
    const events={signal:this.abort.signal};
    this.el('gait').addEventListener('change',()=>this.loadGait(this.el('gait').value).catch(e=>this.error(e)),events);
    this.el('replay').addEventListener('change',()=>this.setReplay(this.el('replay').value),events);
    this.el('reset').addEventListener('click',()=>this.reset(),events);
    this.el('pause').addEventListener('click',()=>this.setPaused(!this.paused),events);
    const commandKeys=['KeyW','KeyS','KeyA','KeyD','KeyQ','KeyE'];
    const updateKeys=()=>{this.command=[.12*(this.keys.has('KeyW')-this.keys.has('KeyS')),.1*(this.keys.has('KeyA')-this.keys.has('KeyD')),.15*(this.keys.has('KeyQ')-this.keys.has('KeyE'))];this.el('live-command').textContent=`vx ${this.command[0].toFixed(2)} · vy ${this.command[1].toFixed(2)} · yaw ${this.command[2].toFixed(2)}`;};
    window.addEventListener('keydown',e=>{if(this.replay!=='live' || e.target.matches('input,select'))return;if(commandKeys.includes(e.code)){e.preventDefault();this.keys.add(e.code);updateKeys();}},events);
    window.addEventListener('keyup',e=>{this.keys.delete(e.code);updateKeys();},events);
    window.addEventListener('blur',()=>{this.keys.clear();updateKeys();},events);
    this.root.querySelectorAll('[data-key]').forEach(button=>{
      const release=()=>{this.keys.delete(button.dataset.key);button.classList.remove('active');updateKeys();};
      button.addEventListener('pointerdown',e=>{e.preventDefault();button.setPointerCapture(e.pointerId);this.keys.add(button.dataset.key);button.classList.add('active');updateKeys();},events);
      for(const event of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(event,release,events);
    });
    this.el('push').addEventListener('click',()=>{if(this.replay==='live')this.pushRemaining=.08;},events);
    window.addEventListener('keydown',e=>{if(e.repeat || e.target.matches('input,select,button,summary'))return;if(e.code==='Space'){e.preventDefault();this.setPaused(!this.paused);}if(e.code==='Backspace'){e.preventDefault();this.reset();}},events);
    if(window.matchMedia('(max-width:700px)').matches){this.el('horizon').checked=false;this.el('forces').checked=false;}
    await this.loadGait('trot');if(this.disposed)return;
    this.animation=requestAnimationFrame(t=>this.advance(t));
  }
  async loadGait(gait) {
    const token=++this.generation;this.setPaused(true);this.el('status').textContent=`Loading native ${gait} rollout…`;
    const rollout=validateRollout(await json(new URL(`../../results/${gait}.json`,import.meta.url)),this.map);
    if(this.disposed || token!==this.generation)return;
    this.rollout=rollout;this.reset();this.describe();for(const id of ['gait','replay','reset','pause'])this.el(id).disabled=false;
  }
  setReplay(value) {
    this.client?.dispose();this.client=null;this.replay=value;this.liveResult=null;this.latencies=[];this.solveCount=0;this.keys.clear();this.command=[0,0,0];this.rate=.01;
    this.el('live-controls').hidden=value!=='live';this.el('solve-label').textContent=value==='live'?'Live solve / violation':'Recorded solve / violation';
    if(value==='live') {
      this.el('gait').value='stand';
      this.client=new MPCWorkerClient(result=>{
        if(this.disposed || this.replay!=='live')return;
        this.liveResult=result;this.latencies.push(result.solveTimeMs);if(this.latencies.length>100)this.latencies.shift();this.solveCount++;
        const sorted=[...this.latencies].sort((a,b)=>a-b),p95=sorted[Math.ceil(sorted.length*.95)-1];
        this.rate=Math.max(.001,Math.min(.1,.012/(p95/1000)));
        this.el('status').textContent=`Live ${result.solver} · ${this.rate.toFixed(3)}× simulation speed · ${this.solveCount} solves`;
      },e=>this.error(e));
      this.client.onReady=()=>{if(!this.disposed)this.el('status').textContent='Solver ready · computing first control…';};
    }
    this.reset();this.describe();
  }
  snapshot() {
    const q=Array.from(this.data.qpos.slice(0,3)).concat(Array.from(this.data.qpos.slice(4,7)),this.data.qpos[3],new Array(16).fill(0));
    const v=rotateVector(q,Array.from(this.data.qvel.slice(0,3)),true).concat(Array.from(this.data.qvel.slice(3,6)),new Array(16).fill(0));
    for(const j of this.map.mapping){q[j.pin_q]=this.data.qpos[j.mj_q];v[j.pin_v]=this.data.qvel[j.mj_v];}
    return {q,v,time:this.physicsTime,command:this.command,gait:this.el('gait').value,armVelocity:[0,0,0]};
  }
  describe() {
    this.root.querySelector('.section-label').textContent=this.replay==='live'?'BROWSER MPC / IPOPT':'NATIVE MPC / FATROP';
    this.el('runtime-label').textContent=this.replay==='live'?'Live browser MPC · CasADi + IPOPT Web Worker':this.replay==='kinematic'?'Recorded native MPC rollout':this.replay==='physics'?'Recorded torques → live MuJoCo physics':'Passive MuJoCo physics · no controller';
    this.el('status').textContent=this.replay==='live'?'Initializing whole-body solver in Web Worker…':this.replay==='kinematic'?'Kinematic playback · no online optimization':this.replay==='physics'?'Experimental transfer · no feedback optimization':'Gravity and ground-contact smoke test';
    this.el('control-hint').textContent=this.replay==='live'?'WASD / Q/E or hold arrows to command velocity. Simulation runs slowly to match measured solver speed.': 'Recorded command: vx 0.10 m/s. Space pauses; Backspace resets. Drag to orbit; pinch to zoom.';
    this.el('warning').hidden=this.replay!=='physics';
    this.el('warning').textContent='Open-loop torque replay can diverge from the native predicted motion. Reset restores the recorded initial state.';
  }
  setPaused(value){this.paused=value;this.lastFrame=null;if(this.root)this.el('pause').textContent=value?'Resume':'Pause';}
  reset() {
    if(!this.rollout || this.disposed)return;
    this.generation++;this.client?.reset();this.el('warning').hidden=true;this.el('live-command').textContent='vx 0.00 · vy 0.00 · yaw 0.00';this.liveResult=null;this.pushRemaining=0;this.keys.clear();this.command=[0,0,0];this.playTime=0;this.physicsTime=0;this.wallTime=0;this.lastTelemetry=0;this.lastFrame=null;this.mj.mj_resetData(this.model,this.data);
    const first=this.rollout.frames[0];writeQ(first.q,this.data.qpos,this.map);writeV(first.q,first.v,this.data.qvel,this.map);
    this.mj.mj_forward(this.model,this.data);this.setPaused(false);this.draw(first);
  }
  frameAt(time) {const f=this.rollout.frames;return f[Math.min(f.length-1,Math.floor(time/this.rollout.metadata.dt))];}
  advance(timestamp) {
    if(this.disposed)return;
    const realElapsed=this.lastFrame===null?0:(timestamp-this.lastFrame)/1000;
    const elapsed=Math.min(realElapsed,.05);this.lastFrame=timestamp;
    this.fps=realElapsed>0?1/realElapsed:this.fps;
    if(this.replay==='live' && !this.paused && (!this.liveResult || controlReady(this.physicsTime,this.liveResult.time)))this.client?.solve(this.snapshot());
    if(!this.paused && this.rollout && (this.replay!=='live' || this.liveResult)) {
      this.wallTime+=realElapsed;this.playTime+=(this.replay==='live'?realElapsed*this.rate:elapsed);
      // Bound action age to one controller interval even when a solve spikes.
      // Rendering continues while the worker solves; simulated time slows.
      if(this.replay==='live')this.playTime=Math.min(this.playTime,controlBoundary(this.liveResult.time));
      const end=this.rollout.frames.at(-1).t;
      if(this.replay==='kinematic') {
        if(this.playTime>end)this.playTime%=end;
        const frames=this.rollout.frames,i=Math.min(frames.length-2,Math.floor(this.playTime/this.rollout.metadata.dt));
        const f=frames[i],next=frames[i+1],mix=(this.playTime-f.t)/(next.t-f.t);
        writeQ(interpolateQ(f.q,next.q,mix),this.data.qpos,this.map);writeV(f.q,f.v,this.data.qvel,this.map);this.mj.mj_forward(this.model,this.data);
      } else {
        if(this.replay==='physics' && this.playTime>end){this.playTime=end;this.setPaused(true);}
        let steps=0;
        while(canStep(this.physicsTime,this.playTime) && steps<25) {
          this.data.ctrl.fill(0);
          if(this.replay==='physics') {const f=this.frameAt(this.physicsTime);for(const j of this.map.mapping)this.data.ctrl[j.actuator]=f.tau[j.pin_v-6];}
          if(this.replay==='live' && this.liveResult) {
            const r=this.liveResult;
            for(const j of this.map.mapping) {
              const i=j.pin_v-6;let torque=r.torque[i];
              if(this.el('servo').checked){const arm=i>=12,kp=arm?80:800,kd=arm?8:40;torque+=kp*(r.qPrediction[1][j.pin_q]-this.data.qpos[j.mj_q])+kd*(r.vPrediction[1][j.pin_v]-this.data.qvel[j.mj_v]);}
              this.data.ctrl[j.actuator]=Math.max(this.model.actuator_ctrlrange[j.actuator*2],Math.min(this.model.actuator_ctrlrange[j.actuator*2+1],torque));
            }
          }
          this.data.qfrc_applied.fill(0);
          if(this.pushRemaining>0){this.data.qfrc_applied[1]=60;this.pushRemaining-=.002;}
          this.mj.mj_step(this.model,this.data);this.physicsTime+=.002;steps++;
        }
        if(!this.data.qpos.every(Number.isFinite)){this.error(new Error('Physics became nonfinite; reset to recover'));}
      }
    }
    if(this.rollout){const frame=this.replay==='live' && this.liveResult?{...this.frameAt(0),v:this.snapshot().v,prediction:this.liveResult.qPrediction,contact_forces:this.liveResult.forcesPrediction,contact_schedule:this.liveResult.contacts,solve_time_ms:this.liveResult.solveTimeMs,constraint_violation:this.liveResult.constraintViolation}:this.frameAt(Math.min(this.playTime,this.rollout.frames.at(-1).t));this.draw(frame);}
    this.animation=requestAnimationFrame(t=>this.advance(t));
  }
  draw(frame) {
    if(!this.renderer)return;
    const showForces=this.el('forces').checked && this.replay!=='passive' && !(this.replay==='live' && !this.liveResult);
    this.arrows.forEach((arrow,i)=>{
      const force=position(frame.contact_forces.slice(i*3,i*3+3));const length=force.length()*.001;
      arrow.visible=showForces && length>1e-6;arrow.position.copy(position(this.data.xpos.slice(this.footBodies[i]*3,this.footBodies[i]*3+3)));
      if(length>1e-6){arrow.setDirection(force.normalize());arrow.setLength(length,Math.min(.04,length*.3),.02);}
    });
    this.horizons.forEach((line,index)=>{
      line.visible=this.el('horizon').checked && this.replay!=='passive' && !(this.replay==='live' && !this.liveResult);if(!line.visible)return;
      writeQ(frame.prediction[[2,5,9,14][index]],this.ghostData.qpos,this.map);this.mj.mj_forward(this.model,this.ghostData);
      const vertices=[];
      for(let body=1;body<this.model.nbody;body++) {
        const parent=this.model.body_parentid[body];if(parent===0)continue;
        const a=position(this.ghostData.xpos.slice(body*3,body*3+3)),b=position(this.ghostData.xpos.slice(parent*3,parent*3+3));
        vertices.push(...a.toArray(),...b.toArray());
      }
      const attribute=line.geometry.getAttribute('position');attribute.array.set(vertices);attribute.needsUpdate=true;line.geometry.setDrawRange(0,vertices.length/3);line.geometry.computeBoundingSphere();
    });
    this.renderer.update(this.data);
    if(this.lastTelemetry && performance.now()-this.lastTelemetry<120)return;this.lastTelemetry=performance.now();
    const q=[...this.data.qpos.slice(0,3),...this.data.qpos.slice(4,7),this.data.qpos[3]];
    const velocity=this.replay==='kinematic'?frame.v.slice(0,3):rotateVector(q,this.data.qvel.slice(0,3),true);
    const f=v=>Number(v).toFixed(3);
    this.el('velocity').textContent=`${f(this.replay==='live'?this.command[0]:.1)} / ${f(velocity[0])} m/s`;
    this.el('lateral').textContent=`${f(this.replay==='live'?this.command[1]:0)} / ${f(velocity[1])} m/s`;
    this.el('yaw').textContent=`${f(this.replay==='live'?this.command[2]:0)} / ${f(this.data.qvel[5])} rad/s`;
    this.el('solve').textContent=`${frame.solve_time_ms.toFixed(1)} ms / ${frame.constraint_violation.toExponential(1)} (${this.replay==='live'?'browser':'native'})`;
    if(this.replay==='live' && !this.liveResult)this.el('solve').textContent='Waiting for first browser solve…';
    const sorted=[...this.latencies].sort((a,b)=>a-b);
    this.el('worker-latency').textContent=sorted.length?`${sorted[Math.floor(sorted.length/2)].toFixed(0)} / ${sorted[Math.ceil(sorted.length*.95)-1].toFixed(0)} ms · setup ${(this.client.setupTimeMs/1000).toFixed(1)} s`:'—';
    this.el('worker-performance').textContent=this.replay==='live' && this.liveResult?`${(1000/this.liveResult.solveTimeMs).toFixed(2)} Hz / ${(this.liveResult.roundTripMs-this.liveResult.solveTimeMs).toFixed(1)} ms overhead`:this.replay==='live'?'Waiting for solver…':'n/a · recorded playback';
    this.el('time').textContent=`${this.rollout.metadata.horizon_dt.reduce((a,b)=>a+b,0).toFixed(3)} s / ${this.playTime.toFixed(2)} s`;
    this.el('dimensions').textContent=`${this.model.nq} / ${this.model.nv} / ${this.model.nu} / ${this.data.ncon}`;
    this.el('pose').textContent=`${Array.from(this.data.qpos.slice(0,3),f).join(', ')} / ${Array.from(this.data.qpos.slice(3,7),f).join(', ')}`;
    this.el('performance').textContent=`${Math.round(this.fps||0)} / ${this.replay==='kinematic'?'n/a':(this.physicsTime/Math.max(this.wallTime,.002)).toFixed(3)}`;
    this.el('horizon-progress').style.width=`${(this.playTime%.015)/.015*100}%`;
    const contacts=this.el('contacts');contacts.replaceChildren();
    for(const name of ['FL','FR','RL','RR']){const i=this.map.feet.indexOf(`${name}_foot`),stance=frame.contact_schedule[i]===1;const div=document.createElement('div');div.className=`foot ${stance?'stance':'swing'}`;div.textContent=`${name} · ${this.replay==='passive'?'no schedule':this.replay==='live'&&!this.liveResult?'waiting':stance?'stance':'swing'}`;contacts.append(div);}
  }
  error(error){this.setPaused(true);this.el('warning').hidden=false;this.el('warning').textContent=error.message;console.error(error);}
  dispose() {
    if(this.disposed)return;
    this.disposed=true;this.generation++;this.client?.dispose();this.abort.abort();cancelAnimationFrame(this.animation);
    if(this.renderer){this.renderer.resizeObserver.disconnect();this.renderer.controls.dispose();this.renderer.scene.traverse(o=>{o.geometry?.dispose();if(Array.isArray(o.material))o.material.forEach(m=>m.dispose());else o.material?.dispose();});this.renderer.renderer.dispose();this.renderer.renderer.forceContextLoss();}
    this.ghostData?.delete();this.data?.delete();this.model?.delete();this.root?.remove();
  }
}
