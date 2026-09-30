import { gateIntersection } from "./course.js";
export class Race {
  constructor(course) {
    this.course = course;
    this.reset();
  }
  reset() {
    this.gate = 0;
    this.lap = 1;
    this.time = 0;
    this.previousTime = 0;
    this.lapStart = null;
    this.lastLapTime = null;
    this.bestLapTime = null;
    this.collisions = 0;
    this.collisionsThisLap = 0;
    this.touching = false;
    this.previous = [...this.course.spawn.position];
    this.crossings = [];
    this.laps = [];
  }
  get currentLapTime() {
    return this.lapStart === null ? 0 : this.time - this.lapStart;
  }
  get finishTime() {
    return this.lastLapTime;
  }
  update(p, time, contact = false) {
    this.time = time;
    if (contact && !this.touching) {
      this.collisions++;
      this.collisionsThisLap++;
    }
    this.touching = contact;
    const u = gateIntersection(this.previous, p, this.course.gates[this.gate]);
    if (u !== null) {
      const crossing = this.previousTime + u * (time - this.previousTime);
      this.crossings.push(crossing);
      if (this.crossings.length > this.course.gates.length + 1) this.crossings.shift();
      if (this.gate === 0) {
        if (this.lapStart !== null) {
          this.lastLapTime = crossing - this.lapStart;
          this.bestLapTime = Math.min(this.bestLapTime ?? Infinity, this.lastLapTime);
          this.laps.push({ lap: this.lap, time: this.lastLapTime, collisions: this.collisionsThisLap });
          if (this.laps.length > 100) this.laps.shift();
          this.lap++;
          this.collisionsThisLap = 0;
        }
        this.lapStart = crossing;
      }
      this.gate = (this.gate + 1) % this.course.gates.length;
    }
    this.previous.splice(0, 3, ...p);
    this.previousTime = time;
  }
}
