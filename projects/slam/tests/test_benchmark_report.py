"""Tests for benchmark report environment metadata."""

from __future__ import annotations

import subprocess

from slam_pipeline.scripts import benchmark_report


def test_rtabmap_version_uses_installed_debian_package(monkeypatch) -> None:
    commands: list[list[str]] = []

    def fake_check_output(command: list[str], **_kwargs: object) -> str:
        commands.append(command)
        if command[-1] == "ros-jazzy-rtabmap":
            return "0.22.1-1noble"
        raise subprocess.CalledProcessError(1, command)

    monkeypatch.setattr(benchmark_report.subprocess, "check_output", fake_check_output)

    assert benchmark_report._rtabmap_version() == "ros-jazzy-rtabmap 0.22.1-1noble"
    assert commands == [["dpkg-query", "-W", "-f=${Version}", "ros-jazzy-rtabmap"]]


def test_rtabmap_version_falls_back_to_ros_wrapper_package(monkeypatch) -> None:
    def fake_check_output(command: list[str], **_kwargs: object) -> str:
        if command[-1] == "ros-jazzy-rtabmap-ros":
            return "0.22.1-1noble"
        raise subprocess.CalledProcessError(1, command)

    monkeypatch.setattr(benchmark_report.subprocess, "check_output", fake_check_output)

    assert benchmark_report._rtabmap_version() == "ros-jazzy-rtabmap-ros 0.22.1-1noble"
