export class FlightInput {
  constructor() {
    this.keys = new Set();
    this.sticks = { left: [0, 0], right: [0, 0] };
    this.pointers = new Map();
    this.current = { forward: 0, strafe: 0, turn: 0, vertical: 0, yaw: 0 };
    const allowed = new Set(["KeyW", "KeyA", "KeyS", "KeyD", "KeyQ", "KeyE", "KeyR", "KeyF", "ArrowUp", "ArrowDown", "ShiftLeft", "ShiftRight"]);
    window.addEventListener("keydown", (e) => {
      if (allowed.has(e.code) && !["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName)) {
        e.preventDefault();
        this.keys.add(e.code);
      }
    });
    window.addEventListener("keyup", (e) => this.keys.delete(e.code));
    window.addEventListener("blur", () => this.reset());
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) this.reset();
    });
    for (const side of ["left", "right"]) {
      const el = document.getElementById(`${side}-stick`);
      const move = (e) => {
        if (this.pointers.get(side) !== e.pointerId) return;
        const r = el.getBoundingClientRect(),
          radius = r.width * 0.35;
        let x = (e.clientX - r.left - r.width / 2) / radius,
          y = -(e.clientY - r.top - r.height / 2) / radius;
        const n = Math.max(1, Math.hypot(x, y));
        x /= n;
        y /= n;
        this.sticks[side] = [x, y];
        el.querySelector("i").style.transform = `translate(${x * radius}px,${-y * radius}px)`;
      };
      const release = (e) => {
        if (this.pointers.get(side) !== e.pointerId) return;
        this.pointers.delete(side);
        this.sticks[side] = [0, 0];
        el.querySelector("i").style.transform = "";
      };
      el.addEventListener("pointerdown", (e) => {
        if (this.pointers.has(side)) return;
        this.pointers.set(side, e.pointerId);
        el.setPointerCapture(e.pointerId);
        move(e);
      });
      el.addEventListener("pointermove", move);
      for (const name of ["pointerup", "pointercancel", "lostpointercapture"]) el.addEventListener(name, release);
    }
  }
  reset() {
    this.keys.clear();
    this.sticks.left = [0, 0];
    this.sticks.right = [0, 0];
    this.pointers.clear();
    document.querySelectorAll(".stick i").forEach((el) => (el.style.transform = ""));
  }
  update() {
    const k = (code) => (this.keys.has(code) ? 1 : 0),
      clamp = (x) => Math.max(-1, Math.min(1, x)),
      axis = (x) => Math.sign(x) * Math.max(0, (Math.abs(x) - 0.08) / 0.92);
    this.current.forward = clamp(k("KeyW") - k("KeyS") + axis(this.sticks.right[1]));
    const shifted = this.keys.has("ShiftLeft") || this.keys.has("ShiftRight");
    const steering = k("KeyA") - k("KeyD");
    this.current.strafe = shifted ? steering : 0;
    this.current.turn = clamp((shifted ? 0 : steering) - axis(this.sticks.right[0]));
    this.current.yaw = clamp(k("KeyQ") - k("KeyE") - axis(this.sticks.left[0]));
    this.current.vertical = clamp(k("KeyR") + k("ArrowUp") - k("KeyF") - k("ArrowDown") + axis(this.sticks.left[1]));
    return this.current;
  }
}
