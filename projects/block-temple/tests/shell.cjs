process.chdir(require('node:path').resolve(__dirname,'..'));
const vm = require('node:vm'), fs = require('node:fs'), assert = require('node:assert/strict');
class Element {
 constructor(id='') { this.id=id; this.hidden=false; this.style={}; this.attrs={}; this.children=[]; this.events={}; this.classList={add(){},toggle(){},contains(){return false;}}; }
 addEventListener(name, fn) { (this.events[name]??=[]).push(fn); }
 emit(name, data={}) { for(const fn of this.events[name]||[]) fn({preventDefault(){},...data}); }
 setAttribute(name,v) {this.attrs[name]=v;} append(v) {this.children.push(v);} setPointerCapture(){} focus(){} querySelector(selector){ if(selector==='[data-flex]') return this.children.find(c=>c.attrs?.flex); return new Element(); } getContext(){return null;} get dataset(){return this.attrs;}
}
const html=fs.readFileSync('godot/web_shell.html','utf8');
const elements=new Map([...html.matchAll(/id="([\w-]+)"/g)].map(m=>[m[1],new Element(m[1])]));
for(const [id,e] of elements) e.hidden=new RegExp(`id="${id}"[^>]*\\bhidden\\b`).test(html);
const document=new Element(); document.getElementById=id=>elements.get(id); document.createElement=()=>new Element(); document.createTextNode=s=>s; document.body=new Element(); document.querySelectorAll=()=>[...elements.values()].flatMap(e=>e.children).filter(e=>e.attrs?.block); document.exitPointerLock=()=>{};
let store = new Map([['robot-world-v1','preserved']]);
const timers=new Map(); let tid=0;
const sandbox={document,console,URLSearchParams,location:{search:'?debug=1'},matchMedia:q=>({matches:q.includes('pointer:coarse')}),localStorage:{getItem:k=>store.get(k),setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)},Engine:class {async startGame(){}},setTimeout:fn=>{timers.set(++tid,fn);return tid;},clearTimeout:id=>timers.delete(id)};
sandbox.window=new Element(); sandbox.window.innerWidth=844; sandbox.window.innerHeight=390; sandbox.screen={orientation:{lock:async()=>{}}};
vm.createContext(sandbox);
let script=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].at(-1)[1].replace('$GODOT_CONFIG','{}'); vm.runInContext(script,sandbox);
let checks=0; const check=(x,label)=>{assert(x,label);checks++;};
const el=id=>elements.get(id), consume=()=>JSON.parse(sandbox.window.templeConsume());
sandbox.window.templeUpdate({loading:false,selected:1,position:[66,4,103],yaw:0}); el('play').onclick();
check(consume().active,'game enters through production menu'); check(consume().quality===.55,'touch defaults to Eco');
check(el('canvas').width===464 && el('canvas').height===215,'Eco physically lowers framebuffer pixels'); el('quality').onclick(); check(el('canvas').width===844 && el('canvas').height===390,'desktop restores framebuffer detail'); el('quality').onclick();
el('movezone').emit('pointerdown',{pointerId:1,clientX:80,clientY:220}); el('movezone').emit('pointermove',{pointerId:1,clientX:80,clientY:180});
el('canvas').emit('pointerdown',{pointerId:2,pointerType:'touch',clientX:570,clientY:150}); el('canvas').emit('pointermove',{pointerId:2,pointerType:'touch',clientX:610,clientY:180});
let v=consume();check(v.z===-1 && v.lookX===40 && v.lookY===30,'simultaneous joystick and camera drag');
check(consume().lookX===0,'look deltas consumed once');
el('jump').emit('pointerdown',{pointerId:3});check(consume().jump,'third touch requests jump');check(!consume().jump,'jump consumed once');
el('break').emit('pointerdown',{pointerId:3});check(consume().actions.includes('break'),'touch mining');el('break').emit('pointerup',{pointerId:3});check(timers.size===1,'hold released; only hint timer remains');
el('canvas').emit('pointerup',{pointerId:2,pointerType:'touch'});check(consume().z===-1,'look release preserves movement');
el('movezone').emit('pointerup',{pointerId:1});check(consume().z===0,'joystick release stops movement');
el('place').emit('pointerdown',{pointerId:3});check(consume().actions.includes('place'),'touch placement');el('place').emit('pointercancel');
document.emit('keydown',{key:'r',repeat:false});check(consume().z===-1,'auto walk keyboard control');document.emit('keydown',{key:'r',repeat:false});check(consume().z===0,'auto walk toggle stops');
document.emit('keydown',{key:'w'});check(consume().z===-1,'WASD forward');document.emit('keyup',{key:'w'});check(consume().z===0,'WASD release');
document.emit('keydown',{key:'9'});check(consume().selected===9,'keyboard palette selection');
document.emit('keydown',{key:'e',repeat:false});check(!el('map-panel').hidden,'map keyboard opens');el('map-close').onclick();check(el('map-panel').hidden,'map closes');
el('movezone').emit('pointerdown',{pointerId:1,clientX:80,clientY:220});el('movezone').emit('pointermove',{pointerId:1,clientX:80,clientY:180}); sandbox.window.emit('blur');
v=consume();check(!v.active && v.x===0 && v.z===0 && !v.jump && v.actions.length===0,'focus loss cancels held inputs');
sandbox.window.templeSave('{"version":2}');check(sandbox.window.templeLoad()==='{"version":2}','save round trip');check(store.get('robot-world-v1')==='preserved','separate storage key');sandbox.window.templeClear();check(!store.has('coruscant-temple-v2'),'reset clears only temple storage');
console.log(`PASS: ${checks} web-shell checks (multitouch fixture, input release, map, quality, storage)`);
