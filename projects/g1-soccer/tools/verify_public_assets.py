"""Check deployed binary identity and JSON/MJCF data after Jekyll minification."""

import argparse
import hashlib
import json
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FILES = [
    "models/coach.onnx",
    "models/walker.onnx",
    "config.json",
    "scene/soccer_field.xml",
    "scene/g1_description/g1_12dof.xml",
    "display-meshes.json",
    "runtime/mujoco.wasm",
]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--origin", default="https://leonardo-maglanoc.com")
    parser.add_argument(
        "--commit", default=None, help="Deployed application source revision"
    )
    args = parser.parse_args()
    origin = args.origin.rstrip("/") + "/assets/interactive/g1-soccer/"
    results = []
    for name in FILES:
        request = urllib.request.Request(
            origin + name, headers={"Cache-Control": "no-cache"}
        )
        with urllib.request.urlopen(request, timeout=60) as response:
            data = response.read()
            mime, status = response.headers.get("Content-Type"), response.status
        source = (ROOT / name).read_bytes()
        if name.endswith(".json"):
            comparison = "json-data"
            assert json.loads(data) == json.loads(source), name
        elif name.endswith(".xml"):
            comparison = "xml-data"
            assert ET.canonicalize(data.decode(), strip_text=True) == ET.canonicalize(
                source.decode(), strip_text=True
            ), name
        else:
            comparison = "bytes"
            assert data == source, name
        if name.endswith(".wasm"):
            assert "application/wasm" in mime, mime
        results.append(
            dict(
                path=name,
                served_sha256=hashlib.sha256(data).hexdigest(),
                source_sha256=hashlib.sha256(source).hexdigest(),
                comparison=comparison,
                matches=True,
                bytes=len(data),
                status=status,
                content_type=mime,
            )
        )
        print(name, "verified", comparison, flush=True)
    (ROOT / "results/production-assets.json").write_text(
        json.dumps(
            dict(
                origin=origin,
                commit=args.commit,
                note="Jekyll minifies JSON/XML. Compare parsed/canonical data; ONNX/WASM bytes must match exactly.",
                assets=results,
            ),
            indent=2,
        )
        + "\n"
    )


if __name__ == "__main__":
    main()
