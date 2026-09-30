import { clamp } from "./math.js";
// Assisted velocity flight: smooth throttle + coordinated turn acceleration.
export class Pilot {
  reset(position, yaw) {
    this.target = [...position];
    this.yaw = yaw;
    this.speed = 0;
    this.strafe = 0;
    this.climb = 0;
    this.yawRate = 0;
    this.velocity = [0, 0, 0];
  }
  update(state, input, dt, out) {
    const ease = 1 - Math.exp(-dt / 0.28),
      turnEase = 1 - Math.exp(-dt / 0.18);
    this.speed += ease * ((input.forward || 0) * ((input.forward || 0) < 0 ? 3 : 5) - this.speed);
    this.strafe += ease * ((input.strafe || 0) * 2.5 - this.strafe);
    this.climb += ease * ((input.vertical || 0) * 1.8 - this.climb);
    const yawCommand = clamp((input.turn || 0) * 1.3 + (input.yaw || 0) * 1.6, -1.6, 1.6);
    this.yawRate += turnEase * (yawCommand - this.yawRate);
    this.yaw += this.yawRate * dt;
    const c = Math.cos(this.yaw),
      s = Math.sin(this.yaw);
    const velocity = [c * this.speed - s * this.strafe, s * this.speed + c * this.strafe, this.climb];
    for (let i = 0; i < 3; i++) {
      this.target[i] = clamp(this.target[i] + velocity[i] * dt, state.p[i] - 0.6, state.p[i] + 0.6);
      if (i === 2) this.target[i] = clamp(this.target[i], 0.3, 5);
      out.p[i] = this.target[i];
      out.v[i] = velocity[i];
      out.a[i] = (velocity[i] - this.velocity[i]) / dt;
      this.velocity[i] = velocity[i];
    }
    out.yaw = this.yaw;
    return out;
  }
}
