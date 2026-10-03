const {chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,args:process.env.GPU?['--no-sandbox','--enable-gpu','--ignore-gpu-blocklist','--use-gl=angle','--use-angle=gl-egl']:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const page=await browser.newPage({viewport:{width:1200,height:900}});
 await page.goto((process.env.GAME_URL||'http://127.0.0.1:8093/assets/interactive/dustfall-outpost/')+'game.html?qa=1');
 await page.waitForFunction(()=>window.dustfallReady,null,{timeout:90000});await page.locator('#resume').click();
 await page.waitForTimeout(2500);await page.evaluate(()=>{send('qa_pose',{x:0,y:0,z:14,yaw:0,pitch:.025});document.querySelector('.hud').style.display='none';});await page.waitForTimeout(1500);
 await page.screenshot({path:'../../assets/interactive/dustfall-outpost/poster.jpg',type:'jpeg',quality:88,timeout:90000});
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
