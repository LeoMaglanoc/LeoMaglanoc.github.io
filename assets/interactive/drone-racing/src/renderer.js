import { VEHICLE } from "./vehicle-config.js";
import * as THREE from "../vendor/three.module.js";
export class FlightRenderer {
  constructor(canvas, course, trajectory) {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color("#10191c");
    this.scene.fog = new THREE.Fog("#10191c", 22, 55);
    this.camera = new THREE.PerspectiveCamera(55, 1, 0.025, 100);
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
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(32, 26), new THREE.MeshStandardMaterial({ color: 0x17262a, roughness: 1 }));
    ground.position.set(0, 0, -0.01);
    this.scene.add(ground);
    // Compact track paint, nearby pylons and perimeter barriers give parallax.
    const paint = new THREE.MeshBasicMaterial({ color: 0xc6c6af, transparent: true, opacity: 0.22 });
    for (let t = 0; t < trajectory.duration; t += 0.14) {
      const ref = trajectory.sample(t),
        mark = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.045), paint);
      mark.position.set(ref.p[0], ref.p[1], 0.006);
      mark.rotation.z = ref.yaw;
      this.scene.add(mark);
    }
    const barrierMat = new THREE.MeshStandardMaterial({ color: 0x697574, roughness: 0.95 });
    for (const y of [-8, 8]) {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(25, 0.16, 0.42), barrierMat);
      wall.position.set(0, y, 0.21);
      this.scene.add(wall);
    }
    for (const x of [-12, 12]) {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(0.16, 16, 0.42), barrierMat);
      wall.position.set(x, 0, 0.21);
      this.scene.add(wall);
    }
    const coneGeometry = new THREE.ConeGeometry(0.13, 0.42, 8),
      coneMaterial = new THREE.MeshStandardMaterial({ color: 0xc7794c });
    for (let t = 0; t < trajectory.duration; t += 0.65) {
      const ref = trajectory.sample(t),
        cone = new THREE.Mesh(coneGeometry, coneMaterial);
      cone.rotation.x = Math.PI / 2;
      cone.position.set(ref.p[0] - 0.9 * Math.sin(ref.yaw), ref.p[1] + 0.9 * Math.cos(ref.yaw), 0.21);
      this.scene.add(cone);
    }
    const start = course.gates[0];
    for (let i = 0; i < 12; i++) {
      const tile = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.24), new THREE.MeshBasicMaterial({ color: i % 2 ? 0xd8ddce : 0x253435 }));
      tile.position.set(
        start.position[0] - 0.3 * Math.cos(start.yaw) - (i - 5.5) * 0.24 * Math.sin(start.yaw),
        start.position[1] - 0.3 * Math.sin(start.yaw) + (i - 5.5) * 0.24 * Math.cos(start.yaw),
        0.008
      );
      tile.rotation.z = start.yaw;
      this.scene.add(tile);
    }
    this.gateMeshes = [];
    course.gates.forEach((gate, i) => {
      const group = new THREE.Group();
      group.position.fromArray(gate.position);
      group.rotation.set(0, gate.pitch || 0, gate.yaw, "ZYX");
      const w = gate.width,
        h = gate.height,
        f = course.frame;
      const material = new THREE.MeshStandardMaterial({ color: 0x638c7d, emissive: 0x355146, emissiveIntensity: 0.25, roughness: 0.5 });
      const bar = (size, pos) => {
        const mesh = new THREE.Mesh(new THREE.CylinderGeometry(f, f, Math.max(...size), 8), material);
        mesh.position.fromArray(pos);
        if (size[2] > size[1]) mesh.rotation.x = Math.PI / 2;
        group.add(mesh);
      };
      bar([2 * f, 2 * f, h + 4 * f], [0, -w / 2 - f, 0]);
      bar([2 * f, 2 * f, h + 4 * f], [0, w / 2 + f, 0]);
      bar([2 * f, w, 2 * f], [0, 0, h / 2 + f]);
      bar([2 * f, w, 2 * f], [0, 0, -h / 2 - f]);
      // Supports remain below the opening; collision posts are kept simple.
      const supportMaterial = new THREE.MeshStandardMaterial({ color: 0x526364, roughness: 0.9 });
      for (const side of [-1, 1]) {
        const length = Math.max(0.1, gate.position[2] - h / 2);
        const support = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.06, length, 6), supportMaterial);
        support.rotation.x = Math.PI / 2;
        support.position.set(0, side * (w / 2 + f), -h / 2 - length / 2);
        group.add(support);
      }
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
    this.shadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.2, 24),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.22, depthWrite: false })
    );
    this.shadow.position.z = 0.012;
    this.scene.add(this.shadow);
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
    this.follow = new THREE.Vector3(1, 0, 0);
    this.lastRenderTime = null;
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
    const group = new THREE.Group(),
      v = VEHICLE.visual;
    const material = (c, metalness = 0.3) =>
      new THREE.MeshStandardMaterial({ color: c, metalness, roughness: 0.48, transparent: ghost, opacity: ghost ? 0.32 : 1 });
    const carbon = material(0x1b2228),
      aluminum = material(0x889293, 0.8),
      accent = material(color),
      battery = material(0x333b46);
    const box = (dims, pos, mat) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(...dims), mat);
      m.position.fromArray(pos);
      group.add(m);
      return m;
    };
    box([v.bodyLength, v.bodyWidth, 0.006], [0, 0, 0], carbon);
    box([0.075, 0.04, 0.006], [-0.005, 0, 0.034], carbon);
    box([0.065, 0.032, 0.026], [-0.008, 0, 0.05], battery);
    box([0.012, 0.034, 0.029], [-0.012, 0, 0.05], accent); // battery strap
    box([0.032, 0.032, 0.02], [0, 0, 0.019], aluminum); // electronics stack
    box([0.021, 0.025, 0.023], [0.046, 0, 0.02], accent);
    const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.014, 12), material(0x10141a, 0.6));
    lens.rotation.z = -Math.PI / 2;
    lens.position.set(0.061, 0, 0.022);
    group.add(lens);
    box([0.006, 0.025, 0.006], [0.056, 0, 0.003], material(0xe3e9d1));
    const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.0015, 0.0015, 0.07, 5), aluminum);
    antenna.rotation.x = Math.PI / 2;
    antenna.rotation.y = -0.25;
    antenna.position.set(-0.048, 0, 0.06);
    group.add(antenna);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.007, 8, 6), accent);
    tip.position.set(-0.057, 0, 0.094);
    group.add(tip);
    group.userData.rotors = [];
    VEHICLE.motorPositions.forEach(([x, y], i) => {
      const arm = box([Math.hypot(x, y), 0.013, 0.008], [x / 2, y / 2, 0], carbon);
      arm.rotation.z = Math.atan2(y, x);
      const motor = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.013, 0.019, 12), aluminum);
      motor.rotation.x = Math.PI / 2;
      motor.position.set(x, y, 0.008);
      group.add(motor);
      const bell = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.009, 12), i < 2 ? accent : carbon);
      bell.rotation.x = Math.PI / 2;
      bell.position.set(x, y, 0.019);
      group.add(bell);
      const rotor = new THREE.Group();
      rotor.position.set(x, y, 0.026);
      group.add(rotor);
      const blades = new THREE.Group();
      rotor.add(blades);
      for (let j = 0; j < 3; j++) {
        const blade = new THREE.Mesh(new THREE.BoxGeometry(v.propRadius, 0.008, 0.001), accent);
        blade.rotation.z = (j * 2 * Math.PI) / 3;
        blade.position.set((Math.cos(blade.rotation.z) * v.propRadius) / 2, (Math.sin(blade.rotation.z) * v.propRadius) / 2, 0);
        blades.add(blade);
      }
      const disc = new THREE.Mesh(
        new THREE.CircleGeometry(v.propRadius, 24),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false })
      );
      rotor.add(disc);
      group.userData.rotors.push({ blades, disc });
    });
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
    const now = performance.now(),
      dt = Math.min(0.1, this.lastRenderTime === null ? 1 / 60 : (now - this.lastRenderTime) / 1000);
    this.lastRenderTime = now;
    const s = runner.sim.state;
    this.drone.userData.rotors.forEach(({ blades, disc }, i) => {
      const speed = runner.sim.motorSpeeds[i];
      blades.rotation.z = (blades.rotation.z + speed * dt * VEHICLE.rotorDirections[i]) % (2 * Math.PI);
      blades.visible = speed < 180;
      disc.visible = speed >= 180;
      disc.material.opacity = Math.min(0.2, speed / 5000 + 0.06);
    });
    this.shadow.position.set(s.p[0], s.p[1], 0.012);
    this.shadow.scale.setScalar(1 + s.p[2] * 0.25);
    this.shadow.material.opacity = 0.25 / (1 + s.p[2] * 0.4);
    this.drone.position.fromArray(s.p);
    this.q.set(s.q[1], s.q[2], s.q[3], s.q[0]);
    this.drone.quaternion.copy(this.q);
    if (this.cameraMode === "FPV") {
      this.offset.set(0.085, 0, 0.024).applyQuaternion(this.q);
      this.camera.position.copy(this.drone.position).add(this.offset);
      this.forward.set(1, 0, 0).applyQuaternion(this.q);
      this.camera.up.set(0, 0, 1).applyQuaternion(this.q);
      this.camera.lookAt(this.cameraTarget.copy(this.camera.position).add(this.forward));
    } else {
      this.camera.up.set(0, 0, 1);
      if (Math.hypot(s.v[0], s.v[1]) > 0.5) this.forward.set(s.v[0], s.v[1], 0).normalize();
      else {
        this.forward.set(1, 0, 0).applyQuaternion(this.q);
        this.forward.z = 0;
        this.forward.normalize();
      }
      if (!this.initialized) this.follow.copy(this.forward);
      else this.follow.lerp(this.forward, 1 - Math.exp(-dt * 5)).normalize();
      this.offset.copy(this.follow).multiplyScalar(-1.05);
      this.offset.z = 0.38;
      this.offset.add(this.drone.position);
      if (!this.initialized) this.camera.position.copy(this.offset);
      else this.camera.position.lerp(this.offset, 1 - Math.exp(-dt * 12));
      this.cameraTarget.copy(this.drone.position).addScaledVector(this.follow, 0.32);
      this.cameraTarget.z += this.camera.aspect < 0.8 ? -0.28 : 0.04;
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
      const time = ((runner.time % ghost.duration) + ghost.duration) % ghost.duration;
      const samples = ghost.samples;
      let lo = 0,
        hi = samples.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (samples[mid][0] <= time) lo = mid + 1;
        else hi = mid;
      }
      const a = samples[(lo - 1 + samples.length) % samples.length],
        b = samples[lo % samples.length];
      const ta = lo === 0 ? a[0] - ghost.duration : a[0],
        tb = lo === samples.length ? b[0] + ghost.duration : b[0];
      const u = Math.max(0, Math.min(1, (time - ta) / (tb - ta)));
      this.ghost.position.set(a[1] + u * (b[1] - a[1]), a[2] + u * (b[2] - a[2]), a[3] + u * (b[3] - a[3]));
      this.ghost.quaternion.set(a[5], a[6], a[7], a[4]);
      this.ghostQ.set(b[5], b[6], b[7], b[4]);
      this.ghost.quaternion.slerp(this.ghostQ, u);
    }
    this.renderer.render(this.scene, this.camera);
  }
}
