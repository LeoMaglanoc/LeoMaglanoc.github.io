import * as THREE from "../vendor/three.module.js";
import { OrbitControls } from "../vendor/OrbitControls.js";
import { C } from "./config.js";

function threePosition(source, index) {
  return new THREE.Vector3(source[index * 3], source[index * 3 + 2], -source[index * 3 + 1]);
}

function threeQuaternion(source, index) {
  return new THREE.Quaternion(-source[index * 4 + 1], -source[index * 4 + 3], source[index * 4 + 2], -source[index * 4]);
}

function colorFor(model, geom) {
  const matId = model.geom_matid[geom];
  if (matId >= 0 && model.mat_rgba) {
    return [model.mat_rgba[matId * 4], model.mat_rgba[matId * 4 + 1], model.mat_rgba[matId * 4 + 2], model.mat_rgba[matId * 4 + 3]];
  }
  return [model.geom_rgba[geom * 4], model.geom_rgba[geom * 4 + 1], model.geom_rgba[geom * 4 + 2], model.geom_rgba[geom * 4 + 3]];
}

export class SortingRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color("#acb8b3");
    this.scene.fog = new THREE.Fog("#acb8b3", 12, 25);
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.025, 50);
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    this.quality = window.matchMedia("(pointer: coarse)").matches ? "mobile" : "desktop";
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.quality === "mobile" ? 1.25 : 1.5));
    this.renderer.shadowMap.enabled = window.innerWidth > 1000 && !window.matchMedia("(pointer: coarse)").matches;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.target.set(0.2, 0.55, 0);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 2;
    this.controls.maxDistance = 12;
    this.controls.maxPolarAngle = Math.PI * 0.49;
    this.bodyGroups = [];
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas.parentElement);

    this.scene.add(new THREE.HemisphereLight(0xf4f7ec, 0x687976, 2.1));
    const key = new THREE.DirectionalLight(0xfff5db, 3);
    key.position.set(3, 5, 4);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.near = 0.1;
    key.shadow.camera.far = 20;
    key.shadow.camera.left = -4;
    key.shadow.camera.right = 4;
    key.shadow.camera.top = 4;
    key.shadow.camera.bottom = -4;
    key.shadow.bias = -0.0005;
    this.scene.add(key);
    const grid = new THREE.GridHelper(7, 28, 0x879b94, 0x97aaa2);
    grid.position.y = 0.002;
    grid.material.transparent = true;
    grid.material.opacity = 0.25;
    this.scene.add(grid);
    this.debugMarker = new THREE.Mesh(new THREE.SphereGeometry(0.018, 12, 8), new THREE.MeshBasicMaterial({ color: 0x42efb1 }));
    this.debugMarker.visible = false;
    this.scene.add(this.debugMarker);
    this.selection = new THREE.Mesh(new THREE.TorusGeometry(0.065, 0.004, 6, 32), new THREE.MeshBasicMaterial({ color: 0xf4bc5c }));
    this.selection.rotation.x = Math.PI / 2;
    this.selection.visible = false;
    this.scene.add(this.selection);
    this.homeCamera();
    this.resize();
  }

  resize() {
    const rect = this.canvas.parentElement.getBoundingClientRect();
    const width = Math.max(1, rect.width);
    const height = Math.max(1, rect.height);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  homeCamera() {
    const narrow = this.canvas.parentElement.clientWidth < 600;
    const short = this.canvas.parentElement.clientHeight < 350;
    this.camera.position.set(narrow ? 5.0 : short ? 3.1 : 4.2, narrow ? 5.8 : short ? 3.8 : 4.7, narrow ? 5.7 : short ? 3.7 : 4.8);
    this.controls.target.set(0.2, 0.55, 0);
    this.controls.update();
  }

  reduceQuality() {
    if (this.quality === "low") return;
    this.quality = "low";
    this.renderer.setPixelRatio(1);
    this.renderer.shadowMap.enabled = false;
    this.resize();
  }

  meshGeometry(model, meshId, cache) {
    if (cache.has(meshId)) return cache.get(meshId);
    const vertexStart = model.mesh_vertadr[meshId] * 3;
    const vertexCount = model.mesh_vertnum[meshId] * 3;
    const source = model.mesh_vert.subarray(vertexStart, vertexStart + vertexCount);
    const vertices = new Float32Array(source.length);
    for (let i = 0; i < source.length; i += 3) {
      vertices[i] = source[i];
      vertices[i + 1] = source[i + 2];
      vertices[i + 2] = -source[i + 1];
    }
    const faceStart = model.mesh_faceadr[meshId] * 3;
    const faceCount = model.mesh_facenum[meshId] * 3;
    const indices = Array.from(model.mesh_face.subarray(faceStart, faceStart + faceCount));
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(vertices, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    cache.set(meshId, geometry);
    return geometry;
  }

  buildModel(model) {
    const root = new THREE.Group();
    root.name = "TIAGo";
    this.scene.add(root);
    const meshCache = new Map();
    const meshType = model.mjtGeom?.mjGEOM_MESH?.value ?? 7;
    const sphereType = model.mjtGeom?.mjGEOM_SPHERE?.value ?? 2;
    const capsuleType = model.mjtGeom?.mjGEOM_CAPSULE?.value ?? 3;
    const ellipsoidType = model.mjtGeom?.mjGEOM_ELLIPSOID?.value ?? 4;
    const cylinderType = model.mjtGeom?.mjGEOM_CYLINDER?.value ?? 5;
    const planeType = model.mjtGeom?.mjGEOM_PLANE?.value ?? 0;

    for (let body = 0; body < model.nbody; body += 1) {
      const group = new THREE.Group();
      group.name = model.body(body)?.name || `body-${body}`;
      group.castShadow = true;
      group.receiveShadow = true;
      root.add(group);
      this.bodyGroups[body] = group;
    }

    for (let geom = 0; geom < model.ngeom; geom += 1) {
      const type = model.geom_type[geom];
      const groupId = model.geom_group[geom];
      if (type !== planeType && groupId !== 1 && groupId !== 2) continue;
      if (type === planeType) continue;
      const bodyId = model.geom_bodyid[geom];
      const size = [model.geom_size[geom * 3], model.geom_size[geom * 3 + 1], model.geom_size[geom * 3 + 2]];
      let geometry;
      if (type === meshType) {
        geometry = this.meshGeometry(model, model.geom_dataid[geom], meshCache);
      } else if (type === capsuleType) {
        geometry = new THREE.CapsuleGeometry(size[0], size[1] * 2, 12, 16);
      } else if (type === cylinderType) {
        geometry = new THREE.CylinderGeometry(size[0], size[0], size[1] * 2, 16);
      } else if (type === sphereType || type === ellipsoidType) {
        geometry = new THREE.SphereGeometry(1, 16, 12);
      } else {
        geometry = new THREE.BoxGeometry(size[0] * 2, size[2] * 2, size[1] * 2);
      }
      const rgba = colorFor(model, geom);
      const material = new THREE.MeshStandardMaterial({
        color: new THREE.Color(rgba[0], rgba[1], rgba[2]),
        roughness: 0.65,
        metalness: 0.12,
        transparent: rgba[3] < 1,
        opacity: rgba[3],
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.copy(threePosition(model.geom_pos, geom));
      mesh.quaternion.copy(threeQuaternion(model.geom_quat, geom));
      if (type === sphereType) mesh.scale.set(size[0], size[0], size[0]);
      if (type === ellipsoidType) mesh.scale.set(size[0], size[2], size[1]);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.bodyGroups[bodyId]?.add(mesh);
      if (groupId === 1 && bodyId !== 0) {
        if (!this.objectMeshes) this.objectMeshes = new Map();
        this.objectMeshes.set(geom, mesh);
      }
    }

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshStandardMaterial({ color: 0xa3b2a9, roughness: 0.9, metalness: 0 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.002;
    floor.receiveShadow = true;
    this.scene.add(floor);
    for (const [name, station] of [
      ["input", C.input],
      ["blue", C.blue],
      ["red", C.red],
    ]) {
      const color = name === "input" ? 0x52756b : name === "blue" ? 0x3e78ad : 0xb96249;
      const plate = new THREE.Mesh(new THREE.PlaneGeometry(1.15, 0.9), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.16 }));
      plate.rotation.x = -Math.PI / 2;
      plate.position.set(0.68, 0.006, -station.center[1]);
      this.scene.add(plate);
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.32, 0.335, 48), new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }));
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(0, 0.008, -station.center[1]);
      this.scene.add(ring);
      this.label(name === "input" ? "01  /  INPUT" : name === "blue" ? "02  /  BLUE" : "03  /  RED", color, [0.85, 0.012, -station.center[1] + 0.52]);
    }
  }

  label(text, color, position) {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 96;
    const ctx = canvas.getContext("2d");
    ctx.font = "600 36px monospace";
    ctx.fillStyle = "#263e39";
    ctx.textAlign = "center";
    ctx.fillText(text, 256, 60);
    const texture = new THREE.CanvasTexture(canvas),
      mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(0.95, 0.178),
        new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false })
      );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.fromArray(position);
    this.scene.add(mesh);
  }

  update(data, task, debug = false) {
    const now = performance.now();
    if (this.lastRender && now - this.lastRender < 1000 / 30) return;
    this.lastRender = now;
    for (let body = 0; body < this.bodyGroups.length; body += 1) {
      const group = this.bodyGroups[body];
      if (!group) continue;
      group.position.copy(threePosition(data.xpos, body));
      group.quaternion.copy(threeQuaternion(data.xquat, body));
    }
    for (const o of task.pool.items) {
      this.bodyGroups[o.body].visible = o.status !== "parked";
      const mesh = this.objectMeshes.get(o.geom);
      if (mesh) mesh.material.color.set(o.color === "blue" ? 0x287cce : 0xe35b40);
    }
    this.selection.visible = !!task.target;
    if (task.target) {
      const p = task.targetPose();
      this.selection.position.set(p[0], p[2] + 0.037, -p[1]);
    }
    this.debugMarker.visible = debug && !!task.motion.target;
    if (this.debugMarker.visible) {
      const p = task.motion.target;
      this.debugMarker.position.set(p[0], p[2], -p[1]);
    }
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }
}
