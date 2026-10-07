"""Verify retained checkpoint integrity, deployment identity, and exact assets."""
import hashlib, json
from pathlib import Path
import onnxruntime as ort
import mujoco
import numpy as np
root=Path('/work')
p=root/'projects/dexterous-rl'
provenance=json.loads((p/'checkpoints/provenance.json').read_text())
archive=p/'checkpoints'/provenance['upstream_source_archive']
assert hashlib.sha256(archive.read_bytes()).hexdigest()==provenance['upstream_source_archive_sha256']
for line in (p/'checkpoints/released/SHA256SUMS').read_text().splitlines():
    digest,name=line.split('  ',1)
    assert hashlib.sha256((p/'checkpoints/released'/name).read_bytes()).hexdigest()==digest,name
assert (p/'web/policy.onnx').read_bytes()==(p/'checkpoints/released/policy.onnx').read_bytes()
s=ort.InferenceSession(str(p/'web/policy.onnx'),providers=['CPUExecutionProvider'])
identity=json.loads(s.get_modelmeta().custom_metadata_map['wuji_policy_identity'])
config=json.loads((p/'web/config.json').read_text())
for key,value in identity.items():
    assert config[key]==value,key
m=mujoco.MjModel.from_xml_path(str(p/'web/scene.xml'))
assert mujoco.__version__=='3.11.0'
assert m.nu==20 and m.nq==27
assert m.opt.timestep==config['sim_dt']==.01
assert np.all(np.isfinite(config['initial_qpos']))
for mesh in (p/'web/meshes').iterdir():
    matches=list((p/'vendor/wuji-mjlab/src/wuji_mjlab/assets').rglob(mesh.name))
    assert any(mesh.read_bytes()==x.read_bytes() for x in matches),mesh.name
print(json.dumps({'passed':True,'nativeMujoco':mujoco.__version__,'nativeONNXRuntime':ort.__version__,'actorInputs':s.get_inputs()[0].shape,'actorOutputs':s.get_outputs()[0].shape,'joints':20,'unchangedMeshFiles':len(list((p/'web/meshes').iterdir()))},indent=2))
