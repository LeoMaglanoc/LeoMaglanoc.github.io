import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
function quat(q, i = 0) {
  return new THREE.Quaternion(q[i + 1], q[i + 2], q[i + 3], q[i]);
}
function faceMaterials(ghost = false) {
  return ["+X", "−X", "+Y", "−Y", "+Z", "−Z"].map((label, i) => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 256;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = ["#b67aec", "#689df2", "#ec8f7f", "#70d5d1", "#b9ec88", "#506976"][i];
    ctx.fillRect(0, 0, 256, 256);
    ctx.strokeStyle = "#142020";
    ctx.lineWidth = 8;
    ctx.strokeRect(10, 10, 236, 236);
    ctx.fillStyle = "#162222";
    ctx.font = "bold 75px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, 128, 128);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return new THREE.MeshStandardMaterial({
      map: texture,
      roughness: 0.55,
      metalness: 0.04,
      transparent: ghost,
      opacity: ghost ? 0.55 : 1,
      depthWrite: !ghost,
    });
  });
}
function cube(ghost = false) {
  const group = new THREE.Group();
  const g = new THREE.BoxGeometry(0.054, 0.054, 0.054);
  group.add(new THREE.Mesh(g, faceMaterials(ghost)));
  const edge = new THREE.LineSegments(
    new THREE.EdgesGeometry(g),
    new THREE.LineBasicMaterial({ color: ghost ? 0xc2f495 : 0x172524, transparent: ghost, opacity: 0.8 })
  );
  group.add(edge);
  return group;
}
function lights(scene) {
  scene.add(new THREE.HemisphereLight(0xe4f6ee, 0x253e36, 2.5));
  const key = new THREE.DirectionalLight(0xf3ffe4, 3);
  key.position.set(0.4, -0.4, 1.2);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x83b8d5, 2);
  rim.position.set(-0.5, 0.4, 0.7);
  scene.add(rim);
  return key;
}
export class HandRenderer {
  constructor(canvas, targetCanvas) {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(34, 1, 0.005, 10);
    this.camera.up.set(0, 0, 1);
    this.camera.position.set(0.26, -0.37, 0.78);
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    const key = lights(this.scene);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    Object.assign(key.shadow.camera, { left: -0.3, right: 0.3, top: 0.3, bottom: -0.3, near: 0.01, far: 2 });
    key.shadow.bias = -0.0001;
    key.target.position.set(-0.08, 0, 0.5);
    this.scene.add(key.target);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(0.36, 80), new THREE.MeshStandardMaterial({ color: 0x1c2b28, roughness: 0.85 }));
    floor.position.set(-0.06, 0, 0.32);
    floor.receiveShadow = true;
    this.scene.add(floor);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.27, 0.271, 96), new THREE.MeshBasicMaterial({ color: 0x3e5649, side: THREE.DoubleSide }));
    ring.position.set(-0.06, 0, 0.3201);
    this.scene.add(ring);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.target.set(-0.065, 0, 0.545);
    this.controls.enableDamping = true;
    this.controls.minDistance = 0.22;
    this.controls.maxDistance = 1;
    this.controls.enablePan = false;
    this.groups = [];
    this.solid = cube();
    this.solid.traverse((o) => {
      if (o.isMesh) o.castShadow = true;
    });
    this.scene.add(this.solid);
    this.targetScene = new THREE.Scene();
    lights(this.targetScene);
    this.targetCube = cube(true);
    this.targetCube.scale.setScalar(1.5);
    this.targetScene.add(this.targetCube);
    this.targetCamera = new THREE.PerspectiveCamera(32, 1, 0.005, 2);
    this.targetCamera.up.set(0, 0, 1);
    this.targetCamera.position.set(0.16, -0.22, 0.15);
    this.targetCamera.lookAt(0, 0, 0);
    this.targetRenderer = new THREE.WebGLRenderer({ canvas: targetCanvas, antialias: true, alpha: true });
    this.targetRenderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    this.targetRenderer.outputColorSpace = THREE.SRGBColorSpace;
    this.canvas = canvas;
    this.targetCanvas = targetCanvas;
    new ResizeObserver(() => this.resize()).observe(canvas.parentElement);
    new ResizeObserver(() => this.resize()).observe(targetCanvas);
    this.resize();
  }
  resize() {
    for (const [canvas, renderer, camera] of [
      [this.canvas, this.renderer, this.camera],
      [this.targetCanvas, this.targetRenderer, this.targetCamera],
    ]) {
      const r = canvas.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      renderer.setSize(r.width, r.height, false);
      camera.aspect = r.width / r.height;
      camera.updateProjectionMatrix();
    }
  }
  build(m, c) {
    this.c = c;
    const cache = new Map();
    for (let i = 0; i < m.nbody; i++) {
      const g = new THREE.Group();
      this.scene.add(g);
      this.groups.push(g);
    }
    for (let i = 0; i < m.ngeom; i++) {
      if (m.geom_group[i] !== 1 || m.geom_type[i] !== 7) continue;
      const id = m.geom_dataid[i];
      if (!cache.has(id)) {
        const start = m.mesh_vertadr[id] * 3,
          n = m.mesh_vertnum[id] * 3;
        const g = new THREE.BufferGeometry();
        g.setAttribute("position", new THREE.BufferAttribute(Float32Array.from(m.mesh_vert.subarray(start, start + n)), 3));
        const fs = m.mesh_faceadr[id] * 3,
          fn = m.mesh_facenum[id] * 3;
        g.setIndex(Array.from(m.mesh_face.subarray(fs, fs + fn)));
        g.computeVertexNormals();
        cache.set(id, g);
      }
      const b = m.geom_bodyid[i],
        name = m.body(b).name;
      const tip = name.includes("tip");
      const color = tip ? 0x394b48 : name.includes("palm") ? 0xd1ddd6 : name.includes("link1") ? 0x657871 : 0xc4cec7;
      const mat = new THREE.MeshStandardMaterial({ color, roughness: tip ? 0.85 : 0.32, metalness: tip ? 0.05 : 0.3 });
      const mesh = new THREE.Mesh(cache.get(id), mat);
      mesh.position.fromArray(m.geom_pos, i * 3);
      mesh.quaternion.copy(quat(m.geom_quat, i * 4));
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.groups[b].add(mesh);
    }
  }
  update(d, goal) {
    for (let i = 0; i < this.groups.length; i++) {
      this.groups[i].position.fromArray(d.xpos, i * 3);
      this.groups[i].quaternion.copy(quat(d.xquat, i * 4));
    }
    this.solid.position.fromArray(d.qpos, this.c.cube_qadr);
    this.solid.quaternion.copy(quat(d.qpos, this.c.cube_qadr + 3));
    this.targetCube.quaternion.copy(quat(goal));
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    this.targetRenderer.render(this.targetScene, this.targetCamera);
  }
  rotateGoal(goal, dx, dy) {
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(this.targetCamera.quaternion),
      right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.targetCamera.quaternion);
    const q = quat(goal);
    q.premultiply(new THREE.Quaternion().setFromAxisAngle(up, dx * 0.012));
    q.premultiply(new THREE.Quaternion().setFromAxisAngle(right, dy * 0.012));
    q.normalize();
    return [q.w, q.x, q.y, q.z];
  }
}
