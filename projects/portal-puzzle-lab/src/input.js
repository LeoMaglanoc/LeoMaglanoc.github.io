export class Input{
 constructor(canvas,sim,{shoot,interact,start}){
  this.keys=new Set();this.stick={x:0,z:0};this.active=false;this.sim=sim;
  const look=(x,y)=>{if(!this.active)return;sim.yaw-=x*.0035;sim.pitch=Math.max(-1.35,Math.min(1.35,sim.pitch-y*.0035));};
  addEventListener('keydown',e=>{if(e.target.closest('input,textarea'))return;if(['KeyW','KeyA','KeyS','KeyD','Space','KeyE','KeyR','ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.code))e.preventDefault();this.keys.add(e.code);if(e.repeat)return;if(e.code==='KeyE'&&this.active)interact();if(e.code==='KeyR')start(true);});
  addEventListener('keyup',e=>this.keys.delete(e.code));
  addEventListener('blur',()=>this.clear());document.addEventListener('visibilitychange',()=>{if(document.hidden)this.clear();});
  document.addEventListener('pointerlockchange',()=>{this.keys.clear();if(!document.pointerLockElement&&this.active&&!matchMedia('(pointer:coarse)').matches)document.querySelector('#prompt').textContent='Click the chamber to resume looking';});
  document.addEventListener('mousemove',e=>{if(document.pointerLockElement===canvas)look(e.movementX,e.movementY);});
  canvas.addEventListener('contextmenu',e=>e.preventDefault());
  canvas.addEventListener('pointerdown',e=>{if(!this.active||e.pointerType==='touch')return;if(document.pointerLockElement!==canvas){canvas.requestPointerLock()?.catch(()=>{});return;}shoot(e.button===2?1:0);});
  for(const [id,index] of [['blue',0],['orange',1]])document.querySelector(`#${id}`).addEventListener('pointerdown',e=>{e.preventDefault();if(this.active)shoot(index);});
  document.querySelector('#interact').addEventListener('pointerdown',e=>{e.preventDefault();if(this.active)interact();});
  const stick=document.querySelector('#stick'),knob=document.querySelector('#knob');let moveId=null;
  const move=e=>{const r=stick.getBoundingClientRect();let x=(e.clientX-r.x-r.width/2)/42,y=(e.clientY-r.y-r.height/2)/42;const d=Math.hypot(x,y);if(d>1){x/=d;y/=d;}this.stick={x,z:y};knob.style.transform=`translate(${x*34}px,${y*34}px)`;};
  stick.addEventListener('pointerdown',e=>{e.preventDefault();if(moveId!==null)return;moveId=e.pointerId;stick.setPointerCapture(moveId);move(e);});
  stick.addEventListener('pointermove',e=>{if(e.pointerId===moveId)move(e);});
  const release=e=>{if(e.pointerId!==moveId)return;moveId=null;this.stick={x:0,z:0};knob.style.transform='';};
  for(const type of ['pointerup','pointercancel','lostpointercapture'])stick.addEventListener(type,release);
  const zone=document.querySelector('#look');let lookId=null,last;
  zone.addEventListener('pointerdown',e=>{if(lookId!==null)return;lookId=e.pointerId;last=[e.clientX,e.clientY];zone.setPointerCapture(lookId);});
  zone.addEventListener('pointermove',e=>{if(e.pointerId!==lookId)return;look(e.clientX-last[0],e.clientY-last[1]);last=[e.clientX,e.clientY];});
  for(const type of ['pointerup','pointercancel','lostpointercapture'])zone.addEventListener(type,e=>{if(e.pointerId===lookId)lookId=null;});
 }
 clear(){this.keys.clear();this.stick={x:0,z:0};document.querySelector('#knob').style.transform='';}
 read(){return {lookX:(this.keys.has('ArrowLeft')?1:0)-(this.keys.has('ArrowRight')?1:0),lookY:(this.keys.has('ArrowUp')?1:0)-(this.keys.has('ArrowDown')?1:0),x:this.stick.x+(this.keys.has('KeyD')?1:0)-(this.keys.has('KeyA')?1:0),z:this.stick.z+(this.keys.has('KeyS')?1:0)-(this.keys.has('KeyW')?1:0),jump:this.keys.has('Space')};}
}
