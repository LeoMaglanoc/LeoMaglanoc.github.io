"""Trajectory parsing and basic TUM-style evaluation metrics."""

from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
from scipy.spatial.transform import Rotation

from ..dataset.association import associate_sorted_unique


def read_tum_trajectory(path: str | Path) -> tuple[np.ndarray, list[np.ndarray]]:
    timestamps, poses = [], []
    with Path(path).open("r", encoding="utf-8") as stream:
        for line in stream:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            values = list(map(float, line.split()))
            if len(values) != 8:
                continue
            timestamp, tx, ty, tz, qx, qy, qz, qw = values
            pose = np.eye(4)
            pose[:3, :3] = Rotation.from_quat([qx, qy, qz, qw]).as_matrix()
            pose[:3, 3] = [tx, ty, tz]
            timestamps.append(timestamp)
            poses.append(pose)
    if not poses:
        raise ValueError(f"No poses found in {path}")
    return np.asarray(timestamps), poses


def poses_to_tum(timestamps_s: np.ndarray, poses: list[np.ndarray], path: str | Path) -> None:
    with Path(path).open("w", encoding="utf-8") as stream:
        for timestamp, pose in zip(timestamps_s, poses):
            qx, qy, qz, qw = Rotation.from_matrix(pose[:3, :3]).as_quat()
            tx, ty, tz = pose[:3, 3]
            stream.write(f"{timestamp:.9f} {tx:.9f} {ty:.9f} {tz:.9f} {qx:.9f} {qy:.9f} {qz:.9f} {qw:.9f}\n")


def associate_trajectories(
    reference_timestamps: np.ndarray,
    reference_poses: list[np.ndarray],
    estimate_timestamps: np.ndarray,
    estimate_poses: list[np.ndarray],
    max_difference_s: float = 0.02,
) -> tuple[list[np.ndarray], list[np.ndarray], np.ndarray]:
    reference = list(zip(reference_timestamps.tolist(), reference_poses))
    estimate = list(zip(estimate_timestamps.tolist(), estimate_poses))
    # Match each sample in the shorter stream to its nearest unused sample in
    # the longer stream. This is one-to-one and mirrors the stream-selection
    # policy used by evo for the independent cross-check.
    if len(reference) >= len(estimate):
        matches = associate_sorted_unique(estimate, reference, max_difference_s).matches
        pairs_ref = [reference[item.second_index][1] for item in matches]
        pairs_est = [estimate[item.first_index][1] for item in matches]
    else:
        matches = associate_sorted_unique(reference, estimate, max_difference_s).matches
        pairs_ref = [reference[item.first_index][1] for item in matches]
        pairs_est = [estimate[item.second_index][1] for item in matches]
    if not pairs_ref:
        raise ValueError("No trajectory timestamps could be associated")
    return pairs_ref, pairs_est, np.asarray([item.residual_s for item in matches], dtype=np.float64)


def _align_positions(reference: np.ndarray, estimate: np.ndarray) -> np.ndarray:
    ref_center = reference.mean(axis=0)
    est_center = estimate.mean(axis=0)
    covariance = (estimate - est_center).T @ (reference - ref_center)
    u, _, vt = np.linalg.svd(covariance)
    rotation = vt.T @ u.T
    if np.linalg.det(rotation) < 0:
        vt[-1, :] *= -1
        rotation = vt.T @ u.T
    translation = ref_center - rotation @ est_center
    return (rotation @ estimate.T).T + translation


def evaluate_trajectories(
    reference_timestamps: np.ndarray,
    reference_poses: list[np.ndarray],
    estimate_timestamps: np.ndarray,
    estimate_poses: list[np.ndarray],
    output_dir: str | Path,
    *,
    artifact_prefix: str = "trajectory",
) -> dict[str, float | int | str]:
    ref, est, timestamp_residuals = associate_trajectories(
        reference_timestamps, reference_poses, estimate_timestamps, estimate_poses
    )
    ref_pos = np.array([pose[:3, 3] for pose in ref])
    est_pos = np.array([pose[:3, 3] for pose in est])
    aligned = _align_positions(ref_pos, est_pos)
    errors = np.linalg.norm(aligned - ref_pos, axis=1)
    rpe_trans = []
    rpe_rot = []
    for ref_first, ref_second, est_first, est_second in zip(ref[:-1], ref[1:], est[:-1], est[1:]):
        ref_relative = np.linalg.inv(ref_first) @ ref_second
        est_relative = np.linalg.inv(est_first) @ est_second
        error = np.linalg.inv(ref_relative) @ est_relative
        rpe_trans.append(float(np.linalg.norm(error[:3, 3])))
        rpe_rot.append(float(np.linalg.norm(Rotation.from_matrix(error[:3, :3]).as_rotvec())))
    rpe_trans = np.asarray(rpe_trans)
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    plot_path = output_dir / f"{artifact_prefix}_comparison.png"
    fig, axis = plt.subplots(figsize=(9, 7))
    axis.plot(ref_pos[:, 0], ref_pos[:, 1], label="ground truth")
    axis.plot(aligned[:, 0], aligned[:, 1], label="estimate aligned")
    axis.set_xlabel("x (m)")
    axis.set_ylabel("y (m)")
    axis.set_title("Trajectory comparison")
    axis.axis("equal")
    axis.legend()
    fig.tight_layout()
    fig.savefig(plot_path, dpi=150)
    plt.close(fig)
    error_plot_path = output_dir / f"{artifact_prefix}_ate_error.png"
    fig, axis = plt.subplots(figsize=(9, 4))
    axis.plot(errors, linewidth=1.2)
    axis.set_xlabel("associated pose index")
    axis.set_ylabel("absolute translation error (m)")
    axis.set_title("ATE after rigid SE(3) alignment")
    fig.tight_layout()
    fig.savefig(error_plot_path, dpi=150)
    plt.close(fig)
    return {
        "associated_poses": int(len(ref)),
        "ate_rmse_m": float(np.sqrt(np.mean(errors**2))),
        "ate_mean_m": float(np.mean(errors)),
        "ate_median_m": float(np.median(errors)),
        "ate_max_m": float(np.max(errors)),
        "rpe_translation_rmse_m": float(np.sqrt(np.mean(rpe_trans**2))) if len(rpe_trans) else 0.0,
        "rpe_rotation_rmse_rad": float(np.sqrt(np.mean(np.square(rpe_rot)))) if rpe_rot else 0.0,
        "max_timestamp_residual_s": float(timestamp_residuals.max()),
        "mean_timestamp_residual_s": float(timestamp_residuals.mean()),
        "trajectory_plot": str(plot_path),
        "ate_error_plot": str(error_plot_path),
    }
