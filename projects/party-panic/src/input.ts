import { neutral, type ModeId } from './protocol';
export class Controls {
    value = neutral();
    keys = new Set<string>();
    stick: [number, number] = [0, 0];
    active: number | null = null;
    constructor() {
        const relevant = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'];
        window.addEventListener('keydown', (e) => {
            if ((e.target as HTMLElement)?.matches('input,textarea')) return;
            if (relevant.includes(e.code)) {
                e.preventDefault();
                if (e.code === 'Space' && !this.keys.has(e.code)) this.jump();
                this.keys.add(e.code);
            }
        });
        window.addEventListener('keyup', (e) => this.keys.delete(e.code));
        window.addEventListener('blur', () => this.clear());
        document.addEventListener('visibilitychange', () => this.clear());
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
    }
    setContext(modeId: ModeId, roundId: number) {
        if (this.value.modeId === modeId && this.value.roundId === roundId) return;
        this.clear();
        this.value = {
            ...neutral(modeId, roundId),
            sequence: this.value.sequence,
            jumpSequence: this.value.jumpSequence
        };
    }
    jump() {
        this.value.jumpSequence++;
    }
    clear() {
        this.keys.clear();
        this.stick = [0, 0];
        this.active = null;
        const knob = document.querySelector<HTMLElement>('#knob');
        if (knob) knob.style.transform = '';
    }
    sample() {
        let x =
            this.stick[0] +
            Number(this.keys.has('KeyD') || this.keys.has('ArrowRight')) -
            Number(this.keys.has('KeyA') || this.keys.has('ArrowLeft'));
        let z =
            this.stick[1] +
            Number(this.keys.has('KeyS') || this.keys.has('ArrowDown')) -
            Number(this.keys.has('KeyW') || this.keys.has('ArrowUp'));
        const n = Math.max(1, Math.hypot(x, z));
        x /= n;
        z /= n;
        this.value = { ...this.value, sequence: this.value.sequence + 1, axes: [x, z], clientTime: performance.now() };
        return this.value;
    }
}
