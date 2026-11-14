import * as P from '../vendor/planck.mjs';
export const DT=1/120, SUBSTEPS=12, ACTION_SCALE=.48, RADIUS=.23;
export const PARTS=[[-1.2,-1.05,1.2,-.4],[-.325,-.4,.325,1.05]];
export const clip=(x,l,h)=>Math.max(l,Math.min(h,x));
export function rng(seed=1){let s=seed>>>0;return()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296;};}
export function createScene(seed=1,difficulty='easy') {
  const random=rng(seed),world=new P.World({gravity:P.Vec2(0,0)});
  const walls=world.createBody();
  for(const [x,y,w,h] of [[5,-.1,5,.1],[5,10.1,5,.1],[-.1,5,.1,5],[10.1,5,.1,5]])walls.createFixture(P.Box(w,h,P.Vec2(x,y)),{friction:.3});
  const angle=difficulty==='easy'?(random()-.5)*.4:(random()-.5)*Math.PI*2;
  const x=4+(random()-.5)*1.6,y=5+(random()-.5)*1.6;
  const block=world.createDynamicBody({position:P.Vec2(x,y),angle,linearDamping:6,angularDamping:6,allowSleep:false});
  for(const [x0,y0,x1,y1] of PARTS)block.createFixture(P.Box((x1-x0)/2,(y1-y0)/2,P.Vec2((x0+x1)/2,(y0+y1)/2)),{density:1,friction:.35,restitution:0});
  const pusher=world.createKinematicBody({position:P.Vec2(x-1.6,y-.7),allowSleep:false});
  pusher.createFixture(P.Circle(RADIUS),{friction:.25,restitution:0});
  let contacts=0,lastActionContact=false;
  world.on('begin-contact',c=>{const a=c.getFixtureA().getBody(),b=c.getFixtureB().getBody();if((a===block&&b===pusher)||(b===block&&a===pusher))contacts++;});
  let goal={x:x+.65+random()*.35,y:y+(random()-.5)*.3,angle:angle+(random()-.5)*.12};
  if(difficulty==='medium')goal={x:clip(x+(random()-.5)*3,2,8),y:clip(y+(random()-.5)*3,2,8),angle:angle+(random()-.5)*1.6};
  if(difficulty==='challenge')goal={x:2+random()*6,y:2+random()*6,angle:(random()-.5)*Math.PI*2};
  function state(){const b=block.getPosition(),p=pusher.getPosition(),v=block.getLinearVelocity();return {object:{x:b.x,y:b.y,angle:block.getAngle()},agent:{x:p.x,y:p.y},velocity:[v.x,v.y,block.getAngularVelocity()],contacts,lastActionContact};}
  function step(action){lastActionContact=false;const start=pusher.getPosition(),tx=clip(start.x+clip(action[0],-1,1)*ACTION_SCALE,RADIUS,10-RADIUS),ty=clip(start.y+clip(action[1],-1,1)*ACTION_SCALE,RADIUS,10-RADIUS);for(let i=0;i<SUBSTEPS;i++){const p=pusher.getPosition();pusher.setLinearVelocity(P.Vec2((tx-p.x)/((SUBSTEPS-i)*DT),(ty-p.y)/((SUBSTEPS-i)*DT)));world.step(DT,8,3);for(let c=world.getContactList();c;c=c.getNext()){const a=c.getFixtureA().getBody(),b=c.getFixtureB().getBody();if(c.isTouching()&&((a===block&&b===pusher)||(b===block&&a===pusher)))lastActionContact=true;}}pusher.setLinearVelocity(P.Vec2());return state();}
  function disturb(which,x,y){const body=which==='object'?block:pusher;body.setPosition(P.Vec2(clip(x,1.4,8.6),clip(y,1.4,8.6)));body.setLinearVelocity(P.Vec2());body.setAngularVelocity(0);}
  return {world,block,pusher,goal,state,step,disturb};
}
export function corners(pose,part){const c=Math.cos(pose.angle),s=Math.sin(pose.angle);return [[part[0],part[1]],[part[2],part[1]],[part[2],part[3]],[part[0],part[3]]].map(([x,y])=>[pose.x+c*x-s*y,pose.y+s*x+c*y]);}
function area(poly){return Math.abs(poly.reduce((a,p,i)=>{const q=poly[(i+1)%poly.length];return a+p[0]*q[1]-p[1]*q[0];},0))/2;}
function intersect(subject,boundary){let out=subject;for(let i=0;i<boundary.length;i++){const a=boundary[i],b=boundary[(i+1)%boundary.length],cross=p=>(b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0]);const input=out;out=[];for(let j=0;j<input.length;j++){const p=input[j],q=input[(j+1)%input.length],cp=cross(p),cq=cross(q);if(cp>=0)out.push(p);if((cp>=0)!==(cq>=0)){const t=cp/(cp-cq);out.push([p[0]+t*(q[0]-p[0]),p[1]+t*(q[1]-p[1])]);}}}return area(out);}
export function coverage(object,goal){let overlap=0;for(const a of PARTS)for(const b of PARTS)overlap+=intersect(corners(object,a),corners(goal,b));return clip(overlap/2.5025,0,1);}
