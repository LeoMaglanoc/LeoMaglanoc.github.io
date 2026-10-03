const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const URL=process.env.GAME_URL||'http://127.0.0.1:8093/assets/interactive/dustfall-outpost/';
const report={renderer:process.env.GPU?"Mesa / GPU":"SwiftShader software"};
const artifacts=process.env.REPORT_DIR||"artifacts";
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
(async()=>{
 fs.mkdirSync(artifacts,{recursive:true});
 const browser=await chromium.launch({headless:true,args:process.env.GPU?['--no-sandbox','--enable-gpu','--ignore-gpu-blocklist','--use-gl=angle','--use-angle=gl-egl']:['--no-sandbox','--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 for(const mobile of [false,true]){
  const context=await browser.newContext({viewport:mobile?{width:844,height:390}:process.env.GPU?{width:1280,height:800}:{width:960,height:600},deviceScaleFactor:1,isMobile:mobile,hasTouch:mobile});
  const page=await context.newPage();page.setDefaultTimeout(process.env.GPU?30000:90000);const errors=[];page.on('response',r=>{if(r.status()>=400)console.log('HTTP failure',r.status(),r.url());});page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  const start=Date.now();await page.goto(URL+'?qa=1');
  assert.equal(await page.locator('#game-frame').getAttribute('src'),null,'No engine download before launch');
  await page.locator('#enter').click();
  const game=await (await page.locator('#game-frame').elementHandle()).contentFrame();
  await game.waitForURL('**/game.html*');
  await game.waitForFunction(()=>window.dustfallReady,null,{timeout:90000});
  await game.locator('#resume').click();
  if(!process.env.GPU)await game.evaluate(()=>send('quality',{low:true}));
  await game.waitForFunction(()=>window.dustfallState&&!window.dustfallState.paused,null,{timeout:30000});
  await sleep(3000);
  const readyMs=Date.now()-start;
  const state=()=>game.evaluate(()=>window.dustfallState);
  const frames=async count=>{const limit=(await state()).physics_frame+count;await game.waitForFunction(limit=>window.dustfallState?.physics_frame>=limit,limit,{timeout:process.env.GPU?15000:90000});};
  const pose=async(x,y,z,yaw=0,pitch=0)=>{await game.evaluate(p=>send('qa_pose',p),{x,y,z,yaw,pitch});await frames(10);};
  const waitTarget=target=>game.waitForFunction(target=>window.dustfallState?.target===target,target,{timeout:process.env.GPU?12000:60000}).catch(async e=>{console.error('Target timeout',target,await state());throw e;});
  const use=async()=>{if(mobile)await game.locator('#use').tap();else await page.keyboard.press('KeyE');await frames(20);};
  const screenshot=name=>(!process.env.GPU&&!['arrival','portrait','completion'].includes(name))?Promise.resolve():page.screenshot({path:`${artifacts}/${mobile?'mobile':'desktop'}-${name}.png`,timeout:90000});
  assert.equal(await game.locator('#touch').isVisible(),mobile);
  await screenshot('arrival');
  if(!mobile){await page.keyboard.press('KeyN');await sleep(300);assert(await game.locator('#journal').isVisible());assert.equal(await game.locator('#pause').isVisible(),false,'Notes remain readable when pointer lock is released');await game.locator('#journal-close').click();await sleep(300);}
  // Restore a known heading after CDP pointer-lock warp events from clicking HTML controls.
  await pose(0,0,14,0,0);
  const initial=await state();
  if(mobile){
   const session=await context.newCDPSession(page);
   const stick=await game.locator('#stick').boundingBox(),look=await game.locator('#look').boundingBox();
   const sx=stick.x+stick.width/2,sy=stick.y+stick.height/2;
   const lx=look.x+80,ly=look.y+70;
   const point=(id,x,y)=>({id,x,y,radiusX:2,radiusY:2,force:1});
   await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point(1,sx,sy),point(2,lx,ly)]});
   await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[point(1,sx,sy-33),point(2,lx+50,ly+12)]});
   await frames(100);
   const during=await state();assert(during.position[2]<initial.position[2]-.8,'Touch joystick moves the player');assert(Math.abs(during.yaw-initial.yaw)>.1,'Second touch looks while moving');assert(during.pitch<initial.pitch,'Vertical camera drag works');
   await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await frames(30);const stopped=await state();await frames(30);const stoppedLater=await state();assert(Math.hypot(stoppedLater.position[0]-stopped.position[0],stoppedLater.position[2]-stopped.position[2])<.2,'Releasing touches stops movement');
   // Cancellation must clear the movement pointer too.
   await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point(1,sx,sy-30)]});await frames(30);await session.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});await frames(30);const cancelled=await state();await frames(30);const afterCancel=await state();assert(Math.hypot(afterCancel.position[0]-cancelled.position[0],afterCancel.position[2]-cancelled.position[2])<.2,'Cancelled gesture stops movement');
   await page.setViewportSize({width:390,height:844});await sleep(700);await screenshot('portrait');assert((await game.locator('#use').boundingBox()).width>=80);await page.setViewportSize({width:844,height:390});await sleep(500);
   report.touch={simultaneousMoveLook:true,verticalLook:true,releaseStops:true,cancelStops:true,portraitAndLandscape:true};
  }else{
   assert(await game.evaluate(()=>document.pointerLockElement===document.getElementById('canvas')),'Mouse capture after launch');
   await page.keyboard.down('KeyW');await frames(100);await page.keyboard.up('KeyW');await sleep(300);const walked=await state();assert(walked.position[2]<initial.position[2]-2,'WASD movement');
   // CDP absolute mouse positions generate compensating warp events under pointer lock.
   // Send the relative event a physical mouse produces, through the actual canvas handler.
   await game.locator('#canvas').dispatchEvent('mousemove',{movementX:100,movementY:15,clientX:640,clientY:400,bubbles:true});await game.waitForFunction(yaw=>Math.abs(window.dustfallState.yaw-yaw)>.05,initial.yaw,{timeout:process.env.GPU?12000:60000});
   await page.keyboard.press('Escape');await game.waitForFunction(()=>window.dustfallState.paused,null,{timeout:30000});assert((await state()).paused);await game.locator('#resume').click();report.desktop={keyboardMovement:true,mouseLook:true,escapePause:true,pointerLock:true};
  }
  // Collision against a closed facade using real control input.
  await pose(-15,0,13,0,0);
  if(mobile){await game.evaluate(()=>send('move',{x:0,y:-1}));await frames(100);await game.evaluate(()=>send('move',{x:0,y:0}));}else{await page.keyboard.down('KeyW');await frames(100);await page.keyboard.up('KeyW');}
  assert((await state()).position[2]>10.7,'Building collision prevents walking through walls');
  // Try the ship before finding anything.
  await pose(4,0,23.8,Math.PI/2,0);await waitTarget('ship');await use();assert.equal((await state()).repaired,false);
  // Components use actual raycast targeting and E/touch interactions, not direct state mutations.
  await pose(-12,0,1,0,-.08);await waitTarget('power_cell');await screenshot('market');await use();assert.deepEqual((await state()).parts,['power_cell']);if(!mobile)await use();else assert.equal(await game.locator('#use').getAttribute('aria-disabled'),'true');assert.equal((await state()).parts.length,1);
  await pose(12,0,-14.3,0,0);await waitTarget('door'); // The door itself is usable, as well as its fixed panel.
  await pose(13.5,0,-14.3,0,0);await waitTarget('door');await use();await game.waitForFunction(()=>window.dustfallState.door_open,null,{timeout:10000});await frames(60);
  // Walk through the doorway and over its threshold.
  await pose(12,0,-15.3,0,0);
  if(mobile){await game.evaluate(()=>send('move',{x:0,y:-1}));await frames(100);await game.evaluate(()=>send('move',{x:0,y:0}));}else{await page.keyboard.down('KeyW');await frames(100);await page.keyboard.up('KeyW');}
  console.log('Workshop entry',mobile,(await state()).position);
  assert((await state()).position[2]<-19,'Workshop doorway and ramp are traversable without jumping');
  await pose(9.3,.45,-19.5,0,-.28);await waitTarget('navigation_module');await screenshot('workshop');await use();assert.equal((await state()).parts.length,2);
  // Closing works from the same fixed control panel after the door slides.
  await pose(13.5,0,-14.3,0,0);await waitTarget('door');await use();await frames(60);assert.equal((await state()).door_open,false);
  await pose(5,0,-7,0,-.15);await waitTarget('generator');await use();assert.equal((await state()).generator_on,true);
  await pose(2.8,0,-46.7,0,-.23);await waitTarget('coolant_unit');await screenshot('wreck');await use();assert.equal((await state()).parts.length,3);
  await pose(0,0,-66,0,.1);await screenshot('overlook');
  await pose(19,0,-2,0,0);await sleep(300);
  await pose(0,0,18,Math.PI,0);await waitTarget('ship');await use(); // Repair from the visible hull, not a hidden hot spot.
  console.log('Ship departure',mobile,await state());
  await game.waitForFunction(()=>window.dustfallState?.complete,null,{timeout:process.env.GPU?30000:90000});await screenshot('completion');assert(await game.locator('#completion').isVisible());
  await game.locator('#explore').click();await sleep(500);assert.equal((await state()).flying,false);assert.equal((await state()).paused,false);assert.equal(await game.locator('#completion').isVisible(),false);
  if(!mobile){await page.keyboard.down('KeyW');await sleep(700);await page.keyboard.up('KeyW');}
  assert.equal(errors.length,0,errors.join('\n'));
  report[mobile?'mobileResult':'desktopResult']={objectiveCompleted:true,collision:true,workshopThreshold:true,doorOpenAndClose:true,keepExploring:true,landmarks:(await state()).visited,fps:(await state()).fps,loadMs:readyMs,errors};
  await context.close();
 }
 await browser.close();fs.writeFileSync(`${artifacts}/browser-results.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
})().catch(e=>{console.error(e);process.exit(1)});
