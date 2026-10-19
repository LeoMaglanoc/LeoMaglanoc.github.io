import QRCode from 'qrcode';
import { Vec3 } from 'playcanvas';
import { Controls } from './input';
import { InputGate, SnapshotGate, VERSION, isSnapshot, parseControl, type Snapshot } from './protocol';
import { admission, rank } from './rules';
import { Scene } from './scene';
import { Simulation } from './simulation';
import { Transport } from './transport';
import './style.css';
const $ = <T extends HTMLElement = HTMLElement>(s: string) => document.querySelector<T>(s)!;
const escape = (s: string) =>
    s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
$('#app').innerHTML =
    `<div class="shade" id="shade"></div><header class="topbar"><a class="brand" href="./">PARTY<br><b>PANIC!</b></a><div class="top-right"><span class="tag">Small party. Big chaos.</span><span class="pill"><i></i>1–8 friends</span></div></header>
<section class="home" id="home"><p class="eyebrow">01 / Obstacle Dash</p><h1>Stay on.<br><em>Dash on.</em></h1><p class="intro">A race against your friends.<br>And your questionable timing.</p><div class="actions"><button class="primary" id="solo">Play solo <span>↗</span></button><button class="secondary" id="host">Host a party <span>＋</span></button><button class="quiet" id="join-open">Join a room →</button></div><p class="home-note">No download. No account. Just one more rematch.<br>Best with friends on the same Wi-Fi.</p></section>
<aside class="course-card" id="course-card"><span class="eyebrow">Your first bad idea</span><div class="num">03</div><h3>Ways to lose your footing.</h3><p>Leap the gaps. Dodge the sweepers.<br>Time the bumpers. Make it to the end.</p><div class="stages"><span></span><span></span><span></span></div></aside>
<footer class="bottom-bar" id="footer"><span>ORIGINAL COURSE / NO ELIMINATION</span><a href="../">BACK TO THE DEMOS ↗</a></footer>
<section class="panel hidden" id="panel"></section><div class="hud hidden" id="hud"></div><div id="labels"></div><div class="center-message hidden" id="countdown"></div><div class="notice hidden" role="status" id="notice"></div><button class="quiet leave hidden" id="leave">Leave room</button><div class="portrait-hint">↻ Turn sideways for more room to race</div>
<div class="controls hidden" id="controls"><div id="joystick" role="group" aria-label="Movement joystick"><div id="knob"></div></div><button id="jump" aria-label="Jump">JUMP ↑</button></div><div class="keyboard-help hidden" id="keyboard-help">WASD / ARROWS &nbsp; MOVE &nbsp; · &nbsp; SPACE &nbsp; JUMP</div>
<details class="diagnostics" id="diagnostics"><summary>↗ Connection & performance</summary><pre id="stats">Loading engine…</pre><div id="fault-controls" class="hidden"><button id="fault">80ms ±40 / 3% loss</button></div><button id="export">Save diagnostics</button></details>`;
const scene = new Scene(),
    transport = new Transport(),
    controls = new Controls();
let attempt = 0,
    frameAt = performance.now();
let sim: Simulation | null = null,
    state: Snapshot | null = null,
    role: 'none' | 'host' | 'guest' = 'none',
    localId = '',
    hostId = '',
    room = '',
    busy = false;
let accepted = new Set<string>(),
    gates = new Map<string, InputGate>();
const snapshotGate = new SnapshotGate();
let lastSnapshot = 0,
    lastPacket = 0,
    lastReliable = 0,
    lastInput = 0,
    lastStats = 0,
    lastUI = 0,
    eventId = 0,
    lastEvent = 0,
    fps = 60;
let histories: { at: number; state: Snapshot }[] = [],
    ended = false,
    view = '';
let nickname = localStorage.getItem('party-panic-name') || 'Player',
    noticeUntil = 0,
    latestInput = controls.value;
const frames: number[] = [],
    rtts: number[] = [],
    logs: { at: string; type: string; payload: unknown }[] = [];
const debug = import.meta.env.DEV && new URLSearchParams(location.search).get('debug') === '1';
function log(type: string, payload: unknown) {
    logs.push({ at: new Date().toISOString(), type, payload });
    if (logs.length > 400) logs.shift();
}
function notice(text: string, seconds = 5) {
    $('#notice').textContent = text;
    $('#notice').classList.remove('hidden');
    noticeUntil = performance.now() + seconds * 1000;
    log('notice', text);
}
function showPanel(html: string) {
    $('#panel').innerHTML = html;
    $('#panel').classList.remove('hidden');
}
function homeVisible(value: boolean) {
    for (const id of ['home', 'course-card', 'footer']) $('#' + id).classList.toggle('hidden', !value);
    $('#leave').classList.toggle('hidden', value);
}
function saveName() {
    const input = $<HTMLInputElement>('#nickname');
    if (input) {
        nickname = input.value.trim().slice(0, 20) || 'Player';
        localStorage.setItem('party-panic-name', nickname);
    }
}
function nameForm(join = false) {
    view = 'form';
    homeVisible(false);
    showPanel(
        `<p class="eyebrow">${join ? 'Find your friends' : 'Make some chaos'}</p><h2>${join ? 'Join the party.' : 'Your party starts here.'}</h2><p>${join ? 'Paste a room link or the host’s room ID.' : 'Choose a nickname. Share the room, then start when everyone is ready.'}</p><label for="nickname">Your nickname</label><input id="nickname" maxlength="20" value="${escape(nickname)}" autocomplete="nickname">${join ? '<label for="room">Room link or ID</label><input id="room" placeholder="Paste the host’s link" autocomplete="off">' : ''}<div class="row"><button id="back" class="quiet">Back</button><button id="continue" class="primary">${join ? 'Join room →' : 'Create room →'}</button></div>`
    );
    $('#back').onclick = () => reset();
    $('#continue').onclick = () => {
        saveName();
        if (join) {
            const raw = $<HTMLInputElement>('#room').value.trim();
            let id = raw;
            try {
                id = new URL(raw).searchParams.get('room') || raw;
            } catch {
                /* A plain room ID is valid. */
            }
            void connect('guest', id);
        } else void connect('host');
    };
}
async function connect(next: 'host' | 'guest', id = '') {
    if (busy) return;
    if (next === 'guest' && !/^[a-zA-Z0-9-]{1,80}$/.test(id)) {
        notice('Paste a valid room link or room ID.');
        return;
    }
    const token = ++attempt;
    busy = true;
    showPanel(
        '<p class="eyebrow">Opening the party line</p><h2>Connecting…</h2><p>This needs internet for signaling. Keep both devices on the same Wi-Fi if possible.</p><button class="quiet" id="cancel">Cancel</button>'
    );
    $('#cancel').onclick = () => reset();
    role = next;
    ended = false;
    homeVisible(false);
    try {
        const openedId = await transport.open();
        if (ended || token !== attempt) return;
        localId = openedId;
        log('peer-open', { role, id: localId });
        if (next === 'host') {
            hostId = localId;
            room = localId;
            sim = new Simulation(scene);
            sim.add(localId, nickname);
            wireSim();
            state = sim.state;
            showLobby();
        } else {
            hostId = id;
            room = id;
            transport.connect(id);
            lastSnapshot = performance.now();
            setTimeout(() => {
                if (role === 'guest' && !state && !ended) {
                    notice('Could not join within 15 seconds. Check the link, Wi-Fi and host tab.', 15);
                    reset(false);
                }
            }, 15000);
        }
    } catch (e) {
        if (token === attempt) {
            notice((e as Error).message, 12);
            reset(false);
        }
    } finally {
        if (token === attempt) busy = false;
    }
}
function wireSim() {
    sim!.onEvent = (type, payload) => {
        const msg = { type: 'event', eventId: ++eventId, tick: sim!.state.tick, event: type, payload };
        transport.broadcast('control', msg, accepted);
        log(type, payload);
        sendState(true);
    };
}
function solo() {
    if (busy) return;
    ended = false;
    homeVisible(false);
    role = 'host';
    localId = 'solo';
    hostId = 'solo';
    sim = new Simulation(scene);
    sim.add(localId, nickname);
    wireSim();
    state = sim.state;
    sim.start();
    view = '';
    renderState();
}
function sendState(reliable = false) {
    if (!sim) return;
    sim.state.sequence++;
    const snapshot = { ...sim.state, players: sim.state.players.map((p) => ({ ...p })) };
    transport.broadcast(reliable ? 'control' : 'movement', snapshot, accepted);
}
function showLobby() {
    if (!state || ended) return;
    view = 'lobby';
    homeVisible(false);
    const isHost = role === 'host',
        url = new URL(location.href);
    url.search = '';
    url.searchParams.set('room', room);
    const link = url.href;
    showPanel(
        `<p class="eyebrow">The calm before the chaos</p><h2>The party room.</h2><p>${isHost ? 'One player is enough for practice. Friends make it messier.' : 'You’re in. The host starts the race.'}</p>${isHost && room ? '<div class="share"><canvas id="qr" aria-label="Scan to join this room"></canvas><div><p class="small">Invite friends · same Wi-Fi recommended</p><input id="share-link" readonly aria-label="Room link"><button class="quiet" id="copy">Copy link ↗</button></div></div>' : ''}<div class="roster" id="roster"></div><div class="row">${isHost ? '<button class="primary" id="start">Start Obstacle Dash →</button>' : '<span class="status">● Connected · Waiting for host</span>'}</div><p class="small">WASD + Space on desktop. Joystick + Jump on phones.<br>Internet needed to load and connect. Direct P2P where available.</p>`
    );
    if (isHost && room) {
        $<HTMLInputElement>('#share-link').value = link;
        void QRCode.toCanvas($('#qr'), link, {
            width: 120,
            margin: 1,
            color: { dark: '#152039', light: '#ffffff' }
        }).catch(() => notice('QR unavailable. Use the share link.'));
        $('#copy').onclick = async () => {
            try {
                await navigator.clipboard.writeText(link);
                notice('Room link copied.');
            } catch {
                $<HTMLInputElement>('#share-link').select();
                notice('Select and copy the room link.');
            }
        };
    }
    if (isHost)
        $('#start').onclick = () => {
            sim!.start();
            view = '';
            renderState();
        };
    updateRoster();
}
function updateRoster() {
    if (!state || !document.querySelector('#roster')) return;
    $('#roster').innerHTML = state.players
        .map(
            (p) =>
                `<div class="player-row"><i class="dot" style="background:${p.color}"></i><span>${escape(p.name)}${p.id === localId ? ' (you)' : ''}</span><small>${p.id === hostId ? 'HOST' : p.connected ? 'READY' : 'LEFT'}</small></div>`
        )
        .join('');
}
function results() {
    if (!state) return;
    view = 'results';
    showPanel(
        `<p class="eyebrow">Every fall was character building</p><h2>That was a dash.</h2><p>${state.players.some((p) => p.finish !== null) ? 'Same friends. Fresh chances. One more?' : 'Time’s up! Reach both checkpoints, then cross the gold gate.'}</p>${rank(
            state.players
        )
            .map(
                (p, i) =>
                    `<div class="result-row"><span class="place">${i + 1}</span><i class="dot" style="background:${p.color}"></i><span class="name">${escape(p.name)}${p.id === localId ? ' · you' : ''}</span><span class="time">${p.finish !== null ? p.finish.toFixed(2) + 's' : 'DNF · CP ' + p.checkpoint + '/2'}</span></div>`
            )
            .join(
                ''
            )}<div class="row">${role === 'host' ? '<button class="primary" id="rematch">Run it back ↻</button>' : '<p class="status">Waiting for the host to rematch…</p>'}<button class="quiet" id="result-leave">Leave</button></div>`
    );
    if (role === 'host')
        $('#rematch').onclick = () => {
            sim!.rematch();
            showLobby();
        };
    $('#result-leave').onclick = () => reset();
}
function renderState() {
    if (!state || ended) return;
    const active = state.phase === 'racing' || state.phase === 'countdown';
    document.body.classList.toggle('playing', active);
    $('#shade').classList.toggle('hidden', active);
    $('#controls').classList.toggle('hidden', !active);
    $('#keyboard-help').classList.toggle('hidden', !active);
    $('#hud').classList.toggle('hidden', !active);
    if (active) {
        $('#panel').classList.add('hidden');
        const p = state.players.find((p) => p.id === localId);
        $('#hud').innerHTML =
            `<div><small>TIME LEFT</small><strong>${Math.max(0, 120 - state.elapsed).toFixed(1)}<span style="font-size:14px">s</span></strong></div><div><small>CHECKPOINT</small><strong>${p?.checkpoint ?? 0}<span style="font-size:14px"> / 2</span></strong></div>`;
        const count = state.phase === 'countdown';
        $('#countdown').classList.toggle('hidden', !count && !state.paused && p?.finish === null);
        if (count)
            $('#countdown').innerHTML =
                `<strong>${Math.max(1, Math.ceil(state.countdown))}</strong><p>Find your footing.</p>`;
        else if (state.paused) $('#countdown').innerHTML = '<strong>PAUSED</strong><p>Host is in another tab.</p>';
        else if (p?.finish !== null)
            $('#countdown').innerHTML = '<strong>FINISHED!</strong><p>Waiting for the rest of the party…</p>';
    } else {
        $('#countdown').classList.add('hidden');
        if (state.phase === 'lobby' && view !== 'lobby') showLobby();
        if (state.phase === 'results' && view !== 'results') results();
    }
    if (view === 'lobby') updateRoster();
}
transport.onOpen = (peer, lane) => {
    log('channel-open', { peer, lane });
    if (role === 'guest' && peer === hostId && lane === 'control')
        transport.send(peer, 'control', { type: 'join', version: VERSION, nickname });
    if (role === 'host' && lane === 'control')
        setTimeout(() => {
            if (!accepted.has(peer)) transport.reject(peer, 'Join handshake timed out.');
        }, 5000);
};
transport.onMessage = (peer, lane, raw) => {
    if (role === 'host' && sim) {
        if (lane === 'movement') {
            if (!accepted.has(peer)) return;
            const input = gates.get(peer)?.accept(raw, performance.now());
            if (input) sim.input(peer, input);
            else transport.rejected++;
            return;
        }
        const msg = parseControl(raw);
        if (!msg) {
            transport.rejected++;
            return;
        }
        if (msg.type === 'join') {
            if (accepted.has(peer)) {
                transport.send(peer, 'control', { type: 'error', reason: 'Already joined.' });
                return;
            }
            const error = admission(msg.version, sim.state.players.length, sim.state.phase);
            if (error) {
                transport.reject(peer, error);
                return;
            }
            accepted.add(peer);
            gates.set(peer, new InputGate());
            sim.add(peer, msg.nickname);
            state = sim.state;
            transport.send(peer, 'control', { type: 'welcome', version: VERSION, id: peer });
            sendState(true);
            updateRoster();
            log('join', { id: peer });
        } else if (msg.type === 'ping' && accepted.has(peer))
            transport.send(peer, 'control', { type: 'pong', at: msg.at });
        else if (msg.type === 'pong' && accepted.has(peer)) {
            transport.rtt = performance.now() - msg.at;
            rtts.push(transport.rtt);
        }
    } else if (role === 'guest' && peer === hostId) {
        if (isSnapshot(raw)) {
            if (!snapshotGate.accept(raw)) return;
            state = raw;
            lastSnapshot = performance.now();
            histories.push({ at: lastSnapshot, state: raw });
            histories = histories.slice(-20);
            for (const p of raw.players) scene.addPlayer(p, false);
            for (const id of scene.characters.keys()) if (!raw.players.some((p) => p.id === id)) scene.removePlayer(id);
            if (raw.phase === 'lobby' && view !== 'lobby') showLobby();
            renderState();
            return;
        }
        if (!raw || typeof raw !== 'object') return;
        const msg = raw as Record<string, unknown>;
        if (msg.type === 'error') {
            notice(String(msg.reason), 12);
            if (!state) reset(false);
        } else if (msg.type === 'welcome' && msg.version === VERSION && msg.id === localId)
            log('welcome', { id: localId });
        else if (msg.type === 'event' && typeof msg.eventId === 'number' && msg.eventId > lastEvent) {
            lastEvent = msg.eventId;
            log(String(msg.event), msg.payload);
        } else {
            const control = parseControl(raw);
            if (control?.type === 'ping') transport.send(peer, 'control', { type: 'pong', at: control.at });
            if (control?.type === 'pong') {
                transport.rtt = performance.now() - control.at;
                rtts.push(transport.rtt);
            }
        }
    }
};
transport.onClose = (peer) => {
    log('disconnect', { peer });
    if (role === 'host') {
        accepted.delete(peer);
        gates.delete(peer);
        sim?.disconnect(peer);
        sendState(true);
        updateRoster();
    } else if (peer === hostId && !ended) endSession('The host left. This match has ended.');
};
transport.onError = (message) => {
    if (!ended) notice(message, 10);
};
function endSession(message: string) {
    ended = true;
    controls.clear();
    document.body.classList.remove('playing');
    $('#controls').classList.add('hidden');
    $('#countdown').classList.add('hidden');
    $('#hud').classList.add('hidden');
    $('#labels').innerHTML = '';
    view = 'ended';
    showPanel(
        `<p class="eyebrow">Party over, for now</p><h2>Match ended.</h2><p>${escape(message)}</p><button class="primary" id="new-room">Back to the party →</button>`
    );
    $('#new-room').onclick = () => reset();
}
function reset(clearNotice = true) {
    attempt++;
    ended = true;
    transport.close();
    for (const id of scene.characters.keys()) scene.removePlayer(id);
    sim = null;
    state = null;
    role = 'none';
    room = '';
    busy = false;
    accepted = new Set();
    gates = new Map();
    histories = [];
    snapshotGate.tick = -1;
    snapshotGate.sequence = -1;
    view = '';
    lastEvent = 0;
    transport.peer = null;
    document.body.classList.remove('playing');
    $('#panel').classList.add('hidden');
    for (const id of ['controls', 'hud', 'countdown', 'keyboard-help']) $('#' + id).classList.add('hidden');
    $('#labels').innerHTML = '';
    $('#shade').classList.remove('hidden');
    if (clearNotice) $('#notice').classList.add('hidden');
    homeVisible(true);
    scene.camera.setPosition(17, 23, 25);
    scene.camera.lookAt(0, 0, -32);
    controls.clear();
    const url = new URL(location.href);
    url.searchParams.delete('room');
    history.replaceState(null, '', url);
}
$('#solo').onclick = solo;
$('#host').onclick = () => nameForm();
$('#join-open').onclick = () => nameForm(true);
$('#leave').onclick = () => reset();
document.addEventListener('visibilitychange', () => {
    frameAt = performance.now();
    controls.clear();
    if (role === 'host' && sim) {
        sim.pause(document.hidden);
        sendState(true);
    }
});
window.addEventListener('pagehide', () => transport.close());
$('#export').onclick = () => {
    const report = {
        date: new Date().toISOString(),
        userAgent: navigator.userAgent,
        viewport: [innerWidth, innerHeight],
        role,
        ice: transport.ice,
        semantics: transport.semantics,
        counts: {
            sent: transport.sent,
            received: transport.received,
            sentBytes: transport.sentBytes,
            receivedBytes: transport.receivedBytes,
            rejected: transport.rejected
        },
        fps: summary(frames),
        rtt: summary(rtts),
        logs
    };
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }));
    a.download = 'party-panic-diagnostics.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};
function summary(values: number[]) {
    const a = [...values].sort((x, y) => x - y);
    return {
        samples: a.length,
        p5: a[Math.floor(a.length * 0.05)] ?? 0,
        median: a[Math.floor(a.length * 0.5)] ?? 0,
        p95: a[Math.floor(a.length * 0.95)] ?? 0
    };
}
if (debug) {
    $('#fault-controls').classList.remove('hidden');
    $('#fault').onclick = () => {
        transport.fault.faults = { delay: 80, jitter: 40, loss: 0.03, reorder: 0.05 };
        notice('Debug movement impairment enabled: 80ms ±40, 3% loss, 5% reorder.');
    };
}
function renderGuest(dt: number, now: number) {
    if (!state || ended) return;
    scene.obstaclesAt(state.elapsed + (state.paused ? 0 : Math.min(0.15, (now - lastSnapshot) / 1000)));
    const target = now - 100;
    let a = histories[0],
        b = histories[histories.length - 1];
    for (let i = 1; i < histories.length; i++) {
        if (histories[i].at >= target) {
            a = histories[i - 1];
            b = histories[i];
            break;
        }
    }
    if (!a || !b) return;
    const f = Math.max(0, Math.min(1, (target - a.at) / Math.max(1, b.at - a.at)));
    for (const p of state.players) {
        const e = scene.characters.get(p.id)!;
        e.enabled = p.connected;
        if (!p.connected) continue;
        const prev = a.state.players.find((q) => q.id === p.id) ?? p,
            next = b.state.players.find((q) => q.id === p.id) ?? p;
        const dest = new Vec3(
            prev.x + (next.x - prev.x) * f,
            prev.y + (next.y - prev.y) * f,
            prev.z + (next.z - prev.z) * f
        );
        if (
            p.id === localId &&
            state.phase === 'racing' &&
            p.finish === null &&
            !state.paused &&
            now - lastSnapshot < 600
        ) {
            const age = Math.min(0.15, (now - lastSnapshot) / 1000);
            dest.set(p.x + p.vx * age, p.y + p.vy * age, p.z + p.vz * age);
            const pos = e.getPosition();
            const distance = pos.distance(dest);
            if (distance < 3) {
                const alpha = 1 - Math.exp(-dt * 12);
                dest.set(
                    pos.x + latestInput.axes[0] * 2.8 * dt + (dest.x - pos.x) * alpha,
                    pos.y + (dest.y - pos.y) * alpha,
                    pos.z + latestInput.axes[1] * 2.8 * dt + (dest.z - pos.z) * alpha
                );
            }
        }
        e.setPosition(dest);
        scene.face(p.id, p.yaw);
    }
}
function labels() {
    if (!state || ended || !document.body.classList.contains('playing')) {
        $('#labels').innerHTML = '';
        return;
    }
    const html: string[] = [];
    for (const p of state.players) {
        const e = scene.characters.get(p.id);
        if (!e || !p.connected) continue;
        const pos = e.getPosition().clone();
        pos.y += 1.25;
        const screen = scene.camera.camera!.worldToScreen(pos);
        if (screen.z > 0 && screen.x > -80 && screen.x < innerWidth + 80 && screen.y > 0 && screen.y < innerHeight)
            html.push(
                `<span class="name-label" style="left:${screen.x}px;top:${screen.y}px;border-bottom:2px solid ${p.color}">${escape(p.name)}${p.id === localId ? ' · you' : ''}</span>`
            );
    }
    $('#labels').innerHTML = html.join('');
}
async function boot() {
    try {
        await scene.init($<HTMLCanvasElement>('#application-canvas'));
        log('engine-ready', { version: '2.23.3' });
        $('#stats').textContent = 'Ready. Solo practice needs no signaling.';
        frameAt = performance.now();
        scene.app.on('update', (delta: number) => {
            const dt = Math.min(delta, 0.1),
                now = performance.now(),
                actualDelta = (now - frameAt) / 1000;
            frameAt = now;
            fps = fps * 0.95 + 0.05 / Math.max(0.001, actualDelta);
            if (frames.length < 36000) frames.push(1 / Math.max(0.001, actualDelta));
            if (now - lastInput >= 1000 / 30) {
                latestInput = controls.sample();
                lastInput = now;
                if (role === 'host') sim?.input(localId, latestInput);
                else if (role === 'guest' && state) transport.send(hostId, 'movement', latestInput);
            }
            if (role === 'host' && sim && !ended) {
                sim.update(actualDelta);
                state = sim.state;
                if (now - lastPacket >= 50) {
                    sendState();
                    lastPacket = now;
                }
            }
            if (role === 'guest') renderGuest(dt, now);
            if (state && !ended) {
                if (state.phase === 'countdown' || state.phase === 'racing' || state.phase === 'results')
                    scene.follow(localId, dt);
                if (now - lastUI >= 100) {
                    renderState();
                    lastUI = now;
                }
                labels();
            }
            if (now - lastReliable >= 1000) {
                lastReliable = now;
                sendState(true);
                for (const [peer, link] of transport.links) {
                    transport.send(peer, 'control', { type: 'ping', at: now });
                    if (link.movement) void transport.inspect(link.movement);
                }
                if (role === 'guest' && state && !ended && now - lastSnapshot > 2500)
                    notice('Host inactive or connection stalled. Keep the host tab open.', 2);
                if (role === 'guest' && state && !ended && now - lastSnapshot > 20000)
                    endSession('No host updates for 20 seconds. The host may have closed or suspended the tab.');
            }
            if (now - lastStats >= 500) {
                const secs = Math.max(1, (now - transport.started) / 1000);
                $('#stats').textContent =
                    `${role.toUpperCase()} · ${Math.round(fps)} FPS · ${scene.characters.size} players\nRTT ${Math.round(transport.rtt)} ms · ${transport.ice}\n${transport.semantics}\nTX ${(transport.sentBytes / secs / 1024).toFixed(1)} KB/s · ${(transport.sent / secs).toFixed(1)} msg/s\nRX ${(transport.receivedBytes / secs / 1024).toFixed(1)} KB/s · ${(transport.received / secs).toFixed(1)} msg/s\nRejected ${transport.rejected} · tick ${state?.tick ?? 0}\n${state?.phase ?? 'home'} · ${state?.paused ? 'paused' : 'active'}\nBuild 0.1 · real-phone QA pending`;
                lastStats = now;
            }
            if (now > noticeUntil) $('#notice').classList.add('hidden');
        });
        const id = new URLSearchParams(location.search).get('room');
        if (id) {
            nameForm(true);
            $<HTMLInputElement>('#room').value = id;
        }
        if (debug) {
            Object.assign(window, {
                partyDebug: {
                    getState: () => structuredClone(state),
                    getLogs: () => logs,
                    getInput: () => latestInput,
                    setTestInput: (axes: [number, number], jumpSequence: number) => {
                        if (sim)
                            sim.input(localId, {
                                type: 'input',
                                axes,
                                jumpSequence,
                                sequence: 100000 + sim.state.tick,
                                clientTime: performance.now()
                            });
                    },
                    addTestPlayer: (name: string) => sim?.add('test-' + name, name),
                    getDiagnostics: () => ({
                        links: [...transport.links.entries()].map(([id, l]) => ({
                            id,
                            control: l.control?.peerConnection?.iceConnectionState,
                            movement: l.movement?.peerConnection?.iceConnectionState,
                            signal: l.control?.peerConnection?.signalingState
                        })),
                        elapsedSeconds: Math.max(1, (performance.now() - transport.started) / 1000),
                        ice: transport.ice,
                        semantics: transport.semantics,
                        rtt: transport.rtt,
                        bodies: scene.liveBodies.size,
                        fps: summary(frames),
                        counts: {
                            sent: transport.sent,
                            received: transport.received,
                            sentBytes: transport.sentBytes,
                            receivedBytes: transport.receivedBytes,
                            rejected: transport.rejected
                        }
                    }),
                    setFaults: (f: { delay: number; jitter: number; loss: number; reorder: number }) =>
                        (transport.fault.faults = f),
                    sendControl: (v: unknown) => transport.send(hostId, 'control', v),
                    getRenderPosition: (id: string) => {
                        const p = scene.characters.get(id)?.getPosition();
                        return p ? { x: p.x, y: p.y, z: p.z } : null;
                    },
                    sendRaw: (v: unknown) => transport.send(hostId, 'movement', v),
                    setPaused: (value: boolean) => sim?.pause(value),
                    advanceWall: (seconds: number) => sim?.update(seconds),
                    hostAdvance: (seconds: number) => {
                        if (sim) for (let i = 0; i < seconds * 60; i++) sim.step(1 / 60);
                    },
                    teleport: (id: string, z: number) => {
                        const p = sim?.state.players.find((p) => p.id === id);
                        if (p) {
                            p.x = 0;
                            p.y = 1;
                            p.z = z;
                            sim!.teleport(p);
                        }
                    },
                    stop: () => sim?.pause(true)
                }
            });
        }
    } catch (e) {
        notice((e as Error).message, 60);
        showPanel(
            '<h2>Couldn’t load the course.</h2><p>WebGL2 and WebAssembly are required. Reload on a stable connection with a current browser.</p><button class="primary" onclick="location.reload()">Reload</button>'
        );
    }
}
void boot();
