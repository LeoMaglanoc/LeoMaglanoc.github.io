import {gateCrossing} from './course.js';
export class Race {
  constructor(course){this.course=course;this.reset();}
  reset(){this.gate=0;this.time=0;this.finishTime=null;this.collisions=0;this.touching=false;this.previous=[...this.course.start];this.crossings=[];}
  update(p,time,contact=false) {
    if(this.finishTime!==null)return;
    this.time=time;
    if(contact&&!this.touching)this.collisions++;this.touching=contact;
    const center=this.course.gates[this.gate];
    if(center&&gateCrossing(this.previous,p,center,this.course.opening,this.course.droneRadius)){
      // Record time at plane intersection, not at the end of the physics step.
      const u=(center[0]-this.previous[0])/(p[0]-this.previous[0]);
      this.crossings.push(time-.004+u*.004);this.gate++;
      if(this.gate===this.course.gates.length)this.finishTime=this.crossings.at(-1);
    }
    this.previous.splice(0,3,...p);
  }
}
