import { LASER, LASER_COVERS, rayBox, type Cover, type Point } from './laser';
import { approachHorizontal } from './movement';
import type { Input, Player } from './protocol';

type Pose = Point & { vx: number; vz: number };
type Command = { sequence: number; axes: [number, number]; dt: number };

/** Sweep a conservative square capsule footprint through the SAME arena AABBs.
 * Tiny substeps plus swept segments prevent tunnelling even on dropped frames.
 * Axis sliding is deliberately conservative at corners; Ammo remains authority. */
export function clipArena(from: Point, wanted: Point, covers: Cover[] = LASER_COVERS): Point {
    const out = { ...from };
    for (const axis of ['x', 'z'] as const) {
        const delta = wanted[axis] - out[axis];
        if (Math.abs(delta) < 1e-9) continue;
        const direction = { x: 0, y: 0, z: 0 };
        direction[axis] = Math.sign(delta);
        let distance = Math.abs(delta);
        for (const cover of covers) {
            if (cover.max.y < from.y - LASER.height / 2 + 0.05 || cover.min.y > from.y + LASER.height / 2) continue;
            const radius = LASER.radius + 0.015;
            const expanded = {
                min: { x: cover.min.x - radius, y: -100, z: cover.min.z - radius },
                max: { x: cover.max.x + radius, y: 100, z: cover.max.z + radius }
            };
            // At a rounded Ammo corner authority can lie inside our conservative
            // square. Allow escaping, but never predict deeper into that box.
            const inside =
                out.x > expanded.min.x && out.x < expanded.max.x && out.z > expanded.min.z && out.z < expanded.max.z;
            if (inside) {
                const midpoint = (expanded.min[axis] + expanded.max[axis]) / 2;
                if ((out[axis] - midpoint) * delta <= 0) distance = 0;
                continue;
            }
            const hit = rayBox(out, direction, expanded, distance);
            if (hit !== null) distance = Math.max(0, hit - 0.001);
        }
        out[axis] += direction[axis] * distance;
    }
    return out;
}

function step(p: Pose, command: Command): Pose {
    let out = { ...p };
    let remaining = Math.min(0.05, Math.max(0, command.dt));
    while (remaining > 1e-8) {
        const dt = Math.min(1 / 60, remaining);
        const [vx, vz] = approachHorizontal(
            out.vx,
            out.vz,
            ...command.axes,
            LASER.speed,
            Math.hypot(...command.axes) < 0.01 ? 42 : 48,
            dt
        );
        const next = clipArena(out, { ...out, x: out.x + vx * dt, z: out.z + vz * dt });
        out = { ...next, vx: Math.abs(next.x - out.x) < 1e-7 ? 0 : vx, vz: Math.abs(next.z - out.z) < 1e-7 ? 0 : vz };
        remaining -= dt;
    }
    return out;
}

/** Local visual movement only. Host snapshots acknowledge consumed input sequences.
 * Replay is bounded to 150ms; snapshots older than 600ms disable prediction. */
export class LaserPrediction {
    private pose?: Pose;
    private visible?: Point;
    private tick = -1;
    private epoch = '';
    private pending: Command[] = [];
    snapshots = 0;
    corrections = 0;
    maxCorrection = 0;
    reset() {
        this.pose = this.visible = undefined;
        this.pending = [];
        this.tick = -1;
        this.epoch = '';
    }
    sample(p: Player, tick: number, input: Input, dt: number, snapshotAge: number): Point {
        const epoch = `${input.modeId}:${input.roundId}:${p.respawns}:${p.respawnAt}`;
        if (this.epoch !== epoch || !this.pose || snapshotAge >= 600) {
            this.reset();
            this.epoch = epoch;
            this.pose = { ...p };
            this.visible = { ...p };
        }
        if (tick !== this.tick) {
            this.snapshots++;
            this.tick = tick;
            this.pending = this.pending.filter((c) => c.sequence > p.inputSequence);
            let total = 0;
            this.pending = this.pending.filter((c) => {
                total += c.dt;
                return total <= 0.15;
            });
            let replay: Pose = { ...p };
            for (const c of this.pending) replay = step(replay, c);
            const error = Math.hypot(replay.x - this.pose!.x, replay.z - this.pose!.z);
            if (error > 0.03) {
                this.corrections++;
                this.maxCorrection = Math.max(this.maxCorrection, error);
            }
            this.pose = replay;
            if (error > 1.2) this.visible = { ...p };
        }
        if (snapshotAge < 600 && !p.respawnAt) {
            const command: Command = { sequence: input.sequence, axes: input.axes, dt: Math.min(dt, 0.05) };
            this.pending.push(command);
            let duration = this.pending.reduce((sum, c) => sum + c.dt, 0);
            while (duration > 0.15 && this.pending.length) duration -= this.pending.shift()!.dt;
            // Once the connection stops acknowledging inputs, hold the horizon.
            if (snapshotAge < 150) this.pose = step(this.pose!, command);
        }
        const alpha = 1 - Math.exp(-Math.max(0, dt) * 35);
        const desired = {
            x: this.visible!.x + (this.pose!.x - this.visible!.x) * alpha,
            y: p.y,
            z: this.visible!.z + (this.pose!.z - this.visible!.z) * alpha
        };
        this.visible = clipArena(this.visible!, desired);
        this.visible.y = p.y;
        return this.visible;
    }
}
