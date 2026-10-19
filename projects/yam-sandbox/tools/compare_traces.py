"""Compare native/WASM states at all actual phase boundaries; fail on divergence."""
import json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
report={}
for obj in ['cube','cylinder']:
 a=json.loads((ROOT/'results'/f'{obj}-trace.json').read_text())
 b=json.loads((ROOT/'results'/f'{obj}-browser-trace.json').read_text())
 assert len(a['trace'])==len(b['trace'])
 maxima={key:0. for key in ['pos','velocity','qpos','ctrl','time','grip']}
 for x,y in zip(a['trace'],b['trace']):
  assert x['phase']==y['phase'] and x['finger_contacts']==y['finger_contacts'] and x['table_contacts']==y['table_contacts']
  for k in maxima:
   xx=x[k] if isinstance(x[k],list) else [x[k]];yy=y[k] if isinstance(y[k],list) else [y[k]]
   maxima[k]=max(maxima[k],max(abs(v-w) for v,w in zip(xx,yy)))
 assert maxima['pos']<.001 and maxima['qpos']<.001 and maxima['velocity']<.01 and maxima['ctrl']<1e-9 and maxima['time']<1e-9,maxima
 report[obj]=dict(max_absolute_difference=maxima,contacts_identical=True,phase_count=len(a['trace']),native_success=a['success'],browser_success=b['success'])
(ROOT/'results/parity.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report,indent=2))
