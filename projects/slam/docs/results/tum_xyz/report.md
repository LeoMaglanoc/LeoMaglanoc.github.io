# TUM fr1/xyz benchmark

## Environment

- git_sha: `659f6bf5d9e1fd7dd3f2322b6cd7556334ba9876`
- date_utc: `2026-09-11T09:29:50.231619+00:00`
- python: `3.12.3`
- open3d: `0.19.0`
- ros: `jazzy`
- rtabmap: `RTAB-Map:               0.22.1`

## Dataset and association

- sequence: fr1/xyz
- source_url: https://cvg.cit.tum.de/data/datasets/rgbd-dataset
- rgb_observations: 798
- depth_observations: 798
- pose_observations: 3000
- associated_rgb_depth_pairs: 794
- associated_rgb_depth_pose_triples: 792
- dropped_rgb_frames: 6

## RTAB-Map graph

- node_count: 193
- link_count: 492
- database_size_bytes: 84041728
- first_node_stamp: 1305031102.211214
- last_node_stamp: 1305031128.747363
- neighbor_link_count: 192
- global_loop_closure_count: 91
- local_space_closure_count: 209
- local_time_closure_count: 0

## Trajectory metrics

### Raw Odometry

- associated_poses: 192
- ate_rmse_m: 2.90053511851375e-16
- ate_mean_m: 2.627720271325722e-16
- ate_median_m: 2.482534153247273e-16
- ate_max_m: 4.577566798522237e-16
- rpe_translation_rmse_m: 4.291330575922854e-08
- rpe_rotation_rmse_rad: 1.4499941018778018e-06
- max_timestamp_residual_s: 0.007564067840576172
- mean_timestamp_residual_s: 0.0030558332800865173

### Optimized

- associated_poses: 192
- ate_rmse_m: 0.004109787049466327
- ate_mean_m: 0.0036126595913068458
- ate_median_m: 0.003161377585978468
- ate_max_m: 0.01236807280094032
- rpe_translation_rmse_m: 0.0003814139015122018
- rpe_rotation_rmse_rad: 9.147745625020066e-05
- max_timestamp_residual_s: 0.007564067840576172
- mean_timestamp_residual_s: 0.0030558332800865173

## Independent evaluator cross-check

- evo_ape_rmse_m: 0.00411
- project_ate_rmse_m: 0.004109787049466327
- evo_rpe_translation_rmse_m: 0.000381
- project_rpe_translation_rmse_m: 0.0003814139015122018
- evo_rpe_rotation_rmse_rad: 9.1e-05
- project_rpe_rotation_rmse_rad: 9.147745625020066e-05
- ate_rmse_difference_m: 2.129505336729079e-07
- rpe_translation_rmse_difference_m: 4.139015122018013e-07
- rpe_rotation_rmse_difference_rad: 4.77456250200654e-07
- within_1e-5_tolerance: True
## TSDF

- mesh_vertices: 28948
- mesh_triangles: 46051
- point_count: 28243
- bounding_box_min: [-2.565, -2.235, -0.19499999999999995]
- bounding_box_max: [1.305, 2.535, 1.4249999999999998]
- bounding_box_size: [3.87, 4.77, 1.6199999999999997]
- integrated_frames: 192
- associated_frames: 192
- optimized_rtabmap_poses: 192
- unmatched_rtabmap_poses: 0
- max_timestamp_difference_s: 0.039913177490234375
- mean_timestamp_difference_s: 0.03314127897222837
- database: outputs/tum_xyz/rtabmap.db

## Replay and completion

- dataset: rgbd_dataset_freiburg1_xyz
- attempted_frames: 792
- published_rgb_frames: 792
- published_depth_frames: 792
- published_odometry_poses: 792
- dropped_or_rejected_frames: 0
- start_timestamp_epoch_s: 1789118864.439266
- end_timestamp_epoch_s: 1789118940.3917837
- runtime_s: 75.95251721199747
- error: None
- database_quiescence: {'stable': True, 'stable_polls': 5, 'node_count': 193, 'elapsed_s': 5.006462877005106, 'database': {'node_count': 193, 'link_count': 492, 'database_size_bytes': 84041728, 'first_node_stamp': 1305031102.211214, 'last_node_stamp': 1305031128.747363, 'neighbor_link_count': 192, 'global_loop_closure_count': 91, 'local_space_closure_count': 209, 'local_time_closure_count': 0}}

## Warnings / errors

- None reported by the benchmark orchestrator.
