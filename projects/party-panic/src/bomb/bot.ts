import { danger, DIRECTIONS, type ArenaState } from './model';
import type { Player } from '../protocol';
/** Bounded breadth-first search; returns ordinary movement/edge input only. */
export function bombDecision(p: Player, players: Player[], arena: ArenaState) {
    const w = arena.width,
        start = p.z * w + p.x,
        bombs = new Set(arena.bombs.map((b) => b.z * w + b.x));
    const occupied = new Set(
        players.filter((q) => q.id !== p.id && q.connected && q.health > 0).map((q) => q.z * w + q.x)
    );
    const search = (unsafe: Set<number>, escape: boolean) => {
        const queue = [{ key: start, first: [0, 0] as [number, number], depth: 0 }],
            seen = new Set([start]);
        let best = queue[0],
            score = -Infinity;
        for (let head = 0; head < queue.length; head++) {
            const node = queue[head],
                x = node.key % w,
                z = Math.floor(node.key / w);
            if (node.depth > 9) continue;
            if (node.depth && !unsafe.has(node.key)) {
                if (escape) return node.first;
                const crate = DIRECTIONS.some(([dx, dz]) => arena.tiles[(z + dz) * w + x + dx] === 2);
                const distance = Math.min(
                    ...players
                        .filter((q) => q.id !== p.id && q.health > 0 && q.connected)
                        .map((q) => Math.abs(q.x - x) + Math.abs(q.z - z)),
                    30
                );
                const value = (crate ? 12 : 0) - distance * 0.5 - node.depth * 0.2;
                if (value > score) {
                    score = value;
                    best = node;
                }
            }
            for (const [dx, dz] of DIRECTIONS) {
                const nx = x + dx,
                    nz = z + dz,
                    key = nz * w + nx;
                if (
                    nx < 1 ||
                    nz < 1 ||
                    nx >= w - 1 ||
                    nz >= arena.height - 1 ||
                    seen.has(key) ||
                    arena.tiles[key] ||
                    bombs.has(key) ||
                    occupied.has(key)
                )
                    continue;
                // May leave an endangered tile, but never route through existing fire.
                if (arena.flames.some((f) => f.x === nx && f.z === nz)) continue;
                seen.add(key);
                queue.push({ key, first: node.depth ? node.first : [dx, dz], depth: node.depth + 1 });
            }
        }
        return escape ? null : best.first;
    };
    const unsafe = danger(arena);
    if (unsafe.has(start)) return { axes: search(unsafe, true) ?? ([0, 0] as [number, number]), plant: false };
    const target =
        DIRECTIONS.some(([dx, dz]) => arena.tiles[(p.z + dz) * w + p.x + dx] === 2) ||
        players.some(
            (q) => q.id !== p.id && q.health > 0 && q.connected && Math.abs(q.x - p.x) + Math.abs(q.z - p.z) <= 2
        );
    if (target && !bombs.has(start)) {
        const escape = search(danger(arena, { x: p.x, z: p.z }), true);
        if (escape) return { axes: escape, plant: true };
    }
    return { axes: search(unsafe, false) ?? ([0, 0] as [number, number]), plant: false };
}
