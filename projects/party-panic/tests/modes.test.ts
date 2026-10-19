import { describe, expect, it, vi } from 'vitest';
import { InputGate, SnapshotGate, VERSION, isSnapshot, neutral, parseControl, parseInput } from '../src/protocol';
import { Simulation } from '../src/simulation';
import type { Scene } from '../src/scene';

function simulation() {
    const characters = new Map();
    const setMode = vi.fn();
    const sim = new Simulation({
        characters,
        setMode,
        addPlayer: (p: { id: string }) =>
            characters.set(p.id, {
                rigidbody: { teleport: vi.fn(), linearVelocity: null, angularVelocity: null }
            }),
        removePlayer: (id: string) => characters.delete(id)
    } as unknown as Scene);
    sim.add('host', 'Host');
    sim.add('guest', 'Guest');
    return { sim, setMode };
}

describe('two-mode protocol boundaries', () => {
    it('parses explicit race/shooter inputs and rejects old protocol versions', () => {
        expect(parseInput(neutral())).toEqual(neutral());
        const shooter = neutral('laser-tag', 4);
        expect(parseInput(shooter)).toEqual(shooter);
        expect(parseInput({ ...neutral(), version: VERSION - 1 })).toBeNull();
        expect(parseInput({ ...neutral(), version: VERSION + 1 })).toBeNull();
        expect(parseInput({ ...neutral(), modeId: 'third-game' })).toBeNull();
        expect(parseInput({ ...neutral(), aim: { yaw: 0, pitch: 0, fire: true, sequence: 1 } })).toBeNull();
        expect(parseInput({ ...neutral(), modeId: 'laser-tag' })).toBeNull();
    });

    it('rejects malformed or out-of-bounds aim and fabricated authority', () => {
        const aim = { yaw: 0, pitch: 0, fire: true, sequence: 1, weapon: 'quick' };
        for (const invalid of [
            null,
            { ...aim, yaw: NaN },
            { ...aim, yaw: Infinity },
            { ...aim, yaw: Math.PI + 0.01 },
            { ...aim, yaw: -Math.PI - 0.01 },
            { ...aim, pitch: 0.81 },
            { ...aim, pitch: -0.81 },
            { ...aim, fire: 1 },
            { ...aim, sequence: -1 },
            { ...aim, sequence: 0.5 },
            { ...aim, targetId: 'victim' }
        ])
            expect(parseInput({ ...neutral('laser-tag'), aim: invalid })).toBeNull();
        expect(parseInput({ ...neutral('laser-tag'), score: 100 })).toBeNull();
        expect(parseInput({ ...neutral('laser-tag'), hit: 'victim' })).toBeNull();
        expect(parseInput({ ...neutral('laser-tag'), aim: { ...aim, yaw: Math.PI, pitch: -0.8 } })).not.toBeNull();
    });

    it('rejects wrong mode and round without poisoning the accepted input sequence', () => {
        const gate = new InputGate();
        expect(gate.accept({ ...neutral('laser-tag', 3), sequence: 1 }, 1000, 'laser-tag', 3)).not.toBeNull();
        expect(gate.accept({ ...neutral('obstacle-dash', 3), sequence: 99 }, 1001, 'laser-tag', 3)).toBeNull();
        expect(gate.accept({ ...neutral('laser-tag', 2), sequence: 99 }, 1002, 'laser-tag', 3)).toBeNull();
        expect(gate.accept({ ...neutral('laser-tag', 3), sequence: 2 }, 1003, 'laser-tag', 3)).not.toBeNull();
        expect(gate.accept({ ...neutral('laser-tag', 3), sequence: 2 }, 1004, 'laser-tag', 3)).toBeNull();
    });

    it('keeps snapshots isolated by version, round and mode, and resets on a new session', () => {
        const { sim } = simulation();
        const snapshot = { ...sim.state, sequence: 1, tick: 1, roundId: 2 };
        expect(isSnapshot(snapshot)).toBe(true);
        expect(isSnapshot({ ...snapshot, version: VERSION - 1 })).toBe(false);
        expect(isSnapshot({ ...snapshot, modeId: 'third-game' })).toBe(false);
        const gate = new SnapshotGate();
        expect(gate.accept(snapshot)).toBe(true);
        expect(gate.accept({ ...snapshot, sequence: 100, roundId: 1 })).toBe(false);
        expect(gate.accept({ ...snapshot, sequence: 100, modeId: 'laser-tag' })).toBe(false);
        expect(gate.accept({ ...snapshot, sequence: 2, tick: 2 })).toBe(true);
        expect(gate.accept({ ...snapshot, sequence: 3, tick: 3, roundId: 3, modeId: 'laser-tag' })).toBe(true);
        expect(gate.accept({ ...snapshot, sequence: 4, tick: 4 })).toBe(false);
        gate.reset();
        expect(gate.accept({ ...snapshot, sequence: 0, tick: 0, roundId: 0 })).toBe(true);
    });

    it('requires mode-aware ready packets with exact fields', () => {
        expect(parseControl({ type: 'ready', modeId: 'laser-tag', roundId: 7 })).toEqual({
            type: 'ready',
            modeId: 'laser-tag',
            roundId: 7
        });
        expect(parseControl({ type: 'ready', roundId: 7 })).toBeNull();
        expect(parseControl({ type: 'ready', modeId: 'laser-tag', roundId: 7, playerId: 'host' })).toBeNull();
    });
});

describe('authoritative lobby mode selection', () => {
    it('changes the epoch and clears readiness and mode-specific input', () => {
        const { sim, setMode } = simulation();
        sim.ready('host', 0);
        sim.ready('guest', 0);
        sim.input('guest', { ...neutral(), sequence: 5, axes: [1, 0], jumpSequence: 3 });
        expect(sim.selectMode('laser-tag')).toBe(true);
        expect(setMode).toHaveBeenCalledExactlyOnceWith('laser-tag');
        expect(sim.state.modeId).toBe('laser-tag');
        expect(sim.state.roundId).toBe(1);
        expect(sim.state.players.every((p) => !p.ready)).toBe(true);
        expect(sim.motions.get('guest')!.input).toEqual(neutral('laser-tag', 1));
        expect(sim.ready('guest', 0, 'obstacle-dash')).toBe(false);
        expect(sim.ready('guest', 1, 'obstacle-dash')).toBe(false);
        sim.input('guest', { ...neutral('obstacle-dash', 1), sequence: 100 });
        sim.input('guest', { ...neutral('laser-tag', 0), sequence: 100 });
        expect(sim.motions.get('guest')!.input.sequence).toBe(0);
        sim.start();
        expect(sim.state.phase).toBe('lobby');
    });

    it('ignores redundant selection and refuses changes during a round or results', () => {
        const { sim, setMode } = simulation();
        sim.ready('host', 0);
        sim.ready('guest', 0);
        expect(sim.selectMode('obstacle-dash')).toBe(true);
        expect(sim.state.roundId).toBe(0);
        expect(sim.state.players.every((p) => p.ready)).toBe(true);
        sim.start();
        for (const phase of ['countdown', 'racing', 'results'] as const) {
            if (sim.state.phase !== phase) sim.transition(phase);
            expect(sim.selectMode('laser-tag')).toBe(false);
            expect(sim.state.modeId).toBe('obstacle-dash');
        }
        expect(setMode).not.toHaveBeenCalled();
        sim.rematch();
        expect(sim.selectMode('laser-tag')).toBe(true);
        expect(sim.state.phase).toBe('lobby');
    });
});
