const {chromium}=require('playwright');
const assert=require('node:assert/strict');const fs=require('node:fs');
(async()=>{
 fs.mkdirSync('artifacts/smoke',{recursive:true});
 const browser=await chromium.launch({headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const results={};
 for(const touch of [false,true]){
  const context=await browser.newContext({viewport:{width:640,height:600},hasTouch:touch,isMobile:touch,deviceScaleFactor:1});
  const page=await context.newPage(),errors=[];page.setDefaultTimeout(60000);
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  const url=(process.env.GAME_URL||'http://127.0.0.1:8093/assets/interactive/dustfall-outpost/')+'game.html?qa=1&smoke=1';
  await page.goto(url);await page.waitForFunction(()=>window.dustfallReady,null,{timeout:90000});
  await page.locator('#resume').click();await page.evaluate(()=>send('quality',{low:true}));
  const state=()=>page.evaluate(()=>window.dustfallState);
  const frames=async n=>{await page.waitForFunction(()=>window.dustfallState?.physics_frame!==undefined);const end=(await state()).physics_frame+n;await page.waitForFunction(n=>window.dustfallState.physics_frame>=n,end,{timeout:60000});};
  await frames(20);await page.evaluate(()=>send('qa_pose',{x:0,y:0,z:14,yaw:0,pitch:0}));await frames(10);
  const before=await state();
  if(touch){
   assert(await page.locator('#touch').isVisible());
   const cdp=await context.newCDPSession(page),stick=await page.locator('#stick').boundingBox(),look=await page.locator('#look').boundingBox();
   const sx=stick.x+stick.width/2,sy=stick.y+stick.height/2,lx=look.x+50,ly=look.y+60;
   const point=(id,x,y)=>({id,x,y,radiusX:2,radiusY:2,force:1});
   await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point(1,sx,sy),point(2,lx,ly)]});
   await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[point(1,sx,sy-32),point(2,lx+30,ly+10)]});await frames(30);
   const during=await state();assert(during.position[2]<before.position[2]-.5);assert(Math.abs(during.yaw-before.yaw)>.05);
   await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await frames(30);const stopped=await state();await frames(20);const after=await state();assert(Math.hypot(after.position[0]-stopped.position[0],after.position[2]-stopped.position[2])<.2);
  }else{
   assert(await page.evaluate(()=>document.pointerLockElement!==null));
   await page.keyboard.down('KeyW');await frames(30);await page.keyboard.up('KeyW');await frames(20);assert((await state()).position[2]<before.position[2]-.5);
  }
  await page.evaluate(()=>send('qa_pose',{x:-12,y:0,z:1,yaw:0,pitch:-.08}));
  await page.waitForFunction(()=>window.dustfallState?.target==='power_cell',null,{timeout:60000});
  if(touch)await page.locator('#use').tap();else await page.keyboard.press('KeyE');
  await page.waitForFunction(()=>window.dustfallState.parts.includes('power_cell'),null,{timeout:60000});
  await page.screenshot({path:`artifacts/smoke/${touch?'touch':'desktop'}.png`,timeout:90000});
  assert.equal(errors.length,0,errors.join('\n'));results[touch?'touch':'desktop']={startup:true,movement:true,raycastPickup:true,errors};
  await context.close();
 }
 await browser.close();fs.writeFileSync('artifacts/smoke/results.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));
})().catch(e=>{console.error(e);process.exit(1)});
