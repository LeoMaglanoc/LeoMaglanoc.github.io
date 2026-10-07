"""Export short licensed clips and actual detector/skeleton tracks; no synthetic footage."""

from common import *
import numpy as np, cv2, torch
from PIL import Image

SPECS = [
    ("pour", "P01_08", 82, 91, "Pour water into a glass", "train"),
    ("cup", "P01_04", 0, 5.2, "Take a cup, then put it down", "validation"),
    ("milk", "P01_03", 53, 65, "Open and pour soy milk", "train"),
]


def export_human():
    media = WEB / "media"
    media.mkdir(exist_ok=True)
    clips = []
    for cid, video, start, end, label, split in SPECS:
        labels = json.loads((DATA / f"{video}_labels.json").read_text())
        fps = labels["fps"]
        a = round(start * fps)
        b = round(end * fps)
        out = media / f"{cid}.mp4"
        subprocess.run(
            [
                "ffmpeg",
                "-v",
                "error",
                "-ss",
                str(start),
                "-i",
                str(DATA / f"{video}_small.mp4"),
                "-t",
                str(end - start),
                "-an",
                "-map",
                "0:v:0",
                "-map_metadata",
                "-1",
                "-map_chapters",
                "-1",
                "-c:v",
                "libx264",
                "-preset",
                "fast",
                "-crf",
                "23",
                "-pix_fmt",
                "yuv420p",
                "-movflags",
                "+faststart",
                "-threads",
                "2",
                "-y",
                str(out),
            ],
            check=True,
        )
        frames = np.load(DATA / f"{video}_processed.npz")["frames"]
        Image.fromarray(frames[a]).save(media / f"{cid}.webp", quality=85)
        small = {
            k: labels[k][a:b] for k in ["hands", "objects", "contact", "instructions"]
        }
        small.update(
            {
                "fps": fps,
                "source": video,
                "source_start": start,
                "label_source": labels["label_source"],
            }
        )
        save_json(media / f"{cid}.json", small)
        clips.append(
            {
                "id": cid,
                "source": video,
                "label": label,
                "split": split,
                "video": f"media/{cid}.mp4",
                "poster": f"media/{cid}.webp",
                "annotations": f"media/{cid}.json",
                "start": start,
                "end": end,
            }
        )
    import shutil

    shutil.copy2(media / "pour.webp", media / "ego-poster.webp")
    save_json(ART / "web-clips.json", clips)


def export_expert():
    (WEB / "media").mkdir(exist_ok=True)
    from simulator import make_env, upright_frame
    import h5py, imageio

    env, task = make_env("bowl_plate", size=384)
    frames = []
    with h5py.File(DATA / "bowl_plate.hdf5") as f:
        d = f["data/demo_0"]
        # State replay preserves the official expert trajectory; no trained-policy claim.
        for i in range(0, len(d["states"]), 2):
            env.set_init_state(d["states"][i])
            frames.append(upright_frame(env, 384))
    env.close()
    imageio.mimsave(
        str(WEB / "media/expert.mp4"),
        frames,
        fps=10,
        codec="libx264",
        quality=8,
        macro_block_size=1,
    )
    Image.fromarray(frames[0]).save(WEB / "media/expert-poster.webp", quality=85)
    save_json(
        ART / "expert-media.json",
        {
            "task": task.name,
            "demo": 0,
            "source": "official LIBERO demonstration states",
            "frames": len(frames),
            "fps": 10,
            "render_size": 384,
        },
    )


if __name__ == "__main__":
    import argparse

    p = argparse.ArgumentParser()
    p.add_argument("mode", choices=["human", "expert"])
    args = p.parse_args()
    export_human() if args.mode == "human" else export_expert()
