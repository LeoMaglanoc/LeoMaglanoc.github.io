export const VERSION = 2;
export const COLORS = ['#ffcc4a', '#75dfd1', '#ec8ee5', '#9fa7ff', '#ff9376', '#99db67', '#82cfff', '#f3f0cf'];
export type Phase = 'lobby' | 'countdown' | 'racing' | 'results';
export type Input = {
    type: 'input';
    sequence: number;
    axes: [number, number];
    jumpSequence: number;
    clientTime: number;
};
export type Player = {
    id: string;
    name: string;
    color: string;
    connected: boolean;
    ready: boolean;
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
};
export type Snapshot = {
    type: 'snapshot';
    mode: 'obstacle-dash';
    sequence: number;
    tick: number;
    phase: Phase;
    elapsed: number;
    countdown: number;
    paused: boolean;
    players: Player[];
    round: number;
};
export type Control =
    | { type: 'join'; version: number; nickname: string }
    | { type: 'ready'; roundId: number }
    | { type: 'ping'; at: number }
    | { type: 'pong'; at: number };
export const neutral = (): Input => ({ type: 'input', sequence: 0, axes: [0, 0], jumpSequence: 0, clientTime: 0 });
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const seq = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 0;
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
export function parseInput(v: unknown): Input | null {
    if (
        !record(v) ||
        v.type !== 'input' ||
        !seq(v.sequence) ||
        !seq(v.jumpSequence) ||
        !finite(v.clientTime) ||
        !Array.isArray(v.axes) ||
        v.axes.length !== 2 ||
        !v.axes.every(finite)
    )
        return null;
    if (Object.keys(v).some((k) => !['type', 'sequence', 'axes', 'jumpSequence', 'clientTime'].includes(k)))
        return null;
    let [x, z] = v.axes.map((n) => Math.max(-1, Math.min(1, n)));
    const length = Math.hypot(x, z);
    if (length > 1) {
        x /= length;
        z /= length;
    }
    return {
        type: 'input',
        sequence: v.sequence,
        axes: [x, z],
        jumpSequence: v.jumpSequence,
        clientTime: v.clientTime
    };
}
export function parseControl(v: unknown): Control | null {
    if (!record(v)) return null;
    if (v.type === 'ready' && seq(v.roundId)) return { type: 'ready', roundId: v.roundId };
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
        v.mode !== 'obstacle-dash' ||
        !seq(v.tick) ||
        !seq(v.sequence) ||
        !seq(v.round) ||
        !['lobby', 'countdown', 'racing', 'results'].includes(String(v.phase)) ||
        !finite(v.elapsed) ||
        !finite(v.countdown) ||
        typeof v.paused !== 'boolean' ||
        !Array.isArray(v.players) ||
        v.players.length > 8
    )
        return false;
    return v.players.every(
        (p) =>
            record(p) &&
            typeof p.id === 'string' &&
            typeof p.name === 'string' &&
            /^#[0-9a-f]{6}$/i.test(String(p.color)) &&
            typeof p.connected === 'boolean' &&
            typeof p.ready === 'boolean' &&
            ['x', 'y', 'z', 'vx', 'vy', 'vz', 'yaw', 'checkpoint', 'progress', 'respawns'].every((k) => finite(p[k])) &&
            (p.finish === null || finite(p.finish))
    );
}
export class InputGate {
    last = -1;
    window = 0;
    count = 0;
    accept(raw: unknown, now: number) {
        if (now - this.window >= 1000) {
            this.window = now;
            this.count = 0;
        }
        if (++this.count > 75) return null;
        const input = parseInput(raw);
        if (!input || input.sequence <= this.last) return null;
        this.last = input.sequence;
        return input;
    }
}
export class SnapshotGate {
    tick = -1;
    sequence = -1;
    accept(s: Snapshot) {
        if (s.sequence <= this.sequence || s.tick < this.tick) return false;
        this.tick = s.tick;
        this.sequence = s.sequence;
        return true;
    }
}
