import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { trajectoryObject } from "./trajectory.js";

const INITIAL_CAMERA_POSE = {
  position: [0.567682, -0.684617, 1.488446],
  target: [0.21, 0.075, -2.58],
  up: [0, 1, 0],
};

export class MapViewer {
  constructor(canvas, loadingElement) {
    this.canvas = canvas;
    this.loadingElement = loadingElement;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a1018);
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.01, 1000);
    this.renderer = createRenderer(canvas);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x22334a, 2.2));
    const key = new THREE.DirectionalLight(0xffffff, 1.6);
    key.position.set(4, 8, 3);
    this.scene.add(key);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas.parentElement);
    this.resetPose = null;
    this.trajectory = null;
    this.animate();
  }

  async load(meshUrl, samples) {
    const loader = new GLTFLoader();
    const gltf = await loader.loadAsync(meshUrl);
    gltf.scene.traverse((object) => {
      if (!object.isMesh || !object.material?.map) return;
      object.material.map.colorSpace = THREE.SRGBColorSpace;
      object.material.map.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
      object.material.needsUpdate = true;
    });
    this.scene.add(gltf.scene);
    this.trajectory = trajectoryObject(samples);
    this.scene.add(this.trajectory);
    this.camera.position.fromArray(INITIAL_CAMERA_POSE.position);
    this.camera.up.fromArray(INITIAL_CAMERA_POSE.up);
    this.controls.target.fromArray(INITIAL_CAMERA_POSE.target);
    this.camera.lookAt(this.controls.target);
    this.controls.update();
    this.resetPose = {
      position: this.camera.position.clone(),
      target: this.controls.target.clone(),
      up: this.camera.up.clone(),
    };
    this.loadingElement.hidden = true;
    this.resize();
  }

  reset() {
    if (!this.resetPose) return;
    this.camera.position.copy(this.resetPose.position);
    this.controls.target.copy(this.resetPose.target);
    this.camera.up.copy(this.resetPose.up);
    this.controls.update();
  }

  setTrajectoryVisible(visible) {
    if (this.trajectory) this.trajectory.visible = visible;
  }

  cameraPose() {
    const values = (vector) => vector.toArray().map((value) => Number(value.toFixed(6)));
    return {
      position: values(this.camera.position),
      target: values(this.controls.target),
      up: values(this.camera.up),
    };
  }

  adjustCamera(action) {
    if (!this.resetPose) return;
    const forward = this.camera.getWorldDirection(new THREE.Vector3()).normalize();
    const right = new THREE.Vector3().crossVectors(forward, this.camera.up).normalize();
    const distance = this.camera.position.distanceTo(this.controls.target);
    const step = Math.max(distance * 0.12, 0.1);
    const translation = new THREE.Vector3();
    if (action === "zoom-in") translation.addScaledVector(forward, step);
    if (action === "zoom-out") translation.addScaledVector(forward, -step);
    if (action === "move-left") translation.addScaledVector(right, -step);
    if (action === "move-right") translation.addScaledVector(right, step);
    if (action === "move-up") translation.addScaledVector(this.camera.up, step);
    if (action === "move-down") translation.addScaledVector(this.camera.up, -step);
    this.camera.position.add(translation);
    if (!action.startsWith("zoom")) this.controls.target.add(translation);
    this.controls.update();
  }

  resize() {
    const { width, height } = this.canvas.parentElement.getBoundingClientRect();
    if (!width || !height) return;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  animate() {
    this.renderer.setAnimationLoop(() => {
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
    });
  }
}

function createRenderer(canvas) {
  try {
    return new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "default" });
  } catch (antialiasError) {
    try {
      // Some constrained mobile GPUs reject an antialiased context but can
      // still render the mesh without multisampling.
      return new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "default" });
    } catch {
      throw new Error("WebGL is unavailable in this browser");
    }
  }
}
