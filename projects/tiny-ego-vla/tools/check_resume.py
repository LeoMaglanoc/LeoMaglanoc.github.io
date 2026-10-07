"""Exercise completed-run resume and configuration rejection without training."""

from common import *
from datasets import CONFIG
from train_ego import run as ego_run
from train_robot_bc import run as robot_run


def main():
    paths = [
        CKPT / name / filename
        for name in ["ego-transformer-11", "robot-robot-4-11", "robot-ego-4-11"]
        for filename in ["best.pt", "last.pt", "metrics.json"]
    ]
    before = {str(p): sha(p) for p in paths}
    ego_run("transformer", 11, resume=True)
    robot_run("transformer", 11, 4, "robot", resume=True)
    robot_run("transformer", 11, 4, "ego", resume=True)
    assert before == {str(p): sha(p) for p in paths}
    original = CONFIG["learning_rate"]
    CONFIG["learning_rate"] = original * 2
    try:
        try:
            robot_run("transformer", 11, 4, "robot", resume=True)
        except AssertionError as error:
            assert "Configuration changed" in str(error)
        else:
            raise AssertionError("Changed configuration was incorrectly accepted")
    finally:
        CONFIG["learning_rate"] = original
    assert before == {str(p): sha(p) for p in paths}
    save_json(
        PROJECT / "resume-audit.json",
        {
            "passed": True,
            "checks": "completed human and paired robot resumes preserve checkpoint and metrics SHA-256; modified configuration rejected before training or checkpoint writes",
            "files": before,
        },
    )
    print(
        "PASS: completed resumes preserve all artifacts; changed configuration rejected",
        flush=True,
    )


if __name__ == "__main__":
    main()
