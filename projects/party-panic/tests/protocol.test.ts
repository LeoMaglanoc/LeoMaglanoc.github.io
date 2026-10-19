import { describe, it, expect } from 'vitest';
import { InputGate, SnapshotGate, parseInput, parseControl, neutral } from '../src/protocol';
import { admission, canTransition, checkpoint, finish, rank, resetPlayer, boundedProgress } from '../src/rules';
import type { Player, Snapshot } from '../src/protocol';
const player = (id = 'a'): Player => ({
    id,
    name: id,
    color: '#ffffff',
    connected: true,
    checkpoint: 0,
    progress: 0,
    finish: null,
    x: 0,
    y: 1,
    z: 3,
    vx: 0,
    vy: 0,
    vz: 0,
    yaw: 0,
    respawns: 0
});
describe('connection-bound input validation', () => {
    it('clamps finite diagonal axes and rejects spoofed authority', () => {
        const i = parseInput({ ...neutral(), axes: [80, -10] });
        expect(Math.hypot(...i!.axes)).toBeCloseTo(1);
        for (const raw of [
            null,
            { ...neutral(), axes: [NaN, 0] },
            { ...neutral(), playerId: 'victim' },
            { ...neutral(), position: [0, 0, -999] },
            { type: 'finish' },
            { ...neutral(), sequence: -1 }
        ])
            expect(parseInput(raw)).toBeNull();
    });
    it('ignores stale and duplicate sequences and bounds rates', () => {
        const g = new InputGate();
        expect(g.accept(neutral(), 1000)).not.toBeNull();
        expect(g.accept(neutral(), 1000)).toBeNull();
        expect(g.accept({ ...neutral(), sequence: 3 }, 1000)).not.toBeNull();
        expect(g.accept({ ...neutral(), sequence: 2 }, 1000)).toBeNull();
        for (let n = 4; n < 100; n++) g.accept({ ...neutral(), sequence: n }, 1000);
        expect(g.accept({ ...neutral(), sequence: 101 }, 1000)).toBeNull();
        expect(g.accept({ ...neutral(), sequence: 102 }, 2100)).not.toBeNull();
    });
    it('retains jump press across missing input packets', () => {
        const g = new InputGate();
        g.accept({ ...neutral(), sequence: 1 }, 0);
        expect(g.accept({ ...neutral(), sequence: 4, jumpSequence: 1 }, 100)?.jumpSequence).toBe(1);
        expect(g.accept({ ...neutral(), sequence: 5, jumpSequence: 1 }, 120)?.jumpSequence).toBe(1);
    });
    it('validates join and ping without HTML interpretation', () => {
        expect(parseControl({ type: 'join', version: 1, nickname: '  Ada  ' })).toEqual({
            type: 'join',
            version: 1,
            nickname: 'Ada'
        });
        expect(parseControl({ type: 'join', version: 1, nickname: 'x'.repeat(21) })).toBeNull();
        expect(parseControl({ type: 'ping', at: Infinity })).toBeNull();
    });
});
describe('lobby and race rules', () => {
    it('rejects versions, full room, late joins', () => {
        expect(admission(2, 1, 'lobby')).toContain('Version');
        expect(admission(1, 8, 'lobby')).toContain('full');
        expect(admission(1, 1, 'racing')).toContain('started');
        expect(admission(1, 7, 'lobby')).toBeNull();
    });
    it('requires ordered lifecycle', () => {
        expect(canTransition('lobby', 'racing')).toBe(false);
        expect(canTransition('results', 'countdown')).toBe(false);
        expect(canTransition('results', 'lobby')).toBe(true);
    });
    it('rejects checkpoint skips, duplicates and fake finishes', () => {
        const p = player();
        expect(checkpoint(p, 2)).toBe(false);
        expect(finish(p, 1)).toBe(false);
        expect(checkpoint(p, 1)).toBe(true);
        expect(checkpoint(p, 1)).toBe(false);
        expect(checkpoint(p, 2)).toBe(true);
        expect(finish(p, 60)).toBe(true);
        expect(finish(p, 1)).toBe(false);
        expect(p.finish).toBe(60);
    });
    it('scores finishers by time and DNF by bounded host progress', () => {
        const a = player('a'),
            b = player('b'),
            c = player('c'),
            d = player('d');
        a.finish = 70;
        b.finish = 60;
        c.checkpoint = 1;
        c.progress = 80;
        d.progress = 39;
        expect(rank([d, a, c, b]).map((p) => p.id)).toEqual(['b', 'a', 'c', 'd']);
        d.z = -900;
        expect(boundedProgress(d)).toBe(40);
        c.z = -900;
        expect(boundedProgress(c)).toBe(85);
    });
    it('disconnect cannot claim checkpoint/finish', () => {
        const p = player();
        p.connected = false;
        expect(checkpoint(p, 1)).toBe(false);
        p.checkpoint = 2;
        expect(finish(p, 10)).toBe(false);
    });
    it('rematch clears all race fields', () => {
        const p = player();
        Object.assign(p, { checkpoint: 2, progress: 132, finish: 70, respawns: 6, vx: 8, vy: 8, vz: 8 });
        resetPlayer(p, 1);
        expect([p.checkpoint, p.progress, p.finish, p.respawns, p.vx, p.vy, p.vz]).toEqual([0, 0, null, 0, 0, 0, 0]);
    });
    it('rejects duplicated and reordered snapshots', () => {
        const gate = new SnapshotGate();
        const s = { tick: 8, sequence: 8 } as Snapshot;
        expect(gate.accept(s)).toBe(true);
        expect(gate.accept(s)).toBe(false);
        expect(gate.accept({ ...s, sequence: 9, paused: true })).toBe(true);
        expect(gate.accept({ tick: 4, sequence: 9 } as Snapshot)).toBe(false);
        expect(gate.accept({ tick: 9, sequence: 10 } as Snapshot)).toBe(true);
    });
});

it('does not award a finish after the active hard deadline', () => {
    const p = player();
    p.checkpoint = 2;
    for (const time of [-1, NaN, Infinity, 120.001]) expect(finish(p, time)).toBe(false);
    expect(p.finish).toBeNull();
    expect(finish(p, 120)).toBe(true);
});
