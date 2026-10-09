import mujoco,json
from pathlib import Path
R=Path('projects/g1-loco-manipulation')
fields=['body_inertia','body_iquat','body_ipos','dof_armature','dof_damping','dof_frictionloss','jnt_axis','actuator_gear','qpos0','body_pos','body_quat','geom_pos','geom_quat','geom_contype','geom_conaffinity','geom_solref','geom_solimp','geom_size','geom_friction','mesh_graph','mesh_pos','mesh_quat']
result={}
for task in ['carrybox','pushbox']:
 m=mujoco.MjModel.from_xml_path(str(R/'robots'/f'{task}.xml'));result[task]={f:getattr(m,f).reshape(-1).tolist() for f in fields}
(R/'artifacts'/'physics-model.json').write_text(json.dumps(result))
