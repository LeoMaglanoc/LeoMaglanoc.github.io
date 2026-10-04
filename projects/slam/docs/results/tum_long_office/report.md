# TUM freiburg3_long_office_household benchmark

## Environment

- git_sha: `04cdf2f3e6b8600f9b97acd03ddb0fe2254067cc`
- date_utc: `2026-09-14T19:30:09.195588+00:00`
- python: `3.12.3`
- open3d: `0.19.0`
- ros: `jazzy`
- rtabmap: `ros-jazzy-rtabmap 0.23.7-1noble.20260903.070800`

## Dataset and association

- sequence: freiburg3_long_office_household
- source_url: https://cvg.cit.tum.de/data/datasets/rgbd-dataset

## RTAB-Map graph

- node_count: 411
- link_count: 1206
- database_size_bytes: 193802240
- first_node_stamp: 1341847981.322892
- last_node_stamp: 1341848067.491527
- neighbor_link_count: 820
- global_loop_closure_count: 44
- local_space_closure_count: 342
- local_time_closure_count: 0

## Trajectory metrics

### Raw Odometry

- associated_poses: 411
- ate_rmse_m: 0.06709364226448022
- ate_mean_m: 0.06018682583258415
- ate_median_m: 0.053119742952476096
- ate_max_m: 0.14384049936535595
- rpe_translation_rmse_m: 0.010525006604602458
- rpe_rotation_rmse_rad: 0.007513917583106215
- max_timestamp_residual_s: 0.008040904998779297
- mean_timestamp_residual_s: 0.0026827229780582327

### Optimized

- associated_poses: 411
- ate_rmse_m: 0.08896396907810981
- ate_mean_m: 0.07896151247621437
- ate_median_m: 0.06959364679789974
- ate_max_m: 0.16393787454823447
- rpe_translation_rmse_m: 0.010189227251088276
- rpe_rotation_rmse_rad: 0.00806231005998485
- max_timestamp_residual_s: 0.008040904998779297
- mean_timestamp_residual_s: 0.0026827229780582327

## Independent evaluator cross-check

- evo_ape_rmse_m: 0.088964
- project_ate_rmse_m: 0.08896396907810981
- evo_rpe_translation_rmse_m: 0.010189
- project_rpe_translation_rmse_m: 0.010189227251088276
- evo_rpe_rotation_rmse_rad: 0.008062
- project_rpe_rotation_rmse_rad: 0.00806231005998485
- ate_rmse_difference_m: 3.0921890187274315e-08
- rpe_translation_rmse_difference_m: 2.2725108827538476e-07
- rpe_rotation_rmse_difference_rad: 3.1005998485031383e-07
- within_1e-5_tolerance: True
## Native RTAB-Map textured mesh

- mesh_vertices: 175077
- mesh_triangles: 89226
- normal_count: 175077
- uv_count: 267678
- uv_triangle_count: 89226
- bounding_box_min: [-4.5947, -5.716, -2.9042]
- bounding_box_max: [6.6034, 2.1085, 6.8813]
- bounding_box_size: [11.1981, 7.8245000000000005, 9.7855]
- texture_count: 2
- backend: rtabmap_textured_mesh
- rtabmap_version: RTAB-Map:               0.23.7
- alicevision_multiband_available: False
- texturing: standard_gain_compensated_blending
- database: outputs/tum_long_office/rtabmap.db

## Open3D TSDF baseline

- mesh_vertices: 140838
- mesh_triangles: 217917
- point_count: 134130
- bounding_box_min: [-4.215, -1.6949999999999998, -1.515]
- bounding_box_max: [6.092049504300788, 2.1708431949992955, 6.776237102107898]
- bounding_box_size: [10.307049504300789, 3.8658431949992953, 8.291237102107898]
- integrated_frames: 206
- associated_frames: 411
- optimized_rtabmap_poses: 411
- unmatched_rtabmap_poses: 0
- max_timestamp_difference_s: 0.04248499870300293
- mean_timestamp_difference_s: 0.032231599455042184
- database: outputs/tum_long_office/rtabmap.db

## Replay and completion

- dataset: rgbd_dataset_freiburg3_long_office_household
- attempted_frames: 2488
- published_rgb_frames: 2488
- published_depth_frames: 2488
- published_odometry_poses: 0
- dropped_or_rejected_frames: 0
- start_timestamp_epoch_s: 1789412746.0579524
- end_timestamp_epoch_s: 1789413001.6145494
- runtime_s: 255.55659711399994
- error: None
- database_quiescence: {'stable': True, 'stable_polls': 8, 'node_count': 411, 'elapsed_s': 8.012607718999789, 'database': {'node_count': 411, 'link_count': 603, 'database_size_bytes': 186531840, 'first_node_stamp': 1341847981.322892, 'last_node_stamp': 1341848067.491527, 'neighbor_link_count': 410, 'global_loop_closure_count': 22, 'local_space_closure_count': 171, 'local_time_closure_count': 0}}

## Warnings / errors

- None reported by the benchmark orchestrator.
