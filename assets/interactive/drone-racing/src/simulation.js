import loadMujoco from '../../g1/vendor/mujoco.js';
import { PARAMS, rotorWrench } from './drone.js';
import { rotation, rotate } from './math.js';
export class Simulation {
  constructor() {
    this.dt=.004; this.motors=new Float64Array(4); this.wrench=new Float64Array(4);
    this.force=new Float64Array(3);this.torque=new Float64Array(3);this.point=new Float64Array(3);
    this.wind=new Float64Array(3);this.massScale=1;this.efficiency=1;
  }
  async init(xml,options={}) {
    this.mj=await loadMujoco(options);
    this.mj.FS.writeFile('/drone.xml',xml);
    this.model=this.mj.MjModel.from_xml_path('/drone.xml');
    this.data=new this.mj.MjData(this.model);this.body=this.model.body('drone').id;
    this.reset();return this;
  }
  reset() {
    this.mj.mj_resetData(this.model,this.data);
    this.massScale=1;this.efficiency=1;this.wind.fill(0);this.motors.fill(0);
    this.model.body_mass[this.body]=PARAMS.mass;
    this.mj.mj_setConst(this.model,this.data);
    this.mj.mj_forward(this.model,this.data);
  }
  get state() {return {p:this.data.qpos.subarray(0,3),q:this.data.qpos.subarray(3,7),v:this.data.qvel.subarray(0,3),omega:this.data.qvel.subarray(3,6)};}
  setMass(scale) {
    this.massScale=scale;this.model.body_mass[this.body]=PARAMS.mass*scale;
    this.mj.mj_setConst(this.model,this.data);
  }
  impulse(dv=[0,1.2,0]) {for(let i=0;i<3;i++)this.data.qvel[i]+=dv[i];}
  step() {
    const s=this.state,r=rotation(s.q),w=rotorWrench(this.motors,this.wrench,this.efficiency);
    rotate(r,[0,0,w[0]],this.force);rotate(r,w.subarray(1),this.torque);
    for(let i=0;i<3;i++) {this.force[i]+=this.wind[i]-PARAMS.mass*.12*s.v[i];this.point[i]=s.p[i];}
    this.data.qfrc_applied.fill(0);
    this.mj.mj_applyFT(this.model,this.data,this.force,this.torque,this.point,this.body,this.data.qfrc_applied);
    this.mj.mj_step(this.model,this.data);
    if(!this.data.qpos.every(Number.isFinite)||!this.data.qvel.every(Number.isFinite))throw new Error('Non-finite physics state. Reset to recover.');
  }
}
