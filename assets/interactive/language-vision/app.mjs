import { decodeMask, maskLayer } from "./masks.mjs";
const $ = (id) => document.getElementById(id);
const debug = new URLSearchParams(location.search).get("debug") === "1";
const colors = [
  [204, 244, 114],
  [130, 214, 223],
  [252, 189, 119],
  [193, 166, 241],
  [240, 155, 176],
];
let modelMetadata,
  scenes,
  scene,
  manifest,
  regions,
  embeddings,
  counts,
  ranking = [],
  selected,
  worker,
  ready = false,
  loading = false,
  requestId = 0,
  sceneGeneration = 0,
  sceneLoading = false;
const cache = new Map(),
  maskCache = new Map(),
  layerCache = new Map();
async function get(url, type = "json") {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Could not load ${url} (${r.status}).`);
  return type === "json" ? r.json() : r.arrayBuffer();
}
function status(text, error = false) {
  $("status").textContent = text;
  $("status").classList.toggle("error", error);
}
function buttonState() {
  $("search").disabled = loading || sceneLoading;
  $("search").innerHTML = loading ? "Loading local model…" : ready ? "Search <span>↗</span>" : "Enable local search <span>↗</span>";
}
async function selectScene(id) {
  const generation = ++sceneGeneration;
  requestId++;
  sceneLoading = true;
  buttonState();
  ranking = [];
  selected = undefined;
  renderResults();
  $("mask-label").hidden = true;
  $("timing").textContent = "—";
  $("scene-score").textContent = "—";
  const next = scenes.find((s) => s.id === id);
  document.querySelectorAll(".scene-button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.scene === id)));
  $("scene-name").textContent = next.title;
  $("photo").src = `data/${id}/scene.webp`;
  $("photo").alt = next.title + " photograph";
  $("photo-credit").href = next.source;
  $("photo-credit").textContent = (next.photographer ? `Photo: ${next.photographer}` : "Photo source") + " ↗";
  $("overlay").getContext("2d").clearRect(0, 0, $("overlay").width, $("overlay").height);
  try {
    if (!cache.has(id)) {
      const [m, r, e, c] = await Promise.all([
        get(`data/${id}/manifest.json`),
        get(`data/${id}/regions.json`),
        get(`data/${id}/embeddings.bin`, "binary"),
        get(`data/${id}/masks.bin`, "binary"),
      ]);
      if (m.model !== modelMetadata.model || m.checkpointRevision !== modelMetadata.checkpointRevision)
        throw new Error("Image and text checkpoint mismatch.");
      cache.set(id, { m, r, e: new Float32Array(e), c: new Uint32Array(c) });
    }
    if (generation !== sceneGeneration) return;
    scene = next;
    ({ m: manifest, r: regions, e: embeddings, c: counts } = cache.get(id));
    maskCache.clear();
    layerCache.clear();
    $("overlay").width = manifest.maskWidth;
    $("overlay").height = manifest.maskHeight;
    $("region-count").textContent = manifest.numRegions;
    if (debug) {
      $("debug-regions").replaceChildren(
        ...regions.map((r) => {
          const b = document.createElement("button");
          b.textContent = `#${r.id} · ${(r.areaFraction * 100).toFixed(1)}%`;
          b.addEventListener("click", () => {
            selected = r.id;
            draw();
            updateDebug();
          });
          return b;
        })
      );
    }
    sceneLoading = false;
    buttonState();
    draw();
    if (ready) search();
  } catch (e) {
    if (generation !== sceneGeneration) return;
    sceneLoading = false;
    buttonState();
    status(e.message, true);
  }
}
function initialize() {
  loading = true;
  buttonState();
  status("Downloading the local text encoder…");
  $("progress").hidden = false;
  worker?.terminate();
  worker = new Worker(new URL("./worker.mjs", import.meta.url), { type: "module" });
  worker.onerror = (e) => {
    loading = false;
    ready = false;
    buttonState();
    $("progress").hidden = true;
    status("Could not start local inference. Press Enable local search to retry.", true);
    console.error(e);
  };
  worker.onmessage = ({ data }) => {
    if (data.type === "progress") {
      $("progress").value = data.received / data.total;
      status(`Loading model · ${(data.received / 1e6).toFixed(1)} / ${(data.total / 1e6).toFixed(1)} MB`);
      return;
    }
    if (data.type === "initializing") {
      status("Preparing the CPU / WASM text encoder…");
      return;
    }
    if (data.type === "ready") {
      ready = true;
      loading = false;
      $("progress").hidden = true;
      buttonState();
      status(`Model ready · ${((data.loadMs + data.initMs) / 1000).toFixed(1)} s to load. Queries stay local.`);
      if (!sceneLoading) search();
      return;
    }
    if (data.id !== requestId) return;
    if (data.type === "error") {
      status(data.error + " Press Search to retry.", true);
      return;
    }
    ranking = data.results;
    selected = ranking[0]?.id;
    $("results-query").textContent = `“${data.query}”`;
    $("timing").textContent = `${data.inferenceMs.toFixed(0)} ms`;
    $("scene-score").textContent = data.sceneScore.toFixed(3);
    status(
      data.truncated
        ? "Search complete. Long text was truncated to the model’s 77-token context."
        : "Search complete. Your query was processed locally."
    );
    renderResults();
    draw();
    updateDebug();
  };
  worker.postMessage({ type: "init" });
}
function search() {
  const query = $("query").value.trim();
  if (!query) {
    status("Enter a visual concept to search.");
    $("query").focus();
    return;
  }
  if (sceneLoading) {
    status("Loading scene assets…");
    return;
  }
  if (!ready) {
    if (!loading) initialize();
    return;
  }
  const id = ++requestId;
  status("Comparing your words with this scene…");
  worker.postMessage({ type: "query", id, query, embeddings, manifest });
}
function mask(id) {
  if (!maskCache.has(id)) {
    const r = regions.find((r) => r.id === id);
    maskCache.set(id, decodeMask(counts.subarray(r.rleOffset, r.rleOffset + r.rleLength), manifest.maskWidth, manifest.maskHeight));
  }
  return maskCache.get(id);
}
function layer(id, color, strong) {
  const key = id + "-" + color.join("-") + "-" + strong;
  if (!layerCache.has(key)) layerCache.set(key, maskLayer(mask(id), manifest.maskWidth, manifest.maskHeight, color, strong ? 0.24 : 0.07));
  return layerCache.get(key);
}
function draw() {
  if (!manifest) return;
  const canvas = $("overlay"),
    ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const top = ranking.slice(0, 5),
    showAll = debug && $("all-masks").checked;
  if ($("show-overlays").checked) {
    if (showAll) for (const r of regions) ctx.drawImage(layer(r.id, colors[(r.id - 1) % 5], false), 0, 0);
    for (let i = top.length - 1; i >= 0; i--) {
      const r = top[i];
      if (r.id !== selected) ctx.drawImage(layer(r.id, colors[i], false), 0, 0);
    }
    if (selected) {
      const i = top.findIndex((r) => r.id === selected);
      ctx.drawImage(layer(selected, colors[Math.max(i, 0)], true), 0, 0);
    }
  }
  $("mask-label").hidden = !selected;
  if (selected) {
    const r = ranking.find((r) => r.id === selected);
    $("mask-label").textContent = `REGION ${String(selected).padStart(2, "0")}${r ? " · " + r.score.toFixed(3) + " similarity" : ""}`;
  }
}
function renderResults() {
  if (!ranking.length) {
    $("results").innerHTML =
      '<div class="empty-state"><span class="empty-icon">⌕</span><h3>A shared space for words & pictures.</h3><p>Enable local search to compare your text with the objects in this scene.</p><small>No fixed labels. No chatbot. No cloud inference.</small></div>';
    return;
  }
  const best = ranking[0].score;
  $("results").replaceChildren(
    ...ranking.slice(0, 5).map((r, i) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "result" + (selected === r.id ? " selected" : "");
      b.setAttribute("aria-pressed", String(selected === r.id));
      b.setAttribute("aria-label", `Rank ${i + 1}, region ${r.id}, similarity ${r.score.toFixed(3)}`);
      const crop = document.createElement("canvas");
      crop.width = 110;
      crop.height = 88;
      const ctx = crop.getContext("2d"),
        box = regions.find((x) => x.id === r.id).bbox;
      const img = $("photo");
      const sx = manifest.width / manifest.maskWidth,
        sy = manifest.height / manifest.maskHeight;
      if (img.complete && img.naturalWidth)
        ctx.drawImage(img, box[0] * sx, box[1] * sy, Math.max(box[2] * sx, 1), Math.max(box[3] * sy, 1), 0, 0, 110, 88);
      const thumb = document.createElement("img");
      thumb.src = crop.toDataURL();
      thumb.alt = "";
      const rank = document.createElement("span");
      rank.className = "rank";
      rank.textContent = String(i + 1).padStart(2, "0");
      const name = document.createElement("span");
      name.className = "result-name";
      name.textContent = `Region ${String(r.id).padStart(2, "0")}`;
      const score = document.createElement("span");
      score.className = "result-score";
      score.textContent = r.score.toFixed(3);
      const small = document.createElement("small");
      small.textContent = "similarity";
      score.append(small);
      b.append(rank, thumb, name, score);
      b.addEventListener("click", () => {
        selected = r.id;
        renderResults();
        draw();
        updateDebug();
      });
      return b;
    })
  );
}
function updateDebug() {
  if (!debug || !selected) return;
  const r = regions.find((r) => r.id === selected),
    score = ranking.find((x) => x.id === selected);
  $("debug-info").textContent = `Region ${r.id} · bbox ${r.bbox.join(", ")} · area ${r.pixelArea} px (${(100 * r.areaFraction).toFixed(
    2
  )}%)\nSAM predicted IoU ${r.predictedIoU.toFixed(4)} · stability ${r.stabilityScore.toFixed(4)}\n${
    score
      ? "Context / isolated / masked: " + score.views.map((s) => s.toFixed(4)).join(" / ") + "\nCombined: " + score.score.toFixed(4)
      : "No query score yet."
  }`;
}
$("search-form").addEventListener("submit", (e) => {
  e.preventDefault();
  search();
});
document.querySelectorAll("[data-query]").forEach((b) =>
  b.addEventListener("click", () => {
    $("query").value = b.dataset.query;
    search();
  })
);
$("show-overlays").addEventListener("change", draw);
$("all-masks").addEventListener("change", draw);
$("zoom").addEventListener("click", () => {
  const expanded = $("stage").classList.toggle("expanded");
  $("zoom").setAttribute("aria-pressed", String(expanded));
  $("zoom").textContent = expanded ? "Collapse ↙" : "Expand ↗";
});
$("photo").addEventListener("load", () => {
  if (ranking.length) renderResults();
});
$("overlay").addEventListener("click", (event) => {
  if (!manifest || !$("show-overlays").checked) return;
  const rect = $("overlay").getBoundingClientRect(),
    scale = Math.min(rect.width / manifest.maskWidth, rect.height / manifest.maskHeight);
  const x = Math.floor((event.clientX - rect.left - (rect.width - manifest.maskWidth * scale) / 2) / scale),
    y = Math.floor((event.clientY - rect.top - (rect.height - manifest.maskHeight * scale) / 2) / scale);
  if (x < 0 || y < 0 || x >= manifest.maskWidth || y >= manifest.maskHeight) return;
  const ids = debug && $("all-masks").checked ? regions.map((r) => r.id) : ranking.slice(0, 5).map((r) => r.id);
  const hit = ids.filter((id) => mask(id)[y * manifest.maskWidth + x]).sort((a, b) => regions[a - 1].pixelArea - regions[b - 1].pixelArea)[0];
  if (hit) {
    selected = hit;
    draw();
    renderResults();
    updateDebug();
  }
});
$("debug-panel").hidden = !debug;
if (debug) {
  $("debug-link").textContent = "Leave debug mode ↗";
  $("debug-link").href = "?";
}
try {
  const [catalog, model] = await Promise.all([get("data/scenes.json"), get("models/model.json")]);
  scenes = catalog;
  modelMetadata = model;
  $("download-size").textContent = `${(model.modelBytes / 1e6).toFixed(1)} MB · cached by your browser`;
  $("scene-count").textContent = `${scenes.length} PHOTOGRAPHS`;
  $("scenes").replaceChildren(
    ...scenes.map((s) => {
      const b = document.createElement("button");
      b.className = "scene-button";
      b.type = "button";
      b.dataset.scene = s.id;
      b.setAttribute("aria-label", `Select ${s.title} scene`);
      b.setAttribute("aria-pressed", "false");
      const img = document.createElement("img");
      img.src = `data/${s.id}/thumb.webp`;
      img.alt = "";
      const label = document.createElement("span");
      label.textContent = s.title;
      b.append(img, label);
      b.addEventListener("click", () => selectScene(s.id));
      return b;
    })
  );
  await selectScene(scenes[0].id);
} catch (e) {
  status(e.message, true);
}
