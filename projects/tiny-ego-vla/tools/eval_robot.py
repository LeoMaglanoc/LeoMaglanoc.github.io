"""Closed-loop rollouts on held-out demonstration initial states (42–46).
Never uses reference actions, object state, or evaluation outcomes for control.
"""

from common import *
import torch, numpy as np, h5py, imageio, argparse
from PIL import Image
from models import RobotModel
from simulator import make_env, upright_frame, proprio
from datasets import CONFIG


def evaluate(checkpoint, encoder, transform, tokenizer, task_key, env, task):
    ck = torch.load(checkpoint, weights_only=False)
    model = RobotModel(ck["kind"])
    model.load_state_dict(ck["model"])
    model.eval()
    norm = ck["norm"]
    run_dir = checkpoint.parent
    dest = ART / "rollouts" / run_dir.name / task_key
    dest.mkdir(parents=True, exist_ok=True)
    with torch.inference_mode():
        txt = torch.nn.functional.normalize(
            encoder.encode_text(tokenizer([task.language])), dim=-1
        )
    rows = []
    with h5py.File(DATA / f"{task_key}.hdf5") as f:
        for init in CONFIG["evaluation_initializations"]:
            # One-based index in UI maps to test demonstrations 42+init.
            out = dest / f"episode-{init}.json"
            if out.exists():
                rows.append(json.loads(out.read_text()))
                continue
            d = f[f"data/demo_{42 + init}"]
            t0 = time.perf_counter()
            env.reset()
            obs = env.set_init_state(d["states"][0])
            history = []
            frames = []
            actions = []
            states = []
            success = False
            total_return = 0
            for step in range(0, CONFIG["evaluation_max_steps"], 2):
                frame = upright_frame(env)
                frames.append(frame)
                with torch.inference_mode():
                    im = transform(Image.fromarray(frame))[None]
                    visual = torch.nn.functional.normalize(
                        encoder.encode_image(im), dim=-1
                    ).numpy()[0]
                    history.append(visual)
                    hist = np.array(
                        [history[max(0, len(history) - 4 + i)] for i in range(4)],
                        dtype="float32",
                    )
                    p = proprio(obs)
                    pn = (p - norm["p_mean"]) / norm["p_std"]
                    pred = model(
                        torch.from_numpy(hist)[None], txt, torch.from_numpy(pn)[None]
                    )[0].numpy()
                    chunk = (pred * norm["a_std"] + norm["a_mean"]).reshape(2, 7)
                for action in chunk:
                    action = np.clip(action, -1, 1)
                    action[6] = 1 if action[6] >= 0 else -1
                    obs, r, done, info = env.step(action)
                    actions.append(action.tolist())
                    states.append(env.get_sim_state().tolist())
                    total_return += float(r)
                    if env.check_success():
                        success = True
                        break
                if success:
                    break
            frames.append(upright_frame(env))
            # Archive raw simulator states/actions independently of compressed presentation video.
            np.savez_compressed(
                dest / f"episode-{init}.npz",
                actions=np.array(actions),
                states=np.array(states),
                initial_state=d["states"][0],
                frames=np.array(frames),
            )
            imageio.mimsave(
                str(dest / f"episode-{init}.mp4"),
                frames,
                fps=10,
                codec="libx264",
                quality=8,
                macro_block_size=1,
            )
            row = {
                "run": run_dir.name,
                "regime": ck["regime"],
                "seed": ck["seed"],
                "budget_per_task": ck["budget"],
                "task": task_key,
                "instruction": task.language,
                "initialization": init,
                "held_out_demo": 42 + init,
                "success": success,
                "return": total_return,
                "length": len(actions),
                "seconds": time.perf_counter() - t0,
                "video": str((dest / f"episode-{init}.mp4").relative_to(PROJECT)),
                "checkpoint_sha256": sha(checkpoint),
            }
            save_json(out, row)
            rows.append(row)
            print(
                "EPISODE",
                run_dir.name,
                task_key,
                init,
                success,
                len(actions),
                round(row["seconds"], 1),
                flush=True,
            )
    return rows


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--budget", type=int, nargs="+")
    p.add_argument("--seed", type=int, nargs="+")
    args = p.parse_args()
    torch.set_num_threads(4)
    encoder, transform, tokenizer = load_encoder("MobileCLIP-S0")
    rows = []
    for task_key in CONFIG["robot_tasks"]:
        env, task = make_env(task_key)
        for budget in args.budget or CONFIG["budgets"]:
            for seed in args.seed or CONFIG["seeds"]:
                for regime in ["robot", "ego"]:
                    checkpoint = CKPT / f"robot-{regime}-{budget}-{seed}/best.pt"
                    if checkpoint.exists():
                        rows.extend(
                            evaluate(
                                checkpoint,
                                encoder,
                                transform,
                                tokenizer,
                                task_key,
                                env,
                                task,
                            )
                        )
        env.close()
    save_json(ART / "robot-evaluation.json", rows)
