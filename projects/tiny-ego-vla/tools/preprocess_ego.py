"""Sample licensed EPIC footage; MediaPipe landmarks and supplied detector labels.
Labels are noisy 2D pseudo-labels, never presented as calibrated physical contact.
"""

from common import *

os.environ["PROTOCOL_BUFFERS_PYTHON_IMPLEMENTATION"] = "python"
import csv, pickle, cv2, numpy as np, mediapipe as mp
from epic_kitchens.hoa.types import FrameDetections


class BytesListUnpickler(pickle.Unpickler):
    def find_class(self, module, name):
        raise pickle.UnpicklingError("Only a list of protobuf byte strings is accepted")


def seconds(s):
    h, m, x = map(float, s.split(":"))
    return h * 3600 + m * 60 + x


def preprocess(video, fps=10):
    out = DATA / f"{video}_processed.npz"
    if out.exists():
        print("cached", video, flush=True)
        return
    source = DATA / f"{video}.MP4"
    # Decode/resize once with FFmpeg, keeping source timestamps at exact sample times.
    small = DATA / f"{video}_small.mp4"
    if not small.exists():
        subprocess.run(
            [
                "ffmpeg",
                "-v",
                "error",
                "-i",
                str(source),
                "-vf",
                f"fps={fps},scale=640:-2",
                "-an",
                "-c:v",
                "libx264",
                "-crf",
                "20",
                "-threads",
                "2",
                "-y",
                str(small),
            ],
            check=True,
        )
    raw = BytesListUnpickler(open(DATA / f"{video}_detections.pkl", "rb")).load()
    assert isinstance(raw, list) and all(isinstance(b, bytes) for b in raw)
    detections = {}
    for b in raw:
        d = FrameDetections.from_protobuf_str(b)
        detections[d.frame_number] = d
    rows = [
        r
        for r in csv.DictReader(open(DATA / "epic_annotations.csv"))
        if r["video_id"] == video
    ]
    cap = cv2.VideoCapture(str(small))
    frames = []
    landmarks = []
    objects = []
    contacts = []
    narration = []
    segments = []
    tracker = mp.solutions.hands.Hands(
        static_image_mode=False,
        max_num_hands=2,
        model_complexity=1,
        min_detection_confidence=0.35,
        min_tracking_confidence=0.35,
    )
    t0 = time.perf_counter()
    index = 0
    prev_center = None
    while True:
        ok, bgr = cap.read()
        if not ok:
            break
        rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
        t = index / fps
        result = tracker.process(rgb)
        hands = []
        for lm in result.multi_hand_landmarks or []:
            hands.append([[float(p.x), float(p.y)] for p in lm.landmark])
        source_frame = round(t * 59.9400599400599) + 1
        d = detections.get(source_frame)
        bbox = None
        contact = None
        if d:
            candidates = [(i, o) for i, o in enumerate(d.objects) if o.score >= 0.5]
            hd = [h for h in d.hands if h.score >= 0.5]
            if candidates and hd:
                # Use strongest hand's predicted interaction point to pick a supplied box.
                hand = max(hd, key=lambda h: h.score)
                target = np.array(hand.bbox.center) + np.array(hand.object_offset.coord)
                _, obj = min(
                    candidates,
                    key=lambda io: np.linalg.norm(np.array(io[1].bbox.center) - target),
                )
                if np.linalg.norm(np.array(obj.bbox.center) - target) < 0.3:
                    b = obj.bbox
                    bbox = [b.left, b.top, b.right, b.bottom, float(obj.score)]
                contact = float(hand.state.value in (3, 4))
        active = [
            r
            for r in rows
            if seconds(r["start_timestamp"]) <= t <= seconds(r["stop_timestamp"])
        ]
        row = active[0] if active else None
        frames.append(rgb)
        landmarks.append(hands)
        objects.append(bbox)
        contacts.append(contact)
        narration.append(row["narration"] if row else "observe the kitchen")
        segments.append(row["narration_id"] if row else f"{video}_gap")
        index += 1
    cap.release()
    tracker.close()
    # Keep both hands for visualization; choose the first available wrist for targets,
    # then require nearest wrist matching at the future timestep during dataset assembly.
    meta = {
        "video": video,
        "fps": fps,
        "frames": len(frames),
        "hands": landmarks,
        "objects": objects,
        "contact": contacts,
        "instructions": narration,
        "segments": segments,
        "label_source": "MediaPipe Hands 0.10.21; supplied EPIC hand-object detector boxes/contact; pseudo-labels",
        "source_url": f"https://data.bris.ac.uk/datasets/3h91syskeag572hl6tvuovwv4d/videos/train/P01/{video}.MP4",
        "license": "CC BY-NC 4.0",
        "source_sha256": sha(source),
        "processing_seconds": time.perf_counter() - t0,
    }
    np.savez_compressed(out, frames=np.array(frames))
    save_json(DATA / f"{video}_labels.json", meta)
    print(video, len(frames), meta["processing_seconds"], flush=True)


if __name__ == "__main__":
    import argparse

    p = argparse.ArgumentParser()
    p.add_argument("--video", nargs="+", default=["P01_03", "P01_08", "P01_04"])
    args = p.parse_args()
    for v in args.video:
        preprocess(v)
