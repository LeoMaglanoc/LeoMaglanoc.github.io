import * as THREE from "three";
import { MujocoThreeRenderer } from "../../shared/mujoco-three-renderer.js";
export function createView(canvas, { mj, model, data }, displayMeshes) {
  const id = (n) => mj.mj_name2id(model, mj.mjtObj.mjOBJ_GEOM.value, n);
  const keep = ["field", "ball_geom", "target_geom"].map(id);
  const excluded = Array.from({ length: model.ngeom }, (_, i) => i).filter(
    (i) => model.geom_group[i] === 0 && !keep.includes(i),
  );
  const view = new MujocoThreeRenderer({
    canvas,
    mujoco: mj,
    model,
    data,
    geomGroups: [0, 1],
    excludeGeomIds: excluded,
    shadows: false,
  });
  view.setBackground("#101b1c");
  view.renderer.setPixelRatio(1);
  view.controls.enableDamping = false;
  view.controls.maxPolarAngle = Math.PI * 0.48;
  view.controls.enablePan = false;
  view.home = () => {
    const portrait = canvas.clientHeight > canvas.clientWidth * 1.15;
    view.setCameraPreset({
      position: portrait ? [7, -9, 11] : [5.5, -7.8, 8.5],
      target: [0, 0, 0.15],
      fov: portrait ? 48 : 45,
      minDistance: 4,
      maxDistance: 19,
    });
  };
  // Display decimation never enters the MuJoCo model or contact solver.
  const originalMeshGeometry = view.meshGeometry.bind(view);
  view.meshGeometry = (id) => {
    const mesh = displayMeshes[String(id)];
    if (!mesh) return originalMeshGeometry(id);
    const key = `mesh:${id}`;
    if (view.geometryCache.has(key)) return view.geometryCache.get(key);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(mesh.positions, 3),
    );
    geometry.setAttribute(
      "normal",
      new THREE.Float32BufferAttribute(mesh.normals, 3),
    );
    geometry.setIndex(mesh.indices);
    geometry.computeBoundingSphere();
    view.geometryCache.set(key, geometry);
    return geometry;
  };
  view.home();
  view.initialize();
  const white = new THREE.LineBasicMaterial({
    color: 0xb8d0b6,
    transparent: true,
    opacity: 0.5,
  });
  function line(points, loop = false) {
    const geo = new THREE.BufferGeometry().setFromPoints(
      points.map(([x, y]) => new THREE.Vector3(x, y, 0.008)),
    );
    const object = loop
      ? new THREE.LineLoop(geo, white)
      : new THREE.Line(geo, white);
    view.scene.add(object);
  }
  line(
    [
      [-4, -3],
      [4, -3],
      [4, 3],
      [-4, 3],
    ],
    true,
  );
  line([
    [0, -3],
    [0, 3],
  ]);
  line(
    Array.from({ length: 65 }, (_, i) => [
      0.7 * Math.cos((i * 2 * Math.PI) / 64),
      0.7 * Math.sin((i * 2 * Math.PI) / 64),
    ]),
  );
  for (const sign of [-1, 1])
    line([
      [sign * 4, -1],
      [sign * 3.25, -1],
      [sign * 3.25, 1],
      [sign * 4, 1],
    ]);
  const fieldId = id("field"),
    targetId = id("target_geom"),
    ballId = id("ball_geom");
  const ray = new THREE.Raycaster(),
    plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0),
    hit = new THREE.Vector3();
  view.pick = (x, y) => {
    const r = canvas.getBoundingClientRect();
    ray.setFromCamera(
      new THREE.Vector2(
        ((x - r.left) / r.width) * 2 - 1,
        (-(y - r.top) / r.height) * 2 + 1,
      ),
      view.camera,
    );
    return ray.ray.intersectPlane(plane, hit) ? [hit.x, hit.y] : null;
  };
  view.update = () => {
    view.updateScene(data);
    for (const mesh of view.objects.values()) {
      const id = mesh.userData.geomId;
      if (id === fieldId) {
        mesh.material.map = null;
        mesh.material.color.set("#163a2b");
        mesh.material.roughness = 1;
      }
      if (id === targetId) {
        mesh.material.color.set("#d3ef88");
        mesh.material.opacity = 0.45;
        mesh.scale.set(0.5, 0.5, 0.001);
      }
      if (id === ballId) {
        mesh.material.color.set("#ffffff");
        mesh.material.roughness = 0.5;
      }
    }
    view.renderer.render(view.scene, view.camera);
  };
  return view;
}
