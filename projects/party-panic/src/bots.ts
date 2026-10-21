import { bombDecision } from './bomb/bot';
import type { ArenaState } from './bomb/model';
import { WEAPONS } from './weapons';
import { LASER, LASER_COVERS, getAimRig, rayBox, resolveShot, type Point } from './laser';
import { neutral, type Input, type ModeId, type Player } from './protocol';

type Brain = {
    sequence: number;
    jump: number;
    fire: number;
    round: number;
    mode: ModeId;
    respawns: number;
    jumped: Set<number>;
    yaw: number;
    pitch: number;
    target: string;
    acquired: number;
    fired: number;
    path: Point[];
    planned: number;
};
const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const angle = (x: number) => Math.atan2(Math.sin(x), Math.cos(x));

/** Host-owned opponents generate the same input packets as a person; never mutate world state. */
export class BotController {
    private brains = new Map<string, Brain>();
    reset() {
        this.brains.clear();
    }
    remove(id: string) {
        this.brains.delete(id);
    }
    update(
        p: Player,
        players: Player[],
        modeId: ModeId,
        roundId: number,
        elapsed: number,
        dt: number,
        arena?: ArenaState
    ): Input {
        let b = this.brains.get(p.id);
        if (!b || b.round !== roundId || b.mode !== modeId) {
            b = {
                sequence: b?.sequence ?? 0,
                jump: b?.jump ?? 0,
                fire: b?.fire ?? 0,
                round: roundId,
                mode: modeId,
                respawns: p.respawns,
                jumped: new Set(),
                yaw: 0,
                pitch: 0,
                target: '',
                acquired: elapsed,
                fired: -1,
                path: [],
                planned: -1
            };
            this.brains.set(p.id, b);
        }
        const input = neutral(modeId, roundId);
        input.life = p.respawns;
        input.sequence = ++b.sequence;
        input.clientTime = elapsed * 1000;
        input.jumpSequence = b.jump;
        if (input.modeId === 'bomb-arena' && arena) {
            if (p.health > 0) {
                const d = bombDecision(p, players, arena);
                input.axes = d.axes;
                if (d.plant && elapsed - b.fired > 0.3) {
                    b.fire++;
                    b.fired = elapsed;
                }
            }
            input.bombSequence = b.fire;
            return input;
        }
        if (!p.connected || p.finish !== null || p.respawnAt > elapsed) return input;
        if (modeId === 'obstacle-dash') {
            if (p.respawns !== b.respawns) {
                b.jumped.clear();
                b.respawns = p.respawns;
            }
            const number = /^bot-(\d+)$/.exec(p.id);
            const personality = number ? Number(number[1]) % 3 : -1;
            const lane =
                personality < 0
                    ? p.checkpoint > 0
                        ? -4
                        : 0
                    : (p.checkpoint > 0 ? [-4, 4, -2] : [-2, 2, 0])[personality];
            const pace = personality < 0 ? 1 : [0.96, 1, 0.94][personality];
            let x = clamp((lane - p.x) * 3, -1, 1),
                z = -1;
            for (const edge of [-16, -26, -35]) {
                if (p.z > edge - 0.25 && p.z < edge + 0.2 && p.y < 1.05 && !b.jumped.has(edge)) {
                    b.jump++;
                    b.jumped.add(edge);
                }
            }
            for (const [i, gate] of [-96, -108, -120].entries()) {
                const sweep = Math.sin(elapsed * 1.7 + i * 1.8);
                const blocked =
                    lane <= -3 ? sweep < 0.55 : lane >= 3 ? sweep > -0.55 : Math.abs(sweep * 4.2 - lane) < 2.8;
                if (p.z > gate + 1.5 && p.z < gate + 2.2 && blocked) z = 0;
            }
            if (Math.abs(lane - p.x) < 0.08) x = 0;
            const length = Math.max(1, Math.hypot(x, z));
            input.axes = [(x / length) * pace, (z / length) * pace];
        }
        input.jumpSequence = b.jump;
        input.jumpHeld = modeId === 'obstacle-dash';
        // Laser navigation and aiming below use ordinary aim/fire inputs, validated by the host.
        if (input.modeId === 'laser-tag') this.laser(p, players, input, b, elapsed, dt);
        return input;
    }
    private laser(
        p: Player,
        players: Player[],
        input: Extract<Input, { modeId: 'laser-tag' }>,
        b: Brain,
        elapsed: number,
        dt: number
    ) {
        const target = players
            .filter((t) => t.id !== p.id && t.connected && t.respawnAt <= elapsed && t.protectedUntil <= elapsed)
            .sort((a, c) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(c.x - p.x, c.z - p.z))[0];
        if (!target) return;
        if (b.target !== target.id) {
            b.target = target.id;
            b.acquired = elapsed;
        }
        const dx = target.x - p.x,
            dz = target.z - p.z;
        const distance = Math.hypot(dx, dz);
        const rig = getAimRig(p, b.yaw, b.pitch);
        const aimX = target.x - rig.camera.x,
            aimZ = target.z - rig.camera.z;
        const desired = Math.atan2(aimX, -aimZ);
        const desiredPitch = Math.atan2(target.y - rig.camera.y, Math.hypot(aimX, aimZ));
        const turn = Math.max(0, Math.min(dt, 0.1)) * 3;
        b.yaw = angle(b.yaw + clamp(angle(desired - b.yaw), -turn, turn));
        b.pitch = clamp(b.pitch + clamp(desiredPitch - b.pitch, -turn, turn), -LASER.maxPitch, LASER.maxPitch);
        const aimRig = getAimRig(p, b.yaw, b.pitch);
        const weapon = /^bot-[1357]$/.test(p.id) ? 'charged' : 'quick';
        const tracking =
            distance < LASER.range &&
            elapsed - b.acquired >= 0.3 &&
            resolveShot({ ...aimRig, yaw: b.yaw, pitch: b.pitch, shooterId: p.id, targets: players, now: elapsed })
                .targetId === target.id;
        const fire =
            tracking &&
            elapsed - b.fired >= WEAPONS[weapon].cooldown &&
            p.energy >= WEAPONS[weapon].cost &&
            (weapon === 'quick' || p.charge >= 1);
        if (fire) {
            b.fire++;
            b.fired = elapsed;
        }
        input.aim = { yaw: b.yaw, pitch: b.pitch, fire: tracking, sequence: b.fire, weapon };
        if (distance > 6 || !clearPath(p, target, 0)) {
            if (elapsed - b.planned > 0.4 || !b.path.length) {
                b.path = route(p, target);
                b.planned = elapsed;
            }
            while (b.path.length && Math.hypot(b.path[0].x - p.x, b.path[0].z - p.z) < 0.25) b.path.shift();
            const point = clearPath(p, target) ? target : b.path[0];
            if (point) {
                const nx = point.x - p.x,
                    nz = point.z - p.z,
                    n = Math.hypot(nx, nz);
                input.axes = [nx / Math.max(1, n), nz / Math.max(1, n)];
            }
        }
    }
}

/** Expanded cover segments keep navigation outside the actual authoritative capsule. */
function clearPath(a: Point, b: Point, padding = 0.5) {
    const distance = Math.hypot(b.x - a.x, b.z - a.z);
    if (!distance) return true;
    const origin = { x: a.x, y: 0.8, z: a.z };
    const direction = { x: (b.x - a.x) / distance, y: 0, z: (b.z - a.z) / distance };
    return !LASER_COVERS.some(
        (cover) =>
            cover.max.y > 0.3 &&
            cover.min.y < 1.5 &&
            rayBox(
                origin,
                direction,
                {
                    min: { ...cover.min, x: cover.min.x - padding, z: cover.min.z - padding },
                    max: { ...cover.max, x: cover.max.x + padding, z: cover.max.z + padding }
                },
                distance
            ) !== null
    );
}

/** Small fixed arena grid; bounded at 567 nodes and cached for 400ms per opponent. */
function route(from: Point, to: Point): Point[] {
    const key = (x: number, z: number) => `${x},${z}`;
    const start = { x: Math.round(from.x), y: 0.8, z: Math.round(from.z) };
    // The rounded cell may touch cover: attach to the nearest reachable grid node.
    let first: Point | undefined;
    for (let radius = 0; radius <= 2 && !first; radius++) {
        for (let x = start.x - radius; x <= start.x + radius && !first; x++) {
            for (let z = start.z - radius; z <= start.z + radius && !first; z++) {
                const candidate = { x, y: 0.8, z };
                if (
                    Math.abs(x) <= LASER.bounds.x - 1 &&
                    Math.abs(z) <= LASER.bounds.z - 1 &&
                    clearPath(from, candidate)
                )
                    first = candidate;
            }
        }
    }
    if (!first) return [];
    const queue = [first],
        seen = new Set([key(first.x, first.z)]),
        parent = new Map<string, Point>();
    let best = first,
        bestDistance = Infinity;
    for (let head = 0; head < queue.length; head++) {
        const at = queue[head];
        const distance = Math.hypot(at.x - to.x, at.z - to.z);
        if (distance < bestDistance) {
            best = at;
            bestDistance = distance;
        }
        if (distance < 1) {
            best = at;
            break;
        }
        for (const [dx, dz] of [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1]
        ]) {
            const next = { x: at.x + dx, y: 0.8, z: at.z + dz },
                id = key(next.x, next.z);
            if (
                Math.abs(next.x) > LASER.bounds.x - 1 ||
                Math.abs(next.z) > LASER.bounds.z - 1 ||
                seen.has(id) ||
                !clearPath(at, next)
            )
                continue;
            seen.add(id);
            parent.set(id, at);
            queue.push(next);
        }
    }
    const result: Point[] = [best];
    while (parent.has(key(result[0].x, result[0].z))) result.unshift(parent.get(key(result[0].x, result[0].z))!);
    return result;
}
