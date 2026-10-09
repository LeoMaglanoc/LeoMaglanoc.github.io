"""Reduce only zero-density visual meshes; preserve all collision/inertia assets."""
from pathlib import Path
import xml.etree.ElementTree as ET
import trimesh
R=Path('/work/projects/g1-loco-manipulation');p=R/'robots/robot.xml';tree=ET.parse(p);root=tree.getroot();asset=root.find('asset');assets={x.get('name'):x for x in asset.findall('mesh')};new={}
for geom in root.findall('.//geom'):
 if geom.get('group')!='1' or geom.get('contype')!='0' or geom.get('density')!='0' or not geom.get('mesh'):continue
 name=geom.get('mesh')
 if name not in new:
  original=assets[name];path=R/'robots/meshes'/original.get('file');mesh=trimesh.load(path,force='mesh')
  if len(mesh.faces)<=2500:continue
  simplified=mesh.simplify_quadric_decimation(face_count=2500)
  filename='visual-'+original.get('file');simplified.export(R/'robots/meshes'/filename)
  clone=ET.SubElement(asset,'mesh',dict(original.attrib));clone.set('name',name+'_visual');clone.set('file',filename);new[name]=name+'_visual'
 geom.set('mesh',new[name])
tree.write(p,encoding='unicode')
p.write_text('\n'.join(line.rstrip() for line in p.read_text().splitlines())+'\n')
import json
files=[p.relative_to(R).as_posix() for p in (R/'robots').rglob('*') if p.is_file()]
(R/'asset-manifest.json').write_text(json.dumps(files,indent=2))
print('Reduced visual meshes:',len(new))
