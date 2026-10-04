from pathlib import Path

import numpy as np
import pytest

from slam_pipeline.rtabmap import export
from slam_pipeline.rtabmap.export import parse_pose_format_11


def test_parse_rtabmap_pose_format_11(tmp_path: Path) -> None:
    path = tmp_path / "poses.txt"
    path.write_text("1.5 1 2 3 0 0 0 1 42\n", encoding="utf-8")
    timestamps, poses, node_ids = parse_pose_format_11(path)
    assert np.allclose(timestamps, [1.5])
    assert np.allclose(poses[0][:3, 3], [1.0, 2.0, 3.0])
    assert node_ids == [42]


@pytest.mark.parametrize("optimization,expected_opt", [("full", "0"), ("raw", "3")])
def test_export_invokes_official_rtabmap_exporter(tmp_path: Path, monkeypatch, optimization: str, expected_opt: str) -> None:
    database = tmp_path / "map.db"; database.write_bytes(b"db")
    output = tmp_path / "trajectory.txt"
    commands = []
    monkeypatch.setattr(export.shutil, "which", lambda _: "/usr/bin/rtabmap-export")

    def fake_run(command, **_kwargs):
        commands.append(command)
        generated = tmp_path / "trajectory_export_poses.txt"
        generated.write_text("1.0 0 0 0 0 0 0 1 7\n", encoding="utf-8")

    monkeypatch.setattr(export.subprocess, "run", fake_run)
    timestamps, _, node_ids = export.export_rtabmap_trajectory(database, output, optimization=optimization)
    assert commands[0][commands[0].index("--opt") + 1] == expected_opt
    assert np.allclose(timestamps, [1.0])
    assert node_ids == [7]
    assert len(output.read_text(encoding="utf-8").split()) == 8
