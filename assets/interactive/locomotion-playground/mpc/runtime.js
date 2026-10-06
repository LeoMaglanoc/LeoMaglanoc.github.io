import {loadCasadi} from './load-casadi.js?v=3';
export class NativeMPCRuntime {
  async init(backend='ipopt') {
    if(!['ipopt','fatrop'].includes(backend))throw new Error('Unknown MPC backend');
    this.backend=backend;
    this.config=await (await fetch(new URL('./deployment.json',import.meta.url))).json();
    if(!(this.config.mass>0))throw new Error('MPC model mass was not initialized');
    this.ca=await loadCasadi(backend);
    const load=async name=>{const r=await fetch(new URL(`./${name}.casadi.gz`,import.meta.url));if(!r.ok)throw new Error(`MPC graph ${name}: ${r.status}`);const stream=r.body.pipeThrough(new DecompressionStream('gzip'));return this.ca.Function.deserialize(await new Response(stream).text());};
    [this.nlp,this.pack,this.bounds,this.decode]=await Promise.all(['nlp','pack','bounds','decode'].map(load));
    if(backend==='fatrop')this.solver=this.ca.nlpsol('whole_body','fatrop',this.nlp,{expand:true,structure_detection:'auto',equality:this.config.equality,print_time:false,fatrop:{print_level:0,max_iter:200,tol:1e-3,mu_init:1e-4,bound_push:1e-7}});
    if(backend==='ipopt')this.feedbackSolver=this.ca.nlpsol('whole_body_feedback','ipopt',this.nlp,{expand:true,print_time:false,ipopt:{print_level:0,max_iter:200,tol:1e-5,mu_init:1e-4,bound_push:1e-7,sb:'yes'}});
    const fixture=await (await fetch(new URL('./native-fixture.json',import.meta.url))).json();
    this.seed=Float64Array.from(fixture.solution);this.seeds=await (await fetch(new URL('./seeds.json',import.meta.url))).json();this.previous=null;
  }
  reset(){this.previous=null;}
  solve({q,v,time=0,command=[.1,0,0],gait='trot',armVelocity,backend=this.backend}) {
    if(q.length!==23 || v.length!==22 || ![...q,...v,...command,time].every(Number.isFinite))throw new Error('Invalid MPC input state');
    if(backend!==this.backend)throw new Error('Solver backend differs from worker initialization');
    const solver=backend==='ipopt'?this.feedbackSolver:this.solver,solverName=backend==='ipopt'?'IPOPT':'Fatrop';
    const c=this.config,input=Float64Array.from(c.initial),part=i=>c.inputs[i].offset;
    input.set([...q,...v],part(0));if(armVelocity)input.set(armVelocity,part(12));input.set([command[0],command[1],0,0,0,command[2]],part(11));
    const contacts=[],swing=[];let t=time;
    const n=gait==='stand'?4:gait==='walk'?3:2,period=c.gait_period,swingPeriod=period*(gait==='walk'?.25:gait==='trot'?.5:1);
    for(let i=0;i<14;i++) {
      const phase=((t%period)+period)%period/period,sp=((t%swingPeriod)+swingPeriod)%swingPeriod/swingPeriod;
      const stance=[1,1,1,1],phases=[0,0,0,0];
      const indices=gait==='stand'?[]:gait==='walk'?[[1],[2],[0],[3]][Math.floor(phase*4)]:phase<.5?[0,3]:[1,2];
      for(const j of indices){stance[j]=0;phases[j]=sp;}
      contacts.push(...stance);swing.push(...phases);t+=c.dt[i];
    }
    input.set(contacts,part(3));input.set(swing,part(4));input[part(5)]=n;input[part(6)]=swingPeriod;
    input.set(this.previous||(backend==='ipopt'?this.seeds[gait].solution:this.seed),part(14));
    // Retain a feasible primal guess; zero forces at newly swinging feet.
    // IPOPT handles measured feedback reliably in this WASM distribution;
    // Fatrop remains available for the unchanged numerical transfer fixture.
    for(let node=0,offset=part(14);node<14;node++) {
      const forces=offset+44+22;
      for(let foot=0;foot<4;foot++)if(!contacts[node*4+foot])input.fill(0,forces+foot*3,forces+foot*3+3);
      offset+=44+(node<3?53:37);
    }
    const ca=this.ca,owned=[];
    const dm=values=>{const m=ca.DM(Array.from(values));owned.push(m);return m;};
    let solution,out,solveTimeMs;
    try {
      const params=c.inputs.slice(0,14).map((x,i)=>{
        const m=dm(input.slice(x.offset,x.offset+x.size));
        if(i===3 || i===4){const shaped=ca.reshape(m,4,14);owned.push(shaped);return shaped;}return m;
      });
      const p=this.pack.call(params)[0];owned.push(p);
      const [lb,ub]=this.bounds.call([p]);owned.push(lb,ub);
      const start=performance.now();const sol=solver.call({p,x0:dm(input.slice(part(14))),lbg:lb,ubg:ub});solveTimeMs=performance.now()-start;
      owned.push(...Object.values(sol));solution=Float64Array.from(sol.x.elements());
      const decoded=this.decode.call([sol.x,...params])[0];owned.push(decoded);out=Float64Array.from(decoded.elements());
    }finally{for(const object of owned)object.delete?.();}
    if(!out.every(Number.isFinite))throw new Error('Fatrop produced nonfinite output');
    const violation=out.at(-1);if(violation>1e-3)throw new Error(`Rejected infeasible ${solverName} MPC solution (violation ${violation.toExponential(2)})`);
    this.previous=solution;
    return {solver:solverName,torque:Array.from(out.slice(675,691)),qPrediction:Array.from({length:15},(_,i)=>Array.from(out.slice(i*23,(i+1)*23))),vPrediction:Array.from({length:15},(_,i)=>Array.from(out.slice(345+i*22,345+(i+1)*22))),forcesPrediction:Array.from(out.slice(691,706)),solveTimeMs,constraintViolation:violation,contacts:contacts.slice(0,4),time};
  }
}
