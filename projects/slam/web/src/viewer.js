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
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.needsRender = true;
    this.controls.addEventListener("change", () => { this.needsRender = true; });
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x22334a, 2.2));
    const key = new THREE.DirectionalLight(0xffffff, 1.6);
    key.position.set(4, 8, 3);
    this.scene.add(key);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas.parentElement);
    this.resetPose = null;
    this.trajectory = null;
    this.meshes = [];
    this.surfaceMode = "texture";
    this.animate();
  }

  async load(meshUrl, samples, options = {}) {
    this.clear();
    this.loadingElement.hidden = false;
    const loader = new GLTFLoader();
    const gltf = await loader.loadAsync(meshUrl, ({ loaded, total }) => {
      const progress = total ? `${Math.round(100 * loaded / total)}%` : `${(loaded / 1048576).toFixed(1)} MB`;
      this.loadingElement.textContent = `Loading 3D reconstruction… ${progress}`;
    });
    gltf.scene.traverse((object) => {
      if (!object.isMesh) return;
      const originals = Array.isArray(object.material) ? object.material : [object.material];
      const textureMaterials = originals.map((material) => {
        if (material.map) {
          material.map.colorSpace = THREE.SRGBColorSpace;
          material.map.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
        }
        // RGB observations already contain the room's illumination. Lighting
        // them again darkens creases and bleaches the tabletop and floor.
        return new THREE.MeshBasicMaterial({
          map: material.map,
          color: material.map ? 0xffffff : material.color,
          side: THREE.DoubleSide,
          toneMapped: false,
          vertexColors: !!object.geometry.attributes.color,
        });
      });
      const geometryMaterials = originals.map(() => new THREE.MeshStandardMaterial({
        color: 0xb8c5cf, roughness: 1, metalness: 0, side: THREE.DoubleSide,
      }));
      originals.forEach((material) => material.dispose());
      const materials = (list) => Array.isArray(object.material) ? list : list[0];
      this.meshes.push({ object, texture: materials(textureMaterials), geometry: materials(geometryMaterials) });
      object.material = materials(textureMaterials);
    });
    this.model = gltf.scene;
    this.scene.add(gltf.scene);
    this.trajectory = trajectoryObject(samples);
    this.scene.add(this.trajectory);
    let pose = options.camera || INITIAL_CAMERA_POSE;
    this.camera.position.fromArray(pose.position);
    this.camera.up.fromArray(pose.up || [0, 1, 0]);
    this.controls.target.fromArray(pose.target);
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

  clear() {
    const materials = new Set(), geometries = new Set(), textures = new Set();
    const dispose = (root) => {
      if (!root) return;
      this.scene.remove(root);
      root.traverse((object) => {
        if (object.geometry) geometries.add(object.geometry);
        for (const material of (Array.isArray(object.material) ? object.material : [object.material])) if (material) materials.add(material);
      });
    };
    for (const mesh of this.meshes) {
      for (const mode of ['geometry', 'texture']) {
        for (const material of (Array.isArray(mesh[mode]) ? mesh[mode] : [mesh[mode]])) materials.add(material);
      }
    }
    dispose(this.model); dispose(this.trajectory); dispose(this.overlay);
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) {
      for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
      material.dispose();
    }
    for (const texture of textures) texture.dispose();
    this.model = this.trajectory = this.overlay = null;
    this.meshes = [];
  }

  async setOverlay(url, visible) {
    if (this.overlay) { this.overlay.visible = visible; this.needsRender = true; return; }
    if (!visible) return;
    const gltf = await new GLTFLoader().loadAsync(url);
    this.overlay = gltf.scene;
    this.overlay.traverse((object) => {
      if (object.isMesh) {
        object.material.dispose();
        object.material = new THREE.MeshBasicMaterial({ color: 0x62d6ff, wireframe: true, transparent: true, opacity: 0.16, depthWrite: false });
      }
    });
    this.scene.add(this.overlay); this.needsRender = true;
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
    this.needsRender = true;
  }

  setSurfaceMode(mode) {
    this.surfaceMode = mode;
    for (const mesh of this.meshes) mesh.object.material = mesh[mode];
    this.needsRender = true;
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
    this.needsRender = true;
  }

  animate() {
    this.renderer.setAnimationLoop(() => {
      this.controls.update();
      // Keep damping responsive, but leave a stationary scan idle instead of
      // repeatedly drawing its large texture atlases (especially on mobile).
      if (!this.needsRender) return;
      this.renderer.render(this.scene, this.camera);
      this.needsRender = false;
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
