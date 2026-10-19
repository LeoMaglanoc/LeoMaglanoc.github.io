import { VERSION, type Phase, type Player } from './protocol';
export const COURSE = { checkpointZ: [-40, -85], finishZ: -132, timeout: 120, spawnZ: [3, -43, -88] };
export const MODE = { id: 'obstacle-dash', name: 'Obstacle Dash', minPlayers: 1, maxPlayers: 8 } as const;
export function canTransition(a: Phase, b: Phase) {
    return (
        (a === 'lobby' && b === 'countdown') ||
        (a === 'countdown' && b === 'racing') ||
        (a === 'racing' && b === 'results') ||
        (a === 'results' && b === 'lobby')
    );
}
export function admission(version: number, count: number, phase: Phase) {
    return version !== VERSION
        ? 'Version mismatch. Reload both devices.'
        : count >= 8
          ? 'Room full (8 players).'
          : phase !== 'lobby'
            ? 'Race already started. Join after the rematch.'
            : null;
}
export function checkpoint(p: Player, index: number) {
    if (index !== p.checkpoint + 1 || index > 2 || !p.connected || p.finish !== null) return false;
    p.checkpoint = index;
    return true;
}
export function finish(p: Player, elapsed: number) {
    if (!Number.isFinite(elapsed) || elapsed < 0 || elapsed > COURSE.timeout) return false;
    if (p.checkpoint !== 2 || p.finish !== null || !p.connected) return false;
    p.finish = elapsed;
    return true;
}
export function rank(players: Player[]) {
    return [...players].sort((a, b) =>
        a.finish !== null && b.finish !== null
            ? a.finish - b.finish || a.id.localeCompare(b.id)
            : a.finish !== null
              ? -1
              : b.finish !== null
                ? 1
                : b.checkpoint - a.checkpoint || b.progress - a.progress || a.id.localeCompare(b.id)
    );
}
export function boundedProgress(p: Player) {
    const min = [0, 40, 85][p.checkpoint] ?? 0;
    const max = [40, 85, 132][p.checkpoint] ?? 132;
    return Math.max(min, Math.min(max, -p.z));
}
export function resetPlayer(p: Player, index: number) {
    Object.assign(p, {
        ready: false,
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
        x: ((index % 4) - 1.5) * 1.3,
        y: 0.8,
        z: 3 + Math.floor(index / 4) * 1.6,
        vx: 0,
        vy: 0,
        vz: 0,
        yaw: 180,
        respawns: 0
    });
}
