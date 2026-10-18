"""Verify checkpoint, shared-dependency and public-runtime identity."""

import argparse
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WEBSITE = ROOT.parents[1]


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--write",
        action="store_true",
        help="Explicitly accept the current validated runtime hashes",
    )
    args = parser.parse_args()
    provenance = json.loads((ROOT / "provenance.json").read_text())
    for item in provenance["shared_assets"]:
        assert digest(WEBSITE / item["path"]) == item["sha256"], item["path"]
    for item in provenance["checkpoints"]:
        assert digest(ROOT / item["path"]) == item["sha256"], item["path"]
    manifest = ROOT / "asset-hashes.json"
    if args.write:
        public = json.loads((WEBSITE / "scripts/project-assets.json").read_text())[
            "projects/g1-soccer"
        ]["files"]
        paths = [ROOT / p for p in public]
        paths += [
            WEBSITE / p
            for p in [
                "assets/interactive/shared/mujoco-three-renderer.js",
                "assets/interactive/mobile-sorting/vendor/three.module.js",
                "assets/interactive/mobile-sorting/vendor/three.core.js",
                "assets/interactive/mobile-sorting/vendor/OrbitControls.js",
                "assets/interactive/language-vision/vendor/ort.wasm.min.mjs",
                "assets/interactive/language-vision/vendor/ort-wasm-simd-threaded.mjs",
                "assets/interactive/euroguessr/vendor/ort-wasm-simd-threaded.wasm",
            ]
        ]
        manifest.write_text(
            json.dumps(
                [
                    dict(
                        path=p.relative_to(WEBSITE).as_posix(),
                        bytes=p.stat().st_size,
                        sha256=digest(p),
                    )
                    for p in sorted(paths)
                ],
                indent=2,
            )
            + "\n"
        )
    items = json.loads(manifest.read_text())
    for item in items:
        path = WEBSITE / item["path"]
        assert path.stat().st_size == item["bytes"], item["path"]
        assert digest(path) == item["sha256"], item["path"]
    print(
        f"Verified {len(items)} runtime files, {len(provenance['shared_assets'])} shared Unitree assets and {len(provenance['checkpoints'])} checkpoint artifacts"
    )


if __name__ == "__main__":
    main()
