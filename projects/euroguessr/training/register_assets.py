"""Register only public runtime files, never datasets or checkpoints."""

import json
from pathlib import Path

project = Path(__file__).resolve().parents[1]
root = project.parents[1]
paths = [
    "index.html",
    "style.css",
    "countries.geojson",
    "cities.json",
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
entry = {
    "destination": "assets/interactive/euroguessr",
    "files": sorted(paths),
}
# Preserve unrelated entries and their formatter layout.
document = manifest.read_text()
block = json.dumps({"projects/euroguessr": entry}, indent=2)[2:-2]
key = '  "projects/euroguessr": {'
if key in document:
    start = document.index(key)
    end = document.index("\n  }", start) + len("\n  }")
    document = document[:start] + block + document[end:]
else:
    document = document.rstrip()[:-1].rstrip() + ",\n" + block + "\n}\n"
# Confirm this remains valid JSON before updating the manifest.
json.loads(document)
manifest.write_text(document)
