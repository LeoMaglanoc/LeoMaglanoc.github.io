"""Compact native inference vectors for the browser's startup gate."""
import json
from pathlib import Path
r=Path('projects/g1-loco-manipulation')
v=[]
for task in ['carrybox','pushbox']:
 for f in json.loads((r/f'fixture-{task}.json').read_text())['frames'][:2]:v.append({'task':task,'obs':f['obs'],'actions':f['actions']})
(r/'golden.json').write_text(json.dumps(v,separators=(',',':')))
