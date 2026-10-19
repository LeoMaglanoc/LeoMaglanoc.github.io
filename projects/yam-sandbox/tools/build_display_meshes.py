"""Decimate render-only meshes; native compiled mesh frame, never used in physics."""
from pathlib import Path
import json,hashlib
import mujoco as mj
import numpy as np
import trimesh
ROOT=Path(__file__).resolve().parents[1]
m=mj.MjModel.from_xml_path(str(ROOT/'scene/bimanual_scene.xml'));out={};stats=[]
for i in range(m.nmesh):
 va=m.mesh_vertadr[i];fa=m.mesh_faceadr[i]
 vertices=m.mesh_vert[va:va+m.mesh_vertnum[i]].astype(np.float64);faces=m.mesh_face[fa:fa+m.mesh_facenum[i]]
 # Render-only 3 mm vertex clustering removes tiny CAD tessellation detail.
 keys,inverse=np.unique(np.round(vertices/.003).astype(np.int64),axis=0,return_inverse=True)
 count=np.bincount(inverse);clustered=np.stack([np.bincount(inverse,weights=vertices[:,a])/count for a in range(3)],axis=1)
 clustered_faces=inverse[faces]
 valid=(clustered_faces[:,0]!=clustered_faces[:,1])&(clustered_faces[:,1]!=clustered_faces[:,2])&(clustered_faces[:,0]!=clustered_faces[:,2])
 merged=trimesh.Trimesh(vertices=clustered,faces=clustered_faces[valid],process=True)
 merged.update_faces(merged.unique_faces());merged.update_faces(merged.nondegenerate_faces())
 v,f=merged.vertices,merged.faces
 out[str(i)]=dict(vertices=np.round(v,7).ravel().tolist(),faces=f.ravel().tolist())
 stats.append(dict(mesh=i,original_triangles=len(faces),display_triangles=len(f)))
(ROOT/'display-meshes.json').write_text(json.dumps(dict(scene_sha256=hashlib.sha256((ROOT/'scene/bimanual_scene.xml').read_bytes()).hexdigest(),meshes=out),separators=(',',':'))+'\n')
(ROOT/'results/display-meshes.json').write_text(json.dumps(stats,indent=2)+'\n')
print('Display triangles per arm:',sum(s['display_triangles'] for s in stats),'original:',sum(s['original_triangles'] for s in stats))
