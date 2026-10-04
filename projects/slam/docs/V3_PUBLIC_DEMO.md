# V3 public demo regeneration

The public page is a static Three.js viewer. It never runs SLAM, odometry,
depth processing, or reconstruction in the browser.

```bash
./scripts/run_tum_long_office.sh
cd web
npm ci
npm run test
npm run build
npm run test:assets
```

The canonical run records RGB-D odometry, RTAB-Map graph diagnostics, raw and
globally optimized trajectory metrics, a colored TSDF mesh, the official TUM
RGB and colorized depth-video transcodes, and web metadata. Check `outputs/tum_long_office/` and
`docs/results/tum_long_office/report.md` before committing browser assets.

`web/public/demos/freiburg3_long_office_household/` contains only the static
public package: `demo.mp4`, `depth.mp4`, `scene.glb`, `trajectory.json`, `metadata.json`,
`thumbnail.webp`, and attribution. It must not contain raw data, PLY files,
ROS databases, or logs.
