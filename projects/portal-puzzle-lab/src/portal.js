import * as T from '../vendor/three.module.js';
// Adapted from efyang/portal-0.5 Portal.js: change from upstream Y-normal
// basis to conventional local +Z normal; the half turn is consequently about Y.
export const WIDTH=1.9, HEIGHT=2.8;
const flip=new T.Matrix4().makeRotationY(Math.PI);
export function frame(position,normal){
 const z=normal.clone().normalize(),y=new T.Vector3(0,1,0),x=y.clone().cross(z);
 return new T.Matrix4().makeBasis(x,y,z).setPosition(position);
}
export function transfer(a,b){return b.matrix.clone().multiply(flip).multiply(a.matrix.clone().invert());}
export function local(portal,position){return new T.Vector3().copy(position).applyMatrix4(portal.matrix.clone().invert());}
export function fits(p,halfX=0,halfY=0){return Math.abs(p.x)<=WIDTH/2-halfX && Math.abs(p.y)<=HEIGHT/2-halfY;}
export function crosses(portal,before,after,halfX=0,halfY=0){
 const a=local(portal,before),b=local(portal,after);
 if(a.z<=0 || b.z>0)return false;
 const t=a.z/(a.z-b.z);return fits(a.lerp(b,t),halfX,halfY);
}
export function rotation(matrix){return new T.Quaternion().setFromRotationMatrix(matrix);}
export function transformBody(body,matrix){
 const q=rotation(matrix);
 for(const key of ['position','previousPosition','interpolatedPosition'])body[key].copy(new T.Vector3().copy(body[key]).applyMatrix4(matrix));
 for(const key of ['velocity','angularVelocity','force','torque'])body[key].copy(new T.Vector3().copy(body[key]).applyQuaternion(q));
 body.quaternion.copy(new T.Quaternion().copy(body.quaternion).premultiply(q));
 body.previousQuaternion.copy(body.quaternion);body.interpolatedQuaternion.copy(body.quaternion);
 body.aabbNeedsUpdate=true;body.wakeUp();
}
export function validPlacement(panel,x,other){
 return Math.abs(x-panel.x)+WIDTH/2+.12<=panel.w/2 && !(other && other.panel===panel && Math.abs(other.position.x-x)<WIDTH+.2);
}
