import {Simulation,DT} from './simulation.js';
import {View} from './view.js';
import {Input} from './input.js';
const $=id=>document.querySelector(`#${id}`),canvas=$('game');
let sim,view,input,started=false,sound=false,audio,message='',messageUntil=0;
const format=t=>`${String(Math.floor(t/60)).padStart(2,'0')}:${String(Math.floor(t%60)).padStart(2,'0')}`;
function tone(event){if(!sound)return;audio||=new (window.AudioContext||window.webkitAudioContext)();audio.resume();const o=audio.createOscillator(),g=audio.createGain();o.connect(g);g.connect(audio.destination);o.frequency.value=({place:480,teleport:180,grab:320,drop:260,door:660,complete:880})[event]||300;g.gain.setValueAtTime(.045,audio.currentTime);g.gain.exponentialRampToValueAtTime(.001,audio.currentTime+.22);o.start();o.stop(audio.currentTime+.23);}
function notify(text){message=text;messageUntil=performance.now()+2200;}
function start(reset=false){if(reset){sim.reset();input.clear();}started=true;input.active=true;$('overlay').hidden=true;$('complete').hidden=true;if(!matchMedia('(pointer:coarse)').matches)canvas.requestPointerLock()?.catch(()=>notify('Click the chamber to enable mouse look'));}
try{
 sim=new Simulation();view=new View(canvas,sim);sim.onPortal=()=>view.rebuild();
 sim.onEvent=event=>{tone(event);if(event==='complete'){$('elapsed').textContent=format(sim.time);$('complete').hidden=false;input.active=false;document.exitPointerLock?.();input.clear();}if(event==='grab')notify('Cube secured · E / GRAB to drop');};
 const shoot=index=>{const hit=view.aim();if(!hit){notify('Aim at a white wall panel');return;}const error=sim.place(index,hit.panel,hit.point.x);notify(error||`${index===0?'Blue':'Orange'} connection placed`);};
 input=new Input(canvas,sim,{shoot,interact:()=>{if(!sim.interact())notify('Look at the cube and move closer');},start});
 $('start').onclick=()=>start();$('reset').onclick=()=>start(true);$('replay').onclick=()=>start(true);
 $('sound').onclick=()=>{sound=!sound;$('sound').setAttribute('aria-pressed',String(sound));$('sound').setAttribute('aria-label',sound?'Disable sound':'Enable sound');if(sound)tone('place');};
 $('help').onclick=()=>{input.active=false;input.clear();document.exitPointerLock?.();$('overlay').hidden=false;$('start').innerHTML='Resume chamber <span>→</span>';};
 canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();input.active=false;notify('Graphics context lost · reload to resume');$('prompt').textContent='Graphics context lost · reload to resume';});
 let last=performance.now(),acc=0,frames=0,since=last,fps=0;
 function loop(now){const delta=Math.min((now-last)/1000,.1);last=now;if(started&&input.active&&!document.hidden){acc+=delta;let steps=0;while(acc>=DT&&steps++<12){sim.step(input.read());acc-=DT;}}else acc=0;
  view.render();frames++;if(now-since>1000){fps=frames*1000/(now-since);frames=0;since=now;}
  $('timer').textContent=format(sim.time);for(const [i,id] of ['blueStatus','orangeStatus'].entries())$(id).classList.toggle('active',!!sim.portals[i]);
  if(now<messageUntil)$('prompt').textContent=message;else if(sim.holding)$('prompt').textContent='E / GRAB to release cube';else {const near=sim.cube.position.distanceTo(sim.player.position)<2.3;$('prompt').textContent=near?'E / GRAB · pick up cube':sim.doorOpen?'Exit powered · follow the green line':'';}
  $('interact').textContent=sim.holding?'DROP':'GRAB';requestAnimationFrame(loop);
 }
 // Test-only inspection: ordinary public URLs expose no scene mutation API.
 if(new URLSearchParams(location.search).get('debug')==='1')window.portalLab={sim,view,input,start,state:()=>({...sim.state(),fps,renderer:view.renderer.info.render,portalResolution:[view.targets[0].width,view.targets[0].height]})};
 requestAnimationFrame(loop);
}catch(e){$('overlay').hidden=true;$('prompt').textContent='WebGL could not start. Try reloading with graphics acceleration enabled.';console.error(e);}
