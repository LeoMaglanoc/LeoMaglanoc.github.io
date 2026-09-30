import * as THREE from "../vendor/three.module.js";
export class FlightRenderer {
  constructor(canvas, course, trajectory) {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color("#10191c");
    this.scene.fog = new THREE.Fog("#10191c", 16, 55);
    this.camera = new THREE.PerspectiveCamera(65, 1, 0.025, 100);
    this.camera.up.set(0, 0, 1);
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.pixelRatio = Math.min(devicePixelRatio || 1, 1.5);
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.cameraMode = "CHASE";
    this.course = course;
    this.scene.add(new THREE.HemisphereLight(0xe3ffe0, 0x23353e, 2));
    const light = new THREE.DirectionalLight(0xffffff, 2.4);
    light.position.set(-3, -8, 12);
    this.scene.add(light);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(100, 70), new THREE.MeshStandardMaterial({ color: 0x17262a, roughness: 1 }));
    ground.position.set(12, 0, -0.01);
    this.scene.add(ground);
    const grid = new THREE.GridHelper(70, 70, 0x415853, 0x24383b);
    grid.rotation.x = Math.PI / 2;
    grid.position.set(12, 0, 0.002);
    this.scene.add(grid);
    this.gateMeshes = [];
    course.gates.forEach((center, i) => {
      const group = new THREE.Group();
      group.position.fromArray(center);
      const [w, h] = course.opening,
        f = course.frame;
      const material = new THREE.MeshStandardMaterial({ color: 0x638c7d, emissive: 0x355146, emissiveIntensity: 0.25, roughness: 0.5 });
      const bar = (size, pos) => {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
        mesh.position.fromArray(pos);
        group.add(mesh);
      };
      bar([2 * f, 2 * f, h + 4 * f], [0, -w / 2 - f, 0]);
      bar([2 * f, 2 * f, h + 4 * f], [0, w / 2 + f, 0]);
      bar([2 * f, w, 2 * f], [0, 0, h / 2 + f]);
      bar([2 * f, w, 2 * f], [0, 0, -h / 2 - f]);
      const ring = new THREE.LineLoop(
        new THREE.BufferGeometry().setFromPoints(
          [
            [0, -w / 2, -h / 2],
            [0, w / 2, -h / 2],
            [0, w / 2, h / 2],
            [0, -w / 2, h / 2],
          ].map((p) => new THREE.Vector3(...p))
        ),
        new THREE.LineBasicMaterial({ color: 0xb5f19b })
      );
      group.add(ring);
      // Number sits above the physical frame; rendered from text, no external asset.
      const label = document.createElement("canvas");
      label.width = 128;
      label.height = 128;
      const ctx = label.getContext("2d");
      ctx.font = "bold 72px sans-serif";
      ctx.textAlign = "center";
      ctx.fillStyle = "#b5f19b";
      ctx.fillText(String(i + 1).padStart(2, "0"), 64, 88);
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(label), transparent: true, depthWrite: false }));
      sprite.position.set(0, 0, h / 2 + 0.55);
      sprite.scale.set(0.6, 0.6, 1);
      group.add(sprite);
      this.scene.add(group);
      this.gateMeshes.push({ material, ring });
    });
    course.obstacles.forEach(([x, y, z, r]) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(r * 2, r * 2, z * 2), new THREE.MeshStandardMaterial({ color: 0x34434c }));
      mesh.position.set(x, y, z);
      this.scene.add(mesh);
    });
    for (const [x, color] of [
      [0, 0xb5f19b],
      [24, 0xc8b2ff],
    ]) {
      const pad = new THREE.Mesh(new THREE.CircleGeometry(0.65, 32), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.18 }));
      pad.position.set(x, 0, 0.005);
      this.scene.add(pad);
    }
    this.drone = this.buildDrone(0xb5f19b);
    this.scene.add(this.drone);
    this.ghost = this.buildDrone(0xc8b2ff, true);
    this.scene.add(this.ghost);
    this.ghost.visible = false;
    const points = [];
    for (let t = 0; t <= trajectory.duration; t += 0.04) points.push(new THREE.Vector3(...trajectory.sample(t).p));
    points.push(new THREE.Vector3(...trajectory.sample(trajectory.duration).p));
    this.reference = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(points),
      new THREE.LineDashedMaterial({ color: 0xb5f19b, dashSize: 0.16, gapSize: 0.12, transparent: true, opacity: 0.65 })
    );
    this.reference.computeLineDistances();
    this.scene.add(this.reference);
    this.actual = this.makeLine(3000, 0x68bcff);
    this.prediction = this.makeLine(19, 0xffc18b);
    this.follow = new THREE.Vector3();
    this.cameraTarget = new THREE.Vector3();
    this.forward = new THREE.Vector3();
    this.offset = new THREE.Vector3();
    this.q = new THREE.Quaternion();
    this.ghostQ = new THREE.Quaternion();
    this.initialized = false;
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(canvas.parentElement);
    this.resize();
  }
  buildDrone(color, ghost = false) {
    const group = new THREE.Group();
    const material = new THREE.MeshStandardMaterial({ color, metalness: 0.35, roughness: 0.4, transparent: ghost, opacity: ghost ? 0.4 : 1 });
    const hull = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.03), material);
    group.add(hull);
    for (const [x, y] of [
      [1, 1],
      [-1, 1],
      [-1, -1],
      [1, -1],
    ]) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.012, 0.01), material);
      arm.rotation.z = Math.atan2(y, x);
      arm.position.set(x * 0.023, y * 0.023, 0);
      group.add(arm);
      const prop = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.002, 16), material);
      prop.rotation.x = Math.PI / 2;
      prop.position.set(x * 0.0325, y * 0.0325, 0.015);
      group.add(prop);
    }
    const nose = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.03, 0.01), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    nose.position.set(0.04, 0, 0);
    group.add(nose);
    return group;
  }
  makeLine(capacity, color) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(capacity * 3), 3));
    geometry.setDrawRange(0, 0);
    const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color }));
    line.frustumCulled = false;
    this.scene.add(line);
    return line;
  }
  resize() {
    const canvas = this.renderer.domElement,
      r = canvas.parentElement.getBoundingClientRect();
    this.camera.aspect = r.width / Math.max(1, r.height);
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(r.width, r.height, false);
  }
  adapt(fps) {
    if (fps < 28 && this.pixelRatio > 0.75) {
      this.pixelRatio = Math.max(0.75, this.pixelRatio - 0.25);
      this.renderer.setPixelRatio(this.pixelRatio);
      this.resize();
    }
  }
  paths(visible) {
    this.reference.visible = visible;
    this.actual.visible = visible;
    this.prediction.visible = visible;
  }
  reset() {
    this.initialized = false;
    this.actual.geometry.setDrawRange(0, 0);
    this.prediction.geometry.setDrawRange(0, 0);
  }
  render(runner, ghost) {
    const s = runner.sim.state;
    this.drone.position.fromArray(s.p);
    this.q.set(s.q[1], s.q[2], s.q[3], s.q[0]);
    this.drone.quaternion.copy(this.q);
    if (this.cameraMode === "FPV") {
      this.offset.set(0.06, 0, 0.02).applyQuaternion(this.q);
      this.camera.position.copy(this.drone.position).add(this.offset);
      this.forward.set(1, 0, 0).applyQuaternion(this.q);
      this.camera.up.set(0, 0, 1).applyQuaternion(this.q);
      this.camera.lookAt(this.cameraTarget.copy(this.camera.position).add(this.forward));
    } else {
      this.camera.up.set(0, 0, 1);
      const yaw = runner.ref.yaw || 0;
      this.offset.set(-2.3 * Math.cos(yaw) + 0.75 * Math.sin(yaw), -2.3 * Math.sin(yaw) - 0.75 * Math.cos(yaw), 1.1).add(this.drone.position);
      if (!this.initialized) this.camera.position.copy(this.offset);
      else this.camera.position.lerp(this.offset, 0.12);
      this.cameraTarget.copy(this.drone.position).add(new THREE.Vector3(1.5 * Math.cos(yaw), 1.5 * Math.sin(yaw), 0.1));
      this.camera.lookAt(this.cameraTarget);
      this.initialized = true;
    }
    this.gateMeshes.forEach(({ material, ring }, i) => {
      material.color.setHex(i < runner.race.gate ? 0x36524b : i === runner.race.gate ? 0xb5f19b : 0x638c7d);
      ring.material.color.setHex(i === runner.race.gate ? 0xb5f19b : 0x638c7d);
    });
    let attribute = this.actual.geometry.attributes.position;
    runner.actual.forEach((p, i) => attribute.setXYZ(i, ...p));
    attribute.needsUpdate = true;
    this.actual.geometry.setDrawRange(0, runner.actual.length);
    attribute = this.prediction.geometry.attributes.position;
    const positions = runner.mpc.positions;
    for (let i = 0; i < positions.length / 3; i++) attribute.setXYZ(i, positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]);
    attribute.needsUpdate = true;
    this.prediction.geometry.setDrawRange(0, runner.mode === "AUTOPILOT" ? positions.length / 3 : 0);
    this.ghost.visible = runner.mode === "RACE AI";
    if (this.ghost.visible && ghost) {
      const time = Math.min(runner.time, ghost.samples.at(-1)[0]),
        index = Math.max(0, Math.min(ghost.samples.length - 2, Math.floor(time / ghost.dt) - 1)),
        a = ghost.samples[index],
        b = ghost.samples[index + 1],
        u = Math.max(0, Math.min(1, (time - a[0]) / (b[0] - a[0])));
      this.ghost.position.set(a[1] + u * (b[1] - a[1]), a[2] + u * (b[2] - a[2]), a[3] + u * (b[3] - a[3]));
      this.ghost.quaternion.set(a[5], a[6], a[7], a[4]);
      this.ghostQ.set(b[5], b[6], b[7], b[4]);
      this.ghost.quaternion.slerp(this.ghostQ, u);
    }
    this.renderer.render(this.scene, this.camera);
  }
}
