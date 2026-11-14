"""Inspect existing shards without rerunning the simulator."""
import gzip,json,argparse
from pathlib import Path
import numpy as np
p=argparse.ArgumentParser();p.add_argument('data',nargs='?',default='local-data');a=p.parse_args();root=Path(a.data);m=json.loads((root/'metadata.json').read_text());print(json.dumps(m,indent=2))
for name,dtype,expected in [('images','uint8',m['episodes']*(m['steps']+1)*8192),('states','float32',m['episodes']*(m['steps']+1)*9),('actions','float32',m['episodes']*m['steps']*2),('contact','uint8',m['episodes']*m['steps'])]:
 array=np.frombuffer(gzip.decompress((root/f'{name}.bin.gz').read_bytes()),dtype=dtype);assert array.size==expected,(name,array.size,expected);assert np.isfinite(array).all();print(name,'elements',array.size,'min',array.min(),'max',array.max())
