"""Create feasible nominal primal seeds for startup; not runtime controls."""
import sys,os,json,gzip
from pathlib import Path
import numpy as np,casadi as ca
sys.path.insert(0,'/opt/wb-mpc');os.chdir('/opt/wb-mpc')
from utils.gait_sequence import GaitSequence
from args import SOLVER_ARGS
root=Path('/workspace/projects/locomotion-playground/mpc');c=json.loads((root/'deployment.json').read_text())
fn=lambda name:ca.Function.deserialize(gzip.decompress((root/f'{name}.casadi.gz').read_bytes()).decode())
nlp,pack,bounds,decode=[fn(x) for x in ['nlp','pack','bounds','decode']]
opts=dict(SOLVER_ARGS['fatrop']['opts'],**{'fatrop.max_iter':100,'print_time':False,'equality':c['equality']})
solver=ca.nlpsol('nominal_seeder','fatrop',nlp,opts)
seeds={}
for gait in ['stand','walk','trot']:
 seq=GaitSequence(gait,.8);contacts,swing=seq.get_gait_schedule(0,c['dt'],14)
 params=[ca.DM(c['initial'][x['offset']:x['offset']+x['size']]) for x in c['inputs'][:14]]
 params[3]=ca.DM(contacts);params[4]=ca.DM(swing);params[5]=seq.n_contacts;params[6]=seq.swing_period;params[11]=np.zeros(6);params[12]=np.zeros(3)
 p=pack(*params);lb,ub=bounds(p)
 sol=solver(p=p,x0=c['initial'][c['inputs'][14]['offset']:],lbg=lb,ubg=ub)
 decoded=np.asarray(decode(sol['x'],*params)).flatten()
 cv=float(decoded[-1]);assert cv<1e-3,(gait,cv)
 seeds[gait]=dict(solution=np.asarray(sol['x']).flatten().tolist(),decoded=decoded.tolist(),constraint_violation=cv)
 print(gait,cv,flush=True)
(root/'seeds.json').write_text(json.dumps(seeds,separators=(',',':')))
