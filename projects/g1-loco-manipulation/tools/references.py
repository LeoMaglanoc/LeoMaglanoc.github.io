"""Export native contact-flow references, not robot rollout/animation states."""
import sys,json
from pathlib import Path
import mujoco,numpy as np
UP=Path('/upstream/native');ROOT=Path('/work/projects/g1-loco-manipulation')
sys.path[:0]=[str(UP),str(UP/'deploy_omnicontact')]
from omnicontact_runner_args import parse_args
from run_skill_omnicontact import OmniContactRunner
fields=['ref_left_wrist_pos','ref_left_wrist_quat','ref_right_wrist_pos','ref_right_wrist_quat','ref_torso_future_pos','ref_torso_future_quat','ref_left_ankle_future_pos','ref_left_ankle_future_quat','ref_right_ankle_future_pos','ref_right_ankle_future_quat','ref_contact','ref_phase']
courses=[{'id':'diagonal','name':'Diagonal','start':[1,0],'goal':[2,.5]},{'id':'straight','name':'Straight','start':[1,0],'goal':[2,0]},{'id':'offset','name':'Offset','start':[1.2,-.2],'goal':[2,-.2]}]
result={'courses':courses,'tasks':{}}
for task in ['carrybox','pushbox']:
 result['tasks'][task]={}
 for course in courses:
  sys.argv=['references','--headless','--task',task,'--policy','omnicontact_transformer.onnx','--init-pos',*map(str,[*course['start'],.55]),'--goal-pos',*map(str,[*course['goal'],.55]),'--disable-replan','--seed','0']
  r=OmniContactRunner(parse_args());r.m.opt.disableflags |= 524288;r._prepare_episode()
  result['tasks'][task][course['id']]={name:getattr(r.policy,name).tolist() for name in fields}
(ROOT/'references.json').write_text(json.dumps(result,separators=(',',':')))
