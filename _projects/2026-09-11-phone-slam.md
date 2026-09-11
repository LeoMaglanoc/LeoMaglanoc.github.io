---
layout: page
title: Phone SLAM / RGB-D Mapping
permalink: /projects/phone-slam/
date: 2026-09-11 09:00:00
description: Offline RGB-D SLAM and dense reconstruction with an interactive Three.js viewer.
category: research
importance: 2
---

Offline RGB-D SLAM and dense 3D reconstruction using RTAB-Map and Open3D, with
an Android ARCore recording pipeline and an interactive Three.js visualization.

The live canonical example uses the **TUM RGB-D**
`freiburg3_long_office_household` benchmark: RGB-D odometry feeds RTAB-Map,
loop closures optimize the pose graph, and Open3D fuses the resulting poses
into a colored metric mesh. The browser only displays precomputed video,
trajectory, and GLB assets—no reconstruction runs on the website.

<p>
  <a class="btn btn-primary" href="/phone-slam/">Live Demo</a>
  <a class="btn btn-outline-primary" href="https://github.com/LeoMaglanoc/phone-slam">GitHub</a>
</p>
