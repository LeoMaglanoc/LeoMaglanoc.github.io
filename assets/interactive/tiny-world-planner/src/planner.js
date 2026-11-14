// Pure learned-model CEM. Never import physics, rasterization or the diagnostic head.
export const CONFIGS={lite:{horizon:6,candidates:32,iterations:3},standard:{horizon:8,candidates:64,iterations:3}};
const clamp=x=>Math.max(-1,Math.min(1,x));
export function seededRandom(seed){let s=seed>>>0;return()=>{s=(Math.imul(1664525,s)+1013904223)>>>0;return (s+.5)/4294967296;};}
function normal(random){return Math.sqrt(-2*Math.log(Math.max(1e-9,random())))*Math.cos(2*Math.PI*random());}
export class CEM{
 constructor(model){this.model=model;this.previous=null;this.random=seededRandom(361);}
 reset(){this.previous=null;this.random=seededRandom(361);}
 async plan(initial,goal,configuration='lite'){
  const start=performance.now(),{horizon:H,candidates:N,iterations}=CONFIGS[configuration]||CONFIGS.lite,elites=Math.max(4,Math.floor(N*.15)),mean=new Float32Array(H*2),std=new Float32Array(H*2).fill(.85);if(this.previous?.length===H*2){mean.set(this.previous.subarray(2));mean.set(this.previous.subarray(-2),H*2-2);}let final;
  for(let iteration=0;iteration<iterations;iteration++){
   if(performance.now()-start>12000)throw Error('Planning timeout');
   const sequences=new Float32Array(N*H*2);for(let n=0;n<N;n++)for(let d=0;d<2;d++){let noise=normal(this.random);for(let k=0;k<H;k++){noise=.7*noise+.714*normal(this.random);const idx=k*2+d;sequences[n*H*2+idx]=n===0?mean[idx]:n===1?0:clamp(mean[idx]+std[idx]*(n<N/3?noise:normal(this.random)));}}
   let states=new Float32Array(N*48);for(let n=0;n<N;n++)states.set(initial,n*48);const costs=new Float64Array(N),trajectory=[];const action=new Float32Array(N*2);
   for(let k=0;k<H;k++){for(let n=0;n<N;n++)for(let d=0;d<2;d++)action[n*2+d]=sequences[(n*H+k)*2+d];states=await this.model.predict(states,action,N);trajectory.push(states);for(let n=0;n<N;n++){let distance=0;for(let j=0;j<16;j++)distance+=(states[n*48+j]-goal[j])**2;costs[n]+=(k===H-1?1:.2/H)*distance/16;for(let d=0;d<2;d++){const a=action[n*2+d];costs[n]+=.0005*a*a;if(k)costs[n]+=.0005*(a-sequences[(n*H+k-1)*2+d])**2;}}}
   if(!costs.every(Number.isFinite))throw Error('Non-finite plan cost');const rank=Array.from({length:N},(_,i)=>i).sort((a,b)=>costs[a]-costs[b]);for(let j=0;j<H*2;j++){let sum=0;for(let e=0;e<elites;e++)sum+=sequences[rank[e]*H*2+j];const m=sum/elites;let v=0;for(let e=0;e<elites;e++)v+=(sequences[rank[e]*H*2+j]-m)**2;mean[j]=.2*mean[j]+.8*m;std[j]=Math.max(.12,Math.sqrt(v/elites));}final={sequences,rank,costs,trajectory};
  }
  const n=final.rank[0],sequence=final.sequences.slice(n*H*2,(n+1)*H*2),selected=final.trajectory.map(t=>t.slice(n*48,(n+1)*48));this.previous=sequence;return {action:Array.from(sequence.slice(0,2)),sequence:Array.from(sequence),cost:final.costs[n],predicted:selected[0],latents:selected,candidateLatents:final.rank.slice(1,5).map(n=>final.trajectory.map(t=>t.slice(n*48,(n+1)*48))),latency:performance.now()-start,config:{horizon:H,candidates:N,iterations}};
 }
}
