/** Small original host/client rules, adapted from Blockyard's energy/serial model.
 * See docs/assets.md and the retained MIT notice. No engine or backend code reused. */
export type WeaponId = 'quick' | 'charged';
export const WEAPONS = {
    quick: {
        name: 'Quick Blaster',
        cooldown: 0.25,
        damage: 34,
        cost: 0.22,
        recharge: 0.36,
        charge: 0,
        recoil: 1.1,
        spread: 0.006,
        color: '#75dfd1'
    },
    charged: {
        name: 'Charged Blaster',
        cooldown: 0.95,
        damage: 70,
        cost: 0.52,
        recharge: 0.36,
        charge: 0.28,
        recoil: 3,
        spread: 0.002,
        color: '#ffcc4a'
    }
} as const;
export const isWeapon = (value: unknown): value is WeaponId => value === 'quick' || value === 'charged';

/** One shared energy pool and cooldown across weapon switches. Rejected serials
 * are consumed immediately so a retransmission can never become a later shot. */
export class WeaponCycle {
    sequence = 0;
    energy = 1;
    lastShot = -Infinity;
    readyAt = -Infinity;
    charge = 0;
    private updatedAt: number | null = null;
    private chargingAt: number | null = null;
    private weapon: WeaponId = 'quick';
    advance(now: number, weapon: WeaponId, trigger: boolean) {
        if (!Number.isFinite(now) || now < 0 || (this.updatedAt !== null && now < this.updatedAt)) return;
        const dt = this.updatedAt === null ? 0 : now - this.updatedAt;
        this.updatedAt = now;
        this.energy = Math.min(1, this.energy + WEAPONS[weapon].recharge * dt);
        if (weapon !== this.weapon || !trigger) this.chargingAt = null;
        this.weapon = weapon;
        if (trigger && weapon === 'charged' && this.chargingAt === null) this.chargingAt = now;
        this.charge = this.chargingAt === null ? 0 : Math.min(1, (now - this.chargingAt) / WEAPONS.charged.charge);
    }
    canFire(now: number, weapon: WeaponId) {
        return (
            now + 1e-9 >= this.readyAt &&
            this.energy + 1e-9 >= WEAPONS[weapon].cost &&
            (weapon !== 'charged' || this.charge >= 1)
        );
    }
    spend(sequence: number, now: number, weapon: WeaponId) {
        this.sequence = sequence;
        this.energy = Math.max(0, this.energy - WEAPONS[weapon].cost);
        this.lastShot = now;
        this.readyAt = now + WEAPONS[weapon].cooldown;
        this.chargingAt = null;
        this.charge = 0;
    }
    attempt(sequence: number, now: number, weapon: WeaponId, valid = true) {
        if (!Number.isSafeInteger(sequence) || sequence <= this.sequence) return false;
        this.sequence = sequence;
        if (!Number.isFinite(now) || now < 0 || !valid || !this.canFire(now, weapon)) return false;
        this.spend(sequence, now, weapon);
        return true;
    }
}

/** Deterministic spread: the same bounded shot direction on shooter and host. */
export function weaponAim(yaw: number, pitch: number, sequence: number, weapon: WeaponId) {
    const spread = WEAPONS[weapon].spread;
    const offset = Math.sin(sequence * 127.1) * spread;
    return {
        yaw: Math.atan2(Math.sin(yaw + offset), Math.cos(yaw + offset)),
        pitch: Math.max(-0.8, Math.min(0.8, pitch + Math.cos(sequence * 311.7) * spread))
    };
}
