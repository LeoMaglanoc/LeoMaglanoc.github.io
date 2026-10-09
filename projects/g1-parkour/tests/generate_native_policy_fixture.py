"""Run inside the matching Holosoma inference environment; no SDK is constructed."""
import argparse
from collections import deque
import json
import numpy as np
import onnxruntime as ort
from holosoma_inference.policies.depth_distillation import DepthDistillationPolicy
from holosoma_inference.config.config_values.inference import g1_wbt_distillation_d435i


def generate(data, model):
    cfg = g1_wbt_distillation_d435i
    p = object.__new__(DepthDistillationPolicy)
    p.config = cfg
    p.robot_config = cfg.robot
    p.num_dofs = 29
    p.dof_names = list(cfg.robot.dof_names)
    p.default_dof_angles = np.array(cfg.robot.default_dof_angles)
    p.last_policy_action = np.array([data['previousActions']], dtype=np.float32)
    p.lin_vel_command = np.zeros((1, 2))
    p.ang_vel_command = np.zeros((1, 1))
    p.stand_command = np.zeros((1, 1))
    p.obs_dict = cfg.observation.obs_dict
    p.obs_dims = cfg.observation.obs_dims
    p.obs_scales = cfg.observation.obs_scales
    p.history_length_dict = cfg.observation.history_length_dict
    p.obs_terms_sorted = {k: list(v) for k, v in p.obs_dict.items()}
    p.obs_history_buffers = {k: {term: deque(maxlen=p.history_length_dict.get(k, 1)) for term in terms} for k, terms in p.obs_dict.items()}
    p.obs_buf_dict = {}
    p._real2model_index = None
    p._model2real_index = None
    p._init_waist_joint_indices()
    p.velocity_command_dim = 15
    p.velocity_command = np.array([data['command']], dtype=np.float32)
    p._get_depth_latent = lambda: np.array([data['latent']], dtype=np.float32)
    p._service_recording = lambda _: None
    p.onnx_input_names = ['obs', 'time_step']
    obs = p.prepare_obs_for_rl(np.array([data['state']]))
    options = ort.SessionOptions()
    options.intra_op_num_threads = options.inter_op_num_threads = 1
    session = ort.InferenceSession(model, sess_options=options, providers=['CPUExecutionProvider'])
    actions = session.run(['actions'], obs)[0]
    return dict(reference='Holosoma 70a344f DepthDistillationPolicy.prepare_obs_for_rl + ONNX Runtime CPU',
                observation=obs['obs'].flatten().tolist(), actions=actions.flatten().tolist())

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--input', required=True)
    parser.add_argument('--model', required=True)
    args = parser.parse_args()
    print(json.dumps(generate(json.load(open(args.input)), args.model)))
