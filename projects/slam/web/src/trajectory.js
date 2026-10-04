import * as THREE from "three";

export function trajectoryObject(samples) {
  if (!Array.isArray(samples) || samples.length < 2) {
    throw new Error("Trajectory needs at least two samples");
  }
  const positions = new Float32Array(samples.length * 3);
  for (const [index, sample] of samples.entries()) {
    const position = sample.position;
    if (!Array.isArray(position) || position.length !== 3 || !position.every(Number.isFinite)) {
      throw new Error(`Invalid trajectory position at sample ${index}`);
    }
    positions.set(position, index * 3);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: 0x62d6ff }));
  line.name = "camera-trajectory";
  const markerGeometry = new THREE.SphereGeometry(0.06, 16, 12);
  const start = new THREE.Mesh(markerGeometry, new THREE.MeshBasicMaterial({ color: 0x5cdb95 }));
  const end = new THREE.Mesh(markerGeometry, new THREE.MeshBasicMaterial({ color: 0xff6b6b }));
  start.position.fromArray(samples[0].position);
  end.position.fromArray(samples.at(-1).position);
  const group = new THREE.Group();
  group.add(line, start, end);
  group.name = "trajectory";
  return group;
}
