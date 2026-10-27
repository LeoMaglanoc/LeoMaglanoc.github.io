/* A conservative, finite-volume ventilation toy model. See README.md. */
(function(root){
'use strict';
const W=48,H=24,N=W*H, V=0.25*0.25*2.7, DT=0.1;
class Model {
 constructor(){this.c=new Float64Array(N).fill(1);this.next=new Float64Array(N);this.p=new Float64Array(N);this.source=new Float64Array(N);this.edges=[];this.t=0;this.config={left:'open',right:'open',bed:true,living:true,wind:2,direction:1};this.rebuild()}
 rebuild(){const s=this.config;this.edges=[];this.source.fill(0);this.p.fill(0);
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){let i=y*W+x;if(x<W-1)this.edges.push([i,i+1]);if(y<H-1){let wall=y===7||y===15;let door=x>=21&&x<27&&(y===7?s.bed:s.living);if(!wall||door)this.edges.push([i,i+W]);}}
  const area={closed:0,tilted:0.08,open:0.32},a=area[s.left],b=area[s.right];
  if(a&&b){let q=0.65*s.wind*Math.min(a,b), sign=s.direction;for(let y=10;y<14;y++){this.source[y*W]+=sign*q/4;this.source[y*W+W-1]-=sign*q/4;}}
  else if(a||b){let q=0.06*s.wind*(a||b), x=a?0:W-1;for(let y=10;y<12;y++)this.source[y*W+x]+=q/2;for(let y=12;y<14;y++)this.source[y*W+x]-=q/2;}
  // Solve a resistor-network pressure field. Each face has unit conductance.
  const adj=Array.from({length:N},()=>[]);for(const [i,j] of this.edges){adj[i].push(j);adj[j].push(i)}
  for(let k=0;k<12000;k++){let err=0;for(let parity=0;parity<2;parity++)for(let i=0;i<N;i++){if(((i%W+Math.floor(i/W))&1)!==parity)continue;let sum=this.source[i];for(const j of adj[i])sum+=this.p[j];let d=sum/adj[i].length-this.p[i];this.p[i]+=1.75*d;err=Math.max(err,Math.abs(d))}if(err<1e-14)break;}
  this.flux=this.edges.map(([i,j])=>this.p[i]-this.p[j]);
 }
 step(){const c=this.c,n=this.next;n.set(c);let out=0;
  for(let e=0;e<this.edges.length;e++){let [i,j]=this.edges[e],q=this.flux[e],f=DT/V*(q*(q>=0?c[i]:c[j])+0.00035*(c[i]-c[j]));n[i]-=f;n[j]+=f;}
  for(let i=0;i<N;i++)if(this.source[i]<0){let loss=DT/V*(-this.source[i])*c[i];n[i]-=loss;out+=loss*V;}
  this.c=this.next;this.next=c;this.t+=DT;return out;
 }
 metrics(){let sum=0,bed=0,cor=0,living=0;for(let i=0;i<N;i++){sum+=this.c[i];let y=Math.floor(i/W);if(y<8)bed+=this.c[i];else if(y<16)cor+=this.c[i];else living+=this.c[i]}return [sum,cor,bed,living].map((v,i)=>100*(1-v/(i?W*8:N)))}
}
root.VentilationModel={Model,W,H,N,V,DT};if(typeof module!=='undefined')module.exports=root.VentilationModel;
})(typeof globalThis!=='undefined'?globalThis:this);
