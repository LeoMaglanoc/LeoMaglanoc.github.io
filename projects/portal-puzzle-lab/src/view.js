import * as T from '../vendor/three.module.js';
import {LEVEL} from './level.js';
import {WIDTH,HEIGHT,transfer,rotation,local} from './portal.js';
const boxGeometry=new T.BoxGeometry(1,1,1);
export class View{
 constructor(canvas,sim){
  this.sim=sim;this.scene=new T.Scene();this.scene.background=new T.Color('#172632');
  this.renderer=new T.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});this.renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));this.renderer.outputColorSpace=T.SRGBColorSpace;this.renderer.localClippingEnabled=true;
  this.camera=new T.PerspectiveCamera(72,1,.04,75);this.virtual=new T.PerspectiveCamera();this.ray=new T.Raycaster();
  this.scene.add(new T.HemisphereLight(0xe9faff,0x495267,2));const sun=new T.DirectionalLight(0xffffff,2);sun.position.set(-3,8,2);this.scene.add(sun);
  this.materials={wall:new T.MeshStandardMaterial({color:0x526774,roughness:.85}),floor:new T.MeshStandardMaterial({color:0x6b7c87,roughness:.9}),ceiling:new T.MeshStandardMaterial({color:0x314651}),panel:new T.MeshStandardMaterial({color:0xe6edef,roughness:.65}),door:new T.MeshStandardMaterial({color:0x33454e,metalness:.5,roughness:.4}),glass:new T.MeshStandardMaterial({color:0x8ed7de,transparent:true,opacity:.12,roughness:.1,depthWrite:false})};
  this.colliders=[];for(const r of sim.statics){const mesh=this.box(r.position,r.size,this.materials[r.kind]);mesh.userData.kind=r.kind;this.colliders.push(mesh);if(r.kind==='door')this.door=mesh;}
  this.panelGroup=new T.Group();this.scene.add(this.panelGroup);this.portalGroup=new T.Group();this.scene.add(this.portalGroup);this.targets=[0,1].map(()=>new T.WebGLRenderTarget(1,1,{depthBuffer:true}));this.portalMeshes=[];
  this.decorate();this.cube=this.box([0,0,0],[.8,.8,.8],new T.MeshStandardMaterial({color:0xdbe5e9,metalness:.25,roughness:.45}));
  const edges=new T.LineSegments(new T.EdgesGeometry(new T.BoxGeometry(.81,.81,.81)),new T.LineBasicMaterial({color:0x354a56}));this.cube.add(edges);
  const badgeMaterial=new T.MeshStandardMaterial({color:0x69e9d1,emissive:0x15877b,emissiveIntensity:.5});
  for(const axis of [0,1,2])for(const sign of [-1,1]){const s=[.42,.42,.42],p=[0,0,0];s[axis]=.012;p[axis]=sign*.405;const mesh=new T.Mesh(boxGeometry,badgeMaterial);mesh.scale.set(...s);mesh.position.set(...p);this.cube.add(mesh);}
  this.plateMaterial=new T.MeshStandardMaterial({color:0xfdb470,emissive:0xc36728,emissiveIntensity:.4});this.plate=this.box(LEVEL.plate,[1.65,.08,1.65],this.plateMaterial);
  this.box([LEVEL.plate[0],.012,LEVEL.plate[2]],[1.95,.025,1.95],new T.MeshStandardMaterial({color:0x233b45}));
  this.rebuild();addEventListener('resize',()=>this.resize());this.resize();
 }
 box(position,size,material){const m=new T.Mesh(boxGeometry,material);m.position.set(...position);m.scale.set(...size);this.scene.add(m);return m;}
 label(text,position,size=1,color='#dbeff4',rotation=0){
  const c=document.createElement('canvas');c.width=1024;c.height=256;const ctx=c.getContext('2d');ctx.font='600 70px system-ui';ctx.fillStyle=color;ctx.textAlign='center';ctx.fillText(text,512,150);
  const tex=new T.CanvasTexture(c);tex.colorSpace=T.SRGBColorSpace;const material=new T.MeshBasicMaterial({map:tex,transparent:true,depthWrite:false});const mesh=new T.Mesh(new T.PlaneGeometry(size*4,size),material);mesh.position.set(...position);mesh.rotation.y=rotation;this.scene.add(mesh);return mesh;
 }
 decorate(){
  const grid=new T.GridHelper(12,12,0x3c5361,0x536975);grid.position.set(0,.006,-2);this.scene.add(grid);
  const grid2=new T.GridHelper(12,12,0x3c5361,0x536975);grid2.position.set(0,.006,-11);this.scene.add(grid2);
  const light=new T.MeshBasicMaterial({color:0xb9edee});
  for(const z of [-12,-6,0]){this.box([0,4.37,z],[8,.025,.18],light);this.box([-5.96,2,z],[.025,.04,3],light);}
  for(const p of LEVEL.panels){this.label(p.label,[p.x,3.65,p.z+p.normal[2]*.015],.6,'#243f4d',p.normal[2]<0?Math.PI:0);
   for(const dx of [-p.w/2,p.w/2])this.box([p.x+dx,2.2,p.z],[.08,4.4,.5],this.materials.wall);
  }
  this.label('OBSERVATION / CUBE VAULT',[0,3.9,-7.975],.55);this.label('ESCAPE',[4.4,3.55,3.97],.5,'#82ecd7',Math.PI);
  this.label('01',[0,2.8,-13.98],1,'#283d49');
  // Observation mullions are shoot-through visually but the glass is physical.
  for(const x of [-1.8,1.8])this.box([x,2.2,-7.95],[.07,4.4,.06],this.materials.wall);
  const path=new T.MeshBasicMaterial({color:0x74baad});for(let z=.2;z<4;z+=.42)this.box([4.4,.012,z],[.09,.015,.23],path);
 }
 rebuild(){
  for(const child of [...this.panelGroup.children])this.panelGroup.remove(child);
  for(const r of this.sim.panelBodies){const m=new T.Mesh(boxGeometry,this.materials.panel);m.position.set(...r.position);m.scale.set(...r.size);this.panelGroup.add(m);}
  for(const child of [...this.portalGroup.children]){child.traverse(m=>{if(m.material)m.material.dispose();if(m.geometry&&m.geometry!==boxGeometry)m.geometry.dispose();});this.portalGroup.remove(child);}this.portalMeshes=[];
  this.sim.portals.forEach((p,i)=>{if(!p)return;const group=new T.Group();group.position.copy(p.position).addScaledVector(p.normal,.012);group.quaternion.setFromRotationMatrix(p.matrix);this.portalGroup.add(group);
   const color=i===0?0x48b8ff:0xff973f;
   // Screen-space texture sampling adapted from upstream Portal.js, with local
   // framebuffer size rather than target size to preserve perspective on resize.
   const mat=new T.ShaderMaterial({uniforms:{view:{value:this.targets[i].texture},resolution:{value:new T.Vector2()},linked:{value:this.sim.portals.every(Boolean)?1:0},tint:{value:new T.Color(color)}},vertexShader:'varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:'uniform sampler2D view;uniform vec2 resolution;uniform float linked;uniform vec3 tint;varying vec2 vUv;void main(){vec3 c=linked>.5?texture2D(view,gl_FragCoord.xy/resolution).rgb:tint*.12;gl_FragColor=vec4(c,1.);}',toneMapped:false});
   const surface=new T.Mesh(new T.PlaneGeometry(WIDTH,HEIGHT),mat);group.add(surface);
   const border=new T.MeshBasicMaterial({color,toneMapped:false});for(const [x,y,w,h] of [[-WIDTH/2,0,.055,HEIGHT],[WIDTH/2,0,.055,HEIGHT],[0,-HEIGHT/2,WIDTH+.055,.055],[0,HEIGHT/2,WIDTH+.055,.055]]){const mesh=new T.Mesh(boxGeometry,border);mesh.position.set(x,y,.008);mesh.scale.set(w,h,.04);group.add(mesh);}
   this.portalMeshes[i]=surface;
  });this.resize();
 }
 resize(){
  const w=innerWidth,h=innerHeight;this.renderer.setSize(w,h,false);this.camera.aspect=w/h;this.camera.updateProjectionMatrix();
  const drawing=new T.Vector2();this.renderer.getDrawingBufferSize(drawing);
  // Cap long edge, maintain main-camera aspect at every orientation.
  const scale=Math.min(1,(matchMedia('(pointer:coarse)').matches?640:1000)/Math.max(drawing.x,drawing.y));
  for(const target of this.targets)target.setSize(Math.max(1,Math.round(drawing.x*scale)),Math.max(1,Math.round(drawing.y*scale)));
  for(const m of this.portalMeshes)if(m)m.material.uniforms.resolution.value.copy(drawing);
 }
 aim(){
  this.sync();this.ray.setFromCamera(new T.Vector2(),this.camera);
  let best=null;for(const panel of LEVEL.panels){const n=new T.Vector3(...panel.normal),plane=new T.Plane().setFromNormalAndCoplanarPoint(n,new T.Vector3(panel.x,0,panel.z));
   if(this.ray.ray.direction.dot(n)>=-.01)continue;const point=this.ray.ray.intersectPlane(plane,new T.Vector3());if(!point||point.y<0||point.y>panel.h||Math.abs(point.x-panel.x)>panel.w/2)continue;const distance=point.distanceTo(this.camera.position);if(!best||distance<best.distance)best={panel,point,distance};
  }
  if(!best)return null;
  // Glass is deliberately transparent to portal shots, explained in the intro.
  const blockers=this.ray.intersectObjects([...this.colliders.filter(m=>m.userData.kind!=='glass'&&m.userData.kind!=='door'),this.cube]);if(blockers[0]&&blockers[0].distance<best.distance-.05)return null;
  return best;
 }
 sync(){this.camera.position.copy(this.sim.eye());this.camera.rotation.set(this.sim.pitch,this.sim.yaw,0,'YXZ');this.camera.updateMatrixWorld();this.cube.position.copy(this.sim.cube.position);this.cube.quaternion.copy(this.sim.cube.quaternion);this.door.visible=!this.sim.doorOpen;this.plateMaterial.color.setHex(this.sim.doorOpen?0x74efd0:0xfdb470);this.plateMaterial.emissive.setHex(this.sim.doorOpen?0x238c79:0xc36728);}
 render(){
  this.sync();const frustum=new T.Frustum().setFromProjectionMatrix(new T.Matrix4().multiplyMatrices(this.camera.projectionMatrix,this.camera.matrixWorldInverse));
  if(this.sim.portals.every(Boolean))for(let i=0;i<2;i++){
   const p=this.sim.portals[i],exit=this.sim.portals[1-i],surface=this.portalMeshes[i];if(local(p,this.camera.position).z<=0||!frustum.intersectsObject(surface))continue;
   const m=transfer(p,exit);this.virtual.copy(this.camera);this.virtual.position.copy(this.camera.position).applyMatrix4(m);this.virtual.quaternion.copy(this.camera.quaternion).premultiply(rotation(m));this.virtual.updateMatrixWorld();
   this.portalGroup.visible=false;this.renderer.clippingPlanes=[new T.Plane().setFromNormalAndCoplanarPoint(exit.normal,exit.position.clone().addScaledVector(exit.normal,.008))];
   this.renderer.setRenderTarget(this.targets[i]);this.renderer.render(this.scene,this.virtual);
  }
  this.portalGroup.visible=true;this.renderer.clippingPlanes=[];this.renderer.setRenderTarget(null);this.renderer.render(this.scene,this.camera);
 }
}
