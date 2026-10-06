import {ExplicitFinalizationRegistry} from './finalization-compat.js';
// Browser sandbox recommended by the official CasADi 3.8 WASM example.
// All files are pinned, locally served package assets; nothing comes from user input.
export async function loadCasadi(backend='ipopt') {
  const base=new URL('./vendor/casadi/',import.meta.url).href;
  async function cjs(name,requireFn) {
    const response=await fetch(new URL(name,base));if(!response.ok)throw new Error(`CasADi asset ${name}: ${response.status}`);
    const source=await response.text(),module={exports:{}};
    return new Function('module','exports','require','__dirname','__filename','FinalizationRegistry',source+'\n;return module.exports;')(module,module.exports,requireFn,base.replace(/\/$/,''),base+name,ExplicitFinalizationRegistry);
  }
  const wasm=await cjs('casadi_wasm.js',()=>{throw new Error('Unexpected WASM require');});
  const create=await cjs('casadi.js',name=>{
    if(name.endsWith('casadi_wasm.js'))return wasm;
    if(name==='path')return {join:(...parts)=>parts.filter(Boolean).join('/').replace(/([^:])\/{2,}/g,'$1/')};
    throw new Error(`Unexpected CasADi module ${name}`);
  });
  const ca=await create();await ca.load_nlpsol(backend);return ca;
}
