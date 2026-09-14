---
layout: page
title: Phone SLAM / RGB-D Mapping
permalink: /projects/phone-slam/
date: 2026-09-11 09:00:00
description: Offline RGB-D SLAM and dense reconstruction with an interactive Three.js viewer.
category: research
importance: 2
---

Offline RGB-D SLAM and dense 3D reconstruction using RTAB-Map, with an Android
ARCore recording pipeline and an interactive Three.js visualization.

The live canonical example uses the **TUM RGB-D**
`freiburg3_long_office_household` benchmark: RGB-D odometry feeds RTAB-Map,
loop closures globally optimize the pose graph, and RTAB-Map reconstructs and
textures the resulting 3D map from the original RGB-D observations. The final
UV-textured mesh is exported to glTF and rendered interactively with Three.js.
Open3D TSDF remains an optional baseline for reconstruction comparison. The
browser only displays precomputed video, trajectory, and GLB assets—no
reconstruction runs on the website.

<p>
  <a class="btn btn-primary" href="/slam/">Live Demo</a>
  <a class="btn btn-outline-primary" href="https://github.com/LeoMaglanoc/phone-slam">GitHub</a>
</p>
