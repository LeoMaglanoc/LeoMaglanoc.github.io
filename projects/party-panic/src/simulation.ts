import { Vec3, type Entity } from 'playcanvas';
import { COLORS, neutral, type Input, type Player, type Snapshot } from './protocol';
import { COURSE, boundedProgress, canTransition, checkpoint, finish, resetPlayer } from './rules';
import { Scene, type Obstacle } from './scene';
import { approachHorizontal, RACE_MOVEMENT } from './movement';
export type Motion = {
    input: Input;
    received: number;
    jumpSeen: number;
    buffer: number;
    groundedAt: number;
    lastJump: number;
    grace: number;
    hitAt: number;
};
export class Simulation {
    scene: Scene;
    state: Snapshot = {
        type: 'snapshot',
        mode: 'obstacle-dash',
        sequence: 0,
        tick: 0,
        phase: 'lobby',
        elapsed: 0,
        countdown: 3,
        paused: false,
        players: [],
        round: 0
    };
    motions = new Map<string, Motion>();
    accumulator = 0;
    onEvent: (type: string, payload: unknown) => void = () => {};
    constructor(scene: Scene) {
        this.scene = scene;
        scene.onTrigger = (id, index) => this.trigger(id, index);
        scene.onHit = (id, o) => this.hit(id, o);
    }
    add(id: string, name: string) {
        const p: Player = {
            id,
            name,
            color: COLORS.find((c) => !this.state.players.some((p) => p.color === c)) ?? COLORS[0],
            connected: true,
            ready: false,
            checkpoint: 0,
            progress: 0,
            finish: null,
            x: 0,
            y: 1.2,
            z: 3,
            vx: 0,
            vy: 0,
            vz: 0,
            yaw: 0,
            respawns: 0
        };
        resetPlayer(p, this.state.players.length);
        this.state.players.push(p);
        this.scene.addPlayer(p, true);
        this.motion(id);
        return p;
    }
    motion(id: string) {
        const m: Motion = {
            input: neutral(),
            received: performance.now(),
            jumpSeen: 0,
            buffer: -1,
            groundedAt: -100,
            lastJump: -100,
            grace: 1,
            hitAt: -100
        };
        this.motions.set(id, m);
        return m;
    }
    input(id: string, i: Input) {
        const m = this.motions.get(id);
        if (m && i.sequence > m.input.sequence) {
            m.input = i;
            m.received = performance.now();
        }
    }
    transition(phase: Snapshot['phase']) {
        if (!canTransition(this.state.phase, phase)) return;
        this.state.phase = phase;
        this.onEvent('phase', { phase });
    }
    ready(id: string, roundId: number) {
        const p = this.state.players.find((p) => p.id === id && p.connected);
        if (!p || this.state.phase !== 'lobby' || roundId !== this.state.round) return false;
        p.ready = true;
        return true;
    }
    start() {
        if (
            this.state.phase !== 'lobby' ||
            !this.state.players.length ||
            this.state.players.some((p) => p.connected && !p.ready)
        )
            return;
        this.state.round++;
        this.state.elapsed = 0;
        this.state.countdown = 3;
        this.state.players.forEach((p, i) => {
            resetPlayer(p, i);
            this.motion(p.id);
            this.teleport(p);
        });
        this.transition('countdown');
    }
    rematch() {
        if (this.state.phase !== 'results') return;
        for (const p of [...this.state.players]) if (!p.connected) this.remove(p.id);
        this.state.players.forEach((p, i) => {
            resetPlayer(p, i);
            this.motion(p.id);
            this.teleport(p);
        });
        this.state.elapsed = 0;
        this.state.countdown = 3;
        this.transition('lobby');
    }
    remove(id: string) {
        this.state.players = this.state.players.filter((p) => p.id !== id);
        this.motions.delete(id);
        this.scene.removePlayer(id);
    }
    disconnect(id: string) {
        const p = this.state.players.find((p) => p.id === id);
        if (!p) return;
        if (this.state.phase === 'lobby') this.remove(id);
        else {
            p.connected = false;
            this.motions.get(id)!.input = neutral();
            this.scene.characters.get(id)!.enabled = false;
            this.onEvent('disconnect', { id });
        }
    }
    pause(value: boolean) {
        this.state.paused = value;
        this.accumulator = 0;
        for (const m of this.motions.values()) m.input = { ...m.input, axes: [0, 0] };
        this.onEvent('pause', { paused: value });
    }
    teleport(p: Player) {
        const body = this.scene.characters.get(p.id)!.rigidbody!;
        body.teleport(p.x, p.y, p.z);
        body.linearVelocity = Vec3.ZERO;
        body.angularVelocity = Vec3.ZERO;
    }
    respawn(p: Player) {
        p.x = 0;
        p.y = 1.3;
        p.z = COURSE.spawnZ[p.checkpoint];
        p.vx = p.vy = p.vz = 0;
        p.respawns++;
        this.teleport(p);
        const m = this.motions.get(p.id)!;
        m.grace = 1;
        m.buffer = -1;
        m.groundedAt = -100;
        this.onEvent('respawn', { id: p.id, checkpoint: p.checkpoint });
    }
    trigger(id: string, index: number) {
        const p = this.state.players.find((p) => p.id === id);
        if (!p || this.state.phase !== 'racing') return;
        if (index < 3) {
            if (checkpoint(p, index)) this.onEvent('checkpoint', { id, index });
        } else if (finish(p, this.state.elapsed)) this.onEvent('finish', { id, time: p.finish });
    }
    hit(id: string, o: Obstacle) {
        const p = this.state.players.find((p) => p.id === id),
            m = this.motions.get(id);
        if (!p || !m || m.grace > 0 || this.state.phase !== 'racing' || this.state.elapsed - m.hitAt < 0.6) return;
        m.hitAt = this.state.elapsed;
        const body = this.scene.characters.get(id)!.rigidbody!;
        const sign =
            o.kind === 'bumper' ? Math.sign(Math.cos(this.state.elapsed * 1.7 + o.phase)) : Math.sign(p.z - o.z) || 1;
        body.applyImpulse(sign * 4.8, 2.5, o.kind === 'sweeper' ? 1 : 0);
        this.onEvent('hit', { id });
    }
    update(dt: number) {
        if (this.state.paused) return;
        const lost = Math.max(0, dt - 0.1);
        if (this.state.phase === 'racing') this.state.elapsed += lost;
        else if (this.state.phase === 'countdown') this.state.countdown -= lost;
        this.accumulator = Math.min(this.accumulator + dt, 0.1);
        while (this.accumulator >= 1 / 60) {
            this.step(1 / 60);
            this.accumulator -= 1 / 60;
        }
    }
    step(dt: number) {
        const s = this.state;
        s.tick++;
        if (s.phase === 'countdown') {
            s.countdown = Math.max(0, s.countdown - dt);
            if (s.countdown <= 0) {
                this.transition('racing');
                for (const m of this.motions.values()) {
                    m.jumpSeen = m.input.jumpSequence;
                    m.buffer = -1;
                }
            }
        }
        if (s.phase === 'racing') {
            s.elapsed += dt;
            if (s.elapsed >= COURSE.timeout) {
                s.elapsed = COURSE.timeout;
                this.transition('results');
            }
        }
        this.scene.obstaclesAt(s.elapsed);
        for (const p of s.players) {
            if (!p.connected) continue;
            const e = this.scene.characters.get(p.id)!,
                m = this.motions.get(p.id)!;
            m.grace = Math.max(0, m.grace - dt);
            if (s.phase !== 'racing' || p.finish !== null) {
                e.rigidbody!.linearVelocity = Vec3.ZERO;
                continue;
            }
            this.move(e, m, dt);
        }
        if (s.phase === 'racing') this.scene.physics.step(dt);
        for (const p of s.players) {
            if (!p.connected) continue;
            const e = this.scene.characters.get(p.id)!,
                pos = e.getPosition(),
                v = e.rigidbody!.linearVelocity;
            p.x = pos.x;
            p.y = pos.y;
            p.z = pos.z;
            p.vx = v.x;
            p.vy = v.y;
            p.vz = v.z;
            if (s.phase === 'racing' && p.finish === null) {
                if (p.y < -5 || Math.abs(p.x) > 12 || p.z > 14) this.respawn(p);
                p.progress = Math.max(p.progress, boundedProgress(p));
            }
            if (Math.hypot(v.x, v.z) > 0.15) p.yaw = (Math.atan2(-v.x, -v.z) * 180) / Math.PI;
            this.scene.face(p.id, p.yaw);
        }
        if (
            s.phase === 'racing' &&
            (s.elapsed >= COURSE.timeout || s.players.every((p) => p.finish !== null || !p.connected))
        )
            this.transition('results');
    }
    move(e: Entity, m: Motion, dt: number) {
        const body = e.rigidbody!,
            pos = e.getPosition(),
            v = body.linearVelocity;
        const time = this.state.elapsed;
        let grounded = false;
        if (v.y <= 0.5)
            for (const [x, z] of [
                [0, 0],
                [0.24, 0],
                [-0.24, 0],
                [0, 0.24],
                [0, -0.24]
            ]) {
                const hit = this.scene.physics.raycastFirst(
                    new Vec3(pos.x + x, pos.y - 0.3, pos.z + z),
                    new Vec3(pos.x + x, pos.y - 0.86, pos.z + z),
                    { filterCallback: (other: Entity) => other !== e && !!other.rigidbody }
                );
                if (hit && hit.normal.y > 0.55) {
                    grounded = true;
                    break;
                }
            }
        if (grounded) m.groundedAt = time;
        if (m.input.jumpSequence > m.jumpSeen) {
            m.jumpSeen = m.input.jumpSequence;
            m.buffer = time;
        }
        const fresh = performance.now() - m.received < 400;
        const axes = fresh ? m.input.axes : [0, 0];
        const accel = grounded
            ? Math.hypot(...axes) < 0.01
                ? RACE_MOVEMENT.groundBraking
                : RACE_MOVEMENT.groundAcceleration
            : RACE_MOVEMENT.airAcceleration;
        // Preserve a brief authoritative sideways impulse instead of braking it away immediately.
        const [vx, vz] = approachHorizontal(
            v.x,
            v.z,
            axes[0],
            axes[1],
            RACE_MOVEMENT.speed,
            time - m.hitAt > 0.25 ? accel : RACE_MOVEMENT.hitRecoveryAcceleration,
            dt
        );
        let vy = v.y;
        if (
            time - m.buffer <= RACE_MOVEMENT.jumpBuffer &&
            time - m.groundedAt <= RACE_MOVEMENT.coyoteTime &&
            time - m.lastJump > 0.18
        ) {
            vy = RACE_MOVEMENT.jumpVelocity;
            m.buffer = -100;
            m.groundedAt = -100;
            m.lastJump = time;
            this.onEvent('jump', { id: e.name });
        }
        body.linearVelocity = new Vec3(
            Math.max(-8, Math.min(8, vx)),
            Math.max(-25, Math.min(12, vy)),
            Math.max(-8, Math.min(8, vz))
        );
    }
}
