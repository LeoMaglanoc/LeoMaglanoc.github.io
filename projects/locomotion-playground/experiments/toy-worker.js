import {loadCasadi} from '../mpc/load-casadi.js';
self.onmessage=async()=>{
 try {
  const ca=await loadCasadi();
  // One-stage toy optimal-control problem: x0=0, x1=x0+u, minimize
  // (x1-1)^2+.01*u^2, with |u|<=2. Fatrop's structure detection is exercised.
  const x0=ca.SX.sym('x0'),u=ca.SX.sym('u'),x1=ca.SX.sym('x1');
  const w=ca.vcat([x0,u,x1]),err=ca.minus(x1,ca.SX(1));
  const nlp={x:w,f:ca.plus(ca.times(err,err),ca.times(ca.SX(.01),ca.times(u,u))),g:ca.vcat([x0,ca.minus(x1,ca.plus(x0,u))])};
  const solver=ca.nlpsol('toy','fatrop',nlp,{structure_detection:'auto',equality:[true,true],fatrop:{print_level:0,tol:1e-7},print_time:false});
  const times=[],solutions=[];let warm=ca.DM([0,0,0]);
  for(let i=0;i<3;i++) {const start=performance.now();const sol=solver.call({x0:warm,lbg:ca.DM([0,0]),ubg:ca.DM([0,0]),lbx:ca.DM([-10,-2,-10]),ubx:ca.DM([10,2,10])});times.push(performance.now()-start);solutions.push(sol.x.nonzeros());warm=sol.x;}
  self.postMessage({ok:true,times,solutions});
 }catch(e){self.postMessage({ok:false,error:e.message});}
};
