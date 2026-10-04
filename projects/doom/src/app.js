const ENGINE_FILES = ["freedm.wad", "gzdoom.pk3", "brightmaps.pk3", "game_support.pk3", "game_widescreen_gfx.pk3", "lights.pk3"];
const GAME_FILE = ["deathmatch_rockets.wad", "./game/deathmatch_rockets.wad"];
const DESKTOP_BOTS = 10;
const MOBILE_BOTS = 4;
const MAP_SETTLE_MS = 8_000;
const ui = Object.fromEntries(["doom-app", "doom-canvas", "start-screen", "start-match", "loading", "loading-text", "rotate", "status", "reset-match", "fullscreen", "mute", "controls-hint", "error", "joystick", "fire", "use", "weapon"].map((id) => [id.replaceAll("-", "_"), document.getElementById(id)]));

let engine = null;
let muted = false;
let running = false;
let touchKeys = new Set();
let audio = null;
let globalInputAttached = false;
let touchControlAttached = false;

function isMobileLayout() { return matchMedia("(pointer: coarse)").matches; }
function requestedBots() {
  const requested = Number(new URLSearchParams(location.search).get("bots"));
  if (Number.isInteger(requested) && requested >= 1 && requested <= 10) return requested;
  return isMobileLayout() ? MOBILE_BOTS : DESKTOP_BOTS;
}
function updateOrientation() {
  ui.rotate.hidden = !(isMobileLayout() && matchMedia("(orientation: portrait)").matches);
}
function setStatus(text) { ui.status.textContent = text; ui.loading_text.textContent = text; }
function percentile(values, point) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * point))];
}
function recordPerformance(frame) {
  const stamps = Array.from(frame.tsRing || []);
  const times = [];
  for (let index = 1; index < stamps.length; index++) {
    const elapsed = stamps[index] - stamps[index - 1];
    if (elapsed > 0 && elapsed < 500) times.push(elapsed);
  }
  const memory = performance.memory?.usedJSHeapSize;
  document.documentElement.dataset.doomFps = String(Math.round(frame.win1s?.fps || 0));
  document.documentElement.dataset.doomFrameP50 = percentile(times, .5).toFixed(1);
  document.documentElement.dataset.doomFrameP95 = percentile(times, .95).toFixed(1);
  if (memory) document.documentElement.dataset.doomMemoryBytes = String(memory);
}
function showError(error) {
  const message = String(error?.message || error);
  console.error("Doom Deathmatch", error);
  ui.error.textContent = message;
  ui.error.hidden = false;
  ui.loading.hidden = true;
  ui.start_screen.hidden = false;
  ui.start_match.disabled = false;
  ui.start_match.textContent = "TRY AGAIN";
}
function clearError() { ui.error.hidden = true; ui.error.textContent = ""; }
function legacyKeyCode(key, code) {
  if (key === " ") return 32;
  if (key === "Enter") return 13;
  if (key === "Escape") return 27;
  if (key === "`") return 192;
  if (key === "]") return 221;
  if (key === "[") return 219;
  if (key === "Control") return 17;
  if (key === "Shift") return 16;
  if (key?.startsWith("Arrow")) return { ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40 }[key];
  if (key?.length === 1) return key.toUpperCase().charCodeAt(0);
  if (/^Digit[1-6]$/.test(code || "")) return code.charCodeAt(5);
  return 0;
}

class AudioRelay {
  constructor() { this.context = null; this.gain = null; this.sources = new Map(); }
  async enable() {
    if (!this.context) {
      const Context = window.AudioContext || window.webkitAudioContext;
      if (!Context) return;
      this.context = new Context();
      this.gain = this.context.createGain();
      this.gain.connect(this.context.destination);
    }
    try { await this.context.resume(); } catch (_) { /* gameplay does not depend on audio */ }
    this.setMuted(muted);
  }
  setMuted(next) {
    muted = next;
    if (this.gain && this.context) this.gain.gain.setValueAtTime(muted ? 0 : 1, this.context.currentTime);
    ui.mute.textContent = muted ? "UNMUTE" : "MUTE";
    ui.mute.setAttribute("aria-pressed", String(muted));
  }
  stopAll() {
    for (const source of this.sources.values()) { try { source.stop(); } catch (_) { /* already stopped */ } }
    this.sources.clear();
  }
  play(message) {
    if (!this.context || !this.gain || !message.ch0) return;
    try {
      const channels = Math.max(1, Math.min(2, message.channels || 1));
      const buffer = this.context.createBuffer(channels, message.ch0.length, message.sampleRate || 44_100);
      buffer.copyToChannel(message.ch0, 0);
      if (channels > 1 && message.ch1) buffer.copyToChannel(message.ch1, 1);
      const source = this.context.createBufferSource();
      const sourceGain = this.context.createGain();
      source.buffer = buffer; source.loop = Boolean(message.loop); source.loopStart = message.loopStart || 0; source.loopEnd = message.loopEnd || 0;
      source.playbackRate.value = message.playbackRate || 1;
      sourceGain.gain.value = Number.isFinite(message.gain) ? message.gain : 1;
      source.connect(sourceGain).connect(this.gain);
      source.onended = () => this.sources.delete(message.sourceId);
      this.sources.set(message.sourceId, source);
      source.start(0, Math.max(0, message.offset || 0), message.duration >= 0 ? message.duration : undefined);
    } catch (_) { /* audio is an enhancement, never a match blocker */ }
  }
  stop(message) {
    const source = this.sources.get(message.sourceId);
    if (!source) return;
    try { source.stop(); } catch (_) { /* already stopped */ }
    this.sources.delete(message.sourceId);
  }
}

class Engine {
  constructor(canvas) { this.canvas = canvas; this.worker = null; this.ready = false; this.heldKeys = new Map(); this.botTimer = null; this.snapshotTimer = null; }
  async start() {
    setStatus("LOADING ENGINE");
    const specs = [...ENGINE_FILES.map((name) => [name, `./engine/${name}`]), GAME_FILE];
    const loaded = await Promise.all(specs.map(async ([name, url]) => {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Could not load ${name} (${response.status}).`);
      return [name, new Uint8Array(await response.arrayBuffer())];
    }));
    const files = Object.fromEntries(loaded.map(([name, bytes]) => [`/${name}`, bytes]));
    const offscreen = this.canvas.transferControlToOffscreen();
    this.worker = new Worker("./doom.worker.js", { name: "doom-deathmatch-engine" });
    this.worker.onmessage = ({ data }) => this.message(data);
    this.worker.onerror = (event) => showError(`Engine worker error: ${event.message}`);
    const args = [
      "-iwad", "freedm.wad", "-file", GAME_FILE[0], "-deathmatch", "-warp", "01",
      "+vid_rendermode", "4", "+vid_preferbackend", "1", "+vid_fullscreen", "0", "+vid_defwidth", "320", "+vid_defheight", "200", "+win_w", "320", "+win_h", "200",
      "+vid_scalemode", "0", "+vid_vsync", "0", "+vid_maxfps", "120", "+cl_capfps", "0", "+gl_texture_filter", "0", "+set", "uiscale", "0", "+set", "st_scale", "0", "+set", "screenblocks", "12", "+set", "hud_althud", "0", "+set", "snd_mididevice", "0", "+set", "sv_forcerespawn", "1", "+set", "sv_respawnprotect", "0", "+set", "sv_maxplayers", "12",
    ];
    this.worker.postMessage({ type: "boot", canvas: offscreen, pinW: 320, pinH: 200, args, files, devMode: false }, [offscreen, ...Object.values(files).map((bytes) => bytes.buffer)]);
  }
  message(message) {
    if (message?.audio === "play") { audio?.play(message); return; }
    if (message?.audio === "stop") { audio?.stop(message); return; }
    if (message.type === "snapshot") {
      document.documentElement.dataset.doomFrameLuminance = String(Math.round(message.lumMean || 0));
      if (message.lumMean > 2) { clearInterval(this.snapshotTimer); this.snapshotTimer = null; }
      return;
    }
    if (message.type === "ready") {
      this.ready = true;
      setStatus("LOADING MAP");
      this.snapshotTimer = setInterval(() => this.worker?.postMessage({ type: "snapshot-request" }), 1_500);
      this.botTimer = setTimeout(() => this.spawnBots(), MAP_SETTLE_MS);
      return;
    }
    if (message.type === "frame-stats") { recordPerformance(message); const fps = Math.round(message.win1s?.fps || 0); if (fps) ui.status.textContent = `LOCAL GAME · ${fps} FPS · BOTS ${requestedBots()}`; return; }
    if (message.type === "error" || message.type === "abort") showError(message.reason || message.message || "The game engine stopped.");
    if (message.type === "log" && message.stream === "stderr" && /fatal|script error/i.test(message.msg)) console.warn("GZDoom:", message.msg);
  }
  spawnBots() {
    if (!this.worker || !this.ready) return;
    const count = requestedBots();
    setStatus("SPAWNING BOTS");
    this.worker.postMessage({ type: "console-commands", commands: Array(count).fill("addbot"), spacingMs: 450 });
    setTimeout(() => {
      if (this.worker) {
        this.worker.postMessage({ type: "snapshot-request" });
        setStatus(`READY · LOCAL GAME · BOTS ${count}`); ui.loading.hidden = true; ui.controls_hint.hidden = false;
      }
    }, count * 450 + 450);
  }
  input(event, target = "window") { this.worker?.postMessage({ type: "input", target, evType: event.type, init: event }); }
  key(key, code, down) {
    const id = code || key;
    if (!this.worker || !running) return;
    if (down && this.heldKeys.has(id)) return;
    if (!down && !this.heldKeys.has(id)) return;
    if (down) this.heldKeys.set(id, { key, code }); else this.heldKeys.delete(id);
    const keyCode = legacyKeyCode(key, code);
    this.input({ type: down ? "keydown" : "keyup", key, code, keyCode, which: keyCode, charCode: down && key.length === 1 ? keyCode : 0 });
  }
  clearInput() { for (const { key, code } of this.heldKeys.values()) this.key(key, code, false); touchKeys.clear(); }
  pointerLock(locked) { this.worker?.postMessage({ type: "pointerlock", locked }); }
  stop() { clearTimeout(this.botTimer); clearInterval(this.snapshotTimer); this.clearInput(); this.worker?.terminate(); this.worker = null; this.ready = false; }
}

function refreshTouchKeys(next) {
  const all = new Map([...touchKeys, ...next].map((entry) => [entry.code, entry]));
  for (const entry of all.values()) engine?.key(entry.key, entry.code, next.has(entry));
  touchKeys = next;
}
function gameKey(event, down) {
  if (!running || !engine?.ready) return;
  const allowed = new Set(["KeyW", "KeyA", "KeyS", "KeyD", "KeyE", "Space", "ShiftLeft", "ShiftRight", "ControlLeft", "ControlRight", "ArrowLeft", "ArrowRight", "Digit1", "Digit2", "Digit3", "Digit4", "Digit5", "Digit6"]);
  if (!allowed.has(event.code)) return;
  event.preventDefault(); engine.key(event.key, event.code, down);
}
function setPointerLock() { if (running) ui.doom_canvas.requestPointerLock?.(); }
function setupDesktopInput() {
  if (!globalInputAttached) {
    globalInputAttached = true;
    window.addEventListener("keydown", (event) => gameKey(event, true));
    window.addEventListener("keyup", (event) => gameKey(event, false));
    window.addEventListener("blur", () => engine?.clearInput());
    document.addEventListener("visibilitychange", () => { engine?.worker?.postMessage({ type: "visibility", state: document.visibilityState }); if (document.hidden) engine?.clearInput(); });
    document.addEventListener("pointerlockchange", () => engine?.pointerLock(document.pointerLockElement === ui.doom_canvas));
  }
  ui.doom_canvas.addEventListener("click", setPointerLock);
  ui.doom_canvas.addEventListener("pointerdown", () => { ui.controls_hint.hidden = true; }, { once: true });
  ui.doom_canvas.addEventListener("contextmenu", (event) => event.preventDefault());
  ui.doom_canvas.addEventListener("mousemove", (event) => { if (running && document.pointerLockElement === ui.doom_canvas) engine?.input({ type: "mousemove", movementX: event.movementX, movementY: event.movementY, buttons: event.buttons }, "canvas"); });
  for (const type of ["mousedown", "mouseup"]) ui.doom_canvas.addEventListener(type, (event) => {
    if (!running || event.button !== 0) return;
    event.preventDefault(); engine?.input({ type, button: event.button, buttons: event.buttons, clientX: event.clientX, clientY: event.clientY }, type === "mouseup" ? "document" : "canvas"); if (type === "mousedown") setPointerLock();
  });
}
function setupTouchInput() {
  let aiming = null;
  if (!touchControlAttached) {
    touchControlAttached = true;
    let stick = null;
  const movement = ["KeyW", "KeyA", "KeyS", "KeyD"];
  const releaseMove = () => refreshTouchKeys(new Set([...touchKeys].filter((entry) => !movement.includes(entry.code))));
  const updateStick = (event) => {
    if (!stick || !running) return;
    event.preventDefault(); const dx = event.clientX - stick.x; const dy = event.clientY - stick.y; const distance = Math.min(37, Math.hypot(dx, dy)); const angle = Math.atan2(dy, dx);
    ui.joystick.querySelector("i").style.transform = `translate(${Math.cos(angle) * distance}px, ${Math.sin(angle) * distance}px)`;
    const next = new Set([...touchKeys].filter((entry) => !movement.includes(entry.code)));
    if (dy < -12) next.add({ key: "w", code: "KeyW" }); if (dy > 12) next.add({ key: "s", code: "KeyS" }); if (dx < -12) next.add({ key: "a", code: "KeyA" }); if (dx > 12) next.add({ key: "d", code: "KeyD" }); refreshTouchKeys(next);
  };
  ui.joystick.addEventListener("pointerdown", (event) => { if (!running) return; event.preventDefault(); stick = { x: event.clientX, y: event.clientY }; ui.joystick.setPointerCapture(event.pointerId); updateStick(event); });
  ui.joystick.addEventListener("pointermove", updateStick);
  for (const type of ["pointerup", "pointercancel"]) ui.joystick.addEventListener(type, () => { stick = null; ui.joystick.querySelector("i").style.transform = ""; releaseMove(); });
  const holdKey = (element, key, code) => {
    element.addEventListener("pointerdown", (event) => { event.preventDefault(); if (!running) return; element.setPointerCapture(event.pointerId); engine?.key(key, code, true); });
    for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) element.addEventListener(type, (event) => { event.preventDefault(); engine?.key(key, code, false); });
  };
  holdKey(ui.fire, "Control", "ControlLeft"); holdKey(ui.use, "e", "KeyE");
  ui.weapon.addEventListener("pointerdown", (event) => { event.preventDefault(); if (!running) return; engine?.key("]", "BracketRight", true); engine?.key("]", "BracketRight", false); });
  }
  ui.doom_canvas.addEventListener("pointerdown", (event) => { if (running && event.pointerType === "touch" && event.clientX > innerWidth * .4) { aiming = { x: event.clientX, y: event.clientY, id: event.pointerId }; ui.doom_canvas.setPointerCapture(event.pointerId); } });
  ui.doom_canvas.addEventListener("pointermove", (event) => { if (!aiming || event.pointerId !== aiming.id || !running) return; event.preventDefault(); engine?.input({ type: "mousemove", movementX: event.clientX - aiming.x, movementY: event.clientY - aiming.y, buttons: 0 }, "canvas"); aiming = { ...aiming, x: event.clientX, y: event.clientY }; });
  for (const type of ["pointerup", "pointercancel"]) ui.doom_canvas.addEventListener(type, (event) => { if (aiming?.id === event.pointerId) aiming = null; });
}
async function bootMatch() {
  clearError(); ui.start_screen.hidden = true; ui.loading.hidden = false; ui.start_match.disabled = true; setStatus("LOADING ENGINE");
  audio ||= new AudioRelay(); await audio.enable(); audio.setMuted(muted); running = true; engine = new Engine(ui.doom_canvas); await engine.start();
}
async function resetMatch() {
  if (!running && !engine) return;
  setStatus("LOADING ENGINE"); ui.loading.hidden = false; ui.controls_hint.hidden = true; running = false; engine?.stop(); audio?.stopAll();
  const replacement = document.createElement("canvas"); replacement.id = "doom-canvas"; replacement.width = 320; replacement.height = 200; replacement.setAttribute("aria-label", "Doom deathmatch game"); ui.doom_canvas.replaceWith(replacement); ui.doom_canvas = replacement;
  setupDesktopInput(); setupTouchInput(); await bootMatch();
}
function fullscreen() { if (document.fullscreenElement) document.exitFullscreen?.(); else ui.doom_app.requestFullscreen?.().catch(() => {}); }
function main() {
  if (!window.OffscreenCanvas || !HTMLCanvasElement.prototype.transferControlToOffscreen) { showError("This demo requires a current Chromium-family browser with OffscreenCanvas support."); return; }
  audio = new AudioRelay(); audio.setMuted(false);
  ui.start_match.addEventListener("click", () => bootMatch().catch(showError)); ui.reset_match.addEventListener("click", () => resetMatch().catch(showError)); ui.fullscreen.addEventListener("click", fullscreen); ui.mute.addEventListener("click", () => audio.setMuted(!muted));
  addEventListener("resize", updateOrientation); addEventListener("orientationchange", updateOrientation); updateOrientation();
  setupDesktopInput(); setupTouchInput();
}
main();
