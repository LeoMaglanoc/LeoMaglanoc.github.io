export function validateRollout(rollout, map) {
  const {metadata:m,frames} = rollout;
  if (m?.robot !== 'B2+Z1' || m.nq !== 23 || m.nv !== 22 || !frames?.length) throw new Error('Unexpected MPC robot/state contract');
  const names = map.mapping.map(x=>x.name);
  if (names.length !== 16 || new Set(names).size !== 16 || new Set(map.mapping.map(x=>x.mj_q)).size !== 16 || new Set(map.mapping.map(x=>x.actuator)).size !== 16) throw new Error('Incomplete or duplicate joint mapping');
  if (m.joints.length!==16 || m.joints.some((name,i)=>name !== map.pinocchio_joint_order[i])) throw new Error('Native joint ordering changed');
  let previous = -Infinity;
  for (const f of frames) {
    for (const [key,size] of [['q',23],['v',22],['tau',16],['contact_forces',15],['contact_schedule',4]]) if (f[key]?.length !== size || !f[key].every(Number.isFinite)) throw new Error(`Invalid ${key} frame`);
    if (!Number.isFinite(f.t) || f.t <= previous || f.prediction?.length!==15 || !f.prediction?.every(q=>q.length===23 && q.every(Number.isFinite))) throw new Error('Invalid MPC time or horizon');
    previous=f.t;
  }
  return rollout;
}
export function writeQ(q, target, map) {
  target.set(q.slice(0,3),0);
  target.set([q[6],q[3],q[4],q[5]],3);
  for (const j of map.mapping) target[j.mj_q] = q[j.pin_q];
}
export function rotateVector(q, v, inverse=false) {
  const [x,y,z,w] = inverse ? [-q[3],-q[4],-q[5],q[6]] : q.slice(3,7);
  const tx=2*(y*v[2]-z*v[1]),ty=2*(z*v[0]-x*v[2]),tz=2*(x*v[1]-y*v[0]);
  return [v[0]+w*tx+y*tz-z*ty,v[1]+w*ty+z*tx-x*tz,v[2]+w*tz+x*ty-y*tx];
}
export function writeV(q,v,target,map) {
  target.set(rotateVector(q,v.slice(0,3)),0);target.set(v.slice(3,6),3);
  for (const j of map.mapping) target[j.mj_v]=v[j.pin_v];
}
export function interpolateQ(a,b,t) {
  const q=a.map((v,i)=>v+(b[i]-v)*t);
  let dot=0; for(let i=3;i<7;i++) dot+=a[i]*b[i];
  let norm=0; for(let i=3;i<7;i++){q[i]=a[i]*(1-t)+b[i]*t*(dot<0?-1:1);norm+=q[i]*q[i];}
  norm=Math.sqrt(norm);for(let i=3;i<7;i++) q[i]/=norm;
  return q;
}
