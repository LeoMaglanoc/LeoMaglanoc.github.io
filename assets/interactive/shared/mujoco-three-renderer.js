import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

// World, mesh vertices and mjvGeom transforms all stay in MuJoCo's Z-up frame.
export class MujocoThreeRenderer {
  constructor({ canvas, mujoco, model, data, geomGroups = [0, 1, 2], excludeGeomIds = [], maxGeoms = 10000, sourceNormals = true, shadows = true }) {
    Object.assign(this, { canvas, mujoco, model, data, sourceNormals });
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color("#101617");
    this.camera = new THREE.PerspectiveCamera(35, 1, 0.005, 100);
    this.camera.up.set(0, 0, 1);
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = shadows;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.geometryCache = new Map();
    this.textureCache = new Map();
    this.objects = new Map();
    this.excluded = new Set(excludeGeomIds);
    this.rotation = new THREE.Matrix4();
    this.follow = new THREE.Vector3();
    this.delta = new THREE.Vector3();
    this.followInitialized = false;
    this.option = new mujoco.MjvOption();
    this.option.geomgroup.fill(0);
    for (const group of geomGroups) this.option.geomgroup[group] = 1;
    this.option.sitegroup.fill(0);
    this.perturb = new mujoco.MjvPerturb();
    this.mjCamera = new mujoco.MjvCamera();
    this.mjScene = new mujoco.MjvScene(model, maxGeoms);
    this.scene.add(new THREE.HemisphereLight(0xd9f5ee, 0x162325, 1.7));
    this.keyLight = new THREE.DirectionalLight(0xeafff7, 3.5);
    this.keyLight.position.set(3, -4, 5);
    this.keyLight.castShadow = shadows;
    this.keyLight.shadow.mapSize.set(1024, 1024);
    Object.assign(this.keyLight.shadow.camera, { near: 0.01, far: 20, left: -3, right: 3, top: 3, bottom: -3 });
    this.keyLight.shadow.bias = -0.0001;
    this.scene.add(this.keyLight, this.keyLight.target);
    this.setCameraPreset({ position: [2.7, -3.1, 1.45], target: [0, 0, 0.75] });
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    this.resize();
  }

  initialize() {
    this.updateScene();
    return this;
  }
  setBackground(color) {
    this.scene.background.set(color);
  }
  setOrbitEnabled(enabled) {
    this.controls.enabled = enabled;
  }
  setFollowBody(bodyId) {
    this.followBody = bodyId;
    this.followInitialized = false;
  }
  setCameraPreset({ position, target, fov = 35, minDistance = 0.1, maxDistance = 8 }) {
    this.camera.position.fromArray(position);
    this.controls.target.fromArray(target);
    Object.assign(this.camera, { fov });
    Object.assign(this.controls, { minDistance, maxDistance });
    this.camera.updateProjectionMatrix();
    this.controls.update();
  }
  resize() {
    const { width, height } = this.canvas.getBoundingClientRect();
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    this.camera.aspect = this.width / this.height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(this.width, this.height, false);
  }

  meshGeometry(id) {
    const key = `mesh:${id}`;
    if (this.geometryCache.has(key)) return this.geometryCache.get(key);
    const m = this.model,
      count = m.mesh_facenum[id] * 3;
    const positions = new Float32Array(count * 3),
      normals = new Float32Array(count * 3),
      uv = new Float32Array(count * 2);
    let validNormals = this.sourceNormals && m.mesh_normalnum[id] > 0;
    const hasUV = m.mesh_texcoordnum[id] > 0;
    let generated;
    if (!this.sourceNormals) {
      const smooth = new THREE.BufferGeometry();
      const start = m.mesh_vertadr[id] * 3;
      smooth.setAttribute("position", new THREE.BufferAttribute(Float32Array.from(m.mesh_vert.subarray(start, start + m.mesh_vertnum[id] * 3)), 3));
      smooth.setIndex(Array.from(m.mesh_face.subarray(m.mesh_faceadr[id] * 3, m.mesh_faceadr[id] * 3 + count)));
      smooth.computeVertexNormals();
      generated = Float32Array.from(smooth.getAttribute("normal").array);
      smooth.dispose();
    }
    // Expand face corners: vertex, normal and UV indices are independent in MuJoCo.
    for (let i = 0; i < count; i++) {
      const face = m.mesh_faceadr[id] * 3 + i;
      const vertex = (m.mesh_vertadr[id] + m.mesh_face[face]) * 3;
      positions.set(m.mesh_vert.subarray(vertex, vertex + 3), i * 3);
      const ni = m.mesh_facenormal[face];
      if (ni < 0 || ni >= m.mesh_normalnum[id]) validNormals = false;
      else {
        const n = (m.mesh_normaladr[id] + ni) * 3;
        normals.set(m.mesh_normal.subarray(n, n + 3), i * 3);
        if (!Number.isFinite(normals[i * 3]) || Math.hypot(...normals.subarray(i * 3, i * 3 + 3)) < 0.5) validNormals = false;
      }
      if (hasUV) {
        const t = (m.mesh_texcoordadr[id] + m.mesh_facetexcoord[face]) * 2;
        uv.set(m.mesh_texcoord.subarray(t, t + 2), i * 2);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    if (validNormals) geometry.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
    else if (generated) {
      for (let i = 0; i < count; i++) {
        const vertex = m.mesh_face[m.mesh_faceadr[id] * 3 + i] * 3;
        normals.set(generated.subarray(vertex, vertex + 3), i * 3);
      }
      geometry.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
    } else geometry.computeVertexNormals();
    if (hasUV) geometry.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    geometry.userData.sourceNormals = validNormals;
    geometry.computeBoundingSphere();
    this.geometryCache.set(key, geometry);
    return geometry;
  }

  geometry(g) {
    // mjvGeom mesh dataid is twice the model mesh id (low bit selects convex hull).
    if (g.type === 7) return this.meshGeometry(Math.floor(g.dataid / 2));
    const key = g.type === 3 ? `capsule:${g.size[0]}:${g.size[1]}` : `primitive:${g.type}`;
    if (this.geometryCache.has(key)) return this.geometryCache.get(key);
    let geometry;
    switch (g.type) {
      case 0:
        geometry = new THREE.PlaneGeometry(1, 1);
        break;
      case 2:
      case 4:
        geometry = new THREE.SphereGeometry(1, 24, 16);
        break;
      case 3:
        geometry = new THREE.CapsuleGeometry(g.size[0], 2 * g.size[1], 8, 20);
        geometry.rotateX(Math.PI / 2);
        break;
      case 5:
        geometry = new THREE.CylinderGeometry(1, 1, 2, 24);
        geometry.rotateX(Math.PI / 2);
        break;
      case 6:
        geometry = new THREE.BoxGeometry(2, 2, 2);
        break;
      default:
        throw Error(`Unsupported MuJoCo visual geom type ${g.type}`);
    }
    this.geometryCache.set(key, geometry);
    return geometry;
  }

  texture(id, face = 0) {
    const key = `${id}:${face}`;
    if (this.textureCache.has(key)) return this.textureCache.get(key);
    const m = this.model,
      width = m.tex_width[id],
      cube = m.tex_type[id] === 1;
    const height = m.tex_height[id] / (cube ? 6 : 1),
      channels = m.tex_nchannel[id];
    const start = Number(m.tex_adr[id]) + face * width * height * channels;
    const rgba = new Uint8Array(width * height * 4);
    for (let i = 0; i < width * height; i++) {
      for (let c = 0; c < 3; c++) rgba[i * 4 + c] = m.tex_data[start + i * channels + Math.min(c, channels - 1)];
      rgba[i * 4 + 3] = channels === 4 ? m.tex_data[start + i * channels + 3] : 255;
    }
    const texture = new THREE.DataTexture(rgba, width, height, THREE.RGBAFormat);
    texture.colorSpace = m.tex_colorspace[id] === 1 ? THREE.LinearSRGBColorSpace : THREE.SRGBColorSpace;
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.generateMipmaps = true;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.needsUpdate = true;
    this.textureCache.set(key, texture);
    return texture;
  }

  material(g) {
    const make = (face) => {
      const id = g.matid;
      const material = new THREE.MeshStandardMaterial({
        roughness: id >= 0 ? this.model.mat_roughness[id] : Math.max(0.25, 1 - g.shininess * 0.7),
        metalness: id >= 0 ? this.model.mat_metallic[id] : Math.min(0.2, g.reflectance),
      });
      if (g.texid >= 0 && (this.model.tex_type[g.texid] === 0 || g.type === 6)) {
        material.map = this.texture(g.texid, face);
      }
      return material;
    };
    return g.texid >= 0 && this.model.tex_type[g.texid] === 1 && g.type === 6 ? Array.from({ length: 6 }, (_, i) => make(i)) : make(0);
  }

  updateScene(data = this.data) {
    this.data = data;
    const mj = this.mujoco;
    mj.mjv_updateScene(this.model, data, this.option, this.perturb, this.mjCamera, mj.mjtCatBit.mjCAT_ALL.value, this.mjScene);
    for (const mesh of this.objects.values()) mesh.visible = false;
    // Embind returns an owned vector copy here. Acquire it once per frame,
    // then release it; reading .geoms for every geometry leaks WASM memory.
    const geoms = this.mjScene.geoms;
    try {
      for (let i = 0; i < this.mjScene.ngeom; i++) {
        const g = geoms.get(i);
        if (g.objtype === mj.mjtObj.mjOBJ_GEOM.value && this.excluded.has(g.objid)) {
          g.delete();
          continue;
        }
        const key = `${g.objtype}:${g.objid}:${g.type}:${g.dataid}`;
        let mesh = this.objects.get(key);
        if (!mesh) {
          mesh = new THREE.Mesh(this.geometry(g), this.material(g));
          mesh.userData.geomId = g.objid;
          mesh.castShadow = g.type !== 0;
          mesh.receiveShadow = true;
          this.objects.set(key, mesh);
          this.scene.add(mesh);
        }
        mesh.visible = g.rgba[3] > 0;
        mesh.position.fromArray(g.pos);
        const r = g.mat;
        this.rotation.set(r[0], r[1], r[2], 0, r[3], r[4], r[5], 0, r[6], r[7], r[8], 0, 0, 0, 0, 1);
        mesh.quaternion.setFromRotationMatrix(this.rotation);
        const s = g.size;
        if (g.type === 0) mesh.scale.set(s[0] > 0 ? 2 * s[0] : 40, s[1] > 0 ? 2 * s[1] : 40, 1);
        else if (g.type === 2) mesh.scale.setScalar(s[0]);
        else if (g.type === 4 || g.type === 6) mesh.scale.fromArray(s);
        else if (g.type === 5) mesh.scale.set(s[0], s[0], s[1]);
        for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
          const transparent = g.rgba[3] < 1;
          if (material.transparent !== transparent) {
            material.transparent = transparent;
            material.needsUpdate = true;
          }
          material.color.setRGB(g.rgba[0], g.rgba[1], g.rgba[2]);
          material.opacity = g.rgba[3];
          material.depthWrite = !transparent;
          material.emissive.copy(material.color).multiplyScalar(g.emission);
        }
        g.delete();
      }
    } finally {
      geoms.delete();
    }
    if (this.followBody != null) {
      this.delta.fromArray(data.xpos, this.followBody * 3);
      this.delta.z = 0;
      if (this.followInitialized) {
        this.delta.sub(this.follow);
        this.camera.position.add(this.delta);
        this.controls.target.add(this.delta);
      }
      this.follow.fromArray(data.xpos, this.followBody * 3);
      this.follow.z = 0;
      this.followInitialized = true;
    }
    this.controls.update();
  }
  update(data = this.data) {
    this.updateScene(data);
    this.renderer.render(this.scene, this.camera);
  }
  dispose() {
    this.resizeObserver.disconnect();
    this.controls.dispose();
    for (const mesh of this.objects.values())
      for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) material.dispose();
    for (const geometry of this.geometryCache.values()) geometry.dispose();
    for (const texture of this.textureCache.values()) texture.dispose();
    for (const object of [this.mjScene, this.mjCamera, this.perturb, this.option]) object.delete();
    this.renderer.dispose();
  }
}
