import "../styles/main.css";
import { MapViewer } from "./viewer.js";

const DEMOS = {
  freiburg3_long_office_household: "demos/freiburg3_long_office_household/metadata.json",
};
const root = import.meta.env.BASE_URL;
const name = new URLSearchParams(window.location.search).get("demo") || "freiburg3_long_office_household";
const metadataUrl = new URL(DEMOS[name] || DEMOS.freiburg3_long_office_household, new URL(root, window.location.origin));
const viewerElement = document.querySelector("#viewer");
const loading = document.querySelector("#loading");
const rgbVideo = document.querySelector("#rgb-video");
const depthVideo = document.querySelector("#depth-video");
const mapCanvas = document.querySelector("#map-canvas");
const mapFallback = document.querySelector("#map-fallback");
const mapFallbackImage = document.querySelector("#map-fallback-image");
const mapFallbackMessage = document.querySelector("#map-fallback-message");
const resetView = document.querySelector("#reset-view");
const trajectoryToggle = document.querySelector("#trajectory-toggle");
const copyCameraPose = document.querySelector("#copy-camera-pose");
const cameraPoseOutput = document.querySelector("#camera-pose-output");
let trajectoryVisible = false;

function asset(metadata, key) {
  return new URL(`demos/${metadata.dataset.name}/${metadata.assets[key]}`, new URL(root, window.location.origin)).href;
}

function setMode(mode) {
  viewerElement.className = `viewer mode-${mode}`;
  document.querySelectorAll("[data-mode]").forEach((button) => {
    button.classList.toggle("active", button.dataset.mode === mode);
    button.setAttribute("aria-pressed", String(button.dataset.mode === mode));
  });
  window.dispatchEvent(new Event("resize"));
}

function showStaticMapFallback(metadata) {
  mapCanvas.hidden = true;
  mapFallbackImage.src = asset(metadata, "thumbnail");
  mapFallbackMessage.textContent = "Interactive 3D rendering needs WebGL, which is unavailable in this browser. Showing the optimized reconstruction preview instead.";
  mapFallback.hidden = false;
  loading.hidden = true;
  document.querySelectorAll("[data-map-control]").forEach((button) => { button.disabled = true; });
}

async function main() {
  try {
    const response = await fetch(metadataUrl);
    if (!response.ok) throw new Error(`Metadata request failed (${response.status})`);
    const metadata = await response.json();
    document.querySelector("#demo-title").textContent = metadata.title;
    document.querySelector("#demo-summary").textContent = "Estimated RGB-D odometry → RTAB-Map loop closure → native UV-textured mesh from the original RGB-D observations.";
    document.querySelector("#dataset-link").href = metadata.dataset.url;
    document.querySelector("#stats").textContent = `${metadata.slam.input_frames.toLocaleString()} RGB-D frames · ${metadata.slam.graph_nodes.toLocaleString()} graph nodes · ${metadata.slam.global_loop_closures} global loop closures · ${metadata.mesh.triangles.toLocaleString()} web-mesh triangles`;
    rgbVideo.src = asset(metadata, "video");
    depthVideo.src = asset(metadata, "depth_video");
    let map;
    try {
      map = new MapViewer(mapCanvas, loading);
    } catch (error) {
      if (/webgl/i.test(error.message)) {
        showStaticMapFallback(metadata);
        return;
      }
      throw error;
    }
    const trajectoryResponse = await fetch(asset(metadata, "trajectory"));
    if (!trajectoryResponse.ok) throw new Error(`Trajectory request failed (${trajectoryResponse.status})`);
    const trajectory = await trajectoryResponse.json();
    if (trajectory.source !== "rtabmap_global_pose_graph_optimized") {
      throw new Error("The published trajectory is not the globally optimized RTAB-Map pose graph");
    }
    await map.load(asset(metadata, "mesh"), trajectory.samples);
    map.setTrajectoryVisible(trajectoryVisible);
    resetView.addEventListener("click", () => map.reset());
    document.querySelector("#surface-toggle").addEventListener("click", (event) => {
      const geometry = map.surfaceMode !== "geometry";
      map.setSurfaceMode(geometry ? "geometry" : "texture");
      event.currentTarget.textContent = geometry ? "Show texture" : "Show geometry";
      event.currentTarget.setAttribute("aria-pressed", String(geometry));
    });
    trajectoryToggle.addEventListener("click", (event) => {
      trajectoryVisible = !trajectoryVisible;
      map.setTrajectoryVisible(trajectoryVisible);
      event.currentTarget.textContent = `Optimized trajectory: ${trajectoryVisible ? "on" : "off"}`;
      event.currentTarget.setAttribute("aria-pressed", String(trajectoryVisible));
    });
    document.querySelectorAll("[data-camera-action]").forEach((button) => {
      button.addEventListener("click", () => map.adjustCamera(button.dataset.cameraAction));
    });
    copyCameraPose.addEventListener("click", async () => {
      const pose = JSON.stringify(map.cameraPose(), null, 2);
      cameraPoseOutput.textContent = pose;
      cameraPoseOutput.hidden = false;
      try {
        await navigator.clipboard.writeText(pose);
        copyCameraPose.textContent = "Pose copied";
      } catch {
        copyCameraPose.textContent = "Copy the pose below";
      }
    });
  } catch (error) {
    loading.textContent = `Viewer failed to load: ${error.message}`;
    loading.classList.add("error");
    console.error(error);
  }
}

document.querySelectorAll("[data-mode]").forEach((button) => button.addEventListener("click", () => setMode(button.dataset.mode)));
document.querySelector("#fullscreen").addEventListener("click", async () => {
  if (document.fullscreenElement) await document.exitFullscreen();
  else await viewerElement.requestFullscreen();
});
main();
