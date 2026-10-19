import Peer, { type DataConnection } from 'peerjs';
export type Lane = 'control' | 'movement';
export function candidatePath(local?: string, remote?: string) {
    return local === 'relay' || remote === 'relay' ? 'relayed' : local && remote ? 'direct' : 'unknown';
}
export type Faults = {
    delay: number;
    jitter: number;
    loss: number;
    reorder: number;
    reliableDelay?: number;
    duplicate?: number;
};
export class FaultLink {
    timers = new Set<ReturnType<typeof setTimeout>>();
    faults: Faults;
    constructor(faults: Faults) {
        this.faults = faults;
    }
    private reliableDue = 0;
    private reliablePending = 0;
    deliver(value: unknown, send: (v: unknown) => void, reliable: boolean) {
        const duplicate = (this.faults.duplicate ?? 0) > 0 && Math.random() < (this.faults.duplicate ?? 0);
        const deliver = () => {
            send(value);
            if (duplicate) send(value);
        };
        let wait: number;
        if (reliable) {
            const delay = this.faults.reliableDelay ?? 0;
            const due = Math.max(Date.now() + (Number.isFinite(delay) ? Math.max(0, delay) : 0), this.reliableDue);
            wait = Math.max(0, due - Date.now());
            this.reliableDue = due;
            // Even an overdue queued packet must precede a new immediate packet.
            if (!wait && !this.reliablePending) {
                deliver();
                return;
            }
            this.reliablePending++;
        } else {
            if (Math.random() < this.faults.loss) return;
            wait = Math.max(
                0,
                this.faults.delay +
                    (Math.random() * 2 - 1) * this.faults.jitter +
                    (Math.random() < this.faults.reorder ? 120 : 0)
            );
            if (!wait) {
                deliver();
                return;
            }
        }
        // A packet on a real channel has already been serialized. Local input
        // cleanup must not rewrite an older packet while its fault timer waits.
        value = structuredClone(value);
        const timer = setTimeout(() => {
            this.timers.delete(timer);
            if (reliable && --this.reliablePending === 0) this.reliableDue = 0;
            deliver();
        }, wait);
        this.timers.add(timer);
    }
    close() {
        for (const timer of this.timers) clearTimeout(timer);
        this.timers.clear();
        this.reliableDue = this.reliablePending = 0;
    }
}
export type Link = { control?: DataConnection; movement?: DataConnection };
export class Transport {
    peer: Peer | null = null;
    links = new Map<string, Link>();
    encoder = new TextEncoder();
    sent = 0;
    received = 0;
    sentBytes = 0;
    receivedBytes = 0;
    rejected = 0;
    droppedBackpressure = 0;
    // Hosts retain the tighter guest-input budget; guests allow authoritative round traffic.
    controlLimit = 30;
    rtt = 0;
    ice = 'not connected';
    semantics = 'not connected';
    started = performance.now();
    fault = new FaultLink({ delay: 0, jitter: 0, loss: 0, reorder: 0 });
    onMessage: (peer: string, lane: Lane, data: unknown) => void = () => {};
    onClose: (peer: string) => void = () => {};
    onError: (message: string) => void = () => {};
    onOpen: (peer: string, lane: Lane) => void = () => {};
    async open(): Promise<string> {
        this.peer = new Peer({ debug: 0, config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] } });
        const p = this.peer;
        p.on('connection', (c) => this.attach(c));
        p.on('error', (error) => {
            if (this.peer === p) this.onError(error.message);
        });
        p.on('disconnected', () => {
            if (this.peer === p)
                this.onError('Signaling disconnected. Existing P2P links may continue. Reload to host a new room.');
        });
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                p.destroy();
                reject(new Error('Signaling timed out. Check internet and retry.'));
            }, 15000);
            p.once('open', (id) => {
                clearTimeout(timeout);
                resolve(id);
            });
            p.once('error', (error) => {
                clearTimeout(timeout);
                reject(error);
            });
        });
    }
    connect(host: string) {
        if (!this.peer) return;
        this.attach(this.peer.connect(host, { label: 'control', reliable: true, serialization: 'json' }));
        this.attach(this.peer.connect(host, { label: 'movement', reliable: false, serialization: 'json' }));
    }
    attach(c: DataConnection) {
        if (c.label !== 'control' && c.label !== 'movement') {
            c.close();
            return;
        }
        const lane = c.label as Lane;
        if (this.links.size >= 12 && !this.links.has(c.peer)) {
            c.close();
            return;
        }
        const link = this.links.get(c.peer) ?? {};
        if (link[lane]) {
            c.close();
            return;
        }
        link[lane] = c;
        this.links.set(c.peer, link);
        const expire = setTimeout(() => {
            if (!c.open) c.close();
        }, 15000);
        c.on('open', () => {
            clearTimeout(expire);
            this.onOpen(c.peer, lane);
            void this.inspect(c);
        });
        let rateAt = performance.now(),
            rateCount = 0;
        c.on('data', (raw) => {
            const at = performance.now();
            if (at - rateAt >= 1000) {
                rateAt = at;
                rateCount = 0;
            }
            if (++rateCount > (lane === 'control' ? this.controlLimit : 90)) {
                this.rejected++;
                return;
            }
            const json = JSON.stringify(raw);
            const bytes = json ? this.encoder.encode(json).byteLength : 0;
            if (bytes > 24000) {
                this.rejected++;
                return;
            }
            this.received++;
            this.receivedBytes += bytes;
            this.onMessage(c.peer, lane, raw);
        });
        c.on('error', () => {
            if (lane === 'control') this.onError('Connection error. Check the room link and network.');
        });
        c.on('close', () => {
            clearTimeout(expire);
            if (this.links.get(c.peer)?.[lane] !== c) return;
            if (lane === 'control') {
                this.links.delete(c.peer);
                link.movement?.close();
                this.onClose(c.peer);
            } else {
                delete link.movement;
            }
        });
    }
    send(peer: string, lane: Lane, value: unknown) {
        const c = this.links.get(peer)?.[lane];
        if (!c?.open) return;
        if (c.dataChannel.bufferedAmount > 65536) {
            this.droppedBackpressure++;
            return;
        }
        this.fault.deliver(
            value,
            (v) => {
                if (!c.open) return;
                try {
                    c.send(v);
                    this.sent++;
                    this.sentBytes += this.encoder.encode(JSON.stringify(v)).byteLength;
                } catch {
                    this.onError('Unable to send. Connection interrupted.');
                }
            },
            lane === 'control'
        );
    }
    broadcast(lane: Lane, value: unknown, accepted?: Set<string>) {
        for (const id of this.links.keys()) if (!accepted || accepted.has(id)) this.send(id, lane, value);
    }
    reject(peer: string, reason: string) {
        this.send(peer, 'control', { type: 'error', reason });
        const c = this.links.get(peer)?.control;
        setTimeout(() => c?.close(), 250);
    }
    async inspect(c: DataConnection) {
        try {
            const dc = c.dataChannel;
            this.semantics = `${c.label}: ordered=${dc.ordered}, retransmits=${dc.maxRetransmits ?? 'unlimited'}`;
            const stats = await c.peerConnection.getStats();
            let pair: RTCStats | undefined;
            stats.forEach((s) => {
                if (s.type === 'transport' && s.selectedCandidatePairId) pair = stats.get(s.selectedCandidatePairId);
            });
            if (!pair)
                stats.forEach((s) => {
                    if (s.type === 'candidate-pair' && s.nominated && s.state === 'succeeded') pair = s;
                });
            if (pair) {
                const p = pair as RTCStats & {
                    localCandidateId: string;
                    remoteCandidateId: string;
                    currentRoundTripTime?: number;
                };
                const a = stats.get(p.localCandidateId),
                    b = stats.get(p.remoteCandidateId);
                this.ice = `${a?.candidateType ?? '?'} ↔ ${b?.candidateType ?? '?'} · ${candidatePath(a?.candidateType, b?.candidateType)}`;
            } else this.ice = 'candidate pair pending / unavailable';
        } catch {
            this.ice = 'ICE statistics unavailable in this browser';
        }
    }
    close() {
        this.fault.close();
        this.links.clear();
        const peer = this.peer;
        this.peer = null;
        peer?.destroy();
    }
}
