import { neutral, type ModeId } from './protocol';

const SHOT_INTERVAL = 1000 / 3;
const AIM_SENSITIVITY = 0.004;

export class Controls {
    value = neutral();
    keys = new Set<string>();
    stick: [number, number] = [0, 0];
    active: number | null = null;
    onShot: (sequence: number) => void = () => {};
    private enabled = true;
    private yaw = 0;
    private pitch = 0;
    private aimPointer: number | null = null;
    private aimMouse = false;
    private aimPosition: [number, number] = [0, 0];
    private firePointer: number | null = null;
    private mouseFire = false;
    private fireSequence = 0;
    private firedAt = -Infinity;
    private shotUntil = -Infinity;

    get aimYaw() {
        return this.yaw;
    }
    set aimYaw(value: number) {
        if (Number.isFinite(value))
            this.yaw = ((((value + Math.PI) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) - Math.PI;
    }
    get aimPitch() {
        return this.pitch;
    }
    set aimPitch(value: number) {
        if (Number.isFinite(value)) this.pitch = Math.max(-0.8, Math.min(0.8, value));
    }
    constructor() {
        const relevant = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'];
        window.addEventListener('keydown', (e) => {
            if (e.code === 'Escape') {
                this.clear();
                return;
            }
            const target = e.target as HTMLElement | null;
            if (!this.enabled || target?.matches?.('input,textarea,select,[contenteditable="true"]')) return;
            if (relevant.includes(e.code)) {
                e.preventDefault();
                if (e.code === 'Space' && !this.keys.has(e.code)) this.jump();
                this.keys.add(e.code);
            }
        });
        window.addEventListener('keyup', (e) => this.keys.delete(e.code));
        window.addEventListener('blur', () => this.clear());
        document.addEventListener('visibilitychange', () => this.clear());
        document.addEventListener('pointerlockchange', () => {
            if (!document.pointerLockElement || !this.laserActive) this.clear();
        });
        document.addEventListener('mousemove', (e) => {
            if (this.laserActive && document.pointerLockElement === this.canvas) this.rotate(e.movementX, e.movementY);
        });
        document.addEventListener('mouseup', (e) => {
            if (e.button === 0) {
                this.mouseFire = false;
                if (this.aimMouse) {
                    this.aimPointer = null;
                    this.aimMouse = false;
                }
            }
        });
        const zone = document.querySelector<HTMLElement>('#joystick')!;
        const knob = document.querySelector<HTMLElement>('#knob')!;
        const move = (e: PointerEvent) => {
            if (this.active !== e.pointerId) return;
            const r = zone.getBoundingClientRect();
            let x = (e.clientX - r.left - r.width / 2) / (r.width * 0.35),
                z = (e.clientY - r.top - r.height / 2) / (r.height * 0.35);
            const n = Math.max(1, Math.hypot(x, z));
            x /= n;
            z /= n;
            this.stick = [x, z];
            knob.style.transform = `translate(${x * 30}px,${z * 30}px)`;
        };
        zone.addEventListener('pointerdown', (e) => {
            if (!this.enabled || this.active !== null) return;
            e.preventDefault();
            this.active = e.pointerId;
            zone.setPointerCapture(e.pointerId);
            move(e);
        });
        zone.addEventListener('pointermove', move);
        const release = (e: PointerEvent) => {
            if (e.pointerId === this.active) {
                this.active = null;
                this.stick = [0, 0];
                knob.style.transform = '';
            }
        };
        zone.addEventListener('pointerup', release);
        zone.addEventListener('pointercancel', release);
        zone.addEventListener('lostpointercapture', release);
        document.querySelector('#jump')!.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            this.jump();
        });
        const aim = document.querySelector<HTMLElement>('#aim-zone');
        const fire = document.querySelector<HTMLElement>('#fire');
        for (const area of [aim, fire, this.canvas]) {
            if (!area) continue;
            area.addEventListener('pointerdown', (e) => {
                if (!this.laserActive || this.aimPointer !== null || (e.pointerType === 'mouse' && e.button !== 0))
                    return;
                e.preventDefault();
                this.aimPointer = e.pointerId;
                this.aimMouse = e.pointerType === 'mouse';
                this.aimPosition = [e.clientX, e.clientY];
                area.setPointerCapture(e.pointerId);
                if (area === fire || e.pointerType === 'mouse') {
                    if (e.pointerType === 'mouse') this.mouseFire = true;
                    else this.firePointer = e.pointerId;
                    this.shoot(performance.now());
                }
                if (e.pointerType === 'mouse') {
                    // Keep this call in the qualifying gameplay pointer gesture.
                    try {
                        const request = this.canvas?.requestPointerLock?.();
                        request?.catch(() => {});
                    } catch {
                        /* Drag aiming remains available if pointer lock is refused. */
                    }
                }
            });
            area.addEventListener('pointermove', (e) => {
                if (!this.laserActive || this.aimPointer !== e.pointerId) return;
                if (document.pointerLockElement !== this.canvas) {
                    this.rotate(e.clientX - this.aimPosition[0], e.clientY - this.aimPosition[1]);
                }
                this.aimPosition = [e.clientX, e.clientY];
            });
            const releaseAim = (e: PointerEvent) => {
                if (
                    e.type === 'lostpointercapture' &&
                    e.pointerType === 'mouse' &&
                    document.pointerLockElement === this.canvas
                )
                    return;
                if (this.aimPointer === e.pointerId) {
                    this.aimPointer = null;
                    this.aimMouse = false;
                }
                if (this.firePointer === e.pointerId) this.firePointer = null;
                if (e.pointerType === 'mouse') this.mouseFire = false;
            };
            area.addEventListener('pointerup', releaseAim);
            area.addEventListener('pointercancel', releaseAim);
            area.addEventListener('lostpointercapture', releaseAim);
        }
    }
    private get canvas() {
        return document.querySelector<HTMLElement>('#application-canvas');
    }
    private get laserActive() {
        return this.enabled && this.value.modeId === 'laser-tag';
    }
    private rotate(x: number, y: number) {
        this.aimYaw += x * AIM_SENSITIVITY;
        this.aimPitch -= y * AIM_SENSITIVITY;
    }
    private shoot(now: number) {
        if (!this.laserActive || now - this.firedAt < SHOT_INTERVAL) return;
        this.firedAt = now;
        // Preserve a quick tap across render/input-send cadence. The monotonic
        // sequence prevents this short delivery window from producing repeats.
        this.shotUntil = now + 100;
        this.fireSequence++;
        this.onShot(this.fireSequence);
    }
    setContext(modeId: ModeId, roundId: number, enabled = true) {
        if (this.value.modeId === modeId && this.value.roundId === roundId && this.enabled === enabled) return;
        const changedRound = this.value.modeId !== modeId || this.value.roundId !== roundId;
        this.clear();
        this.enabled = enabled;
        if (changedRound) {
            this.aimYaw = 0;
            this.aimPitch = 0;
            this.firedAt = -Infinity;
        }
        this.value = {
            ...neutral(modeId, roundId),
            sequence: this.value.sequence,
            jumpSequence: this.value.jumpSequence
        };
    }
    jump() {
        if (this.enabled && this.value.modeId === 'obstacle-dash') this.value.jumpSequence++;
    }
    clear() {
        const pointers = [this.active, this.aimPointer, this.firePointer];
        this.keys.clear();
        this.stick = [0, 0];
        this.active = null;
        this.aimPointer = this.firePointer = null;
        this.aimMouse = false;
        this.mouseFire = false;
        this.shotUntil = -Infinity;
        this.value.axes = [0, 0];
        if (this.value.modeId === 'laser-tag') this.value.aim.fire = false;
        if (document.pointerLockElement === this.canvas) {
            try {
                document.exitPointerLock?.();
            } catch {
                /* A browser may already be exiting. */
            }
        }
        for (const id of ['joystick', 'aim-zone', 'fire', 'application-canvas']) {
            const area = document.querySelector<HTMLElement>('#' + id);
            for (const pointer of pointers) {
                if (pointer === null) continue;
                try {
                    if (area?.hasPointerCapture(pointer)) area.releasePointerCapture(pointer);
                } catch {
                    /* Capture may already have been released on blur. */
                }
            }
        }
        const knob = document.querySelector<HTMLElement>('#knob');
        if (knob) knob.style.transform = '';
    }
    sample() {
        let x = this.enabled
            ? this.stick[0] +
              Number(this.keys.has('KeyD') || this.keys.has('ArrowRight')) -
              Number(this.keys.has('KeyA') || this.keys.has('ArrowLeft'))
            : 0;
        let z = this.enabled
            ? this.stick[1] +
              Number(this.keys.has('KeyS') || this.keys.has('ArrowDown')) -
              Number(this.keys.has('KeyW') || this.keys.has('ArrowUp'))
            : 0;
        const n = Math.max(1, Math.hypot(x, z));
        x /= n;
        z /= n;
        const now = performance.now();
        if (this.value.modeId === 'laser-tag') {
            const cos = Math.cos(this.aimYaw),
                sin = Math.sin(this.aimYaw);
            [x, z] = [x * cos - z * sin, x * sin + z * cos];
            const holding = this.enabled && (this.mouseFire || this.firePointer !== null);
            if (holding) this.shoot(now);
            const firing = this.enabled && (holding || now < this.shotUntil);
            this.value = {
                ...this.value,
                aim: { yaw: this.aimYaw, pitch: this.aimPitch, fire: firing, sequence: this.fireSequence }
            };
        }
        this.value = { ...this.value, sequence: this.value.sequence + 1, axes: [x, z], clientTime: now };
        return this.value;
    }
}
