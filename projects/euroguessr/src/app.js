import { preprocessCLIP } from "./clip-preprocess.js?v=f32-2";
import { preprocess } from "./preprocess.js";
import { distance, score, project, unproject, shuffled } from "./geo.js";
import { pointerGestures, photoStep, clampPhoto, mapStep } from "./gestures.js";
const $ = (id) => document.getElementById(id);
const svgNS = "http://www.w3.org/2000/svg";
let pack = [],
  metadata,
  activeMode = "tiny",
  rounds = [],
  results = [],
  index = 0,
  guess = null,
  ai = null,
  deadline = 0,
  timer = null,
  phase = "loading",
  token = 0,
  view = [0, 0, 700, 630],
  keyboard = { lat: 52, lon: 15 },
  lastLatency = 0;
let worker;
const pending = new Map();
let readyResolve, readyReject;
const ready = new Promise((resolve, reject) => {
  readyResolve = resolve;
  readyReject = reject;
});
function createWorker() {
  worker = new Worker(new URL("./inference.worker.js", import.meta.url));
  const instance = worker;
  worker.onmessage = ({ data }) => {
    if (instance !== worker) return;
    if (data.type === "ready") {
      metadata = data.metadata;
      activeMode = data.mode || "tiny";
      readyResolve();
    } else if (data.type === "progress") {
      $("load-status").textContent = data.initializing
        ? "Download verified. Preparing GeoCLIP on your browser CPU…"
        : `${data.mode === "tiny" ? "Tiny AI" : "GeoCLIP"}: ${(data.bytes / 1048576).toFixed(0)} / ${(data.total / 1048576).toFixed(0)} MiB loaded${
            data.cached ? " · cached" : ""
          }`;
    } else if (data.type === "error") {
      const task = pending.get(data.token);
      if (task) {
        task.reject(Error(data.message));
        pending.delete(data.token);
      } else readyReject(Error(data.message));
    } else if (data.type === "prediction") {
      pending.get(data.token)?.resolve(data);
      pending.delete(data.token);
    }
  };
  worker.onerror = (event) => {
    if (instance !== worker) return;
    const error = Error(event.message || "Browser inference worker failed");
    readyReject(error);
    for (const task of pending.values()) task.reject(error);
    pending.clear();
  };
}
createWorker();
async function getJSON(path) {
  const r = await fetch(path);
  if (!r.ok) throw Error(`Cannot load ${path} (${r.status})`);
  return r.json();
}
function storageGet(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}
function storageSet(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}
function element(name, attrs, parent) {
  const el = document.createElementNS(svgNS, name);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  parent.append(el);
  return el;
}
function drawMap(data) {
  for (let lat = 35; lat <= 70; lat += 5) {
    const a = project({ lat, lon: -25 }),
      b = project({ lat, lon: 45 });
    element("path", { d: `M${a}L${b}` }, $("graticule"));
  }
  for (let lon = -20; lon <= 40; lon += 10) {
    const a = project({ lat: 34, lon }),
      b = project({ lat: 72, lon });
    element("path", { d: `M${a}L${b}` }, $("graticule"));
  }
  for (const feature of data.features) {
    const polygons = feature.geometry.type === "Polygon" ? [feature.geometry.coordinates] : feature.geometry.coordinates;
    let d = "";
    for (const polygon of polygons)
      for (const ring of polygon) {
        d += ring.map(([lon, lat], i) => `${i ? "L" : "M"}${project({ lat, lon }).join(",")}`).join("") + "Z";
      }
    element("path", { d, "fill-rule": "evenodd" }, $("countries"));
  }
  const labels = [
    ["ICELAND", 65, -19],
    ["NORWAY", 65, 9],
    ["SWEDEN", 62, 17],
    ["FINLAND", 65, 26],
    ["UK", 54, -3],
    ["IRELAND", 53, -8],
    ["FRANCE", 47, 2],
    ["SPAIN", 40, -4],
    ["PORTUGAL", 39, -9],
    ["ITALY", 42, 12],
    ["GERMANY", 51, 10],
    ["POLAND", 52, 19],
    ["ROMANIA", 46, 25],
    ["GREECE", 39, 23],
    ["UKRAINE", 49, 32],
  ];
  for (const [name, lat, lon] of labels) {
    const [x, y] = project({ lat, lon });
    element("text", { x, y, "text-anchor": "middle" }, $("labels")).textContent = name;
  }
}
function updateView() {
  $("map").setAttribute("viewBox", view.join(" "));
  drawCities();
}
function zoom(factor, anchor = { x: view[0] + view[2] / 2, y: view[1] + view[3] / 2 }) {
  view = mapStep(view, 1 / factor, anchor);
  updateView();
}
function resetMap() {
  view = [0, 0, 700, 630];
  updateView();
}
function mapPoint(event) {
  const p = $("map").createSVGPoint();
  p.x = event.clientX;
  p.y = event.clientY;
  return p.matrixTransform($("map").getScreenCTM().inverse());
}
function pin(point, color, label) {
  const [x, y] = project(point);
  const g = element("g", {}, $("pins"));
  element("circle", { cx: x, cy: y, r: 10, fill: color, stroke: "white", "stroke-width": 2, "vector-effect": "non-scaling-stroke" }, g);
  element("text", { x, y: y + 3.5, "text-anchor": "middle", fill: "white", "font-size": 10, "font-weight": 700 }, g).textContent = label;
}
function renderPins(reveal = false) {
  $("pins").replaceChildren();
  $("routes").replaceChildren();
  if (guess) pin(guess, "#2563eb", "Y");
  if (reveal) {
    const actual = rounds[index];
    for (const [point, color] of [
      [guess, "#2563eb"],
      [ai, "#db622f"],
    ])
      if (point) {
        const a = project(point),
          b = project(actual);
        element(
          "path",
          { d: `M${a}L${b}`, fill: "none", stroke: color, "stroke-width": 2, "stroke-dasharray": "5 5", "vector-effect": "non-scaling-stroke" },
          $("routes")
        );
      }
    pin(ai, "#db622f", "A");
    pin(actual, "#178465", "✓");
  }
}
function setGuess(point) {
  if (phase !== "playing") return;
  guess = point;
  keyboard = point;
  renderPins();
  $("selection").textContent = `Your pin: ${point.lat.toFixed(2)}° N, ${Math.abs(point.lon).toFixed(2)}° ${point.lon < 0 ? "W" : "E"}`;
  $("guess").disabled = false;
  $("live").textContent = $("selection").textContent;
}
const mapGestures = pointerGestures($("map"), {
  change({ factor, anchor, delta }) {
    const point = mapPoint({ clientX: anchor.x, clientY: anchor.y });
    const matrix = $("map").getScreenCTM();
    view = mapStep(view, factor, point, { x: delta.x / matrix.a, y: delta.y / matrix.d });
    updateView();
  },
  tap(event) {
    const p = mapPoint(event);
    setGuess(unproject(p.x, p.y));
  },
});
$("map").addEventListener(
  "wheel",
  (event) => {
    event.preventDefault();
    zoom(Math.exp(Math.max(-0.3, Math.min(0.3, event.deltaY * 0.002))), mapPoint(event));
  },
  { passive: false }
);
$("map").addEventListener("keydown", (event) => {
  const delta = (0.5 * view[2]) / 700;
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    setGuess(keyboard);
  } else if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) {
    event.preventDefault();
    keyboard.lat += event.key === "ArrowUp" ? delta : event.key === "ArrowDown" ? -delta : 0;
    keyboard.lon += event.key === "ArrowRight" ? delta : event.key === "ArrowLeft" ? -delta : 0;
    keyboard = unproject(...project(keyboard));
    setGuess({ ...keyboard });
  }
});
$("zoom-in").onclick = () => zoom(1 / 1.4);
$("zoom-out").onclick = () => zoom(1.4);
$("map-reset").onclick = resetMap;
let photo = { scale: 1, x: 0, y: 0 };
function fitPhoto() {
  const box = $("photo-wrap").getBoundingClientRect(),
    image = $("street");
  // client dimensions exclude the CSS transform, including during a pinch update.
  const width = image.clientWidth,
    height = image.clientHeight;
  const ratio = Math.min(width / (image.naturalWidth || 1), height / (image.naturalHeight || 1));
  return { box, fitted: { width: image.naturalWidth * ratio, height: image.naturalHeight * ratio } };
}
function renderPhoto() {
  const { box, fitted } = fitPhoto();
  photo = clampPhoto(photo, box, fitted);
  $("street").style.transform = `translate(${photo.x}px, ${photo.y}px) scale(${photo.scale})`;
  $("photo-wrap").classList.toggle("pannable", photo.scale > 1);
  $("photo-out").disabled = photo.scale <= 1;
  $("zoom-photo").disabled = photo.scale >= 4;
}
function changePhoto(factor, anchor = { x: 0, y: 0 }, delta = { x: 0, y: 0 }) {
  photo = photoStep(photo, factor, anchor, delta);
  renderPhoto();
  $("photo-hint").hidden = true;
  storageSet("euroguessr-photo-hint", true);
}
const photoGestures = pointerGestures($("photo-wrap"), {
  change({ factor, anchor, delta }) {
    const box = $("photo-wrap").getBoundingClientRect();
    changePhoto(factor, { x: anchor.x - box.left - box.width / 2, y: anchor.y - box.top - box.height / 2 }, delta);
  },
});
$("zoom-photo").onclick = () => changePhoto(1.4);
$("photo-out").onclick = () => changePhoto(1 / 1.4);
$("photo-reset").onclick = () => {
  photo = { scale: 1, x: 0, y: 0 };
  renderPhoto();
};
$("photo-wrap").addEventListener(
  "wheel",
  (event) => {
    event.preventDefault();
    const box = $("photo-wrap").getBoundingClientRect();
    changePhoto(Math.exp(Math.max(-0.3, Math.min(0.3, -event.deltaY * 0.002))), {
      x: event.clientX - box.left - box.width / 2,
      y: event.clientY - box.top - box.height / 2,
    });
  },
  { passive: false }
);
new ResizeObserver(renderPhoto).observe($("photo-wrap"));
$("photo-hint").hidden = storageGet("euroguessr-photo-hint", false);
let cities = [];
function drawCities() {
  if (!cities.length) return;
  const map = $("map"),
    matrix = map.getScreenCTM();
  if (!matrix) return;
  const scale = 700 / view[2],
    pixelScale = matrix.a;
  const tier = scale >= 3 ? 3 : scale >= 1.6 ? 2 : 1;
  $("cities").replaceChildren();
  $("labels").style.opacity = scale >= 3 ? "0.12" : scale >= 1.6 ? "0.4" : "1";
  const occupied = [];
  for (const city of cities) {
    if (city.tier > tier) continue;
    const [x, y] = project(city);
    if (x < view[0] || x > view[0] + view[2] || y < view[1] || y > view[1] + view[3]) continue;
    const px = (x - view[0]) * pixelScale,
      py = (y - view[1]) * pixelScale;
    const width = city.name.length * 5.8 + 9,
      rect = [px - 3, py - 12, px + width, py + 4];
    element("circle", { cx: x, cy: y, r: 2 / pixelScale }, $("cities"));
    if (occupied.some((r) => rect[0] < r[2] + 5 && rect[2] > r[0] - 5 && rect[1] < r[3] + 3 && rect[3] > r[1] - 3)) continue;
    occupied.push(rect);
    element(
      "text",
      { x: x + 5 / pixelScale, y: y + 3 / pixelScale, "font-size": 11 / pixelScale, "stroke-width": 2.5 / pixelScale },
      $("cities")
    ).textContent = city.name;
  }
}
new ResizeObserver(drawCities).observe($("map"));
function modelDetails() {
  if (activeMode === "tiny" && metadata.onnx_bytes) {
    $("ai-mode").querySelector('option[value="tiny"]').textContent = `Tiny AI · about ${Math.ceil(
      (metadata.onnx_bytes + metadata.reference_bytes) / 1048576
    )} MiB · browser CPU`;
  }
  if (activeMode === "geoclip") {
    $("ai-mode").querySelector('option[value="geoclip"]').textContent = `GeoCLIP 8-bit · about ${Math.ceil(
      metadata.download_bytes / 1048576
    )} MiB · browser CPU`;
  }
  const chosen = metadata.candidates[metadata.method];
  $("game-title").textContent = activeMode === "geoclip" ? "You. A street. GeoCLIP." : "You. A street. A tiny AI.";
  $("model-description").textContent =
    activeMode === "geoclip"
      ? "Quantized image-only GeoCLIP analyzes the same photograph you see, then searches a precomputed European location gallery. Every prediction runs on your browser CPU."
      : `MobileNetV3-Small turns the same photograph you see into a visual embedding. ${
          metadata.distillation?.enabled
            ? "This tiny student was trained with GPS labels and geographic knowledge distilled from GeoCLIP."
            : "It was trained with geographic labels."
        } Its prediction method was selected using spatial validation.`;
  $("model-details").innerHTML = "";
  const dl = document.createElement("dl");
  for (const [label, value] of [
    ["Model", metadata.version],
    ["Parameters", `${(metadata.parameters / 1e6).toFixed(2)} million`],
    ["Selected method", metadata.method],
    [
      "Train / val / test",
      metadata.splits ? Object.values(metadata.splits).slice(0, 3).join(" / ") : "Pretrained worldwide teacher · offline Europe gallery",
    ],
    ["Validation median error", chosen?.val ? `${Math.round(chosen.val.median_km).toLocaleString()} km` : "Not evaluated"],
    ["Test median error", chosen?.test ? `${Math.round(chosen.test.median_km).toLocaleString()} km` : "Not evaluated"],
    [
      "Constant baseline",
      metadata.candidates["constant-center"]?.test
        ? `${Math.round(metadata.candidates["constant-center"].test.median_km).toLocaleString()} km`
        : "Not evaluated",
    ],
    ["Human win rate", "Not measured"],
    ["Inference", `WASM CPU · ${metadata.precision}`],
  ]) {
    const dt = document.createElement("dt"),
      dd = document.createElement("dd");
    dt.textContent = label;
    dd.textContent = value;
    dl.append(dt, dd);
  }
  $("model-details").append(dl);
}
function openAbout() {
  $("about-dialog").showModal();
}
$("about").onclick = openAbout;
$("footer-about").onclick = (event) => {
  event.preventDefault();
  openAbout();
};
$("about-dialog").querySelector(".close").onclick = () => $("about-dialog").close();
function match() {
  clearInterval(timer);
  results = [];
  index = 0;
  let seen = storageGet("euroguessr-seen-v1", []);
  let available = pack.filter((r) => !seen.includes(r.id));
  if (available.length < 5) {
    seen = [];
    available = pack;
  }
  rounds = shuffled(available).slice(0, 5);
  storageSet("euroguessr-seen-v1", [...seen, ...rounds.map((r) => r.id)]);
  $("summary").hidden = true;
  document.querySelector(".game").hidden = false;
  updateTotals();
  startRound();
}
function updateTotals() {
  $("human-total").textContent = results.reduce((s, r) => s + r.humanScore, 0).toLocaleString();
  $("ai-total").textContent = results.reduce((s, r) => s + r.aiScore, 0).toLocaleString();
}
async function startRound() {
  phase = "preparing";
  const current = ++token;
  guess = null;
  ai = null;
  clearInterval(timer);
  resetMap();
  renderPins();
  photoGestures.cancel();
  mapGestures.cancel();
  photo = { scale: 1, x: 0, y: 0 };
  renderPhoto();
  $("round-result").hidden = true;
  $("next").hidden = true;
  $("guess").hidden = false;
  $("guess").disabled = true;
  $("selection").textContent = "Click the map to drop a pin ↓";
  $("round-label").textContent = `ROUND ${index + 1} / 5 · EUROPE`;
  $("map-title").textContent = "Where are we?";
  $("map-eyebrow").textContent = "TRUST YOUR INSTINCT";
  $("map-hint").textContent = "Place your pin on the map. You have 60 seconds.";
  $("timer").textContent = "01:00";
  $("timer").classList.remove("urgent");
  $("credit").textContent = "Street imagery: OpenStreetView-5M / Mapillary · CC BY-SA 4.0";
  $("photo-loading").hidden = false;
  $("ai-status").textContent = "AI is reading the image…";
  $("latency").textContent = "";
  $("progress").textContent = Array.from({ length: 5 }, (_, i) => (i < index ? "●" : i === index ? "◉" : "○")).join(" — ");
  try {
    const image = $("street");
    image.src = rounds[index].image;
    await image.decode();
    if (current !== token) return;
    $("photo-loading").hidden = true;
    renderPhoto();
    if (rounds[index + 1]) {
      const nextImage = new Image();
      nextImage.src = rounds[index + 1].image;
    }
    const pixels = metadata.preprocessing === "clip-bicubic-center-crop" ? preprocessCLIP(image) : preprocess(image);
    const output = await new Promise((resolve, reject) => {
      pending.set(current, { resolve, reject });
      worker.postMessage({ type: "predict", token: current, pixels }, [pixels.buffer]);
    });
    if (current !== token) return;
    ai = output.location;
    lastLatency = output.milliseconds;
    phase = "playing";
    deadline = performance.now() + 60000;
    $("ai-status").textContent = "● AI guess locked · revealed after yours";
    $("latency").textContent = `${Math.round(lastLatency)} ms · CPU`;
    $("live").textContent = `Round ${index + 1}. AI is ready. You have 60 seconds.`;
    timer = setInterval(tick, 200);
    tick();
  } catch (error) {
    phase = "error";
    $("photo-loading").hidden = false;
    $("photo-loading").textContent = `Unable to start round: ${error.message}`;
    $("ai-status").textContent = "Reload to retry. No substitute predictions are used.";
    $("live").textContent = error.message;
  }
}
function tick() {
  if (phase !== "playing") return;
  const seconds = Math.max(0, Math.ceil((deadline - performance.now()) / 1000));
  $("timer").textContent = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  $("timer").classList.toggle("urgent", seconds <= 10);
  if (seconds === 0) reveal(true);
}
function reveal(timedOut = false) {
  if (phase !== "playing" || (!guess && !timedOut)) return;
  phase = "revealed";
  clearInterval(timer);
  const actual = rounds[index],
    humanKm = guess ? distance(guess, actual) : null,
    aiKm = distance(ai, actual),
    humanScore = guess ? score(humanKm) : 0,
    aiScore = score(aiKm);
  results.push({
    round: index + 1,
    imageId: actual.id,
    actual: { lat: actual.lat, lon: actual.lon, country: actual.country },
    human: guess,
    ai: { ...ai },
    humanKm,
    aiKm,
    humanScore,
    aiScore,
    timedOut,
    inferenceMs: lastLatency,
  });
  updateTotals();
  resetMap();
  renderPins(true);
  $("map-title").textContent =
    humanScore > aiScore ? "Nice sense of direction." : humanScore < aiScore ? "The AI found its bearings." : "An even round.";
  $("map-eyebrow").textContent = "LOCATION REVEALED";
  $("map-hint").textContent = `${new Intl.DisplayNames(["en"], { type: "region" }).of(actual.country)} · ${actual.lat.toFixed(3)}° N, ${Math.abs(
    actual.lon
  ).toFixed(3)}° ${actual.lon < 0 ? "W" : "E"}`;
  $("selection").textContent = timedOut ? "Time is up." : `Your guess is locked.`;
  $("round-result").replaceChildren();
  for (const [label, km, points, color] of [
    ["You", humanKm, humanScore, "#2563eb"],
    ["AI", aiKm, aiScore, "#db622f"],
  ]) {
    const div = document.createElement("div");
    div.style.color = color;
    div.textContent = `${label} · ${km === null ? "no guess" : `${Math.round(km).toLocaleString()} km away`}`;
    const strong = document.createElement("strong");
    strong.textContent = `${points.toLocaleString()} pts`;
    div.append(strong);
    $("round-result").append(div);
  }
  $("round-result").hidden = false;
  $("guess").hidden = true;
  $("next").hidden = false;
  $("next").textContent = index === 4 ? "See match results →" : "Next location →";
  $("ai-status").textContent = "● Independent prediction · pixels only";
  $("credit").replaceChildren();
  const link = document.createElement("a");
  link.href = actual.source;
  link.target = "_blank";
  link.rel = "noopener";
  link.textContent = `Photo by ${actual.creator || "Mapillary contributor"} · Mapillary ↗`;
  $("credit").append(link, document.createTextNode(" · CC BY-SA 4.0 · resized/recompressed"));
  $("live").textContent = `${$("map-title").textContent} You scored ${humanScore}; AI scored ${aiScore}.`;
}
$("guess").onclick = () => reveal();
$("next").onclick = () => {
  if (phase !== "revealed") return;
  if (index === 4) finish();
  else {
    index++;
    startRound();
  }
};
function finish() {
  phase = "finished";
  $("summary").hidden = false;
  document.querySelector(".game").hidden = true;
  const human = results.reduce((s, r) => s + r.humanScore, 0),
    machine = results.reduce((s, r) => s + r.aiScore, 0);
  $("winner").textContent = human > machine ? "You found your way." : human < machine ? "This journey goes to the AI." : "Two minds, one score.";
  $("summary-note").textContent = `You ${human.toLocaleString()} — AI ${machine.toLocaleString()} · out of 25,000 points each`;
  $("results-body").replaceChildren();
  for (const r of results) {
    const tr = document.createElement("tr");
    for (const value of [
      r.round,
      r.humanKm === null ? "No guess" : `${Math.round(r.humanKm)} km · ${r.humanScore} pts`,
      `${Math.round(r.aiKm)} km · ${r.aiScore} pts`,
      r.humanScore > r.aiScore ? "You" : r.humanScore < r.aiScore ? "AI" : "Tie",
    ]) {
      const td = document.createElement("td");
      td.textContent = value;
      tr.append(td);
    }
    $("results-body").append(tr);
  }
  const history = storageGet("euroguessr-matches-v1", []);
  history.push(report());
  storageSet("euroguessr-matches-v1", history.slice(-100));
  $("live").textContent = $("winner").textContent;
}
function report() {
  return {
    schemaVersion: 1,
    modelVersion: metadata.version,
    modelSha256: metadata.model_sha256,
    modelFingerprint: metadata.prediction_sha256,
    modelManifest: metadata.manifest_sha256,
    method: metadata.method,
    createdAt: new Date().toISOString(),
    rules: { region: "Europe", rounds: 5, seconds: 60, movement: false, score: "round(5000 * exp(-distance_km / 1500))" },
    participantSkill: "unverified",
    rounds: results,
  };
}
$("download").onclick = () => {
  const url = URL.createObjectURL(new Blob([JSON.stringify(report(), null, 2)], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "euroguessr-match.json";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
$("play-again").onclick = match;
$("choose-ai").onclick = () => {
  $("ai-mode").disabled = false;
  $("start").disabled = false;
  $("ai-mode").value = activeMode === "geoclip" ? "tiny" : "geoclip";
  $("ai-mode").onchange();
  $("load-status").textContent = "Choose an AI for a new five-round match.";
  $("welcome").showModal();
};
$("ai-mode").onchange = () => {
  $("start").textContent =
    $("ai-mode").value === activeMode
      ? "Start your journey →"
      : $("ai-mode").value === "geoclip"
        ? "Download GeoCLIP and start →"
        : "Switch to Tiny AI and start →";
};
$("start").onclick = async () => {
  if (phase === "error") {
    location.reload();
    return;
  }
  const selected = $("ai-mode").value;
  if (selected !== activeMode) {
    $("start").disabled = true;
    $("ai-mode").disabled = true;
    $("start").textContent = "Preparing selected AI…";
    phase = "loading";
    $("load-status").textContent = selected === "geoclip" ? "Loading GeoCLIP…" : "Loading Tiny AI…";
    try {
      const loaded = new Promise((resolve, reject) => {
        readyResolve = resolve;
        readyReject = reject;
      });
      worker.terminate();
      createWorker();
      worker.postMessage({ type: "init", mode: selected });
      await loaded;
      modelDetails();
    } catch (error) {
      phase = "error";
      $("load-status").textContent = `Could not load the selected AI: ${error.message}`;
      $("start").disabled = false;
      $("start").textContent = "Reload with Tiny AI →";
      return;
    }
  }
  $("welcome").close();
  match();
};
$("welcome").addEventListener("cancel", (event) => event.preventDefault());
$("welcome").showModal();
async function initialize() {
  try {
    worker.postMessage({ type: "init" });
    const [images, mapData, cityData] = await Promise.all([getJSON("rounds.json"), getJSON("countries.geojson"), getJSON("cities.json"), ready]);
    cities = cityData.cities;
    pack = images;
    if (pack.length < 5) throw Error("At least five held-out images are required");
    drawMap(mapData);
    drawCities();
    modelDetails();
    phase = "ready";
    $("start").disabled = false;
    $("start").textContent = "Start your journey →";
    $("load-status").textContent = "AI ready. Every prediction runs on your browser CPU.";
    $("ai-status").textContent = "● Browser CPU AI ready";
    $("street").src = pack[0].image;
    $("photo-loading").hidden = true;
  } catch (error) {
    phase = "error";
    $("load-status").textContent = `Could not load the AI: ${error.message}`;
    $("start").disabled = false;
    $("start").textContent = "Retry loading →";
  }
}
initialize();
