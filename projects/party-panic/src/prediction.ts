import type { Player } from './protocol';

/** Cosmetic jump response only. Host capsules, checkpoints and results never use this. */
export class JumpFeedback {
    private sequence = 0;
    private launchedAt = -Infinity;
    private origin = 0;
    private active = false;
    private respawns = -1;

    reset(sequence = 0) {
        this.sequence = sequence;
        this.launchedAt = -Infinity;
        this.active = false;
        this.respawns = -1;
    }

    seed(p: Player, sequence: number) {
        this.reset(sequence);
        this.respawns = p.respawns;
    }

    sample(p: Player, sequence: number, now: number): number | null {
        if (this.respawns !== p.respawns) {
            this.reset(sequence);
            this.respawns = p.respawns;
            return null;
        }
        if (sequence > this.sequence) {
            this.sequence = sequence;
            // The race decks share a floor height. Never predict a second airborne jump
            // from a repeated or delayed edge, even while a grounded snapshot is stale.
            if (now - this.launchedAt > 850 && Math.abs(p.y - 0.75) < 0.14 && Math.abs(p.vy) < 0.5) {
                this.launchedAt = now;
                this.origin = p.y;
                this.active = true;
            }
        }
        const age = (now - this.launchedAt) / 1000;
        if (age > 0.25 || p.vy > 1 || p.y < 0.55) this.active = false;
        return this.active ? this.origin + 7.5 * age - 9 * age * age : null;
    }
}

/** Continue vertical motion during reconciliation; never dip during a confirmed ascent. */
export function reconcileHeight(current: number, target: number, velocity: number, dt: number) {
    const next = current + velocity * dt + (target - current) * (1 - Math.exp(-dt * 12));
    return velocity > 1 ? Math.max(current, next) : next;
}
