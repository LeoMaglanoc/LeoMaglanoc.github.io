# TUM fr1/room benchmark

## Environment

- git_sha: `392b4ca5b3c937bd135c169b7d4c30c0a25159ac`
- date_utc: `2026-09-10T21:06:34.545827+00:00`
- python: `3.12.3`
- open3d: `0.19.0`
- ros: `jazzy`
- rtabmap: `ros-jazzy-rtabmap 0.22.1-1noble.20260615.173328`

## Dataset and association

- sequence: fr1/room
- source_url: https://cvg.cit.tum.de/data/datasets/rgbd-dataset
- rgb_observations: 1362
- depth_observations: 1360
- pose_observations: 4887
- associated_rgb_depth_pairs: 1359
- associated_rgb_depth_pose_triples: 1359
- dropped_rgb_frames: 3

## RTAB-Map graph

- node_count: 510
- link_count: 684
- database_size_bytes: 233631744
- first_node_stamp: 1305031910.765238
- last_node_stamp: 1305031955.30488
- neighbor_link_count: 509
- global_loop_closure_count: 43
- local_space_closure_count: 132
- local_time_closure_count: 0

## Trajectory metrics

### Raw Odometry

- associated_poses: 509
- ate_rmse_m: 3.6012299487357767e-16
- ate_mean_m: 3.323645116642542e-16
- ate_median_m: 3.1401849173675503e-16
- ate_max_m: 7.021666937153402e-16
- rpe_translation_rmse_m: 3.20894632779496e-08
- rpe_rotation_rmse_rad: 1.4678884731328965e-06
- max_timestamp_residual_s: 0.005661964416503906
- mean_timestamp_residual_s: 0.0023570889808340015

### Optimized

- associated_poses: 509
- ate_rmse_m: 0.006342482814714216
- ate_mean_m: 0.005346586125187737
- ate_median_m: 0.004750331980785888
- ate_max_m: 0.01815240160853132
- rpe_translation_rmse_m: 0.000216898981251042
- rpe_rotation_rmse_rad: 6.252832255794221e-05
- max_timestamp_residual_s: 0.005661964416503906
- mean_timestamp_residual_s: 0.0023570889808340015

## Independent evaluator cross-check

- evo_ape_rmse_m: 0.006342
- project_ate_rmse_m: 0.006342482814714216
- evo_rpe_translation_rmse_m: 0.000217
- project_rpe_translation_rmse_m: 0.000216898981251042
- evo_rpe_rotation_rmse_rad: 6.3e-05
- project_rpe_rotation_rmse_rad: 6.252832255794221e-05
- ate_rmse_difference_m: 4.828147142157957e-07
- rpe_translation_rmse_difference_m: 1.0101874895799786e-07
- rpe_rotation_rmse_difference_rad: 4.71677442057789e-07
- within_1e-5_tolerance: True
## TSDF

- mesh_vertices: 185541
- mesh_triangles: 317322
- point_count: 179548
- bounding_box_min: [-3.735, -6.018795121551685, -0.33691191988171487]
- bounding_box_max: [4.727872293267363, 3.0137874618523806, 3.165]
- bounding_box_size: [8.462872293267363, 9.032582583404066, 3.501911919881715]
- integrated_frames: 255
- associated_frames: 509
- optimized_rtabmap_poses: 509
- unmatched_rtabmap_poses: 0
- max_timestamp_difference_s: 0.03948497772216797
- mean_timestamp_difference_s: 0.03324456908145448
- database: outputs/tum_room/rtabmap.db

## Replay and completion

- dataset: rgbd_dataset_freiburg1_room
- attempted_frames: 1359
- published_rgb_frames: 1359
- published_depth_frames: 1359
- published_odometry_poses: 1359
- dropped_or_rejected_frames: 0
- start_timestamp_epoch_s: 1789074134.8540902
- end_timestamp_epoch_s: 1789074254.5109663
- runtime_s: 119.65687524899977
- error: None
- database_quiescence: {'stable': True, 'stable_polls': 5, 'node_count': 510, 'elapsed_s': 5.007152931000292, 'database': {'node_count': 510, 'link_count': 684, 'database_size_bytes': 233631744, 'first_node_stamp': 1305031910.765238, 'last_node_stamp': 1305031955.30488, 'neighbor_link_count': 509, 'global_loop_closure_count': 43, 'local_space_closure_count': 132, 'local_time_closure_count': 0}}

## Warnings / errors

- None reported by the benchmark orchestrator.
