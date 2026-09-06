import * as THREE from '../vendor/three/three.module.js';
import { OrbitControls } from '../vendor/three/OrbitControls.js';

function posePosition(pose) {
  return new THREE.Vector3(pose[12], -pose[13], -pose[14]);
}

function poseAngles(pose) {
  const matrix = new THREE.Matrix4().fromArray(pose);
  const rotation = new THREE.Quaternion().setFromRotationMatrix(matrix);
  const cameraRotation = new THREE.Quaternion(-rotation.x, rotation.y, rotation.z, rotation.w);
  const euler = new THREE.Euler().setFromQuaternion(cameraRotation, 'YXZ');
  return {
    roll: THREE.MathUtils.radToDeg(euler.z),
    pitch: THREE.MathUtils.radToDeg(euler.x),
    yaw: THREE.MathUtils.radToDeg(euler.y),
  };
}

function poseQuaternion(pose) {
  const matrix = new THREE.Matrix4().fromArray(pose);
  const rotation = new THREE.Quaternion().setFromRotationMatrix(matrix);
  return new THREE.Quaternion(-rotation.x, rotation.y, rotation.z, rotation.w);
}

function applyPose(pose, object) {
  const matrix = new THREE.Matrix4().fromArray(pose);
  const rotation = new THREE.Quaternion().setFromRotationMatrix(matrix);
  object.quaternion.set(-rotation.x, rotation.y, rotation.z, rotation.w);
  object.position.copy(posePosition(pose));
}

export class MapVisualization {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setClearColor(0x081012, 1);

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0x081012, 4, 18);
    this.camera = new THREE.PerspectiveCamera(48, 1, 0.01, 1000);
    this.camera.position.set(1.8, 1.7, 2.8);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 0.12;
    this.controls.maxDistance = 100;
    this.controls.target.set(0, 0, 0);

    this.scene.add(new THREE.HemisphereLight(0x9dd6c4, 0x10201e, 1.7));
    const grid = new THREE.GridHelper(12, 24, 0x2a5850, 0x17322f);
    grid.position.y = -0.01;
    this.scene.add(grid);
    this.scene.add(new THREE.AxesHelper(0.35));

    this.mapGeometry = new THREE.BufferGeometry();
    this.mapPoints = new THREE.Points(this.mapGeometry, new THREE.PointsMaterial({ size: 0.035, sizeAttenuation: true, vertexColors: true }));
    this.scene.add(this.mapPoints);

    this.trajectoryGeometry = new THREE.BufferGeometry();
    this.trajectory = new THREE.Line(this.trajectoryGeometry, new THREE.LineBasicMaterial({ color: 0xa8f26d, transparent: true, opacity: 0.9 }));
    this.scene.add(this.trajectory);

    this.currentCamera = new THREE.Group();
    const frustumGeometry = new THREE.BufferGeometry();
    frustumGeometry.setAttribute('position', new THREE.Float32BufferAttribute([
      0, 0, 0, -0.11, -0.075, -0.18, 0, 0, 0, 0.11, -0.075, -0.18,
      0, 0, 0, -0.11, 0.075, -0.18, 0, 0, 0, 0.11, 0.075, -0.18,
      -0.11, -0.075, -0.18, 0.11, -0.075, -0.18, 0.11, -0.075, -0.18, 0.11, 0.075, -0.18,
      0.11, 0.075, -0.18, -0.11, 0.075, -0.18, -0.11, 0.075, -0.18, -0.11, -0.075, -0.18
    ], 3));
    this.currentCamera.add(new THREE.LineSegments(frustumGeometry, new THREE.LineBasicMaterial({ color: 0x68d5bd }))); 
    this.currentCamera.add(new THREE.AxesHelper(0.12));
    this.scene.add(this.currentCamera);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    this.resize();
    this.animate();
  }

  animate() {
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    requestAnimationFrame(() => this.animate());
  }

  resize() {
    const width = this.canvas.clientWidth || 1;
    const height = this.canvas.clientHeight || 1;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  update(pose, trajectory, packedMapPoints) {
    if (pose) applyPose(pose, this.currentCamera);

    const path = new Float32Array(trajectory.length * 3);
    trajectory.forEach((point, index) => {
      path[index * 3] = point.x;
      path[index * 3 + 1] = point.y;
      path[index * 3 + 2] = point.z;
    });
    this.trajectoryGeometry.setAttribute('position', new THREE.BufferAttribute(path, 3));
    this.trajectoryGeometry.computeBoundingSphere();

    const pointCount = Math.floor(packedMapPoints.length / 6);
    const positions = new Float32Array(pointCount * 3);
    const colors = new Float32Array(pointCount * 3);
    for (let index = 0; index < pointCount; index += 1) {
      const source = index * 6;
      positions[index * 3] = packedMapPoints[source];
      positions[index * 3 + 1] = -packedMapPoints[source + 1];
      positions[index * 3 + 2] = -packedMapPoints[source + 2];
      colors[index * 3] = packedMapPoints[source + 3] / 255;
      colors[index * 3 + 1] = packedMapPoints[source + 4] / 255;
      colors[index * 3 + 2] = packedMapPoints[source + 5] / 255;
    }
    this.mapGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.mapGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    this.mapGeometry.computeBoundingSphere();
  }

  reset() {
    this.trajectoryGeometry.deleteAttribute('position');
    this.mapGeometry.deleteAttribute('position');
    this.mapGeometry.deleteAttribute('color');
    this.currentCamera.position.set(0, 0, 0);
    this.currentCamera.quaternion.identity();
  }
}

export { poseAngles, posePosition, poseQuaternion };
