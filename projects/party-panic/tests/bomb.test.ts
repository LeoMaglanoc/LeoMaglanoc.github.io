import { describe, expect, it } from 'vitest';
import { Board, Bomb, Fire, Block, BOMB } from '../src/bomb/model';
import { bombDecision } from '../src/bomb/bot';
import { InputGate, isArena, neutral, parseInput } from '../src/protocol';
const empty = (ids = ['a', 'b']) => {
    const b = new Board(ids, 42);
    for (const e of b.entities()) if (e instanceof Block && e.breakable) e.removeFromBoard();
    return b;
};
const connected = (b: Board) => new Set(b.players.keys());
const step = (b: Board, n = 1) => {
    for (let i = 0; i < n; i++) b.update(new Map(), connected(b), b.players.size === 1);
};
const place = (b: Board, id: string, x: number, z: number) => {
    const p = b.players.get(id)!;
    p.removeFromBoard();
    p.column = x;
    p.row = z;
    p.addToBoard();
    return p;
};
describe('ported deterministic Bomb Arena', () => {
    it('makes reproducible compact maps with distinct safe spawns and connected floor after crate removal', () => {
        for (const n of [1, 2, 4, 8]) {
            const ids = Array.from({ length: n }, (_, i) => String(i)),
                a = new Board(ids, 17),
                b = new Board(ids, 17);
            expect(a.convertToSendFormat()).toEqual(b.convertToSendFormat());
            expect(new Set([...a.players.values()].map((p) => p.row * a.columns + p.column)).size).toBe(n);
            for (const p of a.players.values())
                expect(a.board[p.row][p.column].filter((e) => e instanceof Block)).toHaveLength(0);
            const floors = a.convertToSendFormat().tiles,
                seen = new Set([a.columns + 1]),
                queue = [a.columns + 1];
            for (let i = 0; i < queue.length; i++)
                for (const d of [-1, 1, -a.columns, a.columns]) {
                    const k = queue[i] + d;
                    if (k >= 0 && k < floors.length && floors[k] !== 3 && !seen.has(k)) {
                        seen.add(k);
                        queue.push(k);
                    }
                }
            expect(seen.size).toBe(floors.filter((t) => t !== 3).length);
        }
    });
    it('moves cardinally, stops at walls and rate limits movement', () => {
        const b = empty(),
            p = b.players.get('a')!;
        p.move(-1, 0);
        expect(p.column).toBe(1);
        b.tick += 9;
        p.move(1, 0);
        expect(p.column).toBe(2);
        p.move(1, 0);
        expect(p.column).toBe(2);
        b.tick += 9;
        p.move(0, 1);
        expect(p.row).toBe(1);
    });
    it('plants once at the correct tile, consumes rejected edges, and permits escape but no reentry', () => {
        const b = empty(),
            p = b.players.get('a')!;
        p.plantBomb(1);
        p.plantBomb(1);
        p.plantBomb(2);
        expect(b.bombs()).toHaveLength(1);
        expect(b.bombs()[0].column).toBe(1);
        p.move(1, 0);
        b.tick += 9;
        p.move(-1, 0);
        expect(p.column).toBe(2);
        p.plantBomb(2);
        expect(b.bombs()).toHaveLength(1);
    });
    it('detonates at tick 90 with four rays and 30-tick flames', () => {
        const b = empty(),
            p = place(b, 'a', 3, 3);
        p.plantBomb(1);
        place(b, 'a', 1, 1);
        step(b, 89);
        expect(b.bombs()).toHaveLength(1);
        step(b);
        expect(b.bombs()).toHaveLength(0);
        for (const [x, z] of [
            [3, 3],
            [1, 3],
            [5, 3],
            [3, 1],
            [3, 5]
        ])
            expect(b.board[z][x].some((e) => e instanceof Fire)).toBe(true);
        step(b, 29);
        expect(b.convertToSendFormat().flames.length).toBeGreaterThan(0);
        step(b);
        expect(b.convertToSendFormat().flames).toHaveLength(0);
    });
    it('solid blocks stop fire and the first breakable is destroyed but stops its ray', () => {
        const b = empty();
        new Bomb(b, 3, 3, 'a');
        new Block(b, 3, 4, true);
        new Block(b, 2, 3, false);
        step(b, 90);
        expect(b.board[3][4].some((e) => e instanceof Block)).toBe(false);
        expect(b.board[3][4].some((e) => e instanceof Fire)).toBe(true);
        expect(b.board[3][5].some((e) => e instanceof Fire)).toBe(false);
        expect(b.board[2][3].some((e) => e instanceof Fire)).toBe(false);
    });
    it('chains exactly once and handles simultaneous overlapping explosions', () => {
        const b = empty();
        const a = new Bomb(b, 3, 3, 'a');
        const c = new Bomb(b, 3, 5, 'b');
        c.at = 120;
        step(b, 90);
        expect(a.detonated && c.detonated).toBe(true);
        expect(b.bombs()).toHaveLength(0);
        expect(new Set(b.convertToSendFormat().flames.map((f) => f.z * b.columns + f.x)).size).toBe(
            b.convertToSendFormat().flames.length
        );
    });
    it('eliminates all center-tile occupants, draws on simultaneous deaths and ignores dead actions', () => {
        const b = empty();
        place(b, 'a', 3, 3);
        place(b, 'b', 5, 3);
        new Bomb(b, 3, 3, 'a');
        step(b, 90);
        expect(b.ended).toBe(true);
        expect(b.winner).toBeNull();
        const p = b.players.get('a')!;
        p.move(1, 0);
        p.plantBomb(20);
        expect(p.column).toBe(3);
        expect(b.bombs()).toHaveLength(0);
    });
    it('gives one survivor the win, handles disconnects, and preserves zero-bot practice', () => {
        const b = empty();
        b.players.get('a')!.die();
        step(b);
        expect(b.winner).toBe('b');
        const c = empty();
        c.update(new Map(), new Set(['a']), false);
        expect(c.winner).toBe('a');
        const p = empty(['a']);
        step(p, 100);
        expect(p.ended).toBe(false);
        step(p, 5300);
        expect(p.ended).toBe(true);
        expect(p.winner).toBeNull();
    });
    it('kills on existing fire contact and never crosses an occupied bomb', () => {
        const b = empty();
        const p = place(b, 'a', 3, 3);
        new Fire(b, 3, 4);
        p.move(1, 0);
        expect(p.isAlive).toBe(false);
    });
    it('replays a recorded event schedule to exactly the same terminal state', () => {
        const schedule = [
            { tick: 1, id: 'a', axes: [1, 0] as [number, number], bombSequence: 1 },
            { tick: 10, id: 'a', axes: [0, 1] as [number, number], bombSequence: 1 },
            { tick: 20, id: 'b', axes: [-1, 0] as [number, number], bombSequence: 1 }
        ];
        const replay = () => {
            const b = new Board(['a', 'b'], 23),
                inputs = new Map();
            for (let t = 1; t <= 5400 && !b.ended; t++) {
                for (const e of schedule) if (e.tick === t) inputs.set(e.id, e);
                b.update(inputs, connected(b), false);
            }
            return b.convertToSendFormat();
        };
        expect(replay()).toEqual(replay());
        expect(replay().ended).toBe(true);
    });
    it('validates mode-specific wire state and rejects forged/stale/reordered inputs', () => {
        const i = neutral('bomb-arena', 3);
        expect(parseInput(i)).toEqual(i);
        expect(parseInput({ ...i, bombSequence: -1 })).toBeNull();
        expect(parseInput({ ...i, kills: ['b'] })).toBeNull();
        const gate = new InputGate();
        expect(gate.accept({ ...i, sequence: 2 }, 1000, 'bomb-arena', 3)).not.toBeNull();
        expect(gate.accept({ ...i, sequence: 1 }, 1001, 'bomb-arena', 3)).toBeNull();
        expect(gate.accept({ ...i, sequence: 4, roundId: 2 }, 1002, 'bomb-arena', 3)).toBeNull();
        const state = new Board(['a', 'b']).convertToSendFormat();
        expect(isArena(state)).toBe(true);
        expect(isArena({ ...state, bombs: [{ id: 1, x: -1, z: 2, at: 20, owner: 'a' }] })).toBe(false);
        expect(isArena({ ...state, tiles: [0] })).toBe(false);
    });
    it('a fresh rematch has no bombs, flames or deaths', () => {
        const a = empty();
        a.players.get('a')!.plantBomb(1);
        const b = new Board(['a', 'b'], 3);
        expect(b.bombs()).toHaveLength(0);
        expect([...b.players.values()].every((p) => p.isAlive && p.bombSeen === 0)).toBe(true);
    });
    it('bots escape their predicted bomb lane instead of choosing certain suicide', () => {
        const b = empty(),
            p = { id: 'a', x: 1, z: 1, health: 100, connected: true } as never;
        new Bomb(b, 1, 1, 'a');
        const decision = bombDecision(p, [], b.convertToSendFormat());
        expect(decision.plant).toBe(false);
        expect(decision.axes).not.toEqual([0, 0]);
    });
    it('documents source timers', () => expect([BOMB.fuse, BOMB.flame, BOMB.range]).toEqual([90, 30, 2]));
});
