"""Fullscreen built/live route smoke test in Docker Chromium."""
import json, os
from pathlib import Path
from playwright.sync_api import sync_playwright
OUT=Path(__file__).resolve().parents[1]/'validation'
BASE=os.environ.get('CATCHBOT_ROUTE','http://catchbot-built:8765/catchbot/')
LABEL=os.environ.get('CATCHBOT_LABEL','built')
results=[]
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
 for name,w,h in [('desktop',1440,900),('portrait',390,844),('landscape',844,390)]:
  c=b.new_context(viewport={'width':w,'height':h},has_touch=name!='desktop',is_mobile=name!='desktop')
  page=c.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.on('console',lambda m:errors.append(m.text) if m.type=='error' else None)
  r=page.goto(BASE);assert r.status==200
  frame=page.frame_locator('iframe');frame.locator('#start').click();page.wait_for_timeout(100)
  app=page.frames[1];assert app.evaluate('catchbot.snapshot().phase')=='paused'
  assert page.evaluate('document.documentElement.scrollWidth<=innerWidth && document.documentElement.scrollHeight<=innerHeight')
  assert app.evaluate('document.documentElement.scrollWidth<=innerWidth && document.documentElement.scrollHeight<=innerHeight')
  pt=app.evaluate('catchbot.targetScreen()');iframe=page.locator('iframe').bounding_box()
  x=pt['x']+iframe['x'];y=pt['y']+iframe['y'];page.mouse.move(x,y);page.mouse.down();page.wait_for_timeout(100);assert app.evaluate('catchbot.snapshot().phase')=='warmup';page.mouse.up();assert app.evaluate('catchbot.snapshot().phase')=='paused'
  frame.locator('#about').click();assert frame.locator('dialog').is_visible();frame.locator('.close').click()
  page.screenshot(path=str(OUT/f'{LABEL}-{name}.png'))
  results.append({'viewport':name,'width':w,'height':h,'status':r.status,'browser':b.version,'errors':errors,'iframeSource':page.locator('iframe').get_attribute('src')});assert not errors
  c.close()
 # The blog must expose CatchBot alongside its existing demo links.
 c=b.new_context();page=c.new_page();blog=BASE.split('/catchbot/')[0]+'/blog/AI-coding-agent-case-study/';r=page.goto(blog);assert r.status==200;assert page.locator('a[href="/catchbot/"]').count()>0;assert page.locator('a[href="/rustzero/"]').count()>0
 page.screenshot(path=str(OUT/f'{LABEL}-blog.png'));c.close();b.close()
(OUT/f'chrome-{LABEL}.json').write_text(json.dumps({'url':BASE,'physicalPhone':False,'results':results,'blogLink':True},indent=2)+'\n');print(json.dumps(results,indent=2))
