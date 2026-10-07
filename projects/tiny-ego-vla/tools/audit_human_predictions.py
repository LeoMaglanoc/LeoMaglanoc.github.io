"""Descriptive per-head validation audit; never selects or changes checkpoints."""

from common import *
import torch, numpy as np
from torch.utils.data import DataLoader
from datasets import EgoDataset
from models import EgoModel


def metrics(pred, target, mask):
    motion = ((pred[:, :4] - target[:, :4]).abs() / 10 * mask[:, :4]).sum(0) / mask[
        :, :4
    ].sum(0)
    valid = mask[:, 4].bool()
    p, y = pred[valid, 4].sigmoid(), target[valid, 4]
    return {
        "motion_mae_image_fraction": motion.tolist(),
        "contact_bce": float(torch.nn.functional.binary_cross_entropy(p, y)),
        "contact_brier": float(((p - y) ** 2).mean()),
        "contact_accuracy": float(((p >= 0.5) == y.bool()).float().mean()),
        "contact_mean_probability": float(p.mean()),
    }


def main():
    torch.set_num_threads(4)
    train, validation = EgoDataset("train"), EgoDataset("validation")
    yt = torch.stack([train[i][2] for i in range(len(train))])
    mt = torch.stack([train[i][3] for i in range(len(train))])
    y = torch.stack([validation[i][2] for i in range(len(validation))])
    m = torch.stack([validation[i][3] for i in range(len(validation))])
    constant = (yt * mt).sum(0) / mt.sum(0)
    baseline = constant.repeat(len(y), 1)
    baseline[:, 4] = torch.logit(baseline[:, 4].clamp(0.001, 0.999))
    zero = baseline.clone()
    zero[:, :4] = 0
    rows = []
    for folder in sorted(CKPT.glob("ego-*-*")):
        ck = torch.load(folder / "best.pt", weights_only=False)
        model = EgoModel(ck["kind"])
        model.load_state_dict(ck["model"])
        model.eval()
        outputs = []
        with torch.inference_mode():
            for v, l, _, _ in DataLoader(validation, batch_size=256):
                outputs.append(model(v, l))
        rows.append(
            {
                "run": folder.name,
                "selected_epoch": ck["epoch"] + 1,
                "checkpoint_sha256": sha(folder / "best.pt"),
                **metrics(torch.cat(outputs), y, m),
            }
        )
    report = {
        "scope": "validation video already used for model selection; descriptive, not an independent test",
        "contact_train_positive_fraction": float(constant[4]),
        "contact_validation_positive_fraction": float(y[m[:, 4].bool(), 4].mean()),
        "contact_validation_count": int(m[:, 4].sum()),
        "constant_train_predictor": metrics(baseline, y, m),
        "zero_motion_with_constant_contact": metrics(zero, y, m),
        "runs": rows,
    }
    save_json(PROJECT / "human-prediction-audit.json", report)
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
