import json, numpy as np
from PIL import Image, ImageDraw
from common import ASSETS, PROJECT

for p in (ASSETS / "data").glob("*/manifest.json"):
    m = json.loads(p.read_text())
    rs = json.loads((p.parent / "regions.json").read_text())
    im = (
        Image.open(p.parent / "scene.webp")
        .convert("RGB")
        .resize((m["maskWidth"], m["maskHeight"]))
    )
    counts = np.fromfile(p.parent / "masks.bin", dtype="<u4")
    sheet = Image.new("RGB", (800, 140 * ((len(rs) + 4) // 5)), "#f4f3ed")
    d = ImageDraw.Draw(sheet)
    for i, r in enumerate(rs):
        c = counts[r["rleOffset"] : r["rleOffset"] + r["rleLength"]]
        mask = np.repeat(np.arange(len(c)) % 2, c).reshape(
            m["maskHeight"], m["maskWidth"]
        )
        arr = np.where(mask[:, :, None], np.array(im), 200).astype("uint8")
        x, y, w, h = r["bbox"]
        crop = Image.fromarray(arr).crop((x, y, x + w + 1, y + h + 1))
        crop.thumbnail((156, 110))
        xx = (i % 5) * 160
        yy = (i // 5) * 140
        sheet.paste(crop, (xx, yy))
        d.text((xx + 3, yy + 113), f"#{r['id']} {r['pixelArea']}px", fill="black")
    sheet.save(PROJECT / f"artifacts/{m['sceneId']}-regions.jpg")
