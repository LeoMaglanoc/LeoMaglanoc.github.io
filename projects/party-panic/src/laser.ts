import { WeaponCycle, type WeaponId } from './weapons';
/** Original primitive arena and host-side laser rules; no rendering dependency. */
export type Point = { x: number; y: number; z: number };
export type Cover = { min: Point; max: Point; id?: string; color?: string };
export type LaserTarget = Point & {
    id: string;
    connected: boolean;
    respawnAt: number;
    protectedUntil: number;
};
export const LASER = {
    duration: 90,
    speed: 4.8,
    cooldown: 0.25,
    range: 25,
    respawnDelay: 2,
    spawnProtection: 1,
    maxPitch: 0.8,
    radius: 0.38,
    height: 1.5,
    bounds: { x: 14, z: 11 }
} as const;
const box = (id: string, x: number, z: number, width: number, depth: number, height = 2.2): Cover => ({
    id,
    min: { x: x - width / 2, y: 0, z: z - depth / 2 },
    max: { x: x + width / 2, y: height, z: z + depth / 2 }
});
export const LASER_COVERS: Cover[] = [
    { id: 'arena-floor', color: '#243850', min: { x: -14, y: -1.2, z: -11 }, max: { x: 14, y: 0, z: 11 } },
    ...[-1, 1].flatMap((side) => [-11, -4, 4, 11].map((x) => box(`shelter-${side}-${x}`, x, side * 5.5, 3.2, 1.1))),
    box('middle-left', -4, 0, 2, 4.5),
    box('middle-right', 4, 0, 2, 4.5),
    box('middle', 0, 0, 2, 2),
    box('wall-west', -14.5, 0, 1, 24, 3.5),
    box('wall-east', 14.5, 0, 1, 24, 3.5),
    box('wall-north', 0, -11.5, 28, 1, 3.5),
    box('wall-south', 0, 11.5, 28, 1, 3.5)
];
export const LASER_SPAWNS: Point[] = [-1, 1].flatMap((side) =>
    [-11, -4, 4, 11].map((x) => ({ x, y: 0.8, z: side * 8 }))
);
const add = (p: Point, d: Point, t: number): Point => ({ x: p.x + d.x * t, y: p.y + d.y * t, z: p.z + d.z * t });
const difference = (a: Point, b: Point): Point => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const length = (p: Point) => Math.hypot(p.x, p.y, p.z);
const normalize = (p: Point): Point => {
    const n = length(p);
    return n > 1e-9 ? { x: p.x / n, y: p.y / n, z: p.z / n } : { x: 0, y: 0, z: 0 };
};
export function validAim(yaw: number, pitch: number) {
    return (
        Number.isFinite(yaw) && Number.isFinite(pitch) && Math.abs(yaw) <= Math.PI && Math.abs(pitch) <= LASER.maxPitch
    );
}
export function aimDirection(yaw: number, pitch: number): Point {
    return { x: Math.sin(yaw) * Math.cos(pitch), y: Math.sin(pitch), z: -Math.cos(yaw) * Math.cos(pitch) };
}

/** Distance to first box surface along a normalized ray, including an inside origin. */
export function rayBox(origin: Point, direction: Point, cover: Cover, maxDistance = Infinity): number | null {
    let near = 0;
    let far = maxDistance;
    if (length(direction) < 1e-9) return null;
    for (const axis of ['x', 'y', 'z'] as const) {
        if (Math.abs(direction[axis]) < 1e-9) {
            if (origin[axis] < cover.min[axis] || origin[axis] > cover.max[axis]) return null;
        } else {
            const a = (cover.min[axis] - origin[axis]) / direction[axis];
            const b = (cover.max[axis] - origin[axis]) / direction[axis];
            near = Math.max(near, Math.min(a, b));
            far = Math.min(far, Math.max(a, b));
            if (near > far) return null;
        }
    }
    return near <= maxDistance && far >= 0 ? near : null;
}

/** Exact union of vertical cylinder and spherical end caps, matching the actor capsule. */
export function rayCapsule(origin: Point, direction: Point, center: Point, maxDistance = Infinity): number | null {
    const radius = LASER.radius;
    const halfSegment = LASER.height / 2 - radius;
    const local = difference(origin, center);
    const nearestY = Math.max(-halfSegment, Math.min(halfSegment, local.y));
    if (Math.hypot(local.x, local.y - nearestY, local.z) <= radius) return 0;
    const hits: number[] = [];
    const a = direction.x ** 2 + direction.z ** 2;
    const b = 2 * (local.x * direction.x + local.z * direction.z);
    const c = local.x ** 2 + local.z ** 2 - radius ** 2;
    const discriminant = b * b - 4 * a * c;
    if (a > 1e-9 && discriminant >= 0) {
        for (const t of [(-b - Math.sqrt(discriminant)) / (2 * a), (-b + Math.sqrt(discriminant)) / (2 * a)])
            if (t >= 0 && Math.abs(local.y + direction.y * t) <= halfSegment) hits.push(t);
    }
    for (const y of [-halfSegment, halfSegment]) {
        const p = { x: local.x, y: local.y - y, z: local.z };
        const dot = p.x * direction.x + p.y * direction.y + p.z * direction.z;
        const disc = dot ** 2 - (p.x ** 2 + p.y ** 2 + p.z ** 2 - radius ** 2);
        if (disc >= 0) {
            const t = -dot - Math.sqrt(disc);
            if (t >= 0) hits.push(t);
        }
    }
    const first = Math.min(...hits);
    return Number.isFinite(first) && first <= maxDistance ? first : null;
}

function clippedOffset(origin: Point, wanted: Point, covers: Cover[], padding: number): Point {
    const delta = difference(wanted, origin);
    const direction = normalize(delta);
    let distance = length(delta);
    for (const cover of covers) {
        const expanded = {
            min: { x: cover.min.x - padding, y: cover.min.y - padding, z: cover.min.z - padding },
            max: { x: cover.max.x + padding, y: cover.max.y + padding, z: cover.max.z + padding }
        };
        const hit = rayBox(origin, direction, expanded, distance);
        if (hit !== null) distance = Math.max(0, hit - 0.03);
    }
    return add(origin, direction, distance);
}
export function getAimRig(position: Point, yaw: number, pitch: number, covers: Cover[] = LASER_COVERS) {
    const direction = aimDirection(yaw, pitch);
    const right = { x: Math.cos(yaw), y: 0, z: Math.sin(yaw) };
    const pivot = { ...position, y: position.y + 0.8 };
    const eye = { ...position, y: position.y + 0.35 };
    return {
        direction,
        camera: clippedOffset(pivot, add(add(pivot, direction, -4), right, 0.65), covers, 0.2),
        muzzle: clippedOffset(eye, add(add(eye, direction, 0.5), right, 0.25), covers, 0.03)
    };
}

export class ShotGate {
    private cycle = new WeaponCycle();
    get sequence() {
        return this.cycle.sequence;
    }
    get lastShot() {
        return this.cycle.lastShot;
    }
    get energy() {
        return this.cycle.energy;
    }
    get charge() {
        return this.cycle.charge;
    }
    advance(now: number, weapon: WeaponId, trigger: boolean) {
        this.cycle.advance(now, weapon, trigger);
    }
    discard(sequence: number) {
        if (Number.isSafeInteger(sequence)) this.cycle.sequence = Math.max(this.cycle.sequence, sequence);
    }
    respawn(now: number) {
        this.cycle.energy = 1;
        this.cycle.readyAt = now;
        this.cycle.advance(now, 'quick', false);
    }
    attempt(sequence: number, now: number, yaw: number, pitch: number, weapon: WeaponId = 'quick'): boolean {
        return this.cycle.attempt(sequence, now, weapon, validAim(yaw, pitch));
    }
}

export type ShotResult = { from: Point; to: Point; targetId: string | null; blocked: boolean };
export function resolveShot(options: {
    camera: Point;
    muzzle: Point;
    yaw: number;
    pitch: number;
    shooterId: string;
    targets: LaserTarget[];
    now: number;
    covers?: Cover[];
}): ShotResult {
    const { camera, muzzle, yaw, pitch, shooterId, targets, now, covers = LASER_COVERS } = options;
    const miss: ShotResult = { from: muzzle, to: muzzle, targetId: null, blocked: false };
    if (
        !validAim(yaw, pitch) ||
        !Number.isFinite(now) ||
        ![camera, muzzle].every((p) => [p.x, p.y, p.z].every(Number.isFinite))
    )
        return miss;
    const living = targets.filter((p) => p.id !== shooterId && p.connected && p.respawnAt === 0);
    const direction = aimDirection(yaw, pitch);
    let aimDistance = LASER.range + length(difference(camera, muzzle));
    for (const cover of covers) {
        const hit = rayBox(camera, direction, cover, aimDistance);
        if (hit !== null) aimDistance = hit;
    }
    for (const target of living) {
        const hit = rayCapsule(camera, direction, target, aimDistance);
        if (hit !== null) aimDistance = hit;
    }
    const aim = difference(add(camera, direction, aimDistance), muzzle);
    if (aim.x * direction.x + aim.y * direction.y + aim.z * direction.z <= 0) return { ...miss, blocked: true };
    const shotDirection = normalize(aim);
    let distance = Math.min(LASER.range, length(aim) + 1e-6);
    let blocked = false;
    let targetId: string | null = null;
    for (const cover of covers) {
        const hit = rayBox(muzzle, shotDirection, cover, distance);
        if (hit !== null) {
            distance = hit;
            blocked = true;
        }
    }
    for (const target of living) {
        const hit = rayCapsule(muzzle, shotDirection, target, distance);
        // Geometry wins an exact-distance tie, avoiding shots through touching cover.
        if (hit !== null && hit < distance) {
            distance = hit;
            targetId = target.protectedUntil <= now ? target.id : null;
            blocked = target.protectedUntil > now;
        }
    }
    return { from: muzzle, to: add(muzzle, shotDirection, distance), targetId, blocked };
}

export function chooseSpawn(targets: LaserTarget[], now: number, seed = 0): Point {
    if (!Number.isFinite(now) || !Number.isFinite(seed)) return { ...LASER_SPAWNS[0] };
    const living = targets.filter((p) => p.connected && p.respawnAt === 0);
    let best = LASER_SPAWNS[((Math.trunc(seed) % 8) + 8) % 8];
    let bestScore = -Infinity;
    for (let index = 0; index < LASER_SPAWNS.length; index++) {
        const spawn = LASER_SPAWNS[(index + ((Math.trunc(seed) % 8) + 8)) % 8];
        let score = Infinity;
        for (const target of living) {
            const delta = difference(target, spawn);
            const distance = length(delta);
            const hidden = LASER_COVERS.some(
                (cover) => rayBox({ ...spawn, y: spawn.y + 0.35 }, normalize(delta), cover, distance) !== null
            );
            score = Math.min(score, distance + (hidden ? 6 : 0));
        }
        if (score > bestScore) {
            bestScore = score;
            best = spawn;
        }
    }
    return { ...best };
}
export function laserRank<T extends { id: string; score: number }>(players: T[]): T[] {
    return [...players].sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
}
