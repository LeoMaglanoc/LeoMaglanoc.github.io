import { describe, expect, it, vi } from 'vitest';
import { DisplayMode, type DisplayModeEnvironment } from '../src/platform/displayMode';

function fixture() {
    const document = Object.assign(new EventTarget(), {
        documentElement: { requestFullscreen: vi.fn(async () => {}) },
        fullscreenElement: null as unknown,
        fullscreenEnabled: true,
        visibilityState: 'visible',
        exitFullscreen: vi.fn(async () => {
            document.fullscreenElement = null;
        })
    });
    document.documentElement.requestFullscreen.mockImplementation(async () => {
        document.fullscreenElement = document.documentElement;
        document.dispatchEvent(new Event('fullscreenchange'));
    });
    const window = Object.assign(new EventTarget(), {
        innerWidth: 390,
        innerHeight: 844,
        visualViewport: new EventTarget()
    });
    const orientation = Object.assign(new EventTarget(), {
        lock: vi.fn<(orientation: 'landscape') => Promise<void>>(async () => {}),
        unlock: vi.fn()
    });
    const sentinels: Array<ReturnType<typeof sentinel>> = [];
    function sentinel() {
        const wake = Object.assign(new EventTarget(), {
            released: false,
            release: vi.fn(async () => {
                wake.released = true;
                wake.dispatchEvent(new Event('release'));
            })
        });
        return wake;
    }
    const wakeLock = {
        request: vi.fn<(type: 'screen') => Promise<ReturnType<typeof sentinel>>>(async () => {
            const wake = sentinel();
            sentinels.push(wake);
            return wake;
        })
    };
    const environment = { document, window, orientation, wakeLock };
    const changed = vi.fn();
    const display = new DisplayMode(changed, environment);
    return { display, environment, changed, sentinels };
}

describe('display mode browser lifecycle', () => {
    it('initiates a new gesture request even while a prior browser exit is pending', async () => {
        const { display, environment } = fixture();
        await display.enter();
        let finishExit!: () => void;
        environment.document.exitFullscreen.mockImplementation(
            () =>
                new Promise<void>((done) => {
                    finishExit = () => {
                        environment.document.fullscreenElement = null;
                        done();
                    };
                })
        );
        const exiting = display.exit();
        expect(display.exit()).toBe(exiting);
        // Model the browser's queued fullscreen task: invocation must occur in
        // the second gesture; resolution follows the already queued exit.
        environment.document.documentElement.requestFullscreen.mockImplementation(async () => {
            await exiting;
            environment.document.fullscreenElement = environment.document.documentElement;
        });
        const entering = display.enter();
        expect(environment.document.documentElement.requestFullscreen).toHaveBeenCalledTimes(2);
        finishExit();
        await entering;
        expect(display.state.fullscreen).toBe(true);
        expect(display.state.wakeLockActive).toBe(true);
        // Restore an immediately settling browser exit for cleanup.
        environment.document.exitFullscreen.mockImplementation(async () => {
            environment.document.fullscreenElement = null;
        });
        display.dispose();
    });

    it('requests fullscreen synchronously in the gesture and coalesces pending entry', async () => {
        const { display, environment } = fixture();
        const entering = display.enter();
        expect(environment.document.documentElement.requestFullscreen).toHaveBeenCalledOnce();
        expect(environment.orientation.lock).not.toHaveBeenCalled();
        expect(display.enter()).toBe(entering);
        await entering;
        expect(environment.orientation.lock).toHaveBeenCalledWith('landscape');
        expect(display.state.fullscreen).toBe(true);
        // A successful API promise never invents a landscape viewport.
        expect(display.state.landscape).toBe(false);
        expect(display.state.wakeLockActive).toBe(true);
        await display.enter();
        expect(environment.document.documentElement.requestFullscreen).toHaveBeenCalledOnce();
        display.dispose();
    });

    it('keeps gameplay usable with unsupported APIs and reports actual portrait state', async () => {
        const { environment, changed } = fixture();
        const unsupported: DisplayModeEnvironment = {
            document: Object.assign(new EventTarget(), {
                documentElement: {},
                fullscreenElement: null,
                visibilityState: 'visible'
            }),
            window: environment.window
        };
        const display = new DisplayMode(changed, unsupported);
        await expect(display.enter()).resolves.toBeUndefined();
        expect(display.state).toMatchObject({
            fullscreenSupported: false,
            orientationSupported: false,
            wakeLockSupported: false,
            fullscreen: false,
            portrait: true
        });
        display.dispose();
    });

    it('contains rejected and synchronously thrown API errors', async () => {
        const { display, environment } = fixture();
        environment.document.documentElement.requestFullscreen.mockImplementation(() => {
            throw new Error('gesture denied');
        });
        environment.orientation.lock.mockRejectedValue(new Error('orientation denied'));
        environment.wakeLock.request.mockRejectedValue(new Error('wake denied'));
        await expect(display.enter()).resolves.toBeUndefined();
        expect(display.state).toMatchObject({
            fullscreen: false,
            fullscreenError: 'gesture denied',
            orientationError: 'orientation denied',
            wakeLockError: 'wake denied'
        });
        display.dispose();
    });

    it('notifies canvas/HUD listeners on viewport and orientation changes', () => {
        const { display, environment, changed } = fixture();
        environment.window.innerWidth = 844;
        environment.window.innerHeight = 390;
        environment.window.visualViewport.dispatchEvent(new Event('resize'));
        expect(changed).toHaveBeenLastCalledWith(
            expect.objectContaining({
                width: 844,
                height: 390,
                landscape: true,
                portrait: false
            })
        );
        environment.orientation.dispatchEvent(new Event('change'));
        environment.window.dispatchEvent(new Event('resize'));
        expect(changed).toHaveBeenCalledTimes(3);
        display.dispose();
        environment.window.dispatchEvent(new Event('resize'));
        expect(changed).toHaveBeenCalledTimes(3);
    });

    it('releases and reacquires wake lock on app switch without requesting fullscreen', async () => {
        const { display, environment, sentinels } = fixture();
        await display.enter();
        environment.document.visibilityState = 'hidden';
        environment.document.dispatchEvent(new Event('visibilitychange'));
        expect(sentinels[0].release).toHaveBeenCalledOnce();
        environment.document.visibilityState = 'visible';
        environment.document.dispatchEvent(new Event('visibilitychange'));
        await vi.waitFor(() => expect(display.state.wakeLockActive).toBe(true));
        expect(environment.wakeLock.request).toHaveBeenCalledTimes(2);
        expect(environment.document.documentElement.requestFullscreen).toHaveBeenCalledOnce();
        await display.exit();
        environment.document.dispatchEvent(new Event('visibilitychange'));
        expect(environment.wakeLock.request).toHaveBeenCalledTimes(2);
        expect(display.state.wakeLockActive).toBe(false);
        display.dispose();
    });

    it('does not automatically reenter fullscreen after Escape', async () => {
        const { display, environment } = fixture();
        await display.enter();
        environment.document.fullscreenElement = null;
        environment.document.dispatchEvent(new Event('fullscreenchange'));
        expect(display.state.fullscreen).toBe(false);
        expect(environment.document.documentElement.requestFullscreen).toHaveBeenCalledOnce();
        await display.enter();
        expect(environment.document.documentElement.requestFullscreen).toHaveBeenCalledTimes(2);
        display.dispose();
    });

    it('exits a fullscreen request that completes after leaving gameplay', async () => {
        const { display, environment } = fixture();
        let resolve!: () => void;
        environment.document.documentElement.requestFullscreen.mockImplementation(
            () =>
                new Promise<void>((done) => {
                    resolve = () => {
                        environment.document.fullscreenElement = environment.document.documentElement;
                        done();
                    };
                })
        );
        const entering = display.enter();
        await display.exit();
        resolve();
        await entering;
        expect(display.state.fullscreen).toBe(false);
        expect(environment.orientation.lock).not.toHaveBeenCalled();
        expect(environment.wakeLock.request).not.toHaveBeenCalled();
        display.dispose();
    });

    it('unlocks a delayed orientation success after disposal', async () => {
        const { display, environment } = fixture();
        let resolve!: () => void;
        environment.orientation.lock.mockImplementation(
            () =>
                new Promise<void>((done) => {
                    resolve = done;
                })
        );
        const entering = display.enter();
        await vi.waitFor(() => expect(environment.orientation.lock).toHaveBeenCalledOnce());
        display.dispose();
        resolve();
        await entering;
        expect(environment.orientation.unlock).toHaveBeenCalledTimes(2);
        expect(environment.wakeLock.request).not.toHaveBeenCalled();
    });

    it('releases a wake lock granted after exit and contains rejected exit', async () => {
        const { display, environment, sentinels } = fixture();
        let resolve!: (wake: Awaited<ReturnType<typeof environment.wakeLock.request>>) => void;
        const original = environment.wakeLock.request.getMockImplementation()!;
        environment.wakeLock.request.mockImplementation(
            () =>
                new Promise((done) => {
                    resolve = done;
                })
        );
        const entering = display.enter();
        await vi.waitFor(() => expect(environment.wakeLock.request).toHaveBeenCalledOnce());
        environment.document.exitFullscreen.mockRejectedValue(new Error('exit denied'));
        await display.exit();
        resolve(await original('screen'));
        await entering;
        expect(sentinels[0].release).toHaveBeenCalledOnce();
        expect(display.state.wakeLockActive).toBe(false);
        expect(display.state.fullscreenError).toBe('exit denied');
        display.dispose();
    });
});

it('reports the visible viewport when browser chrome shrinks the layout viewport', () => {
    const { display, environment, changed } = fixture();
    Object.assign(environment.window.visualViewport, { width: 390, height: 700 });
    environment.window.visualViewport.dispatchEvent(new Event('resize'));
    expect(display.state.width).toBe(390);
    expect(display.state.height).toBe(700);
    expect(changed).toHaveBeenLastCalledWith(expect.objectContaining({ height: 700, portrait: true }));
    display.dispose();
});
