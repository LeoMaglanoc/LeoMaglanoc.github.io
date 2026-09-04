import { G1_POLICY_CONFIG as C } from "./config.js";

const KEY_COMMANDS = {
  KeyW: [1, 0, 0],
  KeyS: [-1, 0, 0],
  KeyA: [0, 1, 0],
  KeyD: [0, -1, 0],
  ArrowUp: [1, 0, 0],
  ArrowDown: [-1, 0, 0],
  ArrowLeft: [0, 1, 0],
  ArrowRight: [0, -1, 0],
  KeyQ: [0, 0, 1],
  KeyE: [0, 0, -1]
};

export class CommandManager {
  constructor(onChange) {
    this.onChange = onChange;
    this.keys = new Set();
    this.virtualKeys = new Set();
    this.current = Float32Array.from(C.commandInitial);
    this.target = Float32Array.from(C.commandInitial);
    this.manualMode = false;
    this.rate = [2, 2, 3];
    this.bindKeyboard();
  }

  bindKeyboard() {
    window.addEventListener("keydown", (event) => {
      if (!KEY_COMMANDS[event.code]) return;
      event.preventDefault();
      this.manualMode = true;
      this.keys.add(event.code);
    });
    window.addEventListener("keyup", (event) => {
      if (!KEY_COMMANDS[event.code]) return;
      event.preventDefault();
      this.keys.delete(event.code);
    });
    window.addEventListener("blur", () => {
      this.keys.clear();
      this.virtualKeys.clear();
    });
  }

  bindButton(button, code) {
    const press = (event) => {
      event.preventDefault();
      this.manualMode = true;
      this.virtualKeys.add(code);
      button.classList.add("is-active");
    };
    const release = (event) => {
      event.preventDefault();
      this.virtualKeys.delete(code);
      button.classList.remove("is-active");
    };
    button.addEventListener("pointerdown", press);
    ["pointerup", "pointercancel", "pointerleave"].forEach((name) => button.addEventListener(name, release));
  }

  reset() {
    this.keys.clear();
    this.virtualKeys.clear();
    this.manualMode = false;
    this.current.set(C.commandInitial);
    this.target.set(C.commandInitial);
    this.onChange?.(this.current);
  }

  getTarget() {
    if (!this.manualMode) return C.commandInitial;
    const command = [0, 0, 0];
    for (const code of [...this.keys, ...this.virtualKeys]) {
      const direction = KEY_COMMANDS[code];
      if (!direction) continue;
      command[0] += direction[0];
      command[1] += direction[1];
      command[2] += direction[2];
    }
    return [
      command[0] * C.commandLimits.vx,
      command[1] * C.commandLimits.vy,
      command[2] * C.commandLimits.yaw
    ];
  }

  update(dt) {
    const nextTarget = this.getTarget();
    for (let i = 0; i < 3; i += 1) {
      this.target[i] = nextTarget[i];
      const delta = this.target[i] - this.current[i];
      const maxDelta = this.rate[i] * dt;
      this.current[i] += Math.max(-maxDelta, Math.min(maxDelta, delta));
    }
    this.onChange?.(this.current);
    return this.current;
  }
}
