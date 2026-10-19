import { isWeapon, type WeaponId } from './weapons';
export const VERSION = 3;
export const COLORS = ['#ffcc4a', '#75dfd1', '#ec8ee5', '#9fa7ff', '#ff9376', '#99db67', '#82cfff', '#f3f0cf'];
export type ModeId = 'obstacle-dash' | 'laser-tag';
export type Phase = 'lobby' | 'countdown' | 'racing' | 'results';
type InputBase = {
    type: 'input';
    version: number;
    modeId: ModeId;
    roundId: number;
    life: number;
    sequence: number;
    axes: [number, number];
    jumpSequence: number;
    jumpHeld: boolean;
    diveSequence: number;
    clientTime: number;
};
export type Aim = { yaw: number; pitch: number; fire: boolean; sequence: number; weapon: WeaponId };
export type Input = (InputBase & { modeId: 'obstacle-dash' }) | (InputBase & { modeId: 'laser-tag'; aim: Aim });
export type Player = {
    id: string;
    name: string;
    color: string;
    connected: boolean;
    ready: boolean;
    bot: boolean;
    checkpoint: number;
    progress: number;
    finish: number | null;
    x: number;
    y: number;
    z: number;
    vx: number;
    vy: number;
    vz: number;
    yaw: number;
    respawns: number;
    score: number;
    deaths: number;
    respawnAt: number;
    protectedUntil: number;
    aimPitch: number;
    health: number;
    energy: number;
    weapon: WeaponId;
    charge: number;
    inputSequence: number;
    shotSequence: number;
};
export type Snapshot = {
    type: 'snapshot';
    version: number;
    modeId: ModeId;
    roundId: number;
    sequence: number;
    tick: number;
    phase: Phase;
    elapsed: number;
    countdown: number;
    paused: boolean;
    players: Player[];
};
export type Control =
    | { type: 'join'; version: number; nickname: string }
    | { type: 'ready'; modeId: ModeId; roundId: number }
    | { type: 'ping'; at: number }
    | { type: 'pong'; at: number };
export function neutral(modeId: ModeId = 'obstacle-dash', roundId = 0): Input {
    const base = {
        type: 'input' as const,
        version: VERSION,
        roundId,
        life: 0,
        sequence: 0,
        axes: [0, 0] as [number, number],
        jumpSequence: 0,
        jumpHeld: false,
        diveSequence: 0,
        clientTime: 0
    };
    return modeId === 'laser-tag'
        ? { ...base, modeId, aim: { yaw: 0, pitch: 0, fire: false, sequence: 0, weapon: 'quick' } }
        : { ...base, modeId };
}
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const seq = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 0;
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
export const isMode = (v: unknown): v is ModeId => v === 'obstacle-dash' || v === 'laser-tag';
export function parseInput(v: unknown): Input | null {
    if (
        !record(v) ||
        v.type !== 'input' ||
        v.version !== VERSION ||
        !isMode(v.modeId) ||
        !seq(v.roundId) ||
        !seq(v.sequence) ||
        !seq(v.life) ||
        !seq(v.jumpSequence) ||
        !seq(v.diveSequence) ||
        typeof v.jumpHeld !== 'boolean' ||
        !finite(v.clientTime) ||
        !Array.isArray(v.axes) ||
        v.axes.length !== 2 ||
        !v.axes.every(finite)
    )
        return null;
    const keys = [
        'type',
        'version',
        'modeId',
        'roundId',
        'sequence',
        'axes',
        'life',
        'jumpSequence',
        'jumpHeld',
        'diveSequence',
        'clientTime'
    ];
    if (v.modeId === 'laser-tag') keys.push('aim');
    if (Object.keys(v).some((k) => !keys.includes(k))) return null;
    let [x, z] = v.axes.map((n) => Math.max(-1, Math.min(1, n)));
    const length = Math.hypot(x, z);
    if (length > 1) {
        x /= length;
        z /= length;
    }
    const base = {
        type: 'input' as const,
        version: VERSION,
        roundId: v.roundId,
        life: v.life,
        sequence: v.sequence,
        axes: [x, z] as [number, number],
        jumpSequence: v.jumpSequence,
        jumpHeld: v.jumpHeld,
        diveSequence: v.diveSequence,
        clientTime: v.clientTime
    };
    if (v.modeId === 'obstacle-dash') return { ...base, modeId: v.modeId };
    const a = v.aim;
    if (
        !record(a) ||
        !finite(a.yaw) ||
        Math.abs(a.yaw) > Math.PI ||
        !finite(a.pitch) ||
        Math.abs(a.pitch) > 0.8 ||
        typeof a.fire !== 'boolean' ||
        !seq(a.sequence) ||
        !isWeapon(a.weapon) ||
        Object.keys(a).some((k) => !['yaw', 'pitch', 'fire', 'sequence', 'weapon'].includes(k))
    )
        return null;
    return {
        ...base,
        modeId: 'laser-tag',
        aim: { yaw: a.yaw, pitch: a.pitch, fire: a.fire, sequence: a.sequence, weapon: a.weapon }
    };
}
export function parseControl(v: unknown): Control | null {
    if (!record(v)) return null;
    if (
        v.type === 'ready' &&
        seq(v.roundId) &&
        isMode(v.modeId) &&
        Object.keys(v).every((k) => ['type', 'roundId', 'modeId'].includes(k))
    )
        return { type: 'ready', modeId: v.modeId, roundId: v.roundId };
    if (
        v.type === 'join' &&
        seq(v.version) &&
        typeof v.nickname === 'string' &&
        v.nickname.trim().length > 0 &&
        v.nickname.length <= 20
    )
        return { type: 'join', version: v.version, nickname: v.nickname.trim() };
    if ((v.type === 'ping' || v.type === 'pong') && finite(v.at) && v.at >= 0) return { type: v.type, at: v.at };
    return null;
}
export function isSnapshot(v: unknown): v is Snapshot {
    if (
        !record(v) ||
        v.type !== 'snapshot' ||
        v.version !== VERSION ||
        !isMode(v.modeId) ||
        !seq(v.roundId) ||
        !seq(v.tick) ||
        !seq(v.sequence) ||
        !['lobby', 'countdown', 'racing', 'results'].includes(String(v.phase)) ||
        !finite(v.elapsed) ||
        v.elapsed < 0 ||
        !finite(v.countdown) ||
        typeof v.paused !== 'boolean' ||
        !Array.isArray(v.players) ||
        v.players.length > 8
    )
        return false;
    const ids = new Set<string>();
    return v.players.every((p) => {
        if (
            !record(p) ||
            typeof p.id !== 'string' ||
            p.id.length > 100 ||
            ids.has(p.id) ||
            typeof p.name !== 'string' ||
            p.name.length > 20 ||
            !/^#[0-9a-f]{6}$/i.test(String(p.color)) ||
            typeof p.connected !== 'boolean' ||
            typeof p.ready !== 'boolean' ||
            typeof p.bot !== 'boolean' ||
            ![
                'x',
                'y',
                'z',
                'vx',
                'vy',
                'vz',
                'yaw',
                'checkpoint',
                'progress',
                'respawns',
                'score',
                'deaths',
                'respawnAt',
                'protectedUntil',
                'aimPitch',
                'health',
                'energy',
                'charge',
                'inputSequence',
                'shotSequence'
            ].every((k) => finite(p[k])) ||
            !isWeapon(p.weapon) ||
            !seq(p.inputSequence) ||
            !seq(p.shotSequence) ||
            (p.health as number) < 0 ||
            (p.health as number) > 100 ||
            (p.energy as number) < 0 ||
            (p.energy as number) > 1 ||
            (p.charge as number) < 0 ||
            (p.charge as number) > 1 ||
            !(p.finish === null || finite(p.finish))
        )
            return false;
        ids.add(p.id);
        return true;
    });
}
export class InputGate {
    last = -1;
    window = 0;
    count = 0;
    accept(raw: unknown, now: number, modeId?: ModeId, roundId?: number) {
        if (now - this.window >= 1000) {
            this.window = now;
            this.count = 0;
        }
        if (++this.count > 75) return null;
        const input = parseInput(raw);
        if (
            !input ||
            input.sequence <= this.last ||
            (modeId !== undefined && input.modeId !== modeId) ||
            (roundId !== undefined && input.roundId !== roundId)
        )
            return null;
        this.last = input.sequence;
        return input;
    }
}
export class SnapshotGate {
    tick = -1;
    sequence = -1;
    roundId = -1;
    modeId?: ModeId;
    reset() {
        this.tick = this.sequence = this.roundId = -1;
        this.modeId = undefined;
    }
    accept(s: Snapshot) {
        if (
            s.version !== VERSION ||
            s.sequence <= this.sequence ||
            s.tick < this.tick ||
            s.roundId < this.roundId ||
            (s.roundId === this.roundId && this.modeId !== undefined && s.modeId !== this.modeId)
        )
            return false;
        this.tick = s.tick;
        this.sequence = s.sequence;
        this.roundId = s.roundId;
        this.modeId = s.modeId;
        return true;
    }
}
