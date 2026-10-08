import * as THREE from "three";
import { MujocoThreeRenderer } from "/assets/interactive/shared/mujoco-three-renderer.js";

const quaternion = (q) => new THREE.Quaternion(q[1], q[2], q[3], q[0]);

// Only the nonphysical goal and task-specific composition live here.
export function createDexterousView({ canvas, target, mujoco, model, data }) {
  const goalBody = model.body("goal").id;
  const excludeGeomIds = Array.from({ length: model.ngeom }, (_, i) => i).filter((i) => model.geom_bodyid[i] === goalBody);
  const view = new MujocoThreeRenderer({ canvas, mujoco, model, data, geomGroups: [1, 2], excludeGeomIds });
  view.controls.enablePan = false;
  view.keyLight.position.set(0.4, -0.4, 1.2);
  view.keyLight.target.position.set(-0.065, 0, 0.54);
  Object.assign(view.keyLight.shadow.camera, { left: -0.3, right: 0.3, top: 0.3, bottom: -0.3, near: 0.01, far: 2 });
  view.keyLight.shadow.camera.updateProjectionMatrix();
  view.initialize();
  const targetScene = new THREE.Scene();
  targetScene.add(new THREE.HemisphereLight(0xd9f5ee, 0x162325, 1.7));
  const light = new THREE.DirectionalLight(0xeafff7, 3.5);
  light.position.set(0.4, -0.4, 1.2);
  targetScene.add(light);
  const physical = [...view.objects.values()].find((mesh) => mesh.userData.geomId === model.geom("object/cube_visual").id);
  const ghost = new THREE.Group();
  ghost.scale.setScalar(1.3);
  const materials = physical.material.map((material) => {
    const copy = material.clone();
    copy.transparent = true;
    copy.opacity = 0.55;
    copy.depthWrite = false;
    return copy;
  });
  const targetMesh = new THREE.Mesh(physical.geometry, materials);
  targetMesh.scale.copy(physical.scale);
  ghost.add(targetMesh);
  const edgeGeometry = new THREE.EdgesGeometry(physical.geometry);
  const edges = new THREE.LineSegments(edgeGeometry, new THREE.LineBasicMaterial({ color: 0xb5f36d, transparent: true, opacity: 0.85 }));
  edges.scale.copy(physical.scale);
  ghost.add(edges);
  targetScene.add(ghost);
  const targetCamera = new THREE.PerspectiveCamera(32, 1, 0.005, 2);
  targetCamera.up.set(0, 0, 1);
  targetCamera.position.set(0.16, -0.22, 0.15);
  targetCamera.lookAt(0, 0, 0);
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const up = new THREE.Vector3(),
    right = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  let targetRect, sceneRect;
  const compose = () => {
    // Keep the hand prominent while leaving the lower right available for the goal.
    const portrait = view.width / view.height < 0.8;
    const landscapePhone = view.height < 560 && !portrait;
    view.setCameraPreset({
      position: portrait ? [0.26, -0.37, 0.78] : [0.24, -0.32, 0.75],
      target: [-0.065, 0, portrait ? 0.52 : 0.545],
      fov: portrait ? 36 : landscapePhone ? 32 : 29,
      minDistance: 0.22,
      maxDistance: 1,
    });
  };
  const measure = () => {
    targetRect = target.getBoundingClientRect();
    sceneRect = canvas.getBoundingClientRect();
    targetCamera.aspect = targetRect.width / targetRect.height;
    targetCamera.updateProjectionMatrix();
  };
  const observer = new ResizeObserver(() => {
    measure();
    compose();
  });
  observer.observe(canvas);
  observer.observe(target);
  measure();
  compose();
  view.hitTarget = (x, y) => {
    measure();
    pointer.set(((x - targetRect.left) / targetRect.width) * 2 - 1, 1 - ((y - targetRect.top) / targetRect.height) * 2);
    raycaster.setFromCamera(pointer, targetCamera);
    // A generous hit sphere around the ghost keeps small touch gestures forgiving.
    return raycaster.ray.intersectsSphere(new THREE.Sphere(new THREE.Vector3(), 0.06));
  };
  view.rotateGoal = (goal, dx, dy) => {
    up.set(0, 1, 0).applyQuaternion(targetCamera.quaternion);
    right.set(1, 0, 0).applyQuaternion(targetCamera.quaternion);
    const q = quaternion(goal);
    q.premultiply(rotation.setFromAxisAngle(up, dx * 0.012));
    q.premultiply(rotation.setFromAxisAngle(right, dy * 0.012));
    q.normalize();
    return [q.w, q.x, q.y, q.z];
  };
  view.update = (d, goal) => {
    view.updateScene(d);
    ghost.quaternion.copy(quaternion(goal));
    const r = view.renderer;
    r.setViewport(0, 0, view.width, view.height);
    r.setScissorTest(false);
    r.autoClear = true;
    r.render(view.scene, view.camera);
    // A second viewport in the same WebGL canvas; no second renderer or context.
    const x = targetRect.left - sceneRect.left,
      y = sceneRect.bottom - targetRect.bottom;
    r.setViewport(x, y, targetRect.width, targetRect.height);
    r.setScissor(x, y, targetRect.width, targetRect.height);
    r.setScissorTest(true);
    r.autoClear = false;
    r.clearDepth();
    r.render(targetScene, targetCamera);
    r.setScissorTest(false);
    r.autoClear = true;
  };
  const dispose = view.dispose.bind(view);
  view.dispose = () => {
    observer.disconnect();
    materials.forEach((m) => m.dispose());
    edgeGeometry.dispose();
    edges.material.dispose();
    dispose();
  };
  return view;
}
