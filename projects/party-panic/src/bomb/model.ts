/** Port of statist32/bomberman_multiplayer @20750b9 (MIT, copyright 2020 statist32).
 * Layered board/entity architecture retained. Timers and explosions are host ticks.
 * Original license ships at /party-panic/bomb/LICENSE.txt. */
export const BOMB = { fuse: 90, flame: 30, range: 2, move: 9, duration: 90 } as const;
export const DIRECTIONS = [
    [0, -1],
    [-1, 0],
    [0, 1],
    [1, 0]
] as const;
export type ArenaState = {
    width: number;
    height: number;
    tick: number;
    seed: number;
    tiles: number[];
    bombs: { id: number; x: number; z: number; at: number; owner: string }[];
    flames: { x: number; z: number; until: number }[];
    ended: boolean;
    winner: string | null;
};
export class Entity {
    board: Board;
    row: number;
    column: number;
    constructor(board: Board, row: number, column: number) {
        this.board = board;
        this.row = row;
        this.column = column;
        this.addToBoard();
    }
    addToBoard() {
        this.board.board[this.row][this.column].push(this);
    }
    removeFromBoard() {
        this.board.board[this.row][this.column] = this.board.board[this.row][this.column].filter((e) => e !== this);
    }
    isValidPosition(row: number, column: number) {
        return this.board.board[row]?.[column] !== undefined;
    }
}
export class Obstacle extends Entity {}
export class Block extends Obstacle {
    breakable: boolean;
    constructor(board: Board, row: number, column: number, breakable = false) {
        super(board, row, column);
        this.breakable = breakable;
    }
    break() {
        if (this.breakable) this.removeFromBoard();
    }
}
export class Fire extends Entity {
    until: number;
    constructor(board: Board, row: number, column: number) {
        super(board, row, column);
        this.until = board.tick + BOMB.flame;
    }
}
export class Bomb extends Obstacle {
    id: number;
    owner: string;
    at: number;
    detonated = false;
    range = BOMB.range;
    constructor(board: Board, row: number, column: number, owner: string) {
        super(board, row, column);
        this.id = ++board.serial;
        this.owner = owner;
        this.at = board.tick + BOMB.fuse;
    }
    /** Queued, idempotent detonation prevents recursive cycles and mutation while walking a tile. */
    explode(queue: Bomb[]) {
        if (this.detonated) return;
        this.detonated = true;
        this.removeFromBoard();
        this.burn(this.row, this.column, queue);
        for (const [dx, dz] of DIRECTIONS) {
            for (let distance = 1; distance <= this.range; distance++) {
                const row = this.row + dz * distance,
                    column = this.column + dx * distance;
                if (!this.isValidPosition(row, column)) break;
                const blocks = this.board.board[row][column].filter((e): e is Block => e instanceof Block);
                if (blocks.some((e) => !e.breakable)) break;
                this.burn(row, column, queue);
                if (blocks.length) break;
            }
        }
    }
    private burn(row: number, column: number, queue: Bomb[]) {
        for (const entity of [...this.board.board[row][column]]) {
            if (entity instanceof Block) entity.break();
            else if (entity instanceof Bomb && !entity.detonated) queue.push(entity);
            else if (entity instanceof Character) entity.die();
        }
        const fire = this.board.board[row][column].find((e): e is Fire => e instanceof Fire);
        if (fire) fire.until = this.board.tick + BOMB.flame;
        else new Fire(this.board, row, column);
    }
}
export class Character extends Obstacle {
    id: string;
    isAlive = true;
    moveAt = 0;
    bombSeen = 0;
    plantAt = 0;
    constructor(board: Board, row: number, column: number, id: string) {
        super(board, row, column);
        this.id = id;
    }
    canMove(row: number, column: number) {
        if (!this.isValidPosition(row, column)) return false;
        const tile = this.board.board[row][column];
        if (tile.some((e) => e instanceof Obstacle)) return false;
        if (tile.some((e) => e instanceof Fire)) {
            this.die();
            return false;
        }
        return true;
    }
    move(dx: number, dz: number) {
        if (!this.isAlive || this.board.tick < this.moveAt || (!dx && !dz)) return;
        this.moveAt = this.board.tick + BOMB.move;
        if (this.canMove(this.row + dz, this.column + dx)) {
            this.removeFromBoard();
            this.row += dz;
            this.column += dx;
            this.addToBoard();
        }
    }
    die() {
        if (this.isAlive) {
            this.removeFromBoard();
            this.isAlive = false;
        }
    }
    plantBomb(sequence: number) {
        if (sequence <= this.bombSeen) return;
        this.bombSeen = sequence;
        if (
            !this.isAlive ||
            this.board.tick < this.plantAt ||
            this.board.bombs().length >= 128 ||
            this.board.board[this.row][this.column].some((e) => e instanceof Bomb || e instanceof Fire)
        )
            return;
        this.plantAt = this.board.tick + BOMB.move;
        new Bomb(this.board, this.row, this.column, this.id);
    }
}
export class Board {
    rows: number;
    columns: number;
    board: Entity[][][];
    tick = 0;
    serial = 0;
    seed: number;
    players = new Map<string, Character>();
    ended = false;
    winner: string | null = null;
    constructor(ids: string[], seed = 0) {
        this.rows = ids.length > 4 ? 11 : 9;
        this.columns = ids.length > 4 ? 17 : 13;
        this.seed = seed;
        this.board = Array.from({ length: this.rows }, () => Array.from({ length: this.columns }, () => []));
        const h = this.rows - 2,
            w = this.columns - 2;
        const spawns = [
            [1, 1],
            [w, h],
            [w, 1],
            [1, h],
            [(w + 1) / 2, 1],
            [(w + 1) / 2, h],
            [1, (h + 1) / 2],
            [w, (h + 1) / 2]
        ];
        for (let row = 0; row < this.rows; row++)
            for (let column = 0; column < this.columns; column++) {
                if (!row || !column || row === this.rows - 1 || column === this.columns - 1)
                    new Block(this, row, column);
                else if (row % 2 === 0 && column % 2 === 0) new Block(this, row, column);
                else if (
                    row > 1 &&
                    column > 1 &&
                    row < h &&
                    column < w &&
                    !spawns.slice(0, ids.length).some(([x, z]) => Math.abs(x - column) + Math.abs(z - row) <= 2)
                )
                    new Block(this, row, column, true);
            }
        ids.forEach((id, i) => {
            const [x, z] = spawns[i];
            this.players.set(id, new Character(this, z, x, id));
        });
    }
    entities() {
        return this.board.flat(2);
    }
    bombs() {
        return this.entities().filter((e): e is Bomb => e instanceof Bomb);
    }
    update(
        inputs: Map<string, { axes: [number, number]; bombSequence: number }>,
        connected: Set<string>,
        practice: boolean
    ) {
        if (this.ended) return;
        this.tick++;
        for (const e of this.entities()) if (e instanceof Fire && e.until <= this.tick) e.removeFromBoard();
        // Stable participant order, one cardinal step and one edge action per tick.
        for (const p of this.players.values()) {
            if (!connected.has(p.id)) p.die();
            if (!p.isAlive) continue;
            if (this.board[p.row][p.column].some((e) => e instanceof Fire)) {
                p.die();
                continue;
            }
            const input = inputs.get(p.id);
            if (!input) continue;
            p.plantBomb(input.bombSequence);
            const [x, z] = input.axes;
            if (Math.max(Math.abs(x), Math.abs(z)) >= 0.35)
                p.move(Math.abs(x) > Math.abs(z) ? Math.sign(x) : 0, Math.abs(x) > Math.abs(z) ? 0 : Math.sign(z));
        }
        const queue = this.bombs()
            .filter((b) => b.at <= this.tick)
            .sort((a, b) => a.id - b.id);
        for (let i = 0; i < queue.length; i++) queue[i].explode(queue);
        const alive = [...this.players.values()].filter((p) => p.isAlive);
        if ((!practice && alive.length <= 1) || (practice && !alive.length) || this.tick >= BOMB.duration * 60) {
            this.ended = true;
            this.winner = !practice && alive.length === 1 ? alive[0].id : null;
        }
    }
    convertToSendFormat(): ArenaState {
        const entities = this.entities();
        return {
            width: this.columns,
            height: this.rows,
            tick: this.tick,
            seed: this.seed,
            tiles: this.board.flat().map((t) => {
                const b = t.find((e): e is Block => e instanceof Block);
                return b ? (b.breakable ? 2 : 3) : 0;
            }),
            bombs: entities
                .filter((e): e is Bomb => e instanceof Bomb)
                .map((b) => ({ id: b.id, x: b.column, z: b.row, at: b.at, owner: b.owner })),
            flames: entities
                .filter((e): e is Fire => e instanceof Fire)
                .map((f) => ({ x: f.column, z: f.row, until: f.until })),
            ended: this.ended,
            winner: this.winner
        };
    }
}
/** Conservative blast prediction includes queued chain bombs and current fire. */
export function danger(arena: ArenaState, extra?: { x: number; z: number }) {
    const cells = new Set(arena.flames.map((f) => f.z * arena.width + f.x));
    for (const bomb of [...arena.bombs, ...(extra ? [extra] : [])]) {
        cells.add(bomb.z * arena.width + bomb.x);
        for (const [dx, dz] of DIRECTIONS)
            for (let d = 1; d <= BOMB.range; d++) {
                const x = bomb.x + dx * d,
                    z = bomb.z + dz * d;
                if (x < 0 || z < 0 || x >= arena.width || z >= arena.height) break;
                const key = z * arena.width + x,
                    tile = arena.tiles[key];
                if (tile === 3) break;
                cells.add(key);
                if (tile === 2) break;
            }
    }
    return cells;
}
