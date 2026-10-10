import * as C from '../vendor/cannon-es.js';
import * as T from '../vendor/three.module.js';
import {LEVEL} from './level.js';
import {WIDTH,HEIGHT,frame,local,fits,crosses,transfer,rotation,transformBody,validPlacement} from './portal.js';
export const DT=1/120;
export class Simulation{
 constructor(){
  this.world=new C.World({gravity:new C.Vec3(0,-9.81,0)});this.world.solver.iterations=14;
  this.environmentMaterial=new C.Material("environment");this.playerMaterial=new C.Material("player");this.world.addContactMaterial(new C.ContactMaterial(this.playerMaterial,this.environmentMaterial,{friction:0,restitution:0}));
  this.world.defaultContactMaterial.friction=.35;this.world.defaultContactMaterial.restitution=0;
  this.statics=[];this.panelBodies=[];this.portals=[null,null];this.onPortal=()=>{};this.onEvent=()=>{};
  this.addStatic([0,-.2,-3.5],[12,.4,21],'floor');
  this.addStatic([0,4.6,-5],[12,.4,18],'ceiling');
  this.addStatic([-6.2,2.2,-5],[.4,4.4,18],'wall');this.addStatic([6.2,2.2,-5],[.4,4.4,18],'wall');
  this.addStatic([-2.8,2.2,4.2],[6.4,4.4,.4],'wall');
  this.addStatic([1.9,2.2,4.2],[3,4.4,.4],'wall');this.addStatic([5.8,2.2,4.2],[.4,4.4,.4],'wall');
  this.addStatic([4.4,3.8,4.2],[2,1.2,.4],'wall');
  this.addStatic([3.2,1.6,5.6],[.4,3.2,2.8],'wall');this.addStatic([5.6,1.6,5.6],[.4,3.2,2.8],'wall');
  this.addStatic([4.4,1.6,7],[2.8,3.2,.4],'wall');
  this.addStatic([0,2.2,-8.2],[3.6,4.4,.4],'glass');
  this.addStatic([-5.6,2.2,-8.2],[.8,4.4,.4],'wall');this.addStatic([5.6,2.2,-8.2],[.8,4.4,.4],'wall');
  this.addStatic([-4,2.2,-14.2],[4,4.4,.4],'wall');this.addStatic([4,2.2,-14.2],[4,4.4,.4],'wall');
  this.door=this.addStatic([4.4,1.5,4.2],[2,3,.4],'door');
  this.player=new C.Body({mass:75,material:this.playerMaterial,fixedRotation:true,linearDamping:.12,shape:new C.Box(new C.Vec3(.3,.89,.3))});
  this.cube=new C.Body({mass:9,linearDamping:.25,angularDamping:.65,shape:new C.Box(new C.Vec3(.4,.4,.4))});
  this.world.addBody(this.player);this.world.addBody(this.cube);this.reset();
 }
 addStatic(position,size,kind='panel',panel=null){
  const body=new C.Body({mass:0,material:this.environmentMaterial,shape:new C.Box(new C.Vec3(...size.map(x=>x/2)))});body.position.set(...position);this.world.addBody(body);
  const record={body,position,size,kind,panel};if(kind==='panel')this.panelBodies.push(record);else this.statics.push(record);return record;
 }
 rebuildPanels(){
  for(const r of this.panelBodies)this.world.removeBody(r.body);this.panelBodies=[];
  for(const panel of LEVEL.panels){
   const p=this.portals.find(p=>p?.panel===panel);const open=p && this.portals.every(Boolean);
   const z=panel.z-panel.normal[2]*.2;
   const part=(x,y,w,h)=>{if(w>.001&&h>.001)this.addStatic([x,y,z],[w,h,.4],'panel',panel);};
   if(!open){part(panel.x,panel.h/2,panel.w,panel.h);continue;}
   const left=panel.x-panel.w/2,right=panel.x+panel.w/2,pl=p.position.x-WIDTH/2,pr=p.position.x+WIDTH/2;
   part((left+pl)/2,panel.h/2,pl-left,panel.h);part((pr+right)/2,panel.h/2,right-pr,panel.h);
   part(p.position.x,(HEIGHT+panel.h)/2,WIDTH,panel.h-HEIGHT);
  }
  this.onPortal();
 }
 place(index,panel,x){
  if(!validPlacement(panel,x,this.portals[1-index]))return 'Portal needs to fit inside a white panel';
  // Closing a occupied aperture would trap a body: refuse relocation until clear.
  const old=this.portals[index];
  if(old && [this.player,this.cube].some(b=>{const p=local(old,b.position);return Math.abs(p.z)<.8&&fits(p,-.45,-.9);}))return 'Step away from the old portal first';
  const position=new T.Vector3(x,HEIGHT/2,panel.z),normal=new T.Vector3(...panel.normal);
  this.portals[index]={panel,position,normal,matrix:frame(position,normal)};this.rebuildPanels();this.onEvent('place');return null;
 }
 reset(){
  this.portals=[null,null];this.holding=false;this.activated=false;this.doorOpen=false;this.complete=false;this.time=0;this.yaw=0;this.pitch=0;this.crossings={player:0,cube:0};this.cooldown=new Map();
  for(const [body,position] of [[this.player,LEVEL.spawn],[this.cube,LEVEL.cube]]){
   body.position.set(...position);body.previousPosition.copy(body.position);body.interpolatedPosition.copy(body.position);body.velocity.setZero();body.angularVelocity.setZero();body.force.setZero();body.torque.setZero();body.quaternion.set(0,0,0,1);body.aabbNeedsUpdate=true;body.wakeUp();
  }
  this.door.body.collisionResponse=true;this.rebuildPanels();
 }
 eye(){return new T.Vector3().copy(this.player.position).add(new T.Vector3(0,.68,0));}
 direction(){return new T.Vector3(0,0,-1).applyEuler(new T.Euler(this.pitch,this.yaw,0,'YXZ'));}
 interact(){
  if(this.holding){this.holding=false;this.onEvent('drop');return true;}
  const v=new T.Vector3().copy(this.cube.position).sub(this.eye());
  if(v.length()<2.3&&v.normalize().dot(this.direction())>.65){this.holding=true;this.cube.wakeUp();this.onEvent('grab');return true;}return false;
 }
 step(input={x:0,z:0,jump:false}){
  if(this.complete)return;
  this.yaw+=(input.lookX||0)*1.6*DT;this.pitch=Math.max(-1.35,Math.min(1.35,this.pitch+(input.lookY||0)*1.3*DT));
  const previous=[this.player,this.cube].map(b=>new T.Vector3().copy(b.position));
  const dir=new T.Vector3(input.x||0,0,input.z||0);if(dir.length()>1)dir.normalize();dir.applyAxisAngle(new T.Vector3(0,1,0),this.yaw);
  const k=1-Math.exp(-12*DT);this.player.velocity.x+=(dir.x*3.6-this.player.velocity.x)*k;this.player.velocity.z+=(dir.z*3.6-this.player.velocity.z)*k;
  if(input.jump && this.player.position.y<.95)this.player.velocity.y=4;
  if(this.holding){
   let target=this.eye().addScaledVector(this.direction(),1.12);target.y=Math.max(.44,target.y);
   // A held cube can cross first. Continue its carry spring through the aperture
   // until the player follows, without a camera-only or kinematic teleport.
   if(this.portals.every(Boolean))for(let i=0;i<2;i++){
    const p=this.portals[i],a=local(p,this.eye()),b=local(p,target);
    if(a.z>0&&b.z<0&&fits(b,.41,.41)){const mapped=target.clone().applyMatrix4(transfer(p,this.portals[1-i]));if(mapped.distanceTo(this.cube.position)<target.distanceTo(this.cube.position))target=mapped;}
   }
   const delta=target.sub(new T.Vector3().copy(this.cube.position));
   if(delta.length()>5)this.holding=false;
   else {delta.multiplyScalar(190);delta.addScaledVector(new T.Vector3().copy(this.cube.velocity),-30);delta.y+=9.81;
    const force=delta.multiplyScalar(this.cube.mass);if(force.length()>1800)force.setLength(1800);this.cube.applyForce(new C.Vec3(force.x,force.y,force.z));}
  }
  this.world.step(DT);this.time+=DT;
  if(this.portals.every(Boolean))for(const [bi,body] of [this.player,this.cube].entries()){
   if((this.cooldown.get(body)||0)>this.time)continue;
   for(let i=0;i<2;i++){
    const a=this.portals[i],b=this.portals[1-i];
    if(!crosses(a,previous[bi],body.position,bi===0?.3:.4,bi===0?.88:.4))continue;
    const m=transfer(a,b);transformBody(body,m);body.position.vadd(new C.Vec3(b.normal.x*.035,0,b.normal.z*.035),body.position);
    this.cooldown.set(body,this.time+.16);this.crossings[bi===0?'player':'cube']++;
    if(bi===0){const direction=this.direction().applyQuaternion(rotation(m));this.yaw=Math.atan2(-direction.x,-direction.z);}
    this.onEvent('teleport');break;
   }
  }
  const c=this.cube.position;this.activated=!this.holding&&Math.abs(c.x-LEVEL.plate[0])<.72&&Math.abs(c.z-LEVEL.plate[2])<.72&&c.y<.75;
  if(this.activated!==this.doorOpen){this.doorOpen=this.activated;this.door.body.collisionResponse=!this.doorOpen;this.onEvent('door');}
  if(this.doorOpen&&this.player.position.z>4.7&&this.player.position.x>3.4&&this.player.position.x<5.4){this.complete=true;this.onEvent('complete');}
 }
 state(){return {time:this.time,player:[...this.player.position.toArray()],cube:[...this.cube.position.toArray()],yaw:this.yaw,pitch:this.pitch,holding:this.holding,doorOpen:this.doorOpen,complete:this.complete,portals:this.portals.map(p=>p&&{panel:p.panel.id,x:p.position.x}),crossings:{...this.crossings}};}
}
