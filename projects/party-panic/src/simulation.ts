import { Vec3, type Entity } from 'playcanvas';
import { VERSION, COLORS, neutral, type Input, type Player, type Snapshot, type ModeId } from './protocol';
import { COURSE, boundedProgress, canTransition, checkpoint, finish, resetPlayer } from './rules';
import { Scene, type Obstacle } from './scene';
import { LASER } from './laser';
import { BotController } from './bots';
import { LaserRound } from './laserRound';
import { approachHorizontal, raceHorizontal, raceGravity, turnToward, RACE_MOVEMENT } from './movement';
export type Motion = {
    input: Input;
    received: number;
    jumpSeen: number;
    buffer: number;
    groundedAt: number;
    lastJump: number;
    grace: number;
    hitAt: number;
    diveSeen: number;
    diveUntil: number;
    diveReady: number;
};
export class Simulation {
    scene: Scene;
    laser = new LaserRound();
    bots = new BotController();
    state: Snapshot = {
        type: 'snapshot',
        version: VERSION,
        modeId: 'obstacle-dash',
        sequence: 0,
        tick: 0,
        phase: 'lobby',
        elapsed: 0,
        countdown: 3,
        paused: false,
        players: [],
        roundId: 0
    };
    motions = new Map<string, Motion>();
    accumulator = 0;
    onEvent: (type: string, payload: unknown) => void = () => {};
    constructor(scene: Scene) {
        this.scene = scene;
        this.laser.onEvent = (type, payload) => this.onEvent(type, payload);
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
            bot: false,
            score: 0,
            deaths: 0,
            respawnAt: 0,
            protectedUntil: 0,
            aimPitch: 0,
            health: 100,
            energy: 1,
            weapon: 'quick',
            charge: 0,
            inputSequence: 0,
            shotSequence: 0,
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
        this.preparePlayer(p, this.state.players.length);
        this.state.players.push(p);
        this.scene.addPlayer(p, true);
        this.motion(id);
        return p;
    }
    motion(id: string) {
        const m: Motion = {
            input: neutral(this.state.modeId, this.state.roundId),
            received: performance.now(),
            jumpSeen: 0,
            buffer: -1,
            groundedAt: -100,
            lastJump: -100,
            grace: 1,
            hitAt: -100,
            diveSeen: 0,
            diveUntil: -100,
            diveReady: -100
        };
        this.motions.set(id, m);
        return m;
    }
    input(id: string, i: Input) {
        const m = this.motions.get(id);
        if (
            m &&
            i.version === VERSION &&
            i.modeId === this.state.modeId &&
            i.roundId === this.state.roundId &&
            i.life === this.state.players.find((p) => p.id === id)?.respawns &&
            i.sequence > m.input.sequence
        ) {
            m.input = i;
            m.received = performance.now();
        }
    }
    transition(phase: Snapshot['phase']) {
        if (!canTransition(this.state.phase, phase)) return;
        this.state.phase = phase;
        this.onEvent('phase', { phase });
    }
    ready(id: string, roundId: number, modeId: ModeId = this.state.modeId) {
        const p = this.state.players.find((p) => p.id === id && p.connected);
        if (!p || this.state.phase !== 'lobby' || roundId !== this.state.roundId || modeId !== this.state.modeId)
            return false;
        p.ready = true;
        return true;
    }
    selectMode(modeId: ModeId) {
        if (this.state.phase !== 'lobby') return false;
        if (modeId === this.state.modeId) return true;
        this.laser.reset();
        this.bots.reset();
        this.state.modeId = modeId;
        this.state.roundId++;
        this.scene.setMode(modeId);
        this.state.players.forEach((p, i) => {
            this.scene.removePlayer(p.id);
            this.preparePlayer(p, i);
            this.scene.addPlayer(p, true);
            this.motion(p.id);
        });
        this.onEvent('mode', { modeId });
        return true;
    }
    preparePlayer(p: Player, index: number) {
        resetPlayer(p, index);
        p.ready = p.bot;
        if (this.state.modeId === 'laser-tag') this.laser.prepare(p, index);
    }
    start() {
        if (
            this.state.phase !== 'lobby' ||
            !this.state.players.length ||
            this.state.players.some((p) => p.connected && !p.bot && !p.ready)
        )
            return;
        this.state.roundId++;
        this.laser.reset();
        this.bots.reset();
        this.state.elapsed = 0;
        this.state.countdown = 3;
        this.state.players.forEach((p, i) => {
            this.preparePlayer(p, i);
            this.motion(p.id);
            this.teleport(p);
        });
        this.transition('countdown');
    }
    rematch() {
        if (this.state.phase !== 'results') return;
        this.laser.reset();
        this.bots.reset();
        this.state.roundId++;
        for (const p of [...this.state.players]) if (!p.connected) this.remove(p.id);
        this.state.players.forEach((p, i) => {
            this.preparePlayer(p, i);
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
        this.bots.remove(id);
        this.scene.removePlayer(id);
    }
    disconnect(id: string) {
        const p = this.state.players.find((p) => p.id === id);
        if (!p) return;
        if (this.state.phase === 'lobby') this.remove(id);
        else {
            p.connected = false;
            this.motions.get(id)!.input = neutral(this.state.modeId, this.state.roundId);
            this.scene.characters.get(id)!.enabled = false;
            this.onEvent('disconnect', { id });
        }
    }
    pause(value: boolean) {
        this.state.paused = value;
        this.accumulator = 0;
        for (const m of this.motions.values()) {
            m.input = { ...m.input, axes: [0, 0], jumpHeld: false };
            if (m.input.modeId === 'laser-tag') m.input.aim.fire = false;
            m.jumpSeen = m.input.jumpSequence;
            m.diveSeen = m.input.diveSequence;
            m.buffer = -100;
        }
        this.onEvent('pause', { paused: value });
    }
    teleport(p: Player) {
        const entity = this.scene.characters.get(p.id)!;
        entity.enabled = p.connected;
        const body = entity.rigidbody!;
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
        m.lastJump = m.hitAt = m.diveUntil = m.diveReady = -100;
        m.jumpSeen = m.input.jumpSequence;
        m.diveSeen = m.input.diveSequence;
        this.onEvent('respawn', { id: p.id, checkpoint: p.checkpoint });
    }
    trigger(id: string, index: number) {
        const p = this.state.players.find((p) => p.id === id);
        if (!p || this.state.modeId !== 'obstacle-dash' || this.state.phase !== 'racing') return;
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
        const v = body.linearVelocity;
        body.linearVelocity = new Vec3(
            v.x * 0.45 + sign * 4.8,
            Math.max(v.y, 2.5),
            v.z * 0.45 + (o.kind === 'sweeper' ? 1 : 0)
        );
        m.diveUntil = -100;
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
        const timeout = s.modeId === 'laser-tag' ? LASER.duration : COURSE.timeout;
        s.tick++;
        if (s.phase === 'countdown') {
            s.countdown = Math.max(0, s.countdown - dt);
            if (s.countdown <= 0) {
                this.transition('racing');
                for (const m of this.motions.values()) {
                    m.jumpSeen = m.input.jumpSequence;
                    m.diveSeen = m.input.diveSequence;
                    m.buffer = -1;
                }
            }
        }
        if (s.phase === 'racing') {
            s.elapsed += dt;
            if (s.elapsed >= timeout) {
                s.elapsed = timeout;
                this.transition('results');
            }
        }
        if (s.modeId === 'laser-tag' && s.phase === 'racing') this.laser.beforeStep(s, this.scene);
        this.scene.obstaclesAt(s.elapsed);
        if (s.phase === 'racing')
            for (const p of s.players) {
                if (p.bot && p.connected)
                    this.input(p.id, this.bots.update(p, s.players, s.modeId, s.roundId, s.elapsed, dt));
            }
        for (const p of s.players) {
            if (!p.connected) continue;
            const e = this.scene.characters.get(p.id)!,
                m = this.motions.get(p.id)!;
            m.grace = Math.max(0, m.grace - dt);
            if (s.phase !== 'racing' || p.finish !== null || p.respawnAt > 0) {
                e.rigidbody!.linearVelocity = Vec3.ZERO;
                continue;
            }
            this.move(e, m, dt);
            p.inputSequence = m.input.sequence;
        }
        if (s.phase === 'racing') this.scene.physics.step(dt);
        for (const p of s.players) {
            if (!p.connected || p.respawnAt > 0) continue;
            const e = this.scene.characters.get(p.id)!,
                pos = e.getPosition(),
                v = e.rigidbody!.linearVelocity;
            p.x = pos.x;
            p.y = pos.y;
            p.z = pos.z;
            p.vx = v.x;
            p.vy = v.y;
            p.vz = v.z;
            if (s.modeId === 'obstacle-dash' && s.phase === 'racing' && p.finish === null) {
                if (p.y < -5 || Math.abs(p.x) > 12 || p.z > 14) this.respawn(p);
                p.progress = Math.max(p.progress, boundedProgress(p));
            }
            if (
                s.modeId === 'laser-tag' &&
                (p.y < -3 || Math.abs(p.x) > LASER.bounds.x || Math.abs(p.z) > LASER.bounds.z)
            ) {
                this.laser.prepare(p, s.players.indexOf(p));
                p.protectedUntil = s.elapsed + LASER.spawnProtection;
                p.respawns++;
                this.teleport(p);
            }
            if (s.modeId === 'obstacle-dash' && Math.hypot(v.x, v.z) > 0.15)
                p.yaw = (turnToward((p.yaw * Math.PI) / 180, Math.atan2(-v.x, -v.z), dt) * 180) / Math.PI;
            this.scene.face(p.id, p.yaw);
        }
        if (s.modeId === 'laser-tag' && s.phase === 'racing') this.laser.afterStep(s, this.scene, this.motions);
        if (
            s.phase === 'racing' &&
            (s.elapsed >= timeout ||
                (s.modeId === 'obstacle-dash' && s.players.every((p) => p.finish !== null || !p.connected)))
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
        const fresh =
            performance.now() - m.received < 400 &&
            m.input.life === this.state.players.find((p) => p.id === e.name)?.respawns;
        const race = this.state.modeId === 'obstacle-dash';
        const axes = fresh ? m.input.axes : [0, 0];
        const sinceHit = time - m.hitAt;
        if (m.input.jumpSequence > m.jumpSeen) {
            m.jumpSeen = m.input.jumpSequence;
            if (fresh && sinceHit >= RACE_MOVEMENT.stumbleDeadTime) m.buffer = time;
        }
        let vx = v.x,
            vz = v.z,
            vy = v.y;
        if (m.input.diveSequence > m.diveSeen) {
            m.diveSeen = m.input.diveSequence;
            if (race && fresh && sinceHit >= RACE_MOVEMENT.stumbleRecovery && time >= m.diveReady) {
                const speed = Math.hypot(vx, vz);
                const wish = Math.hypot(...axes);
                const dirX = speed > 0.5 ? vx / speed : wish > 0.01 ? axes[0] / wish : 0;
                const dirZ = speed > 0.5 ? vz / speed : wish > 0.01 ? axes[1] / wish : -1;
                const next = Math.min(
                    RACE_MOVEMENT.diveMaxSpeed,
                    Math.max(speed, RACE_MOVEMENT.speed) + RACE_MOVEMENT.diveImpulse
                );
                vx = dirX * next;
                vz = dirZ * next;
                vy = Math.max(vy, 0) + RACE_MOVEMENT.diveLift;
                m.diveUntil = time + RACE_MOVEMENT.diveDuration;
                m.diveReady = time + RACE_MOVEMENT.diveCooldown;
                m.groundedAt = -100;
                this.onEvent('dive', { id: e.name });
            }
        }
        [vx, vz] = race
            ? raceHorizontal(vx, vz, axes, grounded, time < m.diveUntil, sinceHit, dt)
            : approachHorizontal(
                  vx,
                  vz,
                  axes[0],
                  axes[1],
                  LASER.speed,
                  grounded ? (Math.hypot(...axes) < 0.01 ? 42 : 48) : 24,
                  dt
              );
        if (
            race &&
            fresh &&
            time >= m.diveUntil &&
            sinceHit >= RACE_MOVEMENT.stumbleDeadTime &&
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
        // Ammo owns gravity/integration/collision. Adjust only the difference from
        // its -18 world gravity so there is still one integrator and one body.
        if (race && (!grounded || vy > 0.5)) vy += (18 - raceGravity(vy, fresh && m.input.jumpHeld)) * dt;
        body.linearVelocity = new Vec3(
            Math.max(-8, Math.min(8, vx)),
            Math.max(-25, Math.min(12, vy)),
            Math.max(-8, Math.min(8, vz))
        );
    }
}
