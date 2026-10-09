const {chromium}=require('playwright');const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const origin=process.env.PARKOUR_ORIGIN||'http://127.0.0.1:8096';
 const healthy=await browser.newPage();await healthy.goto(origin+'/assets/interactive/g1-parkour/index.html?debug=1');
 await healthy.waitForFunction(()=>window.parkourDemo?.data.time>.05,{},{timeout:180000});
 assert.equal(await healthy.locator('#loading').isVisible(),false);await healthy.close();
 const unsupported=await browser.newPage();
 await unsupported.addInitScript(()=>{const original=WebGL2RenderingContext.prototype.getExtension;WebGL2RenderingContext.prototype.getExtension=function(name){return name==='EXT_color_buffer_float'?null:original.call(this,name)}});
 await unsupported.goto(origin+'/assets/interactive/g1-parkour/index.html');
 await unsupported.getByText('Unavailable',{exact:true}).waitFor();
 assert.ok((await unsupported.locator('#loading').innerText()).includes('floating-point depth sensor'));
 console.log('Normal startup and explicit unsupported-depth-GPU state passed');await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
