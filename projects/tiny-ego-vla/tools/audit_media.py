"""Check exported human-frame/overlay alignment and all replay encodings."""

from common import *
import numpy as np, cv2, argparse


def probe(path):
    record = json.loads(
        subprocess.check_output(
            ["ffprobe", "-v", "error", "-show_streams", "-of", "json", str(path)],
            text=True,
        )
    )
    assert len(record["streams"]) == 1
    stream = record["streams"][0]
    assert stream["codec_name"] == "h264" and stream["pix_fmt"] == "yuv420p"
    assert stream["avg_frame_rate"] == "10/1"
    content = path.read_bytes()
    assert 0 <= content.find(b"moov") < content.find(b"mdat")
    return stream


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--human-only", action="store_true")
    args = parser.parse_args()
    clips = json.loads((ART / "web-clips.json").read_text())
    records = []
    for clip in clips:
        labels = json.loads((WEB / clip["annotations"]).read_text())
        stream = probe(WEB / clip["video"])
        count = len(labels["hands"])
        assert int(stream["nb_frames"]) == count
        source = np.load(DATA / f"{clip['source']}_processed.npz")["frames"]
        cap = cv2.VideoCapture(str(WEB / clip["video"]))
        errors = []
        for index in [0, count // 2, count - 1]:
            cap.set(cv2.CAP_PROP_POS_FRAMES, index)
            ok, image = cap.read()
            assert ok
            image = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
            reference = source[round(clip["start"] * labels["fps"]) + index]
            error = float(np.abs(image.astype(float) - reference).mean())
            assert error < 10, (clip["id"], index, error)
            errors.append({"frame": index, "rgb_mae": error})
        cap.release()
        records.append(
            {
                "clip": clip["id"],
                "frames": count,
                "alignment_samples": errors,
                "sha256": sha(WEB / clip["video"]),
            }
        )
    rollouts = []
    if not args.human_only:
        result = json.loads((WEB / "results.json").read_text())
        assert result["preview"] is False
        for row in result["robot"]["rollouts"]:
            stream = probe(WEB / row["video"])
            assert int(stream["nb_frames"]) == 1 + (row["length"] + 1) // 2
            assert stream["width"] in [128, 384] and stream["height"] == stream["width"]
            raw = (
                ART
                / "rollouts"
                / row["run"]
                / row["task"]
                / f"episode-{row['initialization']}.mp4"
            )
            reference_path = (
                raw.with_name(raw.stem + "-hi.mp4") if stream["width"] == 384 else raw
            )
            public, reference = cv2.VideoCapture(
                str(WEB / row["video"])
            ), cv2.VideoCapture(str(reference_path))
            errors = []
            for index in [
                0,
                int(stream["nb_frames"]) // 2,
                int(stream["nb_frames"]) - 1,
            ]:
                public.set(cv2.CAP_PROP_POS_FRAMES, index)
                reference.set(cv2.CAP_PROP_POS_FRAMES, index)
                ok_a, frame_a = public.read()
                ok_b, frame_b = reference.read()
                assert ok_a and ok_b and frame_a.shape == frame_b.shape
                error = float(np.abs(frame_a.astype(float) - frame_b).mean())
                assert error < 10, (row["video"], index, error)
                errors.append({"frame": index, "rgb_mae": error})
            public.release()
            reference.release()
            rollouts.append(
                {
                    "video": row["video"],
                    "frames": int(stream["nb_frames"]),
                    "size": stream["width"],
                    "alignment_samples": errors,
                    "sha256": sha(WEB / row["video"]),
                }
            )
        assert len(rollouts) == 180
    report = {
        "passed": True,
        "scope": "human only" if args.human_only else "complete exhibit",
        "checks": "human first/middle/last frames align with labeled source (RGB MAE <10 including recompression); rollout first/middle/last frames align with retained source replay (RGB MAE <10); exact frame counts; 10fps H264 yuv420p video-only fast-start MP4",
        "human": records,
        "rollouts": rollouts,
    }
    save_json(
        PROJECT / ("human-media-audit.json" if args.human_only else "media-audit.json"),
        report,
    )
    print(
        "PASS: human frame/overlay alignment and",
        len(rollouts),
        "rollout encodings",
        flush=True,
    )


if __name__ == "__main__":
    main()
