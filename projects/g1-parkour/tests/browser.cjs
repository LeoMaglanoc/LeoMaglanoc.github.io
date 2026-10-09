const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const origin = process.env.PARKOUR_ORIGIN || 'http://127.0.0.1:8096';
const output = path.resolve(__dirname,'../results'); fs.mkdirSync(output,{recursive:true});
(async () => {
 const browser = await chromium.launch({executablePath:process.env.CHROMIUM_PATH || undefined,args:['--no-sandbox','--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const results = [];
 for (const [name,width,height,mobile] of [['desktop',1440,900,false],['phone-portrait',412,915,true],['phone-landscape',915,412,true]]) {
  const context = await browser.newContext({viewport:{width,height},isMobile:mobile,hasTouch:mobile});
  const page = await context.newPage(); const errors=[]; const missing=[];
  page.on('pageerror',e=>errors.push(e.message)); page.on('response',r=>{if(r.status()>=400)missing.push(`${r.status()} ${r.url()}`)});
  console.log(`Testing ${name}`);
  await page.goto(`${origin}/assets/interactive/g1-parkour/index.html?debug=1`);
  await page.waitForFunction(()=>window.parkourDemo?.data.time > .2,{},{timeout:180000});
  await page.getByRole('button',{name:'Pause',exact:true}).click();
  const state = () => page.evaluate(()=>({time:window.parkourDemo.data.time,qpos:[...window.parkourDemo.data.qpos],ctrl:[...window.parkourDemo.data.ctrl],command:[...window.parkourDemo.policyController.joystickState],depthQueue:window.parkourDemo.policyController.depthLatentQueue.length,steps:window.parkourDemo.policyStepCounter,paused:window.parkourDemo.params.paused}));
  const paused=await state(); await page.waitForTimeout(400); assert.equal((await state()).time,paused.time,'Pause must stop physics');
  for (const speed of ['LOW','HIGH']) {
   await page.getByRole('button',{name:speed,exact:true}).click();
   for (const [key,low] of Object.entries({w:1,a:2,q:3,d:4,e:5,s:11})) {
    await page.keyboard.down(key);const active=await state();assert.equal(active.command.indexOf(1),speed==='HIGH'&&low<=5?low+5:low);
    await page.keyboard.up(key);assert.equal((await state()).command.indexOf(1),0);
   }
  }
  // Actual touch event routing through the Chrome DevTools protocol.
  const client=await context.newCDPSession(page);
  const bounds=await page.getByRole('button',{name:'Forward',exact:true}).boundingBox();
  await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:bounds.x+bounds.width/2,y:bounds.y+bounds.height/2}]});
  assert.equal((await state()).command.indexOf(1),6);
  await client.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});
  assert.equal((await state()).command.indexOf(1),0,'Touch cancellation must clear input');
  const buttonBounds=await page.locator('button').evaluateAll(bs=>bs.filter(b=>b.getBoundingClientRect().width).map(b=>{const r=b.getBoundingClientRect();return {label:b.getAttribute('aria-label')||b.textContent.trim(),x:r.x,y:r.y,w:r.width,h:r.height}}));
  for(const b of buttonBounds){assert.ok(b.x>=0&&b.y>=0&&b.x+b.w<=width+1&&b.y+b.h<=height+1,`${name}: clipped ${b.label}`)}
  await page.getByRole('button',{name:'Reset',exact:true}).click();await page.waitForFunction(()=>window.parkourDemo.data.time===0);
  assert.ok(Math.abs((await state()).qpos[0])<.01,'Reset must return to course start');
  await page.getByRole('button',{name:'Resume',exact:true}).click();
  console.log(`${name}: UI checks passed; running released policy`);
  await page.keyboard.down('w');
  await page.waitForFunction(()=>window.parkourDemo.data.time>5,{},{timeout:180000});
  await page.keyboard.up('w');
  const running=await state();assert.ok(running.qpos[0]>1,'Released policy must physically walk forward');assert.ok(running.depthQueue>0);assert.ok(running.ctrl.some(x=>Math.abs(x)>.01));
  await page.getByRole('button',{name:'About',exact:true}).click();
  const performance = await page.locator('#performance').innerText();
  await page.getByRole('button',{name:'Close about'}).click();
  await page.screenshot({path:path.join(output,`${name}.jpg`),type:'jpeg',quality:85});
  assert.deepEqual(errors,[]);assert.deepEqual(missing,[]);
  results.push({name,width,height,performance,running,errors,missing,buttonBounds});
  await context.close();
 }
 fs.writeFileSync(path.join(output,'browser.json'),JSON.stringify(results,null,2));
 console.log(JSON.stringify(results.map(({name,performance,running})=>({name,performance,simTime:running.time,x:running.qpos[0]})),null,2));
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
