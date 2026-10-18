"""Stage unchanged upstream files with verified shared Unitree assets."""

from pathlib import Path
import hashlib, json, shutil

ROOT = Path(__file__).resolve().parents[1]
WEBSITE = ROOT.parents[1]


def prepare(destination=Path("/tmp/g1-soccer-reference")):
    if destination.exists():
        shutil.rmtree(destination)
    shutil.copytree(ROOT / "upstream", destination)
    shared = WEBSITE / "projects/g1"
    (destination / "assets/policy").mkdir()
    (destination / "assets/policy/motion.pt").symlink_to(shared / "models/motion.pt")
    (destination / "assets/g1_description/meshes").symlink_to(
        shared / "robots/g1/meshes", target_is_directory=True
    )
    models = destination / "train_files/runs/ppo_v1/best_model"
    models.mkdir(parents=True)
    (models / "best_model.zip").symlink_to(ROOT / "checkpoints/coach-best.zip")
    if (ROOT / "provenance.json").exists():
        manifest = json.loads((ROOT / "provenance.json").read_text())
        for entry in manifest["shared_assets"]:
            p = WEBSITE / entry["path"]
            assert hashlib.sha256(p.read_bytes()).hexdigest() == entry["sha256"], (
                f"Asset changed: {p}"
            )
    return destination


if __name__ == "__main__":
    print(prepare())
