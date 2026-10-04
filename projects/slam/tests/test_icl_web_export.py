import json
import struct
import numpy as np
import open3d as o3d
from slam_pipeline.scripts.icl_web_export import write_glb


def test_glb_preserves_geometry_units_colors_and_indices(tmp_path):
    mesh=o3d.geometry.TriangleMesh.create_box(.1,.2,.3);mesh.paint_uniform_color([.2,.5,.8])
    path=tmp_path/'mesh.glb';write_glb(mesh,path);data=path.read_bytes()
    magic,version,length=struct.unpack('<4sII',data[:12]);assert magic==b'glTF' and version==2 and length==len(data)
    json_length,kind=struct.unpack('<I4s',data[12:20]);assert kind==b'JSON';doc=json.loads(data[20:20+json_length])
    assert doc['accessors'][0]['max']==np.asarray(mesh.vertices,dtype='float32').max(axis=0).tolist()
    assert doc['accessors'][3]['count']==len(mesh.triangles)*3
    assert doc['meshes'][0]['primitives'][0]['attributes']['COLOR_0']==2
    view=doc['bufferViews'][2]
    offset=20+json_length+8+view['byteOffset']
    colors=np.frombuffer(data[offset:offset+view['byteLength']],dtype='<f4').reshape(-1,3)
    # The browser converts linear vertex colors back to sRGB on output.
    assert np.allclose(colors[0],[.03310477,.21404114,.60382734])
