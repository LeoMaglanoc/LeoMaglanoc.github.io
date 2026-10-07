"""Shared offline paths, CPU setup and artifact helpers."""

from pathlib import Path
import os, json, time, hashlib, subprocess

ROOT = Path(__file__).resolve().parents[3]
PROJECT = ROOT / "projects/tiny-ego-vla"
DATA = PROJECT / "data"
ART = PROJECT / "artifacts"
WEB = ROOT / "assets/interactive/tiny-ego-vla"
CKPT = PROJECT / "checkpoints"
for p in (DATA, ART, WEB, CKPT):
    p.mkdir(parents=True, exist_ok=True)
os.environ.setdefault("MUJOCO_GL", "osmesa")
os.environ.setdefault("PYOPENGL_PLATFORM", "osmesa")
os.environ.setdefault("LIBERO_CONFIG_PATH", str(ART / "libero-config"))
os.environ.setdefault("OMP_NUM_THREADS", "4")


def save_json(path, value):
    Path(path).write_text(json.dumps(value, indent=2, allow_nan=False) + "\n")


def sha(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for b in iter(lambda: f.read(1024 * 1024), b""):
            h.update(b)
    return h.hexdigest()


def revision():
    return subprocess.check_output(
        ["git", "rev-parse", "HEAD"], cwd=ROOT, text=True
    ).strip()


def setup_libero():
    import yaml, sys

    sys.path.insert(0, str(ART / "LIBERO"))
    base = ART / "LIBERO/libero/libero"
    config = Path(os.environ["LIBERO_CONFIG_PATH"])
    config.mkdir(exist_ok=True)
    (config / "config.yaml").write_text(
        yaml.safe_dump(
            {
                "benchmark_root": str(base),
                "bddl_files": str(base / "bddl_files"),
                "init_states": str(base / "init_files"),
                "assets": str(base / "assets"),
                "datasets": str(DATA),
            }
        )
    )


def load_encoder(name="MobileCLIP2-S0"):
    import torch, open_clip

    torch.set_num_threads(4)
    if name == "MobileCLIP2-S0":
        model, _, preprocess = open_clip.create_model_and_transforms(
            name, pretrained="dfndr2b"
        )
        if hasattr(model.visual.trunk, "reparameterize"):
            model.visual.trunk.reparameterize()
    else:
        # Official Apple implementation is available from the existing local project.
        import mobileclip

        checkpoint = CKPT / "mobileclip_s0.pt"
        if not checkpoint.exists():
            import urllib.request

            urllib.request.urlretrieve(
                "https://docs-assets.developer.apple.com/ml-research/datasets/mobileclip/mobileclip_s0.pt",
                checkpoint,
            )
        assert (
            sha(checkpoint)
            == "809b408eff74f8058843e86a1f92967097d42ba782450e85b8f4867b7f0ca0b7"
        )
        model, _, preprocess = mobileclip.create_model_and_transforms(
            "mobileclip_s0", pretrained=str(checkpoint)
        )
    return (
        model.eval().requires_grad_(False),
        preprocess,
        open_clip.get_tokenizer("MobileCLIP2-S0"),
    )


def run_provenance():
    return {
        "started_utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "git_commit": revision(),
        "source_sha256": {p.name: sha(p) for p in (PROJECT / "tools").glob("*.py")},
        "config_sha256": sha(PROJECT / "configs/experiment.json"),
        "data_manifest_sha256": sha(PROJECT / "data-manifest.json"),
        "environment_lock_sha256": sha(PROJECT / "environment-lock.txt"),
    }
