"""Convert completed run records to a portable, backend-free exhibit.
Refuses to publish an incomplete scheduled evaluation.
"""

from common import *
import numpy as np, shutil, argparse
from PIL import Image
from datasets import CONFIG


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--preview",
        action="store_true",
        help="Local UI QA with budget 4 and seed 11 across both tasks; never publish",
    )
    args = parser.parse_args()
    budgets = [4] if args.preview else CONFIG["budgets"]
    seeds = [11] if args.preview else CONFIG["seeds"]
    task_keys = CONFIG["robot_tasks"]
    selected = json.loads((ART / "architecture-selection.json").read_text())
    kind = selected["selected"]
    ego = json.loads((CKPT / f"ego-{kind}-11/metrics.json").read_text())
    ego["architectures"] = selected["candidates"]
    ego.pop("examples", None)
    predictions = json.loads((CKPT / f"ego-{kind}-11/metrics.json").read_text())[
        "examples"
    ]
    # Choose evenly spaced examples with motion; descriptive selection only, no checkpoint tuning.
    predictions = [p for p in predictions if p["mask"][0] or p["mask"][2]][
        :: max(1, len(predictions) // 12)
    ][:12]
    out_predictions = []
    source_frames = {}
    source_labels = {}
    for i, p in enumerate(predictions):
        video = p["video"]
        t = p["frame"]
        if video not in source_frames:
            source_frames[video] = np.load(DATA / f"{video}_processed.npz")["frames"]
            source_labels[video] = json.loads(
                (DATA / f"{video}_labels.json").read_text()
            )
        meta = source_labels[video]
        Image.fromarray(source_frames[video][t]).save(
            WEB / f"media/prediction-{i}.webp", quality=85
        )
        wrist = None
        obj = None
        if p["mask"][0]:
            pairs = [
                (np.linalg.norm(np.array(y[0]) - x[0]), x, y)
                for x in meta["hands"][t]
                for y in meta["hands"][t + CONFIG["future_frames"]]
            ]
            wrist = min(pairs, key=lambda q: q[0])[1][0]
        if p["mask"][2]:
            b = meta["objects"][t]
            obj = [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2]
        out_predictions.append(
            {
                **p,
                "image": f"media/prediction-{i}.webp",
                "time": t / meta["fps"],
                "wrist": wrist,
                "object": obj,
            }
        )
    ego["predictions"] = out_predictions
    ego["prediction_audit"] = json.loads(
        (PROJECT / "human-prediction-audit.json").read_text()
    )
    metrics = []
    rollouts = []
    for budget in budgets:
        for seed in seeds:
            for regime in ["robot", "ego"]:
                run = f"robot-{regime}-{budget}-{seed}"
                metrics.append(json.loads((CKPT / run / "metrics.json").read_text()))
                for task in task_keys:
                    for init in CONFIG["evaluation_initializations"]:
                        source = ART / "rollouts" / run / task / f"episode-{init}.json"
                        row = json.loads(source.read_text())
                        original = PROJECT / row["video"]
                        hires = original.with_name(original.stem + "-hi.mp4")
                        presentation = hires if hires.exists() else original
                        if hires.exists():
                            render_record = json.loads(
                                hires.with_suffix(".json").read_text()
                            )
                            assert render_record["source_sha256"] == sha(
                                original.with_suffix(".npz")
                            )
                            assert render_record["video_sha256"] == sha(hires)
                        stem = f"{regime}-{budget}-{seed}-{task}-{init}"
                        target = WEB / f"media/{stem}.mp4"
                        # Keep high-resolution state replays intact; compress the tiny policy
                        # cameras for mobile bandwidth and the Pages size budget. Raw frames
                        # and original videos remain in the local continuation archive.
                        codec = (
                            ["-c", "copy"]
                            if hires.exists()
                            else [
                                "-c:v",
                                "libx264",
                                "-crf",
                                "28",
                                "-preset",
                                "fast",
                                "-pix_fmt",
                                "yuv420p",
                                "-threads",
                                "2",
                            ]
                        )
                        # Enforce fast-start MP4 for static hosting and mobile playback.
                        subprocess.run(
                            [
                                "ffmpeg",
                                "-v",
                                "error",
                                "-i",
                                str(presentation),
                                "-map_metadata",
                                "-1",
                                *codec,
                                "-movflags",
                                "+faststart",
                                "-y",
                                str(target),
                            ],
                            check=True,
                        )
                        frames = np.load(original.with_suffix(".npz"))["frames"]
                        poster = original.with_name(original.stem + "-hi.webp")
                        if hires.exists() and poster.exists():
                            shutil.copy2(poster, WEB / f"media/{stem}.webp")
                        else:
                            Image.fromarray(frames[0]).save(
                                WEB / f"media/{stem}.webp", quality=82
                            )
                        row["presentation"] = (
                            "384px replay of recorded simulator states"
                            if hires.exists()
                            else "128px recorded policy camera"
                        )
                        row["video"] = f"media/{stem}.mp4"
                        row["poster"] = f"media/{stem}.webp"
                        rollouts.append(row)
    summary = []
    for budget in budgets:
        for regime in ["robot", "ego"]:
            rs = [
                r
                for r in rollouts
                if r["budget_per_task"] == budget and r["regime"] == regime
            ]
            ms = [
                m
                for m in metrics
                if m["budget_per_task"] == budget and m["regime"] == regime
            ]
            summary.append(
                {
                    "budget": budget,
                    "regime": regime,
                    "successes": sum(r["success"] for r in rs),
                    "episodes": len(rs),
                    "success_rate": sum(r["success"] for r in rs) / len(rs),
                    "mean_validation_mse": float(
                        np.mean([m["best_validation_mse"] for m in ms])
                    ),
                    "mean_test_mse": float(np.mean([m["test_mse"] for m in ms])),
                    "by_seed": [
                        {
                            "seed": seed,
                            "successes": sum(
                                r["success"] for r in rs if r["seed"] == seed
                            ),
                            "episodes": sum(r["seed"] == seed for r in rs),
                        }
                        for seed in seeds
                    ],
                }
            )
    encoder_benchmark = json.loads((ART / "encoder-benchmark.json").read_text())
    sim_benchmark = json.loads((ART / "sim-fast-benchmark.json").read_text())
    tasks = [
        {
            "id": "bowl_plate",
            "label": "Bowl next to plate",
            "instruction": "pick up the black bowl next to the plate and place it on the plate",
        },
        {
            "id": "bowl_ramekin",
            "label": "Bowl next to ramekin",
            "instruction": "pick up the black bowl next to the ramekin and place it on the plate",
        },
    ]
    data = {
        "name": "TinyEgoVLA",
        "preview": args.preview,
        "date": "2026-10-07",
        "git_commit": revision(),
        "config": CONFIG,
        "clips": json.loads((ART / "web-clips.json").read_text()),
        "ego": ego,
        "robot": {
            "tasks": [task for task in tasks if task["id"] in task_keys],
            "budgets": budgets,
            "seeds": seeds,
            "initializations": len(CONFIG["evaluation_initializations"]),
            "metrics": metrics,
            "rollouts": rollouts,
            "summary": summary,
        },
        "benchmarks": {"encoder": encoder_benchmark, "simulator": sim_benchmark},
        "method": [
            [
                "Human data",
                "EPIC-KITCHENS P01_03 and P01_08 for training; P01_04 for validation. One participant, about 323 seconds total, sampled at 10 fps. CC BY-NC 4.0.",
            ],
            [
                "Preprocessing",
                "MediaPipe 21-joint skeletons; supplied EPIC hand-object detector boxes and contact estimates. Match nearby wrists and object centers within an annotated action; missing/large-jump labels are masked. These are noisy image-plane pseudo-labels. Contact labels are strongly positive-biased (92.7% train, 95.4% validation), so contact accuracy alone is uninformative.",
            ],
            [
                "Frozen features",
                "Official MobileCLIP-S0, paired 512D image/text features; checkpoint SHA-256 809b408eff74f8058843e86a1f92967097d42ba782450e85b8f4867b7f0ca0b7. Encoded once, cached and normalized.",
            ],
            [
                "Temporal model",
                f"{kind.upper()}, four observations, hidden width 128. {ego['params']:,} human-model trainable parameters. Shared image/language projections and temporal trunk transfer; the human head is discarded.",
            ],
            [
                "Losses",
                "Human: masked Smooth L1 for future wrist/object displacement ×10, plus 0.2 × contact BCE. Robot: MSE on normalized two-step 7D action chunks. AdamW, 0.0007 learning rate, gradient clipping at 1.",
            ],
            [
                "Robot data",
                "Two official LIBERO spatial tasks, 50 demonstrations each. Per task: demos 0–34 train pool, 35–41 validation, 42–49 test. Budgets use first 4, 9 or 35 training demonstrations. Normalization is fit separately on each training budget and shared across paired regimes; compare normalized MSE within budget. Stored observations are post-action; targets use the following two actions, dropping incomplete terminal chunks.",
            ],
            [
                "Control",
                "One upright agentview RGB camera, eight proprioception values (end-effector pose and gripper position); no privileged object state. Camera encoding and history update at simulation-time 10 Hz, executing two predicted actions at 20 Hz; offline CPU execution is slower than real time. Gripper prediction is thresholded to ±1.",
            ],
            [
                "Evaluation",
                "Three training seeds × two tasks × five starts from held-out demonstration states 42–46, up to 200 simulator actions. Checkpoints selected only by validation action MSE. Sparse LIBERO task success; repeat starts across seeds are correlated. No significance claim.",
            ],
            [
                "Hardware & deployment",
                "Intel Core i7-8565U laptop; 15 GiB RAM. CPU PyTorch; software OSMesa robot rendering. MediaPipe uses the CPU XNNPACK delegate. The static browser performs no ML inference or simulation.",
            ],
            [
                "RL status",
                "Not performed. No RL curve, reward improvement or real-robot execution is claimed.",
            ],
        ],
    }
    save_json(WEB / "results.json", data)
    save_json(
        PROJECT / ("preview-summary.json" if args.preview else "results-summary.json"),
        {
            "config": CONFIG,
            "architecture_selection": selected,
            "summary": summary,
            "benchmarks": data["benchmarks"],
            "human_prediction_audit": ego["prediction_audit"],
            "human_run_metrics": [
                {
                    k: v
                    for k, v in json.loads(path.read_text()).items()
                    if k not in ("curve", "examples")
                }
                for path in sorted(CKPT.glob("ego-*/metrics.json"))
            ],
            "run_metrics": [
                {k: v for k, v in m.items() if k != "curve"} for m in metrics
            ],
        },
    )
    # Preserve licenses in their original text alongside the public notes.
    (WEB / "licenses").mkdir(exist_ok=True)
    shutil.copy2(ART / "LIBERO/LICENSE", WEB / "licenses/LIBERO.txt")
    print("EXPORTED", len(rollouts), "rollouts", flush=True)


if __name__ == "__main__":
    main()
