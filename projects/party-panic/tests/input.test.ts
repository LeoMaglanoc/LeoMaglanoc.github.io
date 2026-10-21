import { afterEach, describe, expect, it, vi } from 'vitest';
import { Controls } from '../src/input';

class Surface extends EventTarget {
    style = { transform: '' };
    captures = new Set<number>();
    matches() {
        return false;
    }
    getBoundingClientRect() {
        return { left: 0, top: 0, width: 100, height: 100 };
    }
    setPointerCapture(id: number) {
        this.captures.add(id);
    }
    hasPointerCapture(id: number) {
        return this.captures.has(id);
    }
    releasePointerCapture(id: number) {
        this.captures.delete(id);
    }
    requestPointerLock = vi.fn(() => Promise.reject(new Error('unsupported')));
}
function event(target: EventTarget, type: string, fields: Record<string, unknown> = {}) {
    target.dispatchEvent(Object.assign(new Event(type, { cancelable: true }), fields));
}
function fixture() {
    const surfaces = Object.fromEntries(
        ['joystick', 'knob', 'jump', 'dive', 'aim-zone', 'fire', 'application-canvas', 'bomb-button'].map((id) => [
            id,
            new Surface()
        ])
    );
    const document = Object.assign(new EventTarget(), {
        pointerLockElement: null as Surface | null,
        querySelector: (selector: string) => surfaces[selector.slice(1)]
    });
    const exitPointerLock = vi.fn(() => {
        document.pointerLockElement = null;
    });
    Object.assign(document, { exitPointerLock });
    const window = new EventTarget();
    vi.stubGlobal('window', window);
    vi.stubGlobal('document', document);
    let clock = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => clock);
    const controls = new Controls();
    const shot = vi.fn();
    controls.onShot = shot;
    return {
        exitPointerLock,
        controls,
        surfaces,
        document,
        window,
        shot,
        time: (now: number) => {
            clock = now;
        }
    };
}
const pointer = (pointerId: number, clientX = 50, clientY = 50, pointerType = 'touch') => ({
    pointerId,
    clientX,
    clientY,
    pointerType,
    button: 0
});
afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

describe('mode-specific controls', () => {
    it('releases pointer lock for results and rejects a late grant after disabling gameplay', () => {
        const { controls, document, surfaces, exitPointerLock } = fixture();
        controls.setContext('laser-tag', 1);
        document.pointerLockElement = surfaces['application-canvas'];
        controls.setContext('laser-tag', 1, false);
        expect(exitPointerLock).toHaveBeenCalledOnce();
        document.pointerLockElement = surfaces['application-canvas'];
        event(document, 'pointerlockchange');
        expect(exitPointerLock).toHaveBeenCalledTimes(2);
    });
    it('preserves a quick tap for network sampling without generating repeated shots', () => {
        const { controls, surfaces, shot, time } = fixture();
        controls.setContext('laser-tag', 1);
        event(surfaces.fire, 'pointerdown', pointer(2));
        event(surfaces.fire, 'pointerup', pointer(2));
        time(20);
        const tap = controls.sample();
        expect(tap.modeId === 'laser-tag' && tap.aim.fire).toBe(true);
        time(251);
        const released = controls.sample();
        expect(released.modeId === 'laser-tag' && released.aim.fire).toBe(false);
        expect(shot).toHaveBeenCalledExactlyOnceWith(1);
    });
    it('preserves normalized race movement and edge-triggered jumps', () => {
        const { controls, window, surfaces } = fixture();
        event(window, 'keydown', { code: 'KeyW' });
        event(window, 'keydown', { code: 'KeyD' });
        expect(Math.hypot(...controls.sample().axes)).toBeCloseTo(1);
        event(window, 'keydown', { code: 'Space' });
        event(window, 'keydown', { code: 'Space', repeat: true });
        expect(controls.value.jumpSequence).toBe(1);
        event(window, 'keyup', { code: 'Space' });
        event(window, 'keydown', { code: 'Space' });
        event(surfaces.jump, 'pointerdown', pointer(5));
        expect(controls.value.jumpSequence).toBe(3);
    });
    it('rotates shooter movement into world axes and prevents jumping', () => {
        const { controls, window, surfaces } = fixture();
        controls.setContext('laser-tag', 4);
        controls.aimYaw = Math.PI / 2;
        event(window, 'keydown', { code: 'KeyW' });
        const input = controls.sample();
        expect(input.axes[0]).toBeCloseTo(1);
        expect(input.axes[1]).toBeCloseTo(0);
        expect(input.modeId).toBe('laser-tag');
        expect(input.roundId).toBe(4);
        event(window, 'keydown', { code: 'Space' });
        event(surfaces.jump, 'pointerdown', pointer(3));
        expect(controls.sample().jumpSequence).toBe(0);
    });
    it('supports independent movement and aim-and-fire touch pointers at 3 Hz', () => {
        const { controls, surfaces, time, shot } = fixture();
        controls.setContext('laser-tag', 1);
        event(surfaces.joystick, 'pointerdown', pointer(1, 50, 15));
        event(surfaces.fire, 'pointerdown', pointer(2));
        expect(shot).toHaveBeenCalledExactlyOnceWith(1);
        event(surfaces.fire, 'pointermove', pointer(2, 100, 0));
        expect(controls.aimYaw).toBeCloseTo(0.2);
        expect(controls.aimPitch).toBeCloseTo(0.2);
        let input = controls.sample();
        expect(input.axes[1]).toBeLessThan(-0.9);
        expect(input.modeId === 'laser-tag' && input.aim.fire).toBe(true);
        time(249);
        controls.sample();
        expect(shot).toHaveBeenCalledTimes(1);
        time(251);
        input = controls.sample();
        expect(shot).toHaveBeenCalledTimes(2);
        expect(input.modeId === 'laser-tag' && input.aim.sequence).toBe(2);
        event(surfaces.fire, 'pointercancel', pointer(2));
        time(1000);
        input = controls.sample();
        expect(input.modeId === 'laser-tag' && input.aim.fire).toBe(false);
        expect(input.axes[1]).toBeLessThan(-0.9);
        event(surfaces.joystick, 'lostpointercapture', pointer(1));
        expect(controls.sample().axes).toEqual([0, 0]);
    });
    it('allows aim-only drag and bounds extreme angles', () => {
        const { controls, surfaces, shot } = fixture();
        controls.setContext('laser-tag', 1);
        event(surfaces['aim-zone'], 'pointerdown', pointer(2));
        event(surfaces['aim-zone'], 'pointermove', pointer(2, 50000, -50000));
        expect(Math.abs(controls.aimYaw)).toBeLessThanOrEqual(Math.PI);
        expect(controls.aimPitch).toBe(0.8);
        expect(shot).not.toHaveBeenCalled();
        controls.aimPitch = -100;
        controls.aimYaw = NaN;
        expect(controls.aimPitch).toBe(-0.8);
        expect(Number.isFinite(controls.aimYaw)).toBe(true);
    });
    it('requests desktop pointer lock in gameplay gesture and contains API refusal', async () => {
        const { controls, surfaces, document, shot, time } = fixture();
        controls.setContext('laser-tag', 2);
        event(surfaces['application-canvas'], 'pointerdown', pointer(1, 0, 0, 'mouse'));
        expect(surfaces['application-canvas'].requestPointerLock).toHaveBeenCalledOnce();
        expect(shot).toHaveBeenCalledOnce();
        await Promise.resolve();
        document.pointerLockElement = surfaces['application-canvas'];
        event(document, 'mousemove', { movementX: 100, movementY: -20 });
        expect(controls.aimYaw).toBeCloseTo(0.4);
        expect(controls.aimPitch).toBeCloseTo(0.08);
        event(surfaces['application-canvas'], 'lostpointercapture', pointer(1, 0, 0, 'mouse'));
        time(251);
        controls.sample();
        expect(shot).toHaveBeenCalledTimes(2);
        event(document, 'mouseup', { button: 0 });
        time(1000);
        controls.sample();
        expect(shot).toHaveBeenCalledTimes(2);
        event(surfaces['application-canvas'], 'pointerdown', pointer(2, 0, 0, 'mouse'));
        expect(shot).toHaveBeenCalledTimes(3);
    });
    it('never fires from disabled lobby controls or requests lock there', () => {
        const { controls, surfaces, window, shot } = fixture();
        controls.setContext('laser-tag', 0, false);
        event(surfaces['application-canvas'], 'pointerdown', pointer(1, 0, 0, 'mouse'));
        event(surfaces.fire, 'pointerdown', pointer(2));
        event(surfaces.joystick, 'pointerdown', pointer(3, 0, 0));
        event(window, 'keydown', { code: 'KeyW' });
        expect(controls.sample().axes).toEqual([0, 0]);
        expect(shot).not.toHaveBeenCalled();
        expect(surfaces['application-canvas'].requestPointerLock).not.toHaveBeenCalled();
    });
    it.each(['blur', 'visibilitychange', 'Escape', 'context'])('clears held movement/fire on %s', (reason) => {
        const { controls, surfaces, window, document, time, shot } = fixture();
        controls.setContext('laser-tag', 1);
        event(surfaces.joystick, 'pointerdown', pointer(1, 50, 0));
        event(surfaces.fire, 'pointerdown', pointer(2));
        if (reason === 'blur') event(window, 'blur');
        if (reason === 'visibilitychange') event(document, 'visibilitychange');
        if (reason === 'Escape') event(window, 'keydown', { code: 'Escape' });
        if (reason === 'context') controls.setContext('laser-tag', 2);
        time(1000);
        const input = controls.sample();
        expect(input.axes).toEqual([0, 0]);
        expect(input.modeId === 'laser-tag' && input.aim.fire).toBe(false);
        expect(shot).toHaveBeenCalledOnce();
        expect(surfaces.fire.captures.size).toBe(0);
        expect(surfaces.joystick.captures.size).toBe(0);
    });
});

it('jump duration and dive edges retain pointer ownership and clear on cancel', () => {
    const { controls, surfaces } = fixture();
    controls.setContext('obstacle-dash', 1);
    event(surfaces.jump, 'pointerdown', pointer(4));
    event(surfaces.jump, 'pointerdown', pointer(5));
    event(surfaces.dive, 'pointerdown', pointer(6));
    event(surfaces.dive, 'pointerdown', pointer(6));
    expect(controls.sample()).toMatchObject({ jumpHeld: true, jumpSequence: 1, diveSequence: 1 });
    event(surfaces.jump, 'pointercancel', pointer(5));
    expect(controls.sample().jumpHeld).toBe(true);
    event(surfaces.jump, 'pointercancel', pointer(4));
    expect(controls.sample().jumpHeld).toBe(false);
    controls.clear();
    expect(controls.sample().axes).toEqual([0, 0]);
});

it('charged preparation cancels on release and switching does not bypass shared cooldown', () => {
    const { controls, surfaces, shot, time } = fixture();
    controls.setContext('laser-tag', 1);
    controls.selectWeapon('charged');
    event(surfaces.fire, 'pointerdown', pointer(2));
    time(200);
    controls.sample();
    expect(shot).not.toHaveBeenCalled();
    event(surfaces.fire, 'pointercancel', pointer(2));
    controls.sample();
    time(1000);
    event(surfaces.fire, 'pointerdown', pointer(3));
    time(1331);
    controls.sample();
    expect(shot).toHaveBeenCalledOnce();
    controls.selectWeapon('quick');
    time(1400);
    controls.sample();
    expect(shot).toHaveBeenCalledOnce();
});

it('reconciles rejected-shot energy during a held burst and resets actions on a new life', () => {
    const { controls, surfaces, time, shot } = fixture();
    controls.setContext('laser-tag', 1);
    event(surfaces.fire, 'pointerdown', pointer(2));
    expect(shot).toHaveBeenCalledOnce();
    controls.syncEnergy(1, 1, 2); // host consumed/rejected the speculative shot
    expect(controls.energy).toBe(1);
    time(251);
    controls.sample();
    expect(shot).toHaveBeenCalledTimes(2);
    controls.syncEnergy(0.5, 1, 3); // one unacknowledged 0.22-energy shot
    expect(controls.energy).toBeCloseTo(0.28);
    controls.setLife(1);
    expect(controls.sample()).toMatchObject({ life: 1, aim: { fire: false } });
    controls.syncEnergy(1, 1, 3);
    expect(controls.energy).toBe(1);
});

it('Bomb Arena has edge-triggered keyboard and touch actions with cancel-safe movement', () => {
    const { controls, surfaces, window } = fixture();
    controls.setContext('bomb-arena', 1);
    event(window, 'keydown', { code: 'Space', repeat: false });
    event(window, 'keydown', { code: 'Space', repeat: true });
    expect(controls.sample()).toMatchObject({ modeId: 'bomb-arena', bombSequence: 1, jumpSequence: 0 });
    event(surfaces['bomb-button'], 'click');
    expect(controls.sample()).toMatchObject({ bombSequence: 2 });
    event(surfaces.joystick, 'pointerdown', pointer(10, 95, 50));
    event(surfaces['bomb-button'], 'click');
    expect(controls.sample()).toMatchObject({ bombSequence: 3 });
    expect(controls.sample().axes[0]).toBeGreaterThan(0);
    event(surfaces.joystick, 'pointercancel', pointer(99));
    expect(controls.sample().axes[0]).toBeGreaterThan(0);
    event(surfaces.joystick, 'pointercancel', pointer(10));
    expect(controls.sample().axes).toEqual([0, 0]);
    controls.setContext('bomb-arena', 2);
    expect(controls.sample()).toMatchObject({ bombSequence: 0 });
});
