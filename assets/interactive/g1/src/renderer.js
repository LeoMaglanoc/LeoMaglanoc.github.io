import * as THREE from "three";
import { MujocoThreeRenderer } from "../../shared/mujoco-three-renderer.js";

// Application framing and floor styling; physics geometry lives in the shared renderer.
export function createG1Renderer(canvas, simulation) {
  const excluded = Array.from({ length: simulation.model.ngeom }, (_, i) => i).filter(
    (i) => simulation.model.geom_group[i] === 0 && simulation.model.geom_type[i] !== 0
  );
  const renderer = new MujocoThreeRenderer({
    canvas,
    mujoco: simulation.mujoco,
    model: simulation.model,
    data: simulation.data,
    geomGroups: [0, 1],
    excludeGeomIds: excluded,
  });
  renderer.setCameraPreset({ position: [2.7, -3.1, 1.45], target: [0, 0, 0.75], minDistance: 1.3, maxDistance: 8 });
  renderer.controls.maxPolarAngle = Math.PI * 0.49;
  renderer.setFollowBody(simulation.pelvisBody);
  renderer.scene.fog = new THREE.Fog("#101617", 12, 28);
  renderer.initialize();
  let floorMaterial;
  for (const mesh of renderer.objects.values()) {
    if (simulation.model.geom_type[mesh.userData.geomId] === 0) {
      floorMaterial = mesh.material;
      mesh.material.map = null;
      mesh.material.color.set(0x13211f);
      mesh.material.roughness = 0.9;
      mesh.material.needsUpdate = true;
    }
  }
  const grid = new THREE.GridHelper(30, 60, 0x37514c, 0x1d302e);
  grid.rotation.x = Math.PI / 2;
  grid.position.z = 0.001;
  renderer.scene.add(grid);
  renderer.update = (data) => {
    renderer.updateScene(data);
    floorMaterial?.color.set(0x13211f);
    renderer.renderer.render(renderer.scene, renderer.camera);
  };
  return renderer;
}
