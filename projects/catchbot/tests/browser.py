"""Real Chromium via Playwright. Phone sizes emulate viewports, not physical devices."""
import json, math, time
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'validation';OUT.mkdir(exist_ok=True)
import os
BASE=os.environ.get('CATCHBOT_URL','http://127.0.0.1:8765/projects/catchbot/')
results=[]
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
 for label,w,h,touch in [('desktop',1440,900,False),('portrait',390,844,True),('landscape',844,390,True)]:
  context=browser.new_context(viewport={'width':w,'height':h},has_touch=touch,is_mobile=touch,device_scale_factor=1)
  page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.on('console',lambda m:errors.append(m.text) if m.type=='error' else None)
  response=page.goto(BASE);assert response.status==200;page.wait_for_function('!!window.catchbot')
  page.screenshot(path=str(OUT/f'{label}-start.png'))
  page.locator('#start').click();assert page.evaluate('catchbot.snapshot().phase')=='paused'
  pt=page.evaluate('catchbot.targetScreen()');session=context.new_cdp_session(page)
  def down(x,y):
   if touch:session.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':x,'y':y,'id':1}]})
   else:page.mouse.move(x,y);page.mouse.down()
  def move(x,y):
   if touch:session.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[{'x':x,'y':y,'id':1}]})
   else:page.mouse.move(x,y)
  def up(cancel=False):
   if touch:session.send('Input.dispatchTouchEvent',{'type':'touchCancel' if cancel else 'touchEnd','touchPoints':[]})
   else:page.mouse.up()
  down(pt['x'],pt['y']);assert page.evaluate('catchbot.snapshot().phase')=='warmup'
  rect=page.locator('#field').bounding_box();cx=rect['x']+rect['width']/2;cy=rect['y']+rect['height']/2;r=(min(rect['width'],rect['height'])-48)/2*.73
  begin=time.perf_counter();snapshots=[];captured_active=False
  for i in range(135):
   a=.6+i*.09;move(cx+r*math.cos(a),cy-r*math.sin(a));page.wait_for_timeout(32)
   current=page.evaluate('catchbot.snapshot()')
   if i%15==0:snapshots.append(current)
   if current['phase']=='playing' and not captured_active:
    page.screenshot(path=str(OUT/f'{label}-active.png'));captured_active=True
  elapsed=time.perf_counter()-begin
  state=page.evaluate('catchbot.snapshot()');(OUT/f'{label}-scripted-trace.json').write_text(json.dumps({'origin':'automated CDP drag; not human data','trace':page.evaluate('catchbot.exportTrace()')},separators=(',',':')));page.screenshot(path=str(OUT/f'{label}-playing.png'))
  assert state['diagnostics']['updates']>0
  assert captured_active or state['score']>0, {'phase':state['phase'],'score':state['score']}
  # Ended rounds are allowed; if active, release must freeze the clock.
  up();paused=page.evaluate('catchbot.snapshot()');page.wait_for_timeout(220);after=page.evaluate('catchbot.snapshot()');assert paused['score']==after['score'];assert not page.evaluate('document.documentElement.scrollWidth>innerWidth')
  assert page.evaluate('scrollY')==0
  if page.locator('#compare').is_enabled():
   page.locator('#compare').click();assert page.locator('dialog').is_visible();assert 'two strategies' in page.locator('dialog').inner_text();page.locator('.close').click()
  # Repeated restarts and a cancelled gesture clear capture/history.
  for _ in range(3):page.locator('#restart').click()
  pt=page.evaluate('catchbot.targetScreen()');down(pt['x'],pt['y']);page.wait_for_timeout(100);up(True);assert page.evaluate('catchbot.snapshot().phase')=='paused'
  pt=page.evaluate('catchbot.targetScreen()');page.evaluate("document.getElementById('field').addEventListener('pointerdown',e=>window.lastPointerId=e.pointerId)")
  down(pt['x'],pt['y']);page.evaluate("document.getElementById('field').dispatchEvent(new PointerEvent('lostpointercapture',{pointerId:window.lastPointerId}))");assert page.evaluate('catchbot.snapshot().phase')=='paused';up()
  # A hidden-document event follows the same browser lifecycle handler.
  down(pt['x'],pt['y']);page.evaluate("Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));delete document.hidden");assert page.evaluate('catchbot.snapshot().phase')=='paused';up()
  page.locator('#mode').select_option('reactive');assert page.evaluate('catchbot.snapshot().phase')=='ready';page.locator('#start').click()
  pt=page.evaluate('catchbot.targetScreen()');down(pt['x'],pt['y']);page.wait_for_timeout(200);up()
  # Resize preserves normalized state (paused, so timing cannot alter q).
  before=page.evaluate('catchbot.snapshot()');page.set_viewport_size({'width':h,'height':w});page.wait_for_timeout(80);resized=page.evaluate('catchbot.snapshot()');assert before['q']==resized['q'];assert before['target']==resized['target']
  timings=page.evaluate('catchbot.performance()');timings.sort()
  results.append({'viewport':label,'width':w,'height':h,'touchEmulation':touch,'browser':browser.version,'errors':errors,'observedState':state,'scriptSeconds':elapsed,'rafMs':{'n':len(timings),'median':timings[len(timings)//2] if timings else None,'p95':timings[min(len(timings)-1,int(len(timings)*.95))] if timings else None},'checks':'start, actual drag, warmup, online predictions, release pause, no scroll, compare, cancel, lost capture, visibility handler, restart, mode reset, resize'})
  assert not errors,errors
  context.close()
 browser.close()
(OUT/'chrome.json').write_text(json.dumps({'url':BASE,'physicalPhone':False,'results':results},indent=2)+'\n')
print(json.dumps([{k:r[k] for k in ['viewport','browser','rafMs','errors']} for r in results],indent=2))
