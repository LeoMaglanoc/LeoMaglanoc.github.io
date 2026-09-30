// MuJoCo: right-handed world Z up; quaternions w,x,y,z; body X forward, Y left.
export const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
export const dot = (a,b) => a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
export const cross = (a,b) => [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
export const normalize = a => { const n=Math.hypot(...a)||1; return a.map(x=>x/n); };
export function rotation(q) {
  const [w,x,y,z]=q;
  return [1-2*(y*y+z*z),2*(x*y-w*z),2*(x*z+w*y),2*(x*y+w*z),1-2*(x*x+z*z),2*(y*z-w*x),2*(x*z-w*y),2*(y*z+w*x),1-2*(x*x+y*y)];
}
export function rotate(r,v,out=[0,0,0]) {
  for(let i=0;i<3;i++) out[i]=r[3*i]*v[0]+r[3*i+1]*v[1]+r[3*i+2]*v[2];
  return out;
}
export const yawOf = q => Math.atan2(2*(q[0]*q[3]+q[1]*q[2]),1-2*(q[2]*q[2]+q[3]*q[3]));
export const angleDifference = (a,b) => Math.atan2(Math.sin(a-b),Math.cos(a-b));
