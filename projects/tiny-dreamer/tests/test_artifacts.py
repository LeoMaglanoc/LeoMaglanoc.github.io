from pathlib import Path
import hashlib
import json
import numpy as np
import mujoco
import onnxruntime as ort

ROOT = Path(__file__).resolve().parents[1]


def test_shipped_artifact_integrity_and_fixed_parity():
    metadata = json.loads((ROOT / "models/model_metadata.json").read_text())
    fixtures = json.loads((ROOT / "models/inference_fixture.json").read_text())
    for name, digest in metadata["sha256"].items():
        assert (
            hashlib.sha256((ROOT / "models" / name).read_bytes()).hexdigest() == digest
        )
    opts = ort.SessionOptions()
    opts.intra_op_num_threads = 1
    for name, fixture in fixtures.items():
        session = ort.InferenceSession(
            str(ROOT / f"models/{name}.onnx"), opts, providers=["CPUExecutionProvider"]
        )
        outputs = session.run(
            None, {k: np.array(v, np.float32) for k, v in fixture["inputs"].items()}
        )
        for info, output in zip(session.get_outputs(), outputs):
            np.testing.assert_allclose(
                output, fixture["outputs"][info.name], atol=1e-5, rtol=1e-5
            )


def test_shipped_model_contract():
    model = mujoco.MjModel.from_xml_path(str(ROOT / "models/cartpole.xml"))
    assert (model.nq, model.nv, model.nu) == (2, 2, 1)
    assert model.opt.timestep == 0.01
    assert model.opt.integrator == mujoco.mjtIntegrator.mjINT_RK4
    np.testing.assert_array_equal(model.actuator_ctrlrange, [[-1, 1]])


def test_fullscreen_route_contract():
    repo = Path("/repo") if Path("/repo/_pages").exists() else ROOT.parents[1]
    page = (repo / "_pages/tiny-dreamer.md").read_text()
    layout = (repo / "_layouts/tiny-dreamer-fullscreen.html").read_text()
    assert "layout: tiny-dreamer-fullscreen" in page
    assert "relative_url" in page and "allowfullscreen" in page
    assert "100dvh" in layout and "overflow: hidden" in layout
