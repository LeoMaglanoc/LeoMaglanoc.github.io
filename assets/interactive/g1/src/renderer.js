import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

function threePosition(source, index) {
  return new THREE.Vector3(source[index * 3], source[index * 3 + 2], -source[index * 3 + 1]);
}

function threeQuaternion(source, index) {
  return new THREE.Quaternion(
    -source[index * 4 + 1],
    -source[index * 4 + 3],
    source[index * 4 + 2],
    -source[index * 4]
  );
}

function colorFor(model, geom) {
  const matId = model.geom_matid[geom];
  if (matId >= 0 && model.mat_rgba) {
    return [model.mat_rgba[matId * 4], model.mat_rgba[matId * 4 + 1], model.mat_rgba[matId * 4 + 2], model.mat_rgba[matId * 4 + 3]];
  }
  return [model.geom_rgba[geom * 4], model.geom_rgba[geom * 4 + 1], model.geom_rgba[geom * 4 + 2], model.geom_rgba[geom * 4 + 3]];
}

export class G1Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color("#101617");
    this.scene.fog = new THREE.Fog("#101617", 12, 28);
    this.camera = new THREE.PerspectiveCamera(35, 1, 0.01, 100);
    this.camera.position.set(2.7, 1.45, 3.1);
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.target.set(0, 0.75, 0);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 1.3;
    this.controls.maxDistance = 8;
    this.controls.maxPolarAngle = Math.PI * 0.49;
    this.bodyGroups = [];
    this.lastFollow = new THREE.Vector3();
    this.followInitialized = false;
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas.parentElement);

    this.scene.add(new THREE.HemisphereLight(0xd9f5ee, 0x162325, 1.7));
    const key = new THREE.DirectionalLight(0xeafff7, 3.5);
    key.position.set(3, 5, 4);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.near = 0.1;
    key.shadow.camera.far = 20;
    this.scene.add(key);
    this.scene.add(new THREE.GridHelper(30, 60, 0x37514c, 0x1d302e));
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
    root.name = "G1";
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
      if (type !== planeType && groupId !== 1) continue;
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
        roughness: 0.34,
        metalness: 0.18,
        transparent: rgba[3] < 1,
        opacity: rgba[3]
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.copy(threePosition(model.geom_pos, geom));
      mesh.quaternion.copy(threeQuaternion(model.geom_quat, geom));
      if (type === sphereType) mesh.scale.set(size[0], size[0], size[0]);
      if (type === ellipsoidType) mesh.scale.set(size[0], size[2], size[1]);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.bodyGroups[bodyId]?.add(mesh);
    }

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(40, 40),
      new THREE.MeshStandardMaterial({ color: 0x13211f, roughness: 0.9, metalness: 0 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.002;
    floor.receiveShadow = true;
    this.scene.add(floor);
  }

  update(data) {
    for (let body = 0; body < this.bodyGroups.length; body += 1) {
      const group = this.bodyGroups[body];
      if (!group) continue;
      group.position.copy(threePosition(data.xpos, body));
      group.quaternion.copy(threeQuaternion(data.xquat, body));
    }
    const pelvis = threePosition(data.xpos, 1);
    if (!this.followInitialized) {
      this.lastFollow.copy(pelvis);
      this.followInitialized = true;
    }
    const delta = pelvis.clone().sub(this.lastFollow);
    delta.y = 0;
    if (delta.lengthSq() > 0.000001) {
      this.camera.position.add(delta);
      this.controls.target.add(delta);
      this.lastFollow.copy(pelvis);
    }
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }
}
