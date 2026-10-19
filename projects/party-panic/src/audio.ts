/** Small synthesized cues: no downloaded audio, and no autoplay before a gesture. */
export class AudioFeedback {
    private context?: AudioContext;
    private voices = 0;
    muted = false;
    enable() {
        try {
            this.context ??= new AudioContext();
            void this.context.resume().catch(() => {});
        } catch {
            // Audio is optional; an unsupported API must not prevent gameplay.
        }
    }
    play(kind: string) {
        const context = this.context;
        if (!context || context.state !== 'running' || this.muted || this.voices >= 8) return;
        const frequency = {
            jump: 260,
            land: 95,
            hit: 120,
            checkpoint: 740,
            shot: 520,
            charged: 190,
            confirm: 780,
            dive: 330,
            tag: 920
        }[kind];
        if (!frequency) return;
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        const now = context.currentTime;
        const duration = kind === 'checkpoint' || kind === 'tag' ? 0.18 : 0.08;
        oscillator.type = kind === 'shot' ? 'sawtooth' : 'sine';
        oscillator.frequency.setValueAtTime(frequency, now);
        oscillator.frequency.exponentialRampToValueAtTime(frequency * (kind === 'hit' ? 0.5 : 1.5), now + duration);
        gain.gain.setValueAtTime(0.035, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
        oscillator.connect(gain).connect(context.destination);
        this.voices++;
        oscillator.onended = () => {
            this.voices--;
            oscillator.disconnect();
            gain.disconnect();
        };
        oscillator.start(now);
        oscillator.stop(now + duration);
    }
    dispose() {
        void this.context?.close().catch(() => {});
        this.context = undefined;
    }
}
