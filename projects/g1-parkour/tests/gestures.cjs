const {chromium}=require('playwright');const assert=require('node:assert/strict');const fs=require('node:fs');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const context=await browser.newContext({viewport:{width:412,height:915},isMobile:true,hasTouch:true});const page=await context.newPage();
 await page.goto((process.env.PARKOUR_ORIGIN||'http://127.0.0.1:8096')+'/assets/interactive/g1-parkour/index.html?debug=1');
 await page.waitForFunction(()=>window.parkourDemo?.data.time>.05,{},{timeout:180000});
 await page.getByRole('button',{name:'Pause',exact:true}).click();
 const pose=()=>page.evaluate(()=>{const d=window.parkourDemo;return {camera:d.camera.position.toArray(),distance:d.camera.position.distanceTo(d.controls.target),qpos:[...d.data.qpos]}});
 const before=await pose(),client=await context.newCDPSession(page);
 await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:280,y:400}]});
 await client.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:330,y:420}]});
 await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 await page.waitForFunction(p=>Math.hypot(...window.parkourDemo.camera.position.toArray().map((v,i)=>v-p[i]))>.1,before.camera);
 const orbit=await pose();
 await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:126,y:410},{x:286,y:410}]});
 await client.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:96,y:410},{x:316,y:410}]});
 await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 await page.waitForFunction(distance=>Math.abs(window.parkourDemo.camera.position.distanceTo(window.parkourDemo.controls.target)-distance)>.1,orbit.distance);
 const pinch=await pose();assert.deepEqual(pinch.qpos,before.qpos,'Camera touch gestures must not perturb robot physics');
 await page.evaluate(()=>{const d=window.parkourDemo;window.resourcesBefore=[d.model,d.data,d.policyController.session,d.policyController.depthSession];window.sceneCountBefore=d.scene.children.length});
 for(let n=0;n<5;n++){await page.getByRole('button',{name:'Reset',exact:true}).click();await page.waitForFunction(()=>!window.parkourDemo.resetRequested);}
 const reuse=await page.evaluate(()=>{const d=window.parkourDemo;return [d.model,d.data,d.policyController.session,d.policyController.depthSession].every((x,i)=>x===window.resourcesBefore[i])&&d.scene.children.length===window.sceneCountBefore});
 assert.equal(reuse,true,'Reset must reuse physics/model sessions and scene resources');
 fs.writeFileSync('results/gestures.json',JSON.stringify({oneFingerOrbit:true,pinchZoom:true,cameraDidNotPerturbPhysics:true,resets:5,resourcesReused:reuse,before,orbit,pinch},null,2));
 console.log('Touch orbit/pinch, physics isolation and five reset resource checks passed');await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
