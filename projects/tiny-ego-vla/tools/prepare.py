"""Bounded public inputs only. No credentials or gated dataset required."""

from common import *
import urllib.request

LIBERO_REV = "8f1084e3132a39270c3a13ebe37270a43ece2a01"
DATA_REV = "e329580e402fb5f07ae3b1f18475fc3b63783b91"
EPIC_ANNOTATION_REV = "ea8b40457a400c3fffa1c7f406ef3dc169cc2522"


def download(url, path):
    if path.exists():
        print("exists", path.name)
        return
    tmp = path.with_suffix(path.suffix + ".part")
    urllib.request.urlretrieve(url, tmp)
    tmp.replace(path)
    print("downloaded", path.name, flush=True)


def main():
    manifest_path = PROJECT / "data-manifest.json"
    expected = json.loads(manifest_path.read_text()) if manifest_path.exists() else None
    lib = ART / "LIBERO"
    if not lib.exists():
        subprocess.run(
            [
                "git",
                "clone",
                "--depth",
                "1",
                "https://github.com/Lifelong-Robot-Learning/LIBERO.git",
                str(lib),
            ],
            check=True,
        )
        subprocess.run(
            ["git", "fetch", "--depth", "1", "origin", LIBERO_REV], cwd=lib, check=True
        )
        subprocess.run(["git", "checkout", LIBERO_REV], cwd=lib, check=True)
    assert (
        subprocess.check_output(
            ["git", "rev-parse", "HEAD"], cwd=lib, text=True
        ).strip()
        == LIBERO_REV
    )
    for video in ["P01_03", "P01_04", "P01_08"]:
        download(
            f"https://data.bris.ac.uk/datasets/3h91syskeag572hl6tvuovwv4d/videos/train/P01/{video}.MP4",
            DATA / f"{video}.MP4",
        )
        download(
            f"https://data.bris.ac.uk/datasets/3l8eci2oqgst92n14w2yqi5ytu/hand-objects/P01/{video}.pkl",
            DATA / f"{video}_detections.pkl",
        )
    download(
        f"https://raw.githubusercontent.com/epic-kitchens/epic-kitchens-100-annotations/{EPIC_ANNOTATION_REV}/EPIC_100_train.csv",
        DATA / "epic_annotations.csv",
    )
    tasks = {
        "bowl_plate": "pick_up_the_black_bowl_next_to_the_plate_and_place_it_on_the_plate",
        "bowl_ramekin": "pick_up_the_black_bowl_next_to_the_ramekin_and_place_it_on_the_plate",
    }
    for key, name in tasks.items():
        download(
            f"https://huggingface.co/datasets/yifengzhu-hf/LIBERO-datasets/resolve/{DATA_REV}/libero_spatial/{name}_demo.hdf5",
            DATA / f"{key}.hdf5",
        )
    files = [
        p
        for p in DATA.iterdir()
        if p.suffix in (".MP4", ".hdf5", ".pkl", ".csv") and p.name != "P01_01.MP4"
    ]
    manifest = {
        "libero_revision": LIBERO_REV,
        "robot_dataset_revision": DATA_REV,
        "epic_annotation_revision": EPIC_ANNOTATION_REV,
        "files": [
            {"path": p.name, "sha256": sha(p), "bytes": p.stat().st_size} for p in files
        ],
    }
    if expected is not None:
        expected_files = {
            f["path"]: (f["sha256"], f["bytes"]) for f in expected["files"]
        }
        actual_files = {f["path"]: (f["sha256"], f["bytes"]) for f in manifest["files"]}
        assert actual_files == expected_files, (
            "Source data differs from recorded manifest; preserve the original experiment and investigate"
        )
        for key in [
            "libero_revision",
            "robot_dataset_revision",
            "epic_annotation_revision",
        ]:
            assert expected[key] == manifest[key]
        print(
            "PASS: all source files match the recorded manifest; original manifest preserved",
            flush=True,
        )
    else:
        save_json(manifest_path, manifest)
    load_encoder("MobileCLIP-S0")


if __name__ == "__main__":
    main()
