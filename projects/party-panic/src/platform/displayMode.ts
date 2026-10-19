/** Browser display state is deliberately independent of a round or room. */
export interface DisplayModeState {
    fullscreenSupported: boolean;
    orientationSupported: boolean;
    wakeLockSupported: boolean;
    fullscreen: boolean;
    landscape: boolean;
    portrait: boolean;
    width: number;
    height: number;
    wakeLockActive: boolean;
    fullscreenError?: string;
    orientationError?: string;
    wakeLockError?: string;
}

interface WakeSentinel extends EventTarget {
    released: boolean;
    release(): Promise<void>;
}

export interface DisplayModeEnvironment {
    document: EventTarget & {
        documentElement: { requestFullscreen?: () => Promise<void> };
        fullscreenElement: unknown;
        fullscreenEnabled?: boolean;
        visibilityState: string;
        exitFullscreen?: () => Promise<void>;
    };
    window: EventTarget & {
        innerWidth: number;
        innerHeight: number;
        visualViewport?: (EventTarget & { width?: number; height?: number }) | null;
    };
    orientation?: EventTarget & {
        lock?: (orientation: 'landscape') => Promise<void>;
        unlock?: () => void;
    };
    wakeLock?: { request: (type: 'screen') => Promise<WakeSentinel> };
}

function browserEnvironment(): DisplayModeEnvironment {
    return {
        document,
        window,
        orientation: screen.orientation,
        wakeLock: navigator.wakeLock
    };
}

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));

export class DisplayMode {
    private readonly environment: DisplayModeEnvironment;
    private readonly onChange: (state: DisplayModeState) => void;
    private readonly listeners: Array<() => void> = [];
    private errors: Pick<DisplayModeState, 'fullscreenError' | 'orientationError' | 'wakeLockError'> = {};
    private wanted = false;
    private disposed = false;
    private generation = 0;
    private entering?: Promise<void>;
    private exiting?: Promise<void>;
    private wake?: WakeSentinel;
    private acquiringWake?: Promise<void>;

    constructor(
        onChange: (state: DisplayModeState) => void = () => {},
        environment: DisplayModeEnvironment = browserEnvironment()
    ) {
        this.environment = environment;
        this.onChange = onChange;
        const refresh = () => this.notify();
        this.listen(environment.window, 'resize', refresh);
        this.listen(environment.window, 'orientationchange', refresh);
        this.listen(environment.window.visualViewport, 'resize', refresh);
        this.listen(environment.orientation, 'change', refresh);
        this.listen(environment.document, 'fullscreenchange', refresh);
        this.listen(environment.document, 'visibilitychange', () => {
            if (environment.document.visibilityState === 'visible') {
                void this.acquireWake();
            } else {
                void this.releaseWake();
            }
            this.notify();
        });
    }

    get state(): DisplayModeState {
        const { document: doc, window: view, orientation, wakeLock } = this.environment;
        const width = view.visualViewport?.width ?? view.innerWidth;
        const height = view.visualViewport?.height ?? view.innerHeight;
        return {
            fullscreenSupported: !!doc.documentElement.requestFullscreen && doc.fullscreenEnabled !== false,
            orientationSupported: !!orientation?.lock,
            wakeLockSupported: !!wakeLock,
            fullscreen: !!doc.fullscreenElement,
            landscape: width > height,
            portrait: height > width,
            width,
            height,
            wakeLockActive: !!this.wake && !this.wake.released,
            ...this.errors
        };
    }

    /** Call directly in the click/touch handler, before unrelated awaits. */
    enter(): Promise<void> {
        if (this.disposed) return Promise.resolve();
        if (this.entering && this.wanted) return this.entering;
        this.wanted = true;
        const generation = ++this.generation;
        this.errors = {};
        const { document: doc } = this.environment;
        let fullscreen: Promise<void>;
        try {
            // Invocation is synchronous: preserve this gesture's transient activation.
            fullscreen =
                (!doc.fullscreenElement || this.exiting) && this.state.fullscreenSupported
                    ? doc.documentElement.requestFullscreen!()
                    : Promise.resolve();
        } catch (error) {
            fullscreen = Promise.reject(error);
        }
        const entering = fullscreen
            .catch((error: unknown) => {
                if (generation === this.generation) {
                    this.errors.fullscreenError = errorMessage(error);
                }
            })
            .then(async () => {
                if (!this.current(generation)) {
                    // An exit while the browser prompt was pending still wins.
                    if (!this.wanted) await this.exitBrowserFullscreen();
                    return;
                }
                const orientation = this.environment.orientation;
                if (orientation?.lock) {
                    try {
                        await orientation.lock('landscape');
                        if (!this.wanted) orientation.unlock?.();
                    } catch (error) {
                        if (this.current(generation)) {
                            this.errors.orientationError = errorMessage(error);
                        }
                    }
                }
                if (this.current(generation)) await this.acquireWake();
            })
            .finally(() => {
                if (this.entering === entering) this.entering = undefined;
                this.notify();
            });
        this.entering = entering;
        return entering;
    }

    exit(): Promise<void> {
        if (this.exiting && !this.wanted) return this.exiting;
        this.wanted = false;
        ++this.generation;
        try {
            this.environment.orientation?.unlock?.();
        } catch (error) {
            this.errors.orientationError = errorMessage(error);
        }
        const exiting = Promise.all([this.releaseWake(), this.exitBrowserFullscreen()]).then(() => {
            if (this.exiting === exiting) this.exiting = undefined;
            this.notify();
        });
        this.exiting = exiting;
        return exiting;
    }

    dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        for (const remove of this.listeners) remove();
        this.listeners.length = 0;
        void this.exit();
    }

    private current(generation: number): boolean {
        return !this.disposed && this.wanted && generation === this.generation;
    }

    private listen(target: EventTarget | null | undefined, name: string, fn: () => void) {
        target?.addEventListener(name, fn);
        if (target) this.listeners.push(() => target.removeEventListener(name, fn));
    }

    private notify(): void {
        if (!this.disposed) this.onChange(this.state);
    }

    private async exitBrowserFullscreen(): Promise<void> {
        const doc = this.environment.document;
        try {
            if (doc.fullscreenElement) await doc.exitFullscreen?.();
        } catch (error) {
            this.errors.fullscreenError = errorMessage(error);
        }
    }

    private async releaseWake(): Promise<void> {
        const wake = this.wake;
        this.wake = undefined;
        try {
            await wake?.release();
        } catch (error) {
            this.errors.wakeLockError = errorMessage(error);
        }
    }

    private acquireWake(): Promise<void> {
        const { document: doc, wakeLock } = this.environment;
        if (
            this.disposed ||
            !this.wanted ||
            doc.visibilityState !== 'visible' ||
            !wakeLock ||
            this.wake ||
            this.acquiringWake
        )
            return this.acquiringWake ?? Promise.resolve();
        const generation = this.generation;
        const acquiring = (async () => {
            try {
                // Defer invocation to handle even synchronous browser/polyfill throws
                // after acquiringWake has been assigned.
                const wake = await Promise.resolve().then(() => wakeLock.request('screen'));
                if (!this.current(generation) || doc.visibilityState !== 'visible') {
                    await wake.release();
                    return;
                }
                this.wake = wake;
                wake.addEventListener(
                    'release',
                    () => {
                        if (this.wake === wake) this.wake = undefined;
                        this.notify();
                    },
                    { once: true }
                );
            } catch (error) {
                if (this.current(generation)) this.errors.wakeLockError = errorMessage(error);
            } finally {
                this.acquiringWake = undefined;
                this.notify();
                // A new explicit entry may have occurred during an older pending grant.
                if (generation !== this.generation && this.wanted) void this.acquireWake();
            }
        })();
        this.acquiringWake = acquiring;
        return acquiring;
    }
}
