import { expect, it, vi } from 'vitest';
import { Simulation } from '../src/simulation';
import type { Scene } from '../src/scene';

function simulation() {
    // Readiness uses the real session state; only the irrelevant renderer is stubbed.
    const characters = new Map();
    const scene = {
        characters,
        addPlayer: (player: { id: string }) =>
            characters.set(player.id, {
                rigidbody: { teleport: vi.fn(), linearVelocity: null, angularVelocity: null }
            }),
        removePlayer: (id: string) => characters.delete(id)
    } as unknown as Scene;
    const sim = new Simulation(scene);
    sim.add('host', 'Host');
    sim.add('guest', 'Guest');
    return sim;
}

it('rejects unknown, disconnected and previous-round readiness', () => {
    const sim = simulation();
    expect(sim.ready('unknown', 0)).toBe(false);
    expect(sim.ready('guest', 1)).toBe(false);
    expect(sim.state.players[1].ready).toBe(false);
    sim.state.players[1].connected = false;
    expect(sim.ready('guest', 0)).toBe(false);
});

it('requires all connected players to enter before the authoritative countdown', () => {
    const sim = simulation();
    sim.start();
    expect(sim.state.phase).toBe('lobby');
    expect(sim.ready('host', 0)).toBe(true);
    sim.start();
    expect(sim.state.phase).toBe('lobby');
    expect(sim.ready('guest', 0)).toBe(true);
    sim.start();
    expect(sim.state.phase).toBe('countdown');
    expect(sim.state.round).toBe(1);
    expect(sim.ready('guest', 0)).toBe(false);
});

it('resets readiness at rematch and refuses reused readiness from the last lobby', () => {
    const sim = simulation();
    sim.ready('host', 0);
    sim.ready('guest', 0);
    sim.start();
    sim.transition('racing');
    sim.transition('results');
    sim.rematch();
    expect(sim.state.phase).toBe('lobby');
    expect(sim.state.players.every((player) => !player.ready)).toBe(true);
    expect(sim.ready('guest', 0)).toBe(false);
    sim.start();
    expect(sim.state.phase).toBe('lobby');
});
