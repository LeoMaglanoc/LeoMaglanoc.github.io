/** Adapted from statist32 public/Draw.js, MIT copyright 2020 statist32. */
import type { Player } from '../protocol';
import type { ArenaState } from './model';
export class Draw {
    canvas: HTMLCanvasElement;
    ctx: CanvasRenderingContext2D;
    tileSize = 32;
    images: Record<string, HTMLImageElement> = {};
    cost = 0;
    error = '';
    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d')!;
    }
    async load() {
        await Promise.all(
            ['bomb', 'fire', 'character', 'block_hard', 'block_breakable'].map(async (name) => {
                const image = new Image(32, 32);
                image.src = import.meta.env.BASE_URL + 'bomb/sprites/' + name + '.png';
                await image.decode();
                this.images[name] = image;
            })
        );
    }
    clear() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
    sprite(name: string, x: number, z: number) {
        const image = this.images[name];
        if (image) this.ctx.drawImage(image, x * 32, z * 32, 32, 32);
    }
    bomb(x: number, z: number) {
        this.sprite('bomb', x, z);
    }
    fire(x: number, z: number) {
        this.sprite('fire', x, z);
    }
    player(x: number, z: number) {
        this.sprite('character', x, z);
    }
    block(x: number, z: number, breakable = false) {
        this.sprite(breakable ? 'block_breakable' : 'block_hard', x, z);
    }
    render(arena: ArenaState, players: Player[], localId: string) {
        const start = performance.now();
        const width = arena.width * 32,
            height = arena.height * 32;
        if (this.canvas.width !== width || this.canvas.height !== height) {
            this.canvas.width = width;
            this.canvas.height = height;
        }
        const ctx = this.ctx;
        ctx.imageSmoothingEnabled = false;
        this.clear();
        ctx.fillStyle = '#182837';
        ctx.fillRect(0, 0, width, height);
        for (let z = 0; z < arena.height; z++)
            for (let x = 0; x < arena.width; x++) {
                const tile = arena.tiles[z * arena.width + x];
                if (tile) this.block(x, z, tile === 2);
                else {
                    ctx.fillStyle = (x + z) % 2 ? '#253a42' : '#2b4249';
                    ctx.fillRect(x * 32, z * 32, 32, 32);
                }
            }
        for (const b of arena.bombs) {
            this.bomb(b.x, b.z);
            ctx.fillStyle = '#ffcc4a';
            ctx.fillRect(b.x * 32 + 4, b.z * 32 + 29, 24 * Math.max(0, (b.at - arena.tick) / 90), 2);
        }
        for (const f of arena.flames) this.fire(f.x, f.z);
        for (const p of players) {
            if (!p.connected || !p.health) continue;
            // Original sprite unchanged. External identity ring and short name distinguish participants.
            ctx.strokeStyle = p.color;
            ctx.lineWidth = p.id === localId ? 3 : 2;
            ctx.strokeRect(p.x * 32 + 2, p.z * 32 + 1, 28, 30);
            this.player(p.x, p.z);
            ctx.fillStyle = p.color;
            ctx.font = 'bold 8px monospace';
            ctx.textAlign = 'center';
            ctx.fillText(p.id === localId ? 'YOU' : p.name.slice(0, 5).toUpperCase(), p.x * 32 + 16, p.z * 32 + 8);
        }
        this.cost = performance.now() - start;
    }
}
