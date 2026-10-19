import * as THREE from 'three';
import { MujocoThreeRenderer } from '../../shared/mujoco-three-renderer.js';
// mjvGeom's cylinder display size differs from mjModel.geom_size. Use the physical
// model dimensions here; keep the other demos' shared renderer unchanged.
export class Renderer extends MujocoThreeRenderer {
  meshGeometry(id) {
    if (!this.displayMeshes) return super.meshGeometry(id);
    const key = `display:${id}`;
    if (this.geometryCache.has(key)) return this.geometryCache.get(key);
    const mesh = this.displayMeshes.meshes[id];
    if (!mesh) throw Error(`Missing display mesh ${id}`);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(mesh.vertices, 3));
    geometry.setIndex(mesh.faces); geometry.computeVertexNormals(); geometry.computeBoundingSphere();
    this.geometryCache.set(key, geometry); return geometry;
  }
  updateScene(data = this.data) {
    super.updateScene(data);
    for (const mesh of this.objects.values()) {
      const id = mesh.userData.geomId;
      if (id >= 0 && this.model.geom_type[id] === 5) {
        const radius = this.model.geom_size[id * 3], halfHeight = this.model.geom_size[id * 3 + 1];
        mesh.scale.set(radius, radius, halfHeight);
      }
    }
  }
}
