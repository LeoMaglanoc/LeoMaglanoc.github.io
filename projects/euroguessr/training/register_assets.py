"""Register only public runtime files, never datasets or checkpoints."""

import json
from pathlib import Path

project = Path(__file__).resolve().parents[1]
root = project.parents[1]
paths = [
    "index.html",
    "style.css",
    "countries.geojson",
    "rounds.json",
    "THIRD_PARTY_NOTICES.md",
]
for directory in ["src", "models", "images", "vendor", "licenses"]:
    paths.extend(
        p.relative_to(project).as_posix()
        for p in (project / directory).rglob("*")
        if p.is_file()
    )
manifest = root / "scripts/project-assets.json"
data = json.loads(manifest.read_text())
data["projects/euroguessr"] = {
    "destination": "assets/interactive/euroguessr",
    "files": sorted(paths),
}
manifest.write_text(json.dumps(data, indent=2) + "\n")
