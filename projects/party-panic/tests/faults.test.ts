import { it, expect, vi, afterEach } from 'vitest';
import { FaultLink } from '../src/transport';
afterEach(() => vi.useRealTimers());
it('injects movement loss but preserves reliable round events', () => {
    const link = new FaultLink({ delay: 0, jitter: 0, loss: 1, reorder: 0 });
    const send = vi.fn();
    link.deliver({ type: 'input' }, send, false);
    expect(send).not.toHaveBeenCalled();
    link.deliver({ type: 'event' }, send, true);
    expect(send).toHaveBeenCalledOnce();
    link.close();
});
it('cancels pending delayed movement on room teardown', () => {
    vi.useFakeTimers();
    const link = new FaultLink({ delay: 80, jitter: 40, loss: 0, reorder: 1 });
    const send = vi.fn();
    link.deliver('old-round', send, false);
    expect(link.timers.size).toBe(1);
    link.close();
    vi.runAllTimers();
    expect(send).not.toHaveBeenCalled();
    expect(link.timers.size).toBe(0);
});
it('delivers jittered messages without treating a missing packet as connection loss', () => {
    vi.useFakeTimers();
    const link = new FaultLink({ delay: 80, jitter: 40, loss: 0, reorder: 0.05 });
    const send = vi.fn();
    link.deliver({ sequence: 3, jumpSequence: 1 }, send, false);
    vi.advanceTimersByTime(300);
    expect(send).toHaveBeenCalledWith({ sequence: 3, jumpSequence: 1 });
    expect(link.timers.size).toBe(0);
});
