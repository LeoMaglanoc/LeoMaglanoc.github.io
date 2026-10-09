import * as THREE from "three";
import { MujocoThreeRenderer } from "../../shared/mujoco-three-renderer.js";
export function createView(canvas, sim) {
  const inRobot = (id) => {
    while (id > 0) {
      if (id === sim.bodyIds.pelvis) return true;
      id = sim.model.body_parentid[id];
    }
    return false;
  };
  const excluded = Array.from({ length: sim.model.ngeom }, (_, i) => i).filter(
    (i) => sim.model.geom_group[i] === 0 && inRobot(sim.model.geom_bodyid[i])
  );
  const view = new MujocoThreeRenderer({
    canvas,
    mujoco: sim.mj,
    model: sim.model,
    data: sim.data,
    geomGroups: [0, 1],
    excludeGeomIds: excluded,
    shadows: false,
  });
  view.setCameraPreset({
    position: [3.2, -3.7, 2.3],
    target: [1.1, 0.25, 0.4],
    fov: canvas.clientWidth < canvas.clientHeight ? 65 : 35,
    minDistance: 1.5,
    maxDistance: 12,
  });
  const resize = view.resize.bind(view);
  view.resize = () => {
    resize();
    view.camera.fov = view.width < view.height ? 65 : 35;
    view.camera.updateProjectionMatrix();
  };
  view.renderer.setPixelRatio(1);
  view.initialize();
  view.scene.fog = new THREE.Fog("#101617", 12, 28);
  for (const mesh of view.objects.values())
    if (sim.model.geom_type[mesh.userData.geomId] === 0) {
      mesh.material.map = null;
      mesh.material.color.set("#13211f");
      mesh.material.needsUpdate = true;
    }
  const goal = new THREE.Mesh(new THREE.RingGeometry(0.28, 0.31, 64), new THREE.MeshBasicMaterial({ color: 0xa7efc0, side: THREE.DoubleSide }));
  goal.position.set(...sim.settings.goal, 0.013);
  view.scene.add(goal);
  view.update = () => {
    view.updateScene();
    for (const mesh of view.objects.values())
      if (sim.model.geom_type[mesh.userData.geomId] === 0) {
        mesh.material.map = null;
        mesh.material.color.set("#13211f");
        mesh.material.roughness = 0.95;
        mesh.material.needsUpdate = true;
      }
    view.renderer.render(view.scene, view.camera);
  };
  const dispose = view.dispose.bind(view);
  view.dispose = () => {
    goal.geometry.dispose();
    goal.material.dispose();
    dispose();
  };
  return view;
}
