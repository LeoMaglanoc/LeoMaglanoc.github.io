"""Predeclared 20 nominal + 10 ±5 mm offsets per task, plus broken-contact control."""
import json,time
from native_pick_place import Simulation,ROOT
OFFSETS=[(-.005,-.005),(-.005,0),(-.005,.005),(0,-.005),(0,.005),(.005,-.005),(.005,0),(.005,.005),(-.0025,.0025),(.0025,-.0025)]
results=dict(engine='MuJoCo 3.11.0 / Docker',offsets=OFFSETS,tasks={})
start=time.monotonic()
for obj in ['cube','cylinder']:
 runs=[]
 for i,offset in enumerate([(0,0)]*20+OFFSETS):
  r=Simulation(obj,offset).run();r.pop('samples');r['offset']=offset;r['trial']=i;runs.append(r);print(obj,i,r['success'],r['reason'],flush=True)
 fail=Simulation(obj,disable_contacts=True).run();fail.pop('samples')
 results['tasks'][obj]=dict(nominal_passed=sum(r['success'] for r in runs[:20]),offset_passed=sum(r['success'] for r in runs[20:]),runs=runs,disabled_contacts=fail)
 results['wall_seconds']=time.monotonic()-start
 (ROOT/'results/native-evaluation.json').write_text(json.dumps(results,indent=2)+'\n')
assert all(t['nominal_passed']==20 and t['offset_passed']>=8 and not t['disabled_contacts']['success'] for t in results['tasks'].values())
