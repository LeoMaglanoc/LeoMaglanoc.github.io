import { CameraSession, coverRect } from './camera.js';
import { AlvaSlam } from './slam.js';
import { MapVisualization, poseAngles, posePosition, poseQuaternion } from './visualization.js';

const $ = (id) => document.getElementById(id);
const video = $('camera-video');
const sequencePreview = $('sequence-preview');
const featureOverlay = $('feature-overlay');
const captureCanvas = document.createElement('canvas');
const captureContext = captureCanvas.getContext('2d', { alpha: false, willReadFrequently: true });
const stage = document.querySelector('.slam-stage');
const stageMessage = $('stage-message');
const statusCard = document.querySelector('.status-card');
const mapView = new MapVisualization($('map-canvas'));
const camera = new CameraSession(video);
const slam = new AlvaSlam();

let running = false;
let initialized = false;
let hasTracked = false;
let frameHandle = 0;
let lastProcess = 0;
let lastMapUpdate = 0;
let lastPose = null;
let trajectory = [];
let lastTrajectoryPosition = null;
let lastTrajectoryTime = 0;
let fpsWindow = [];
let sourceMode = 'camera';
let sourceWidth = 0;
let sourceHeight = 0;
let sequenceFrames = [];
let sequenceIndex = 0;
let trace = [];

function setError(message) {
  const error = $('error-message');
  error.textContent = message;
  error.hidden = !message;
}

function setStatus(state, detail) {
  const labels = { ready: 'READY', initializing: 'INITIALIZING', tracking: 'TRACKING', lost: 'TRACKING LOST' };
  statusCard.dataset.state = state;
  $('tracking-status').textContent = labels[state] || state.toUpperCase();
  $('status-detail').textContent = detail;
  $('status-dot').className = `status-dot ${state}`;
  $('status-light').style.background = state === 'lost' ? 'var(--danger)' : state === 'initializing' ? 'var(--warning)' : 'var(--accent)';
  $('status-light').style.boxShadow = state === 'lost' ? '0 0 14px rgba(255, 124, 114, .65)' : state === 'initializing' ? '0 0 14px rgba(244, 186, 104, .7)' : '0 0 14px rgba(168, 242, 109, .75)';
}

function setOverlaySize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  featureOverlay.width = Math.max(1, Math.floor(featureOverlay.clientWidth * dpr));
  featureOverlay.height = Math.max(1, Math.floor(featureOverlay.clientHeight * dpr));
  featureOverlay.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0);
}

function drawFeatures(points) {
  const context = featureOverlay.getContext('2d');
  const width = featureOverlay.clientWidth;
  const height = featureOverlay.clientHeight;
  context.clearRect(0, 0, width, height);
  if (!points.length || !sourceWidth || !sourceHeight) return;
  const rect = coverRect(sourceWidth, sourceHeight, width, height);
  context.fillStyle = 'rgba(168, 242, 109, 0.88)';
  for (const point of points) {
    context.beginPath();
    context.arc(rect.x + point.x * rect.scale, rect.y + point.y * rect.scale, 1.7, 0, Math.PI * 2);
    context.fill();
  }
}

function updatePose(pose) {
  if (!pose) return;
  const position = posePosition(pose);
  if (!trajectory.length) {
    trajectory = [{ x: 0, y: 0, z: 0 }];
    lastTrajectoryPosition = position.clone();
    lastTrajectoryTime = performance.now();
  }
  const now = performance.now();
  if (lastTrajectoryPosition.distanceTo(position) > 0.015 || now - lastTrajectoryTime > 500) {
    trajectory.push({ x: position.x, y: position.y, z: position.z });
    lastTrajectoryPosition.copy(position);
    lastTrajectoryTime = now;
  }
  lastPose = pose;
  $('pose-x').textContent = signed(position.x);
  $('pose-y').textContent = signed(position.y);
  $('pose-z').textContent = signed(position.z);
  const angles = poseAngles(pose);
  $('pose-roll').textContent = signed(angles.roll);
  $('pose-pitch').textContent = signed(angles.pitch);
  $('pose-yaw').textContent = signed(angles.yaw);
}

function signed(value) {
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}`;
}

function updateFps(timestamp) {
  fpsWindow.push(timestamp);
  while (fpsWindow.length && timestamp - fpsWindow[0] > 1000) fpsWindow.shift();
  $('fps-value').textContent = fpsWindow.length ? String(fpsWindow.length) : '—';
}

function resize() {
  setOverlaySize();
  mapView.resize();
}

async function initializeSource() {
  const videoFile = $('video-file').files[0];
  const sequenceFiles = [...$('sequence-files').files];
  setError('');
  setStatus('initializing', 'Loading video input and initializing the WebAssembly tracker.');
  $('start-button').disabled = true;
  try {
    if (videoFile) {
      sourceMode = 'video';
      await camera.startVideo(videoFile);
      sourceWidth = video.videoWidth;
      sourceHeight = video.videoHeight;
    } else if (sequenceFiles.length) {
      sourceMode = 'sequence';
      sequenceFrames = await Promise.all(sequenceFiles.map((file) => createImageBitmap(file)));
      sequenceIndex = 0;
      sourceWidth = sequenceFrames[0].width;
      sourceHeight = sequenceFrames[0].height;
      sequencePreview.width = sourceWidth;
      sequencePreview.height = sourceHeight;
      sequencePreview.classList.add('is-visible');
      video.style.display = 'none';
    } else {
      sourceMode = 'camera';
      await camera.start();
      sourceWidth = video.videoWidth;
      sourceHeight = video.videoHeight;
    }
    captureCanvas.width = sourceWidth;
    captureCanvas.height = sourceHeight;
    await slam.initialize(captureCanvas.width, captureCanvas.height);
    trace = [];
    initialized = true;
    running = true;
    $('reset-button').disabled = false;
    $('source-label').textContent = sourceMode === 'sequence' ? 'IMAGE SEQUENCE' : sourceMode === 'video' ? 'VIDEO INPUT' : 'CAMERA INPUT';
    stageMessage.classList.add('is-hidden');
    setStatus('initializing', 'Find texture and move slowly to initialize tracking.');
    frameHandle = requestAnimationFrame(processLoop);
  } catch (error) {
    $('start-button').disabled = false;
    setStatus('ready', 'Start the rear camera to initialize AlvaAR.');
    setError(error.message || String(error));
    camera.stop();
    sequenceFrames.forEach((frame) => frame.close?.());
    sequenceFrames = [];
    sequencePreview.classList.remove('is-visible');
    video.style.display = '';
  }
}

function processLoop(timestamp) {
  if (!running) return;
  frameHandle = requestAnimationFrame(processLoop);
  if (!initialized || document.hidden || timestamp - lastProcess < 33) return;
  lastProcess = timestamp;
  const start = performance.now();
  if (sourceMode === 'sequence') {
    const frame = sequenceFrames[sequenceIndex];
    captureContext.drawImage(frame, 0, 0, captureCanvas.width, captureCanvas.height);
    sequencePreview.getContext('2d').drawImage(frame, 0, 0, sequencePreview.width, sequencePreview.height);
    sequenceIndex = (sequenceIndex + 1) % sequenceFrames.length;
  } else {
    captureContext.drawImage(video, 0, 0, captureCanvas.width, captureCanvas.height);
  }
  const imageData = captureContext.getImageData(0, 0, captureCanvas.width, captureCanvas.height);
  const result = slam.processFrame(imageData);
  const duration = performance.now() - start;
  $('slam-ms-value').textContent = duration.toFixed(0);
  $('features-value').textContent = String(result.framePoints.length);
  drawFeatures(result.framePoints);
  updateFps(timestamp);

  const orientation = result.pose ? poseQuaternion(result.pose) : null;
  const position = result.pose ? posePosition(result.pose) : null;
  trace.push({
    frame: trace.length,
    timestamp,
    tracking: Boolean(result.pose),
    x: position?.x ?? null,
    y: position?.y ?? null,
    z: position?.z ?? null,
    qx: orientation?.x ?? null,
    qy: orientation?.y ?? null,
    qz: orientation?.z ?? null,
    qw: orientation?.w ?? null,
    features: result.framePoints.length,
    mapPoints: Math.floor(result.mapPoints.length / 6),
  });
  $('export-trace-button').disabled = false;

  if (result.pose) {
    hasTracked = true;
    updatePose(result.pose);
    setStatus('tracking', 'Pose is updating. Keep moving through a textured scene.');
    if (timestamp - lastMapUpdate > 160) {
      lastMapUpdate = timestamp;
      mapView.update(result.pose, trajectory, result.mapPoints);
    }
    $('map-points-value').textContent = result.mapPoints.length ? String(result.mapPoints.length / 6) : '—';
  } else if (hasTracked) {
    setStatus('lost', 'Tracking lost. Hold on a textured area to recover.');
  } else {
    setStatus('initializing', 'Find texture and move slowly to initialize tracking.');
  }
}

function reset() {
  slam.reset();
  trajectory = [];
  lastTrajectoryPosition = null;
  lastPose = null;
  hasTracked = false;
  mapView.reset();
  $('features-value').textContent = '—';
  $('map-points-value').textContent = '—';
  setStatus('initializing', 'Map reset. Find texture and move slowly to initialize tracking.');
}

function switchView(mode) {
  const isMap = mode === 'map';
  stage.classList.toggle('is-map', isMap);
  $('camera-view-button').classList.toggle('is-active', !isMap);
  $('map-view-button').classList.toggle('is-active', isMap);
  $('camera-view-button').setAttribute('aria-selected', String(!isMap));
  $('map-view-button').setAttribute('aria-selected', String(isMap));
  if (isMap) mapView.resize();
}

$('start-button').addEventListener('click', initializeSource);
$('reset-button').addEventListener('click', reset);
$('camera-view-button').addEventListener('click', () => switchView('camera'));
$('map-view-button').addEventListener('click', () => switchView('map'));
$('video-file').addEventListener('change', () => { if ($('video-file').files.length && !running) initializeSource(); });
$('sequence-files').addEventListener('change', () => { if ($('sequence-files').files.length && !running) initializeSource(); });
$('export-trace-button').addEventListener('click', () => {
  if (!trace.length) return;
  const payload = {
    source: sourceMode,
    width: sourceWidth,
    height: sourceHeight,
    frames: trace,
  };
  const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `alvaar-${sourceMode}-trace.json`;
  link.click();
  URL.revokeObjectURL(url);
});
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 100));
window.addEventListener('pagehide', () => {
  running = false;
  cancelAnimationFrame(frameHandle);
  camera.stop();
  sequenceFrames.forEach((frame) => frame.close?.());
});
resize();
setStatus('ready', 'Start the rear camera to initialize AlvaAR.');
