"""Cheap CI checks: detect stale model/reference/display assets and missing licenses."""
from pathlib import Path
import hashlib,json,xml.etree.ElementTree as ET
ROOT=Path(__file__).resolve().parents[1]
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
scene=ROOT/'scene/bimanual_scene.xml';digest=sha(scene);xml=ET.parse(scene).getroot()
assert len(xml.find('actuator'))==14 and len(xml.findall('.//camera'))==5
assert len(xml.find('equality'))==2 and not xml.findall('.//weld')
for obj in ['cube','cylinder']:
 ref=json.loads((ROOT/'references'/f'{obj}.json').read_text())
 assert ref['scene_sha256']==digest
 assert ref['tool_sha256']==sha(ROOT/'tools/generate_references.py')
 assert len(ref['waypoints'])==8
 for w in ref['waypoints']:
  assert len(w['q'])==6 and len(w['qs'])>=2
assert json.loads((ROOT/'display-meshes.json').read_text())['scene_sha256']==digest
for name in json.loads((ROOT/'asset-manifest.json').read_text()):assert (ROOT/name).is_file(),name
for name in ['YAM-MIT.txt','APACHE-2.0.txt','THREE-MIT.txt']:assert (ROOT/'licenses'/name).stat().st_size>500
provenance=ROOT/'provenance.json'
if provenance.exists():
 for name,value in json.loads(provenance.read_text())['sha256'].items():assert sha(ROOT/name)==value,f'Stale provenance: {name}'
print('YAM model, reference, display, provenance and license contracts passed')
