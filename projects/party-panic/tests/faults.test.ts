import { it, expect, vi, afterEach } from 'vitest';
import { FaultLink, Transport, candidatePath } from '../src/transport';
import type { DataConnection } from 'peerjs';
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

it('does not label an unavailable ICE candidate as a direct connection', () => {
    expect(candidatePath('host', 'srflx')).toBe('direct');
    expect(candidatePath('host', 'relay')).toBe('relayed');
    expect(candidatePath('relay', undefined)).toBe('relayed');
    expect(candidatePath('host', undefined)).toBe('unknown');
    expect(candidatePath()).toBe('unknown');
});

it('delays reliable traffic without loss or reordering when the debug delay changes', () => {
    vi.useFakeTimers();
    const link = new FaultLink({ delay: 80, jitter: 40, loss: 1, reorder: 1, reliableDelay: 120 });
    const send = vi.fn();
    link.deliver('round-start', send, true);
    vi.advanceTimersByTime(30);
    link.faults.reliableDelay = 0;
    link.deliver('score', send, true);
    vi.advanceTimersByTime(89);
    expect(send).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(send.mock.calls.map(([value]) => value)).toEqual(['round-start', 'score']);
    expect(link.timers.size).toBe(0);
    link.deliver('next', send, true);
    expect(send).toHaveBeenLastCalledWith('next');
    link.close();
});

it('duplicates reliable packets adjacently and duplicates movement only after surviving loss', () => {
    vi.useFakeTimers();
    const link = new FaultLink({ delay: 80, jitter: 0, loss: 0, reorder: 0, reliableDelay: 100, duplicate: 1 });
    const send = vi.fn();
    link.deliver('shot', send, true);
    link.deliver('tag', send, true);
    link.deliver('input', send, false);
    vi.advanceTimersByTime(100);
    expect(send.mock.calls.map(([value]) => value)).toEqual(['input', 'input', 'shot', 'shot', 'tag', 'tag']);
    link.faults.loss = 1;
    link.deliver('lost', send, false);
    vi.runAllTimers();
    expect(send).toHaveBeenCalledTimes(6);
    link.close();
});

it('teardown cancels both delayed lanes and does not retain ordering state in a new room', () => {
    vi.useFakeTimers();
    const link = new FaultLink({ delay: 80, jitter: 0, loss: 0, reorder: 0, reliableDelay: 1000, duplicate: 1 });
    const send = vi.fn();
    link.deliver('old-score', send, true);
    link.deliver('old-movement', send, false);
    expect(link.timers.size).toBe(2);
    link.close();
    vi.runAllTimers();
    expect(send).not.toHaveBeenCalled();
    link.faults.reliableDelay = 0;
    link.deliver('new-round', send, true);
    expect(send.mock.calls.map(([value]) => value)).toEqual(['new-round', 'new-round']);
    expect(link.timers.size).toBe(0);
});

function connection() {
    const listeners = new Map<string, (...args: unknown[]) => void>();
    const channel = { bufferedAmount: 0 };
    const send = vi.fn();
    const data = {
        peer: 'other',
        label: 'control',
        open: true,
        dataChannel: channel,
        send,
        on: (name: string, callback: (...args: unknown[]) => void) => listeners.set(name, callback),
        close: () => listeners.get('close')?.()
    } as unknown as DataConnection;
    return { data, channel, send, receive: (value: unknown) => listeners.get('data')?.(value) };
}

it('keeps guest control spam bounded while admitting eight-player authoritative event bursts', () => {
    vi.useFakeTimers();
    for (const [limit, count, accepted] of [
        [30, 40, 30],
        [128, 80, 80]
    ]) {
        const transport = new Transport();
        transport.controlLimit = limit;
        const link = connection();
        transport.attach(link.data);
        transport.onMessage = vi.fn();
        for (let index = 0; index < count; index++) link.receive({ type: 'event', eventId: index });
        expect(transport.onMessage).toHaveBeenCalledTimes(accepted);
        expect(transport.rejected).toBe(count - accepted);
        link.data.close();
        transport.close();
    }
});

it('records outgoing backpressure drops without claiming packets were sent', () => {
    vi.useFakeTimers();
    const transport = new Transport();
    const link = connection();
    transport.attach(link.data);
    link.channel.bufferedAmount = 65537;
    transport.send('other', 'control', { type: 'event' });
    expect(transport.droppedBackpressure).toBe(1);
    expect(transport.sent).toBe(0);
    expect(link.send).not.toHaveBeenCalled();
    link.channel.bufferedAmount = 0;
    transport.send('other', 'control', { type: 'event' });
    expect(transport.sent).toBe(1);
    expect(link.send).toHaveBeenCalledOnce();
    link.data.close();
    transport.close();
});

it('freezes delayed packet content before local input cleanup can mutate it', () => {
    vi.useFakeTimers();
    const link = new FaultLink({ delay: 80, jitter: 0, loss: 0, reorder: 0, reliableDelay: 100 });
    const send = vi.fn();
    const input = { axes: [1, 0], aim: { fire: true } };
    const result = { players: [{ score: 3 }] };
    link.deliver(input, send, false);
    link.deliver(result, send, true);
    input.axes[0] = 0;
    input.aim.fire = false;
    result.players[0].score = 99;
    vi.advanceTimersByTime(100);
    expect(send.mock.calls.map(([value]) => value)).toEqual([
        { axes: [1, 0], aim: { fire: true } },
        { players: [{ score: 3 }] }
    ]);
    link.close();
});
