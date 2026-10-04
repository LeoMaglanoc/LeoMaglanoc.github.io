import json
from pathlib import Path
import mujoco
import numpy as np
import onnxruntime as ort
import torch
from training.config import Config
from training.dreamer import Dreamer
from training.export_onnx import export


def test_onnx_and_physics_export(tmp_path):
    agent = Dreamer(Config())
    metadata = export(agent, tmp_path)
    assert max(metadata["parity"]["max_absolute_errors"].values()) < 1e-5
    model = mujoco.MjModel.from_xml_path(str(tmp_path / "cartpole.xml"))
    data = mujoco.MjData(model)
    trace = json.loads((tmp_path / "reference_trace.json").read_text())
    data.qpos[:] = trace["initial_qpos"]
    data.qvel[:] = trace["initial_qvel"]
    mujoco.mj_forward(model, data)
    for step in trace["steps"]:
        data.ctrl[:] = step["action"]
        for _ in range(metadata["action_repeat"]):
            # dm_control legacy_step=False uses mj_step2 then mj_step1.
            # Plain mj_step has the same integration, but post-step derived
            # fields need forwarding before observations are extracted.
            mujoco.mj_step(model, data)
        mujoco.mj_forward(model, data)
        np.testing.assert_allclose(data.qpos, step["qpos"], atol=2e-5, rtol=2e-5)
        np.testing.assert_allclose(data.qvel, step["qvel"], atol=2e-5, rtol=2e-5)


def test_shipped_graphs_when_present():
    path = Path("models/model_metadata.json")
    if not path.exists():
        return
    metadata = json.loads(path.read_text())
    opts = ort.SessionOptions()
    opts.intra_op_num_threads = 1
    for name, contract in metadata["graphs"].items():
        session = ort.InferenceSession(f"models/{name}.onnx", opts)
        assert [v.name for v in session.get_inputs()] == contract["inputs"]
        assert [v.name for v in session.get_outputs()] == contract["outputs"]
