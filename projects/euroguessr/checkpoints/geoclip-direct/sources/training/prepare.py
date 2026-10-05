"""Resumable, bounded OSV-5M sampler using verified HTTP byte ranges."""

import argparse, csv, io, json, struct, zlib, hashlib, time
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed
import requests
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
REVISION = "cff33609b56b54d8743b7ee7a416eb8433e9a681"
BASE = f"https://huggingface.co/datasets/osv5m/osv5m/resolve/{REVISION}/"
COUNTRIES = set(
    "AL AD AT BE BA BG HR CY CZ DK EE FI FR DE GR HU IS IE IT LV LI LT LU MT MD MC ME NL MK NO PL PT RO SM RS SK SI ES SE CH GB UA VA".split()
)


def request(url, byte_range=None):
    for attempt in range(5):
        try:
            r = requests.get(
                url,
                headers={"Range": f"bytes={byte_range}"} if byte_range else {},
                timeout=(20, 90),
                stream=not byte_range,
            )
            r.raise_for_status()
            if byte_range and r.status_code != 206:
                raise ValueError("Server ignored byte range")
            return r
        except (requests.RequestException, ValueError):
            if attempt == 4:
                raise
            time.sleep(2**attempt)


def index(split, shard):
    cache = DATA / f"{split}-{shard}-index.json"
    if cache.exists():
        return json.loads(cache.read_text())
    url = BASE + f"images/{split}/{shard:02d}.zip"
    tail = request(url + "?part=tail", "-65536").content
    e = struct.unpack("<4s4H2LH", tail[-22:])
    size, off = e[5:7]
    b = request(url + "?part=index", f"{off}-{off+size-1}").content
    out = {}
    p = 0
    while b[p : p + 4] == b"PK\x01\x02":
        f = struct.unpack_from("<4s6H3L5H2L", b, p)
        n, x, c = f[10:13]
        name = b[p + 46 : p + 46 + n].decode()
        p += 46 + n + x + c
        if name.endswith(".jpg"):
            out[Path(name).stem] = {
                "offset": f[16],
                "size": f[8],
                "crc": f[7],
                "method": f[4],
                "url": url,
                "name": name,
            }
    cache.write_text(json.dumps(out))
    return out


def metadata(split):
    cache = DATA / f"{split}-europe.json"
    if cache.exists():
        return json.loads(cache.read_text())
    print("Streaming metadata", split, flush=True)
    r = request(BASE + split + ".csv")
    rows = []
    n = 0
    lines = (b.decode("utf-8") for b in r.iter_lines(chunk_size=1024 * 1024))
    for row in csv.DictReader(lines):
        n += 1
        if n % 250000 == 0:
            print("metadata rows", split, n, flush=True)
        if (
            row["country"] in COUNTRIES
            and 34 <= float(row["latitude"]) <= 72
            and -25 <= float(row["longitude"]) <= 45
        ):
            rows.append(
                {
                    k: row[k]
                    for k in [
                        "id",
                        "latitude",
                        "longitude",
                        "country",
                        "sequence",
                        "creator_username",
                        "creator_id",
                        "captured_at",
                    ]
                }
            )
    cache.write_text(json.dumps(rows))
    print("Europe rows", split, len(rows), flush=True)
    return rows


def source_bytes(row, entry):
    off = entry["offset"]
    header = request(
        entry["url"] + f"?image={row['id']}&part=h", f"{off}-{off+29}"
    ).content
    f = struct.unpack("<4s5H3L2H", header)
    start = off + 30 + f[-2] + f[-1]
    b = request(
        entry["url"] + f"?image={row['id']}&part=b", f"{start}-{start+entry['size']-1}"
    ).content
    if entry["method"] == 8:
        b = zlib.decompress(b, -15)
    if zlib.crc32(b) != entry["crc"]:
        raise ValueError("ZIP checksum mismatch")
    return b


def fetch(pair):
    row, entry = pair
    path = DATA / "images" / f"{row['id']}.jpg"
    if path.exists():
        return row
    b = source_bytes(row, entry)
    image = Image.open(io.BytesIO(b)).convert("RGB")
    image.thumbnail((640, 640))
    tmp = path.with_suffix(".tmp")
    image.save(tmp, format="JPEG", quality=88)
    tmp.replace(path)
    return row


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--train", type=int, default=1600)
    p.add_argument("--test", type=int, default=180)
    p.add_argument("--shards", type=int, default=1)
    p.add_argument("--workers", type=int, default=6)
    args = p.parse_args()
    DATA.mkdir(exist_ok=True)
    (DATA / "images").mkdir(exist_ok=True)
    (DATA / "dataset-revision.json").write_text(
        json.dumps(
            {"repo": "osv5m/osv5m", "revision": REVISION, "license": "cc-by-sa-4.0"},
            indent=2,
        )
    )
    allrows = []
    for source, count in [("train", args.train), ("test", args.test)]:
        entries = {}
        for shard in range(args.shards):
            entries.update(index(source, shard))
        rows = [r for r in metadata(source) if r["id"] in entries]
        # Stable order interleaves countries; sequence dedup avoids adjacent views.
        groups = {}
        seen = set()
        for r in sorted(
            rows, key=lambda r: hashlib.sha256(r["id"].encode()).hexdigest()
        ):
            if r["sequence"] in seen:
                continue
            seen.add(r["sequence"])
            groups.setdefault(r["country"], []).append(r)
        chosen = []
        for i in range(max(map(len, groups.values()))):
            for country in sorted(groups):
                if i < len(groups[country]):
                    chosen.append(groups[country][i])
                if len(chosen) >= count:
                    break
            if len(chosen) >= count:
                break
        print("Selected", source, len(chosen), flush=True)
        for r in chosen:
            r["source_split"] = source
            # Spatial blocks assigned independently of images, never random image splits.
            block = f"{int(float(r['latitude'])//3)}:{int(float(r['longitude'])//3)}"
            r["block"] = block
            r["split"] = (
                "test"
                if source == "test"
                else (
                    "val"
                    if int(hashlib.sha256(block.encode()).hexdigest()[:8], 16) % 5 == 0
                    else "train"
                )
            )
        with ThreadPoolExecutor(max_workers=args.workers) as pool:
            futures = {pool.submit(fetch, (r, entries[r["id"]])): r for r in chosen}
            for i, f in enumerate(as_completed(futures)):
                try:
                    allrows.append(f.result())
                except Exception as e:
                    print("FAILED", futures[f]["id"], str(e), flush=True)
                if (i + 1) % 100 == 0:
                    print("Downloaded", source, i + 1, flush=True)
        # Save after each split so interrupted runs retain usable manifests.
        allrows.sort(key=lambda r: (r["source_split"], r["id"]))
        (DATA / "manifest.json").write_text(json.dumps(allrows, indent=2))
    print("Saved manifest", len(allrows), flush=True)


if __name__ == "__main__":
    main()
