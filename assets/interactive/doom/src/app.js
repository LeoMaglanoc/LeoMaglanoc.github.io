import { ArnoldPolicy, ACTIONS } from "./policy.js";

const TICK_MS = 1000 / (35 / 3);
const PASSIVE_SMOKE = new URLSearchParams(location.search).has("passive");
const SINGLEPLAYER_SMOKE = new URLSearchParams(location.search).has("singleplayer");
const NO_BRIDGE_SMOKE = new URLSearchParams(location.search).has("nobridge");
const FILES = ["freedm.wad", "gzdoom.pk3", "brightmaps.pk3", "game_support.pk3", "game_widescreen_gfx.pk3", "lights.pk3", "bridge.pk3"];
const KEYS = { forward: "w", backward: "s", strafeLeft: "a", strafeRight: "d", turnLeft: "ArrowLeft", turnRight: "ArrowRight", attack: "Control" };
const ui = Object.fromEntries(["doom-app", "doom-canvas", "loading", "loading-text", "rotate", "mode-label", "frags", "deaths", "health", "ammo", "runtime", "perf", "take-control", "return-ai", "reset-match", "error", "q-values", "joystick", "fire"].map((id) => [id.replaceAll("-", "_"), document.getElementById(id)]));

let engine, policy, state = { health: 0, ammo: 0, frags: 0, deaths: 0 }, mode = "ai";
let currentKeys = new Set(), inferenceBusy = false, observationId = 0, timer = null, moveMissing = 0, turnMissing = 0;
let perf = { samples: [], frames: 0, fps: 0, lastAction: 0, started: performance.now() };

function showError(error) { ui.error.textContent = String(error && error.message || error); ui.error.hidden = false; ui.loading.hidden = true; }
function setLoading(text) { ui.loading_text.textContent = text; ui.loading.hidden = false; }
function updateStats() { for (const field of ["frags", "deaths", "health", "ammo"]) ui[field].textContent = state[field]; }
function percentile(values, p) { if (!values.length) return 0; const sorted = [...values].sort((a, b) => a - b); return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p))]; }
function updatePerf() { const p50 = percentile(perf.samples, .5), p95 = percentile(perf.samples, .95); ui.perf.textContent = `Policy ${(1000 / TICK_MS).toFixed(1)} Hz · ${p50.toFixed(1)}/${p95.toFixed(1)} ms`; }
function updateQValues(q) { ui.q_values.textContent = q.map((value, i) => `${String(i).padStart(2, "0")} ${ACTIONS[i].join(" + ").toUpperCase().padEnd(28)} ${value.toFixed(3)}`).join("\n"); }

class Engine {
  constructor(canvas) { this.canvas = canvas; this.worker = null; this.ready = false; this.onState = null; this.onObservation = null; this.onFrame = null; }
  async start() {
    const loaded = await Promise.all(FILES.map(async (name) => [name, new Uint8Array(await (await fetch(`./engine/${name}`)).arrayBuffer())]));
    const files = Object.fromEntries(loaded.map(([name, bytes]) => [`/${name}`, bytes]));
    const offscreen = this.canvas.transferControlToOffscreen();
    this.worker = new Worker("./doom.worker.js", { name: "ai-doom-engine" });
    this.worker.onmessage = (event) => this.message(event.data);
    this.worker.onerror = (event) => showError(`Engine worker error: ${event.message}`);
    const args = [
      "-iwad", "freedm.wad", ...(NO_BRIDGE_SMOKE ? [] : ["-file", "bridge.pk3"]), ...(SINGLEPLAYER_SMOKE ? [] : ["-host", "1", "-deathmatch"]), "-warp", "01",
      "+vid_rendermode", "4", "+vid_preferbackend", "1", "+vid_fullscreen", "0", "+vid_defwidth", "320", "+vid_defheight", "200", "+win_w", "320", "+win_h", "200", "+vid_scalemode", "0", "+vid_vsync", "0", "+vid_maxfps", "120", "+cl_capfps", "0", "+gl_texture_filter", "0", "+set", "uiscale", "0", "+set", "st_scale", "0", "+set", "screenblocks", "12", "+set", "hud_althud", "0", "+set", "snd_mididevice", "0", "+set", "sv_cheats", "1", "+set", "sv_forcerespawn", "1", "+set", "sv_respawnprotect", "0", "+set", "sv_maxplayers", "12"
    ];
    this.worker.postMessage({ type: "boot", canvas: offscreen, pinW: 320, pinH: 200, args, files, devMode: false }, [offscreen, ...Object.values(files).map((bytes) => bytes.buffer)]);
  }
  message(message) {
    if (message.type === "ready") { this.ready = true; this.onReady(); return; }
    if (message.type === "bridge-state") { this.onState?.(message); return; }
    if (message.type === "bridge-observation") { this.onObservation?.(message); return; }
    if (message.type === "frame-stats") { this.onFrame?.(message); return; }
    if (message.type === "abort" || message.type === "error" || message.type === "bridge-error") { console.error("AI Doom engine", message); showError(message.reason || message.message); }
    if (message.type === "log") {
      this.logs = [...(this.logs || []).slice(-399), message.msg]; window.__doomEngineLogs = this.logs;
      if (/bot|unknown command|player [0-9]+ of/i.test(message.msg)) window.__doomBotLogs = [...(window.__doomBotLogs || []), message.msg];
    }
    if (message.type === "log" && message.stream === "stderr" && /script error|fatal|unknown command/i.test(message.msg)) console.warn("GZDoom:", message.msg);
  }
  onReady() { ui.loading.hidden = true; ui.take_control.disabled = false; ui.reset_match.disabled = false; ui.mode_label.textContent = "AI CONTROL"; if (!PASSIVE_SMOKE) this.addBots(); }
  addBots() { for (let i = 0; i < 10; i++) setTimeout(() => this.worker?.postMessage({ type: "bridge-console", command: "addbot" }), 700 + i * 420); }
  requestObservation() { this.worker?.postMessage({ type: "bridge-observation-request", requestId: ++observationId }); }
  setKeys(next) {
    for (const control of currentKeys) if (!next.has(control)) this.key(control, false);
    for (const control of next) if (!currentKeys.has(control)) this.key(control, true);
    currentKeys = next;
  }
  key(control, down) { const key = KEYS[control] || control; this.worker?.postMessage({ type: "bridge-key", key, down }); }
  input(event, target = "window") { this.worker?.postMessage({ type: "input", target, evType: event.type, init: event }); }
  pointerLock(locked) { this.worker?.postMessage({ type: "pointerlock", locked }); }
  stop() { this.setKeys(new Set()); this.worker?.terminate(); this.worker = null; this.ready = false; }
}

function aiControls(controls) {
  const set = new Set(controls);
  const moving = set.has("forward") || set.has("backward") || set.has("strafeLeft") || set.has("strafeRight");
  const turning = set.has("turnLeft") || set.has("turnRight");
  moveMissing = moving ? 0 : moveMissing + 1; turnMissing = turning ? 0 : turnMissing + 1;
  if (moveMissing >= 30) { set.add("forward"); moveMissing = 0; }
  if (turnMissing >= 60) { set.add("turnRight"); turnMissing = 0; }
  return set;
}

async function onObservation(message) {
  if (inferenceBusy || !policy || !engine?.ready) return;
  inferenceBusy = true;
  try {
    const start = performance.now();
    const result = await policy.act(new Uint8Array(message.rgb), message.width, message.height, state.health, state.ammo);
    const elapsed = performance.now() - start;
    perf.samples.push(elapsed); if (perf.samples.length > 240) perf.samples.shift(); perf.lastAction = result.action;
    updatePerf(); updateQValues(result.q);
    if (mode === "ai") engine.setKeys(aiControls(result.controls));
  } catch (error) { showError(error); }
  finally { inferenceBusy = false; }
}

function startPolicyClock() { clearInterval(timer); timer = setInterval(() => { if (engine?.ready && !inferenceBusy) engine.requestObservation(); }, TICK_MS); }
function switchMode(next) {
  mode = next; ui.mode_label.textContent = next === "ai" ? "AI CONTROL" : "YOU CONTROL";
  ui.take_control.hidden = next === "human"; ui.return_ai.hidden = next !== "human";
  if (next === "ai") { engine.canvas.requestPointerLock?.(); } else { engine.setKeys(new Set()); document.exitPointerLock?.(); }
}

function forwardHumanInput() {
  const toControl = { KeyW: "forward", KeyS: "backward", KeyA: "strafeLeft", KeyD: "strafeRight", ArrowLeft: "turnLeft", ArrowRight: "turnRight", ControlLeft: "attack", ControlRight: "attack" };
  window.addEventListener("keydown", (event) => { if (mode !== "human" || !engine?.ready) return; const control = toControl[event.code]; if (!control) return; event.preventDefault(); const next = new Set(currentKeys); next.add(control); engine.setKeys(next); });
  window.addEventListener("keyup", (event) => { const control = toControl[event.code]; if (!control) return; const next = new Set(currentKeys); next.delete(control); engine?.setKeys(next); });
  ui.doom_canvas.addEventListener("click", () => { if (mode === "human") ui.doom_canvas.requestPointerLock?.(); });
  document.addEventListener("pointerlockchange", () => engine?.pointerLock(document.pointerLockElement === ui.doom_canvas));
  ui.doom_canvas.addEventListener("mousemove", (event) => { if (mode !== "human" || document.pointerLockElement !== ui.doom_canvas) return; engine.input({ type: "mousemove", movementX: event.movementX, movementY: event.movementY, buttons: event.buttons }, "canvas"); });
  for (const type of ["mousedown", "mouseup"]) ui.doom_canvas.addEventListener(type, (event) => { if (mode === "human") engine.input({ type, button: event.button, buttons: event.buttons, clientX: event.clientX, clientY: event.clientY }, type === "mouseup" ? "document" : "canvas"); });
}

function addTouchInput() {
  let stick = null, aiming = null;
  const updateStick = (event) => { if (!stick || mode !== "human") return; const dx = event.clientX - stick.x, dy = event.clientY - stick.y, distance = Math.min(37, Math.hypot(dx, dy)), angle = Math.atan2(dy, dx); ui.joystick.querySelector("i").style.transform = `translate(${Math.cos(angle) * distance}px, ${Math.sin(angle) * distance}px)`; const next = new Set([...currentKeys].filter((x) => !["forward", "backward", "strafeLeft", "strafeRight"].includes(x))); if (dy < -12) next.add("forward"); if (dy > 12) next.add("backward"); if (dx < -12) next.add("strafeLeft"); if (dx > 12) next.add("strafeRight"); engine.setKeys(next); };
  ui.joystick.addEventListener("pointerdown", (event) => { stick = { x: event.clientX, y: event.clientY }; ui.joystick.setPointerCapture(event.pointerId); updateStick(event); });
  ui.joystick.addEventListener("pointermove", updateStick); ui.joystick.addEventListener("pointerup", () => { stick = null; ui.joystick.querySelector("i").style.transform = ""; engine?.setKeys(new Set([...currentKeys].filter((x) => !["forward", "backward", "strafeLeft", "strafeRight"].includes(x)))); });
  ui.doom_canvas.addEventListener("pointerdown", (event) => { if (mode === "human" && event.pointerType === "touch" && event.clientX > innerWidth * .42) { aiming = { x: event.clientX, y: event.clientY }; ui.doom_canvas.setPointerCapture(event.pointerId); } });
  ui.doom_canvas.addEventListener("pointermove", (event) => { if (!aiming || mode !== "human") return; engine.input({ type: "mousemove", movementX: event.clientX - aiming.x, movementY: event.clientY - aiming.y, buttons: 0 }, "canvas"); aiming = { x: event.clientX, y: event.clientY }; });
  ui.doom_canvas.addEventListener("pointerup", () => { aiming = null; });
  for (const eventName of ["pointerdown", "pointerup", "pointercancel"]) ui.fire.addEventListener(eventName, (event) => { event.preventDefault(); if (mode !== "human") return; const next = new Set(currentKeys); eventName === "pointerdown" ? next.add("attack") : next.delete("attack"); engine.setKeys(next); });
}

async function resetMatch() {
  clearInterval(timer); engine?.stop(); policy?.reset(); state = { health: 0, ammo: 0, frags: 0, deaths: 0 }; updateStats(); currentKeys = new Set(); moveMissing = 0; turnMissing = 0; perf = { samples: [], frames: 0, fps: 0, lastAction: 0, started: performance.now() }; switchMode("ai");
  const replacement = document.createElement("canvas"); replacement.id = "doom-canvas"; replacement.width = 320; replacement.height = 200; replacement.setAttribute("aria-label", "AI Doom game"); ui.doom_canvas.replaceWith(replacement); ui.doom_canvas = replacement;
  forwardHumanInput(); addTouchInput(); await bootEngine();
}

async function bootEngine() {
  setLoading("Mounting FreeDM and starting a 10-bot deathmatch…"); engine = new Engine(ui.doom_canvas); engine.onState = (next) => { const respawned = state.health <= 0 && next.health > 0; state = next; if (respawned) policy.reset(); updateStats(); }; engine.onObservation = onObservation; engine.onFrame = (frame) => { perf.fps = frame.win1s?.fps || perf.fps; ui.runtime.textContent = `Local / WASM · ${Math.round(perf.fps || 0)} FPS`; }; await engine.start(); if (!PASSIVE_SMOKE) startPolicyClock();
}

async function main() {
  try {
    if (!window.OffscreenCanvas || !HTMLCanvasElement.prototype.transferControlToOffscreen) throw new Error("This demo requires a browser with OffscreenCanvas support (current Chrome or Edge).");
    setLoading("Loading Arnold Track-1 policy…"); policy = new ArnoldPolicy(new URL("../models/arnold_track1.onnx", import.meta.url)); await policy.load();
    ui.take_control.addEventListener("click", () => switchMode("human")); ui.return_ai.addEventListener("click", () => switchMode("ai")); ui.reset_match.addEventListener("click", () => resetMatch().catch(showError));
    forwardHumanInput(); addTouchInput(); await bootEngine();
  } catch (error) { showError(error); }
}

main();
