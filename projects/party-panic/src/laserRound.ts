import { WEAPONS, weaponAim } from './weapons';
import { Vec3 } from 'playcanvas';
import { LASER, LASER_SPAWNS, ShotGate, chooseSpawn, getAimRig, resolveShot } from './laser';
import type { Input, Player, Snapshot } from './protocol';
import type { Scene } from './scene';

/** Laser-only authoritative rules. Session identity, clock and transport stay in Simulation. */
export class LaserRound {
    private shots = new Map<string, ShotGate>();
    onEvent: (type: string, payload: unknown) => void = () => {};
    reset() {
        this.shots.clear();
    }
    prepare(p: Player, index: number) {
        Object.assign(p, LASER_SPAWNS[index % LASER_SPAWNS.length]);
        p.yaw = p.z > 0 ? 0 : 180;
        p.protectedUntil = LASER.spawnProtection;
        p.health = 100;
        p.energy = 1;
        p.weapon = 'quick';
        p.charge = 0;
    }
    beforeStep(state: Snapshot, scene: Scene) {
        if (state.modeId !== 'laser-tag' || state.phase !== 'racing' || state.paused) return;
        for (const p of state.players) {
            if (!p.connected || !p.respawnAt || state.elapsed < p.respawnAt) continue;
            const spawn = chooseSpawn(
                state.players.filter((q) => q.id !== p.id),
                state.elapsed,
                p.respawns
            );
            Object.assign(p, spawn, {
                vx: 0,
                vy: 0,
                vz: 0,
                respawnAt: 0,
                health: 100,
                energy: 1,
                charge: 0,
                protectedUntil: state.elapsed + LASER.spawnProtection
            });
            p.respawns++;
            this.shots.get(p.id)?.respawn(state.elapsed);
            const entity = scene.characters.get(p.id)!;
            entity.enabled = true;
            entity.rigidbody!.teleport(p.x, p.y, p.z);
            entity.rigidbody!.linearVelocity = Vec3.ZERO;
            this.onEvent('respawn', { id: p.id });
        }
    }
    afterStep(state: Snapshot, scene: Scene, inputs: Map<string, { input: Input; received: number }>) {
        if (state.modeId !== 'laser-tag' || state.phase !== 'racing' || state.paused) return;
        for (const p of state.players) {
            const motion = inputs.get(p.id);
            const input = motion?.input;
            let gate = this.shots.get(p.id);
            if (!gate) {
                gate = new ShotGate();
                this.shots.set(p.id, gate);
            }
            const fresh =
                !!input &&
                input.modeId === 'laser-tag' &&
                input.roundId === state.roundId &&
                input.life === p.respawns &&
                performance.now() - motion!.received < 400;
            const weapon = input?.modeId === 'laser-tag' ? input.aim.weapon : p.weapon;
            gate.advance(
                state.elapsed,
                weapon,
                fresh && input!.modeId === 'laser-tag' && input!.aim.fire && !p.respawnAt && p.connected
            );
            p.energy = gate.energy;
            p.charge = gate.charge;
            p.weapon = weapon;
            if ((p.respawnAt > 0 || !p.connected) && input?.modeId === 'laser-tag') gate.discard(input.aim.sequence);
            p.shotSequence = gate.sequence;
            if (
                !p.connected ||
                p.respawnAt > 0 ||
                !input ||
                input.modeId !== 'laser-tag' ||
                input.roundId !== state.roundId ||
                input.life !== p.respawns ||
                performance.now() - motion!.received >= 400
            )
                continue;
            p.yaw = (-input.aim.yaw * 180) / Math.PI;
            p.aimPitch = input.aim.pitch;
            scene.face(p.id, p.yaw);
            if (!input.aim.fire) continue;
            const accepted = gate.attempt(input.aim.sequence, state.elapsed, input.aim.yaw, input.aim.pitch, weapon);
            p.shotSequence = gate.sequence;
            if (!accepted) continue;
            p.energy = gate.energy;
            p.charge = gate.charge;
            const aim = weaponAim(input.aim.yaw, input.aim.pitch, input.aim.sequence, weapon);
            const rig = getAimRig(p, aim.yaw, aim.pitch);
            const shot = resolveShot({
                ...rig,
                yaw: aim.yaw,
                pitch: aim.pitch,
                shooterId: p.id,
                targets: state.players,
                now: state.elapsed
            });
            this.onEvent('shot', { id: p.id, sequence: input.aim.sequence, weapon, ...shot });
            if (!shot.targetId) continue;
            const target = state.players.find((q) => q.id === shot.targetId)!;
            // Defensive checks keep one tag even when several shooters act this tick.
            if (!target.connected || target.respawnAt > 0 || target.protectedUntil > state.elapsed) continue;
            target.health = Math.max(0, target.health - WEAPONS[weapon].damage);
            this.onEvent('damage', {
                shooterId: p.id,
                targetId: target.id,
                health: target.health,
                damage: WEAPONS[weapon].damage,
                sequence: input.aim.sequence,
                eliminated: target.health === 0
            });
            if (target.health > 0) continue;
            p.score++;
            target.deaths++;
            target.respawnAt = state.elapsed + LASER.respawnDelay;
            target.vx = target.vy = target.vz = 0;
            const entity = scene.characters.get(target.id)!;
            entity.rigidbody!.linearVelocity = Vec3.ZERO;
            entity.enabled = false;
            this.onEvent('tag', { shooterId: p.id, targetId: target.id });
        }
    }
}
