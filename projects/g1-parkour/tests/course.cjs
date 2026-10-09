// Validate a full closed-loop course without expensive *display* rendering.
// Depth capture/readback, ONNX inference and all physics run unchanged.
const {chromium}=require('playwright');const fs=require('node:fs');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const page=await browser.newPage({viewport:{width:640,height:480}});
 page.on('console',msg=>{if(msg.text().startsWith('Course:'))console.log(msg.text())});
 await page.goto((process.env.PARKOUR_ORIGIN||'http://127.0.0.1:8096')+'/assets/interactive/g1-parkour/index.html?debug=1');
 await page.waitForFunction(()=>window.parkourDemo,{},{timeout:90000});
 const result=await page.evaluate(async()=>{
  const d=window.parkourDemo;d.renderer.setAnimationLoop(null);
  while(d.renderInFlight)await new Promise(r=>setTimeout(r,10));
  // Verify that vertex-lit presentation does not alter one sensor pixel.
  d.applySceneInitialState({resetData:true,rebindCameras:true});
  d.captureDepthFrame(); const depthBefore=Array.from(d.depthFrame);
  const replacements=[]; const types=window.parkourMaterialTypes;
  d.scene.traverse(o=>{if(o.material instanceof types.Lambert){const old=o.material;const replacement=new types.Physical({color:old.color,opacity:old.opacity,transparent:old.transparent,map:old.map,flatShading:old.flatShading});replacements.push([o,old,replacement]);o.material=replacement;}});
  d.captureDepthFrame(); const depthError=Math.max(...d.depthFrame.map((v,i)=>Math.abs(v-depthBefore[i])));
  for(const [o,old,replacement] of replacements){o.material=old;replacement.dispose();}
  if(depthError>1e-6)throw new Error(`Material change affected sensor depth: ${depthError}`);
  const render=d.renderer.render.bind(d.renderer);
  d.renderer.render=(scene,camera)=>{if(camera!==d.camera)render(scene,camera)};
  d.applySceneInitialState({resetData:true,rebindCameras:true});d.params.paused=false;d.mujoco_time=0;
  d.policyController.highSpeedMode=true;d.policyController.pressedKeys.add('w');d.policyController._updateCommandState();
  const start=performance.now(),samples=[];
  for(let frame=1;frame<=6000;frame++){
   await d.render(frame*20);
   if(frame%500===0)console.log(`Course: ${d.data.time.toFixed(1)} s, x=${d.data.qpos[0].toFixed(1)} m`);
   if(frame%50===0)samples.push({t:d.data.time,x:d.data.qpos[0],y:d.data.qpos[1],z:d.data.qpos[2]});
   if(d.data.qpos[0]>=66)break;
   if(d.data.qpos[2]<.2&&d.data.time>2)break;
  }
  return {depthMaterialParityMaxError:depthError,mode:'Display camera rendering suppressed; sensor rendering, ONNX and physics unchanged',elapsedWallSeconds:(performance.now()-start)/1000,simTime:d.data.time,x:d.data.qpos[0],y:d.data.qpos[1],z:d.data.qpos[2],finished:d.data.qpos[0]>=65.5&&Math.abs(d.data.qpos[1])<1.5,steps:d.policyStepCounter,depthQueue:d.policyController.depthLatentQueue.length,samples};
 });
 fs.mkdirSync('results',{recursive:true});fs.writeFileSync('results/course.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 // Fixed W is a documented behavioral probe, not a success assertion.
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
