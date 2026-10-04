import "../styles/main.css";
import { MapViewer } from "./viewer.js";

const base = new URL(import.meta.env.BASE_URL, window.location.origin);
const url = (path) => new URL(path, base).href;
const el = (id) => document.getElementById(id);
const viewer = el('viewer'), loading = el('loading');
const datasetSelect = el('dataset-select'), mapperSelect = el('mapper-select'), poseSelect = el('pose-select'), displaySelect = el('display-select');
let map, metadata, summary, trajectoryVisible = false, icl = false;

async function json(path) {
  const response = await fetch(url(path));
  if (!response.ok) throw new Error(`Could not load ${path} (${response.status})`);
  return response.json();
}

function setMode(mode) {
  const expanded = viewer.classList.contains('expanded');
  viewer.className = `viewer mode-${mode}${expanded ? ' expanded' : ''}`;
  document.querySelectorAll('[data-mode]').forEach((button) => {
    button.classList.toggle('active', button.dataset.mode === mode);
    button.setAttribute('aria-pressed', String(button.dataset.mode === mode));
  });
  window.dispatchEvent(new Event('resize'));
}

function row(table, values, { header = false, mean = false } = {}) {
  const tr = document.createElement('tr');
  if (mean) tr.className = 'mean';
  for (const value of values) {
    const cell = document.createElement(header ? 'th' : 'td');
    if (header) cell.scope = 'col';
    cell.textContent = value; tr.append(cell);
  }
  table.append(tr);
}

function renderTables() {
  const core = el('benchmark-table'), diagnostic = el('diagnostic-table');
  core.replaceChildren(); diagnostic.replaceChildren();
  row(core, ['Sequence', 'Poses', 'Mapper', 'ATE cm', 'Accuracy cm', 'Completeness cm', 'F@2cm', 'F@5cm'], { header: true });
  row(diagnostic, ['Sequence', 'Depth', 'Poses', 'Accuracy cm', 'Completeness cm', 'F@2cm'], { header: true });
  for (const result of summary.sequences) {
    if (result.status !== 'passed') { row(core, [result.sequence, 'Run failed', result.error]); continue; }
    for (const name of ['tsdf_estimated', 'rtab_estimated', 'tsdf_gt', 'rtab_gt']) {
      const m = result.conditions[name];
      row(core, [result.sequence, name.endsWith('estimated') ? 'Estimated' : 'GT', name.startsWith('tsdf') ? 'TSDF' : 'RTAB',
        name.endsWith('estimated') ? (result.trajectory.ate_rmse_m * 100).toFixed(2) : '0.00',
        (m.accuracy.mean_m * 100).toFixed(2), (m.completeness.mean_m * 100).toFixed(2),
        m.f_scores['0.02'].f_score.toFixed(3), m.f_scores['0.05'].f_score.toFixed(3)]);
    }
    for (const name of ['tsdf_clean_gt', 'tsdf_gt', 'tsdf_estimated']) {
      const m = result.conditions[name];
      row(diagnostic, [result.sequence, name.includes('clean') ? 'Clean' : 'Noisy', name.includes('estimated') ? 'Estimated' : 'GT',
        (m.accuracy.mean_m * 100).toFixed(2), (m.completeness.mean_m * 100).toFixed(2), m.f_scores['0.02'].f_score.toFixed(3)]);
    }
  }
  for (const name of ['tsdf_estimated', 'rtab_estimated', 'tsdf_gt', 'rtab_gt']) {
    const values = summary.means[name];
    if (values) row(core, ['Mean', name.endsWith('estimated') ? 'Estimated' : 'GT', name.startsWith('tsdf') ? 'TSDF' : 'RTAB',
      ...values.map((v, i) => v.toFixed(i < 3 ? 2 : 3))], { mean: true });
  }
  const selected = metadata.tuning_selection, settings = selected.settings;
  el('tuning-summary').textContent = `${metadata.tuning_summary} Selected TSDF: ${(settings.voxel_length * 1000).toFixed(0)} mm voxels, ${(settings.sdf_trunc * 1000).toFixed(0)} mm truncation, ${settings.frame_stride === 1 ? 'every frame' : 'every second frame'}. Validation F@2cm ${selected.heldout_mean_f2.toFixed(3)} versus baseline ${selected.baseline_heldout_mean_f2.toFixed(3)}.`;
}

function metrics(variant) {
  const m = variant.metrics;
  const values = [ ['ATE', `${(variant.ate_rmse_m * 100).toFixed(2)} cm`],
    ['Surface accuracy', `${(m.accuracy.mean_m * 100).toFixed(2)} cm`],
    ['Surface completeness', `${(m.completeness.mean_m * 100).toFixed(2)} cm`],
    ['F-score @ 2 cm', m.f_scores['0.02'].f_score.toFixed(3)], ['F-score @ 5 cm', m.f_scores['0.05'].f_score.toFixed(3)] ];
  el('metric-panel').replaceChildren();
  for (const [label, value] of values) {
    const card = document.createElement('div'); card.className = 'metric'; card.textContent = label;
    const strong = document.createElement('strong'); strong.textContent = value; card.append(strong); el('metric-panel').append(card);
  }
}

async function loadModel() {
  el('camera-pose-output').hidden = true;
  el('copy-camera-pose').textContent = 'Copy camera pose';
  if (icl) {
    const variant = metadata.variants[`${mapperSelect.value}_${poseSelect.value}`];
    const display = displaySelect.value;
    metrics(variant);
    el('heatmap-legend').hidden = display !== 'error' || !map;
    const displayTriangles = display === 'color' ? variant.color_web_triangles : variant.web_triangles;
    el('stats').textContent = `kt0 · ${metadata.input_frames.toLocaleString()} input frames · ${metadata.shared_frame_count.toLocaleString()} shared graph frames · ${variant.integration_frame_count.toLocaleString()} integrated frames · ${variant.master_triangles.toLocaleString()} master triangles · ${displayTriangles.toLocaleString()} display triangles`;
    if (!map) { loading.hidden = true; return; }
    const trajectory = await json(`demos/icl_nuim/${variant.trajectory}`);
    const mesh = display === 'error' ? variant.error_mesh : display === 'color' ? variant.mesh : variant.geometry_mesh;
    await map.load(url(`demos/icl_nuim/${mesh}`), trajectory.samples, { camera: metadata.camera });
    map.setSurfaceMode(display === 'color' || display === 'error' ? 'texture' : 'geometry');
    if (display === 'overlay') await map.setOverlay(url(`demos/icl_nuim/${metadata.gt_mesh}`), true);
  } else {
    if (!map) { loading.hidden = true; return; }
    const trajectory = await json(`demos/${metadata.dataset.name}/${metadata.assets.trajectory}`);
    if (trajectory.source !== 'rtabmap_global_pose_graph_optimized') throw new Error('Unexpected TUM trajectory source');
    await map.load(url(`demos/${metadata.dataset.name}/${metadata.assets.mesh}`), trajectory.samples);
    map.setSurfaceMode('texture');
    el('surface-toggle').textContent = 'Show geometry'; el('surface-toggle').setAttribute('aria-pressed', 'false');
  }
  map.setTrajectoryVisible(trajectoryVisible);
}

async function guarded(action) {
  const controls = [datasetSelect, mapperSelect, poseSelect, displaySelect];
  controls.forEach((control) => { control.disabled = true; });
  loading.classList.remove('error');
  try { await action(); }
  catch (error) { loading.hidden = false; loading.classList.add('error'); loading.textContent = error.message; console.error(error); }
  finally { controls.forEach((control) => { control.disabled = false; }); }
}

async function switchDataset() {
  icl = datasetSelect.value === 'icl';
  el('map-fallback-image').hidden = icl;
  el('icl-controls').hidden = !icl; el('benchmark').hidden = !icl; el('surface-toggle').hidden = icl;
  el('camera-pose-output').hidden = true;
  if (icl) {
    [metadata, summary] = await Promise.all([json('demos/icl_nuim/metadata.json'), json('demos/icl_nuim/summary.json')]);
    if (!summary.complete) throw new Error('The four-sequence benchmark is incomplete');
    mapperSelect.value = metadata.default_mapper || 'tsdf';
    el('demo-title').textContent = 'ICL-NUIM · living room';
    el('demo-summary').textContent = 'Synthetic benchmark · estimated RGB-D SLAM and known camera poses, evaluated against the true 3D surface.';
    el('dataset-attribution').textContent = 'Representative viewer: lr_kt0. Complete results for kt0–kt3 below. ICL-NUIM, CC BY 3.0.';
    el('rgb-video').src = url('demos/icl_nuim/demo.mp4'); el('depth-video').src = url('demos/icl_nuim/depth.mp4');
    renderTables();
  } else {
    metadata = await json('demos/freiburg3_long_office_household/metadata.json');
    el('demo-title').textContent = 'TUM RGB-D · office & household';
    el('demo-summary').textContent = 'Estimated RGB-D odometry → RTAB-Map loop closure → native UV-textured mesh from the original RGB-D observations.';
    el('dataset-attribution').replaceChildren('Real RGB-D example: ');
    const link = document.createElement('a'); link.href = metadata.dataset.url; link.textContent = 'TUM RGB-D Dataset';
    el('dataset-attribution').append(link, ' — freiburg3_long_office_household.');
    el('stats').textContent = `${metadata.slam.input_frames.toLocaleString()} RGB-D frames · ${metadata.slam.graph_nodes.toLocaleString()} graph nodes · ${metadata.slam.global_loop_closures} global loop closures · ${metadata.mesh.triangles.toLocaleString()} web-mesh triangles`;
    el('rgb-video').src = url(`demos/${metadata.dataset.name}/${metadata.assets.video}`);
    el('depth-video').src = url(`demos/${metadata.dataset.name}/${metadata.assets.depth_video}`);
  }
  el('rgb-video').pause(); el('depth-video').pause();
  setMode('map'); await loadModel();
  const query = new URL(window.location.href); query.searchParams.set('demo', icl ? 'icl_nuim' : 'freiburg3_long_office_household');
  history.replaceState(null, '', query);
}

function initializeMap() {
  try { map = new MapViewer(el('map-canvas'), loading); }
  catch (error) {
    el('map-canvas').hidden = true; el('map-fallback').hidden = false;
    el('map-fallback-message').textContent = 'Interactive 3D needs WebGL. Benchmark tables remain available below.';
    el('map-fallback-image').hidden = icl;
    el('map-fallback-image').src = url('demos/freiburg3_long_office_household/thumbnail.webp'); loading.hidden = true;
    document.querySelectorAll('[data-map-control]').forEach((button) => { button.disabled = true; });
  }
}

initializeMap();
if (new URLSearchParams(window.location.search).get('demo') === 'icl_nuim') datasetSelect.value = 'icl';
datasetSelect.addEventListener('change', () => guarded(switchDataset));
for (const control of [mapperSelect, poseSelect, displaySelect]) control.addEventListener('change', () => guarded(loadModel));
document.querySelectorAll('[data-mode]').forEach((button) => button.addEventListener('click', () => setMode(button.dataset.mode)));
el('reset-view').addEventListener('click', () => map?.reset());
el('surface-toggle').addEventListener('click', (event) => {
  const geometry = map.surfaceMode !== 'geometry'; map.setSurfaceMode(geometry ? 'geometry' : 'texture');
  event.currentTarget.textContent = geometry ? 'Show texture' : 'Show geometry'; event.currentTarget.setAttribute('aria-pressed', String(geometry));
});
el('trajectory-toggle').addEventListener('click', (event) => {
  trajectoryVisible = !trajectoryVisible; map?.setTrajectoryVisible(trajectoryVisible);
  event.currentTarget.textContent = `Trajectory: ${trajectoryVisible ? 'on' : 'off'}`;
  event.currentTarget.setAttribute('aria-pressed', String(trajectoryVisible));
});
document.querySelectorAll('[data-camera-action]').forEach((button) => button.addEventListener('click', () => map?.adjustCamera(button.dataset.cameraAction)));
el('copy-camera-pose').addEventListener('click', async () => {
  const pose = JSON.stringify(map.cameraPose(), null, 2); el('camera-pose-output').textContent = pose; el('camera-pose-output').hidden = false;
  try { await navigator.clipboard.writeText(pose); el('copy-camera-pose').textContent = 'Pose copied'; }
  catch { el('copy-camera-pose').textContent = 'Copy the pose below'; }
});
el('fullscreen').addEventListener('click', async () => {
  if (document.fullscreenElement) await document.exitFullscreen();
  else if (viewer.classList.contains('expanded')) viewer.classList.remove('expanded');
  else {
    try { await viewer.requestFullscreen(); }
    catch { viewer.classList.add('expanded'); }
  }
  window.dispatchEvent(new Event('resize'));
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && viewer.classList.contains('expanded')) {
    viewer.classList.remove('expanded'); window.dispatchEvent(new Event('resize'));
  }
});
el('exit-fullscreen').addEventListener('click', async () => {
  if (document.fullscreenElement) await document.exitFullscreen();
  viewer.classList.remove('expanded'); window.dispatchEvent(new Event('resize'));
});
guarded(switchDataset);
