"""Download curated photographs under the Pexels license; preserve sources."""

import json, subprocess
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / "assets/interactive/language-vision/data"
SCENES = [
    ("electrical", "Electrical tools", 6349402),
    ("tools", "Hand tools", 4346892),
    ("workshop", "Workbench", 9180362),
    ("desk", "Desk", 4050315),
    ("kitchen", "Kitchen table", 1640777),
    ("living-room", "Living room", 1571460),
    ("street", "City street", 378570),
    ("market", "Market", 264636),
    ("candlelight", "Candlelight", 2031751),
    ("harvest", "Harvest", 1458694),
    ("station", "Train station", 5617385),
]
if __name__ == "__main__":
    catalog = []
    folder = OUT / "toolkit"
    folder.mkdir(parents=True, exist_ok=True)
    original = ROOT / "projects/language-vision/artifacts/toolkit-original.jpg"
    source_url = "https://upload.wikimedia.org/wikipedia/commons/c/ce/Tools_66.jpg"
    if not original.exists():
        subprocess.run(
            ["curl", "-L", "--fail", "-o", str(original), source_url], check=True
        )
    im = Image.open(original).convert("RGB")
    im.thumbnail((1800, 1800))
    im.save(folder / "scene.webp", quality=87)
    thumb = im.copy()
    thumb.thumbnail((240, 160))
    thumb.save(folder / "thumb.webp", quality=75)
    catalog.append(
        dict(
            id="toolkit",
            title="Toolkit",
            width=im.width,
            height=im.height,
            photographer="Wilfredor",
            source="https://commons.wikimedia.org/wiki/File:Tools_66.jpg",
            license="https://creativecommons.org/publicdomain/zero/1.0/",
            imageUrl=source_url,
        )
    )
    for sid, title, pid in SCENES:
        folder = OUT / sid
        folder.mkdir(parents=True, exist_ok=True)
        url = f"https://images.pexels.com/photos/{pid}/pexels-photo-{pid}.jpeg?w=1800"
        source_dir = ROOT / "projects/language-vision/artifacts/source-scenes"
        source_dir.mkdir(parents=True, exist_ok=True)
        p = source_dir / (sid + ".jpg")
        if not p.exists():
            subprocess.run(["curl", "-L", "--fail", "-o", str(p), url], check=True)
        im = Image.open(p).convert("RGB")
        im.thumbnail((1800, 1800))
        im.save(folder / "scene.webp", quality=87)
        thumb = im.copy()
        thumb.thumbnail((240, 160))
        thumb.save(folder / "thumb.webp", quality=75)
        catalog.append(
            dict(
                id=sid,
                title=title,
                width=im.width,
                height=im.height,
                source=f"https://www.pexels.com/photo/{pid}/",
                license="https://www.pexels.com/license/",
                imageUrl=url,
            )
        )
    (OUT / "scenes.json").write_text(json.dumps(catalog, indent=2) + "\n")
    montage = Image.new("RGB", (800, 400), "white")
    from PIL import ImageDraw

    draw = ImageDraw.Draw(montage)
    for n, s in enumerate(catalog):
        im = Image.open(OUT / s["id"] / "scene.webp")
        im.thumbnail((200, 170))
        x = (n % 4) * 200
        y = (n // 4) * 200
        montage.paste(im, (x, y))
        draw.text((x, y + 175), s["title"], fill="black")
    montage.save(ROOT / "projects/language-vision/artifacts/scenes.jpg")
