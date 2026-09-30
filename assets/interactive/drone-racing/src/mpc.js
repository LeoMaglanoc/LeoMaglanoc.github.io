import {clamp} from './math.js';
export class TrackingMPC {
  constructor({horizon=18,dt=.04,iterations=32}={}) {
    this.n=horizon;this.dt=dt;this.iterations=iterations;
    this.u=new Float64Array(horizon*3);this.gradient=new Float64Array(horizon*3);
    this.positions=new Float64Array((horizon+1)*3);this.velocities=new Float64Array((horizon+1)*3);
    this.references=Array.from({length:horizon},()=>({p:[0,0,0],v:[0,0,0],a:[0,0,0],yaw:0}));
    this.last=new Float64Array(3);this.output=new Float64Array(3);this.times=[];this.lastSolve=0;this.reset();
  }
  reset(){this.u.fill(0);this.last.fill(0);this.output.fill(0);this.times.length=0;this.lastSolve=0;this.positions.fill(0);this.velocities.fill(0);}
  rollout(state) {
    this.positions.set(state.p);this.velocities.set(state.v);
    for(let k=0;k<this.n;k++)for(let j=0;j<3;j++){
      const i=k*3+j;this.positions[i+3]=this.positions[i]+this.dt*this.velocities[i];
      this.velocities[i+3]=this.velocities[i]+this.dt*this.u[i];
    }
  }
  // Position/velocity tracking + feed-forward effort + adjacent control-rate penalties.
  cost(state,withGradient=false) {
    this.rollout(state);let value=0;if(withGradient)this.gradient.fill(0);
    for(let j=0;j<3;j++) {
      let lp=0,lv=0;
      for(let k=this.n-1;k>=0;k--) {
        const i=k*3+j,ref=this.references[k],weight=k===this.n-1?3:1;
        const ep=this.positions[i+3]-ref.p[j],ev=this.velocities[i+3]-ref.v[j];
        const eu=this.u[i]-ref.a[j],du=this.u[i]-(k===0?this.last[j]:this.u[i-3]);
        value+=weight*(16*ep*ep+4*ev*ev)+.08*eu*eu+.1*du*du;
        lp+=2*weight*16*ep;lv+=2*weight*4*ev;
        if(withGradient){
          this.gradient[i]+=this.dt*lv+.16*eu+.2*du;
          if(k>0)this.gradient[i-3]-=.2*du;
        }
        lv+=this.dt*lp;
      }
    }
    return value;
  }
  solve(state,trajectory,time) {
    const start=performance.now();
    // Prediction spacing equals solve cadence, so shift exactly one sample.
    this.u.copyWithin(0,3);this.u.set(this.u.subarray((this.n-2)*3,(this.n-1)*3),(this.n-1)*3);
    for(let k=0;k<this.n;k++)trajectory.sample(time+(k+1)*this.dt,this.references[k]);
    this.initialCost=this.cost(state);
    for(let iteration=0;iteration<this.iterations;iteration++) {
      this.cost(state,true);
      for(let i=0;i<this.u.length;i++)this.u[i]=clamp(this.u[i]-.18*this.gradient[i],i%3===2?-5:-6,i%3===2?6:6);
    }
    this.finalCost=this.cost(state);this.output.set(this.u.subarray(0,3));this.last.set(this.output);
    this.lastSolve=performance.now()-start;this.times.push(this.lastSolve);
    if(this.times.length>1500)this.times.shift();return this.output;
  }
  timing(){const a=[...this.times].sort((x,y)=>x-y);return {last:this.lastSolve,average:a.length?a.reduce((x,y)=>x+y,0)/a.length:0,p95:a.length?a[Math.min(a.length-1,Math.floor(a.length*.95))]:0};}
}
