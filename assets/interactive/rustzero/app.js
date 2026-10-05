const $ = (id) => document.getElementById(id);
const board = $("board");
let worker,
  state,
  selected = null,
  lastSquares = [],
  busy = true,
  ply = 0,
  startup,
  inference,
  evidence,
  runInfo,
  requestId = 0;
const local = () => $("mode").value === "local";
const humanBlack = () => !local() && $("side").value === "black";
function send(type, payload = {}) {
  worker.postMessage({ id: ++requestId, type, ...payload });
}
function clearStats() {
  $("value").textContent = "—";
  $("value-meter").style.width = "50%";
  $("visits").textContent = "0";
  $("candidates").innerHTML = '<div class="empty-search">' + (local() ? "Two players · no CPU opponent" : "Search → compare → choose") + "</div>";
  $("search-caption").textContent = local()
    ? "Pass the device after each move. No model or AI search runs."
    : "The AI’s candidate moves appear here as it searches.";
}
function acceptState(next) {
  state = next;
  ply = state.ply;
  lastSquares = state.last_move || [];
}
function navigate(type) {
  selected = null;
  busy = true;
  clearStats();
  status("Restoring position…");
  render();
  send(type, { human: local() ? -1 : humanBlack() ? 1 : 0 });
}
const generation = () => ($("checkpoint").value === "final" ? runInfo?.checkpoint_generation ?? 0 : Number($("checkpoint").value.split("-")[1]));
const coordinate = (s) => "abcdef"[s % 6] + (Math.floor(s / 6) + 1);
const status = (text) => {
  $("status").textContent = text;
};
const active = () => state && !busy && state.terminal === null && (local() || state.side === humanBlack());
for (let i = 0; i < 36; i++) {
  const button = document.createElement("button");
  button.className = "square";
  button.type = "button";
  button.addEventListener("click", () => selectSquare(Number(button.dataset.square)));
  board.append(button);
}
function render(animateMove = false) {
  const playable = active();
  const destinations = selected === null ? [] : state.legal.filter((m) => m.from === selected);
  [...board.children].forEach((button, i) => {
    let s = (5 - Math.floor(i / 6)) * 6 + (i % 6);
    if (humanBlack()) s = 35 - s;
    const piece = state ? state.board[(5 - Math.floor(s / 6)) * 6 + (s % 6)] : 0;
    const destination = destinations.find((m) => m.to === s);
    const own = piece === ((local() ? state?.side : humanBlack()) ? -1 : 1);
    button.dataset.square = s;
    button.className = `square ${(Math.floor(s / 6) + (s % 6)) % 2 ? "dark" : ""} ${selected === s ? "selected" : ""} ${
      destination ? "destination" : ""
    } ${lastSquares.includes(s) ? "last" : ""}`;
    button.disabled = !playable || (!destination && (!own || !state.legal.some((m) => m.from === s)));
    button.setAttribute(
      "aria-label",
      `${destination ? "Move to " : piece === 1 ? "White pawn " : piece === -1 ? "Black pawn " : "Empty "}${coordinate(s)}`
    );
    button.setAttribute("aria-pressed", selected === s ? "true" : "false");
    button.replaceChildren();
    if (piece) {
      const pawn = document.createElement("span");
      pawn.className = `pawn ${piece === 1 ? "white" : "black"}`;
      if (animateMove && s === lastSquares[1]) {
        const from = lastSquares[0],
          direction = humanBlack() ? -1 : 1;
        pawn.style.setProperty("--dx", `${direction * ((from % 6) - (s % 6)) * button.clientWidth}px`);
        pawn.style.setProperty("--dy", `${direction * (Math.floor(s / 6) - Math.floor(from / 6)) * button.clientHeight}px`);
        pawn.classList.add("moving");
      }
      button.append(pawn);
    }
    if (i % 6 === 0) {
      const label = document.createElement("span");
      label.className = "coordinate";
      label.textContent = Math.floor(s / 6) + 1;
      label.setAttribute("aria-hidden", "true");
      button.append(label);
    }
  });
  [...document.querySelectorAll(".files span")].forEach((s, i) => (s.textContent = "abcdef"[humanBlack() ? 5 - i : i]));
  const opponentLabel = $("checkpoint").value === "final" ? "CHAMPION" : `GEN ${generation()}`;
  $("white-player").textContent = local() ? "WHITE" : humanBlack() ? opponentLabel : "YOU";
  $("black-player").textContent = local() ? "BLACK" : humanBlack() ? "YOU" : opponentLabel;
  $("ply").textContent = `${ply} ${ply === 1 ? "ply" : "plies"}`;
  $("undo").disabled = !state || (local() ? state.ply === 0 : state.ply <= (humanBlack() ? 1 : 0));
  $("redo").disabled = !state || state.ply >= state.total_plies || busy;
  $("history-note").textContent = !state || state.total_plies === 0 ? "No moves yet" : `${state.ply} / ${state.total_plies} moves`;
  $("side").disabled = local();
  $("simulations").disabled = local();
  document.body.classList.toggle("thinking", busy);
  document.body.classList.toggle("local", local());
  $("opponent-heading").textContent = local() ? "Local players" : "Your opponent";
  $("search-heading").textContent = local() ? "Two players" : "Inside the search";
  const wasFinished = !$("game-result").hidden;
  const finished = state?.terminal !== null && state?.terminal !== undefined;
  $("game-result").hidden = !finished;
  document.body.classList.toggle("game-over", finished);
  if (finished) {
    const winner = state.terminal === 1 ? state.side : !state.side;
    const won = winner === humanBlack();
    $("game-result").dataset.outcome = local() ? "local" : won ? "win" : "loss";
    $("result-icon").textContent = local() || won ? "★" : "⚑";
    $("result-title").textContent = local() ? `${winner ? "Black" : "White"} wins!` : won ? "You win!" : "AI wins — you lost";
    $("result-detail").textContent = `${winner ? "Black" : "White"} wins after ${ply} plies. Play again or undo to explore another move.`;
    if (!wasFinished)
      $("game-result").scrollIntoView({
        block: "nearest",
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      });
  }
  if (state?.terminal !== null && state?.terminal !== undefined) {
    const winner = state.terminal === 1 ? state.side : !state.side;
    status(
      local() ? `${winner ? "Black" : "White"} wins — breakthrough!` : winner === humanBlack() ? "You win — breakthrough!" : "AI wins — breakthrough!"
    );
  } else if (playable) status(local() ? `${state.side ? "Black" : "White"} to move · select a pawn` : "Your turn · select a pawn");
}
function selectSquare(s) {
  if (!active()) return;
  const move = state.legal.find((m) => m.from === selected && m.to === s);
  if (move) {
    lastSquares = [move.from, move.to];
    selected = null;
    busy = true;
    status("Playing your move…");
    render();
    send("play", { action: move.action });
  } else {
    selected = selected === s ? null : s;
    render();
    if (selected !== null) status(`Pawn ${coordinate(s)} · choose a highlighted square`);
  }
}
function search(animateMove = false) {
  if (local() || state.terminal !== null) {
    busy = false;
    render(animateMove);
    return;
  }
  busy = true;
  status("AI is thinking…");
  render(animateMove);
  send("search", { simulations: Number($("simulations").value) });
}
function displayStats(data) {
  $("value").textContent = (data.value >= 0 ? "+" : "") + data.value.toFixed(2);
  $("value-meter").style.width = `${(data.value + 1) * 50}%`;
  const total = data.stats.reduce((n, s) => n + s.visits, 0);
  $("visits").textContent = total;
  $("search-caption").textContent = `${data.type === "complete" ? "Last AI search" : "Searching"} · share of ${total} root visits · AI’s perspective`;
  const candidates = data.stats
    .filter((s) => s.visits > 0)
    .sort((a, b) => b.visits - a.visits)
    .slice(0, 5);
  $("candidates").replaceChildren(
    ...candidates.map((s) => {
      const m = data.root.legal.find((m) => m.action === s.action);
      const row = document.createElement("div");
      row.className = "candidate";
      row.title = `Prior ${(s.prior * 100).toFixed(1)}%; Q ${s.q_value.toFixed(3)}; ${s.visits} visits`;
      const name = document.createElement("span");
      name.textContent = `${coordinate(m.from)} → ${coordinate(m.to)}`;
      const bar = document.createElement("div");
      bar.className = "bar";
      const fill = document.createElement("i");
      fill.style.width = `${s.probability * 100}%`;
      bar.append(fill);
      const percent = document.createElement("span");
      percent.textContent = `${Math.round(s.probability * 100)}%`;
      row.append(name, bar, percent);
      return row;
    })
  );
}
function start() {
  worker?.terminate();
  state = null;
  selected = null;
  lastSquares = [];
  busy = true;
  ply = 0;
  $("new-game").disabled = true;
  $("checkpoint").disabled = true;
  status("Loading Rust engine…");
  $("timing").textContent = "Initializing Rust/WASM…";
  clearStats();
  render();
  updateEvidence();
  worker = new Worker(new URL("./worker.js", import.meta.url), { type: "module" });
  worker.onmessage = ({ data }) => {
    if (data.id !== requestId) return;
    if (data.type === "error") {
      busy = false;
      render();
      status(`Could not run AI: ${data.message}`);
      $("new-game").disabled = false;
      $("checkpoint").disabled = local();
      return;
    }
    if (data.type === "ready") {
      acceptState(data.state);
      startup = data.startupMs;
      inference = data.inferenceMs;
      busy = false;
      $("new-game").disabled = false;
      $("checkpoint").disabled = local();
      $("timing").textContent = local()
        ? `Two players · engine loaded in ${startup.toFixed(0)} ms · no CPU opponent`
        : `Loaded in ${startup.toFixed(0)} ms · first inference ${inference.toFixed(2)} ms`;
      render();
      if (!local() && state.side !== humanBlack()) search();
    } else if (data.type === "state") {
      acceptState(data.state);
      search(true);
    } else if (data.type === "history") {
      acceptState(data.state);
      busy = false;
      render();
      if (!local() && state.terminal === null && state.side !== humanBlack()) search();
    } else if (data.type === "search") {
      displayStats(data);
    } else if (data.type === "complete") {
      displayStats(data);
      const move = data.root.legal.find((m) => m.action === data.action);
      lastSquares = [move.from, move.to];
      acceptState(data.state);
      busy = false;
      render(true);
      $("timing").textContent = `Last move ${data.moveMs.toFixed(0)} ms · first inference ${inference.toFixed(2)} ms`;
    }
  };
  worker.onerror = () => {
    busy = false;
    render();
    status("Engine failed to load. Try New game.");
    $("new-game").disabled = false;
    $("checkpoint").disabled = local();
  };
  send("init", { checkpoint: $("checkpoint").value, local: local() });
}
function updateEvidence() {
  if (local()) {
    $("checkpoint-note").textContent = "Local two-player game. Both players share this device; no model is loaded and no AI runs.";
    return;
  }
  if (!evidence) {
    $("checkpoint-note").textContent = "Checkpoint evidence is unavailable. Reload to try again.";
    return;
  }
  const matchups = ["random", "heuristic", "heuristic-mcts-256"].map((opponent) =>
    evidence.find((r) => r.generation === generation() && r.opponent === opponent && r.simulations === 256)
  );
  $("checkpoint-note").textContent =
    `${generation() === 0 ? "Random initial weights" : `Self-play weights · generation ${generation()}`}. ` +
    matchups
      .filter(Boolean)
      .map((r) => `${r.wins}/${r.games} vs ${r.opponent}`)
      .join("; ") +
    " at 256 simulations.";
}
async function learning() {
  try {
    const [response, metadata, config] = await Promise.all([
      fetch("metrics/holdout.json"),
      fetch("metrics/run-metadata.json"),
      fetch("metrics/config.json"),
    ]);
    if (!response.ok || !metadata.ok || !config.ok) throw new Error("Metrics unavailable");
    evidence = await response.json();
    runInfo = await metadata.json();
    const cfg = await config.json();
    const checkpoints = [...new Set(evidence.filter((r) => r.simulations === 256 && r.opponent === "heuristic").map((r) => r.generation))].sort(
      (a, b) => a - b
    );
    const options = [
      new Option(`Champion · Gen ${runInfo.checkpoint_generation}`, "final"),
      ...checkpoints
        .filter((g) => g !== runInfo.checkpoint_generation)
        .reverse()
        .map((g) => new Option(`Gen ${g} · ${g === 0 ? "untrained" : "self-play"}`, `gen-${g}`)),
    ];
    $("checkpoint").replaceChildren(...options);
    $("training-note").textContent = `${cfg.generations} generations · ${(cfg.generations * cfg.games).toLocaleString()} self-play games · seed ${
      cfg.seed
    }`;
    updateEvidence();
    const svgNS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNS, "svg");
    svg.setAttribute("viewBox", "0 0 860 220");
    svg.setAttribute("role", "img");
    svg.setAttribute(
      "aria-label",
      "Paired holdout win rates against random, greedy heuristic and heuristic MCTS-256, with 256 simulations per learned agent."
    );
    const element = (tag, attrs, text) => {
      const el = document.createElementNS(svgNS, tag);
      for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value);
      if (text !== undefined) el.textContent = text;
      svg.append(el);
      return el;
    };
    for (const percent of [0, 50, 100]) {
      const y = 180 - percent * 1.4;
      element("line", { x1: 52, y1: y, x2: 835, y2: y, stroke: "#d6d6c8", "stroke-dasharray": "3 5" });
      element("text", { x: 4, y: y + 4 }, `${percent}%`);
    }
    for (const [opponent, color] of [
      ["random", "#929d80"],
      ["heuristic", "#af4f2d"],
      ["heuristic-mcts-256", "#425f88"],
    ]) {
      const points = checkpoints.map((g, i) => {
        const r = evidence.find((r) => r.generation === g && r.opponent === opponent && r.simulations === 256);
        return [70 + i * (740 / Math.max(1, checkpoints.length - 1)), 180 - r.win_rate * 140];
      });
      element("polyline", { points: points.map((p) => p.join(",")).join(" "), fill: "none", stroke: color, "stroke-width": 2.5 });
      points.forEach(([x, y]) => element("circle", { cx: x, cy: y, r: 4.5, fill: color, stroke: "#f3efe6", "stroke-width": 2 }));
    }
    checkpoints.forEach((g, i) =>
      element("text", { x: 70 + i * (740 / Math.max(1, checkpoints.length - 1)), y: 211, "text-anchor": "middle" }, `Gen ${g}`)
    );
    $("chart").replaceChildren(svg);
    const final = evidence.find(
      (r) => r.generation === runInfo.checkpoint_generation && r.opponent === "heuristic-mcts-256" && r.simulations === 256
    );
    $("evidence").textContent =
      `${final.games} games per matchup, identical paired openings with both colors; 2–4 seeded opening plies, no search noise. Champion Gen ${runInfo.checkpoint_generation}: ${final.wins}/${final.games} vs heuristic MCTS-256. Holdout seed ${runInfo.holdout_seed}; training seed ${runInfo.training_seed}. Champion selected using development matches only.`;
  } catch (error) {
    $("evidence").textContent = "Evaluation data could not be loaded. Reload to try again.";
  }
}
$("new-game").addEventListener("click", start);
$("checkpoint").addEventListener("change", start);
$("side").addEventListener("change", start);
learning().finally(start);

$("mode").addEventListener("change", start);
$("undo").addEventListener("click", () => navigate("back"));
$("redo").addEventListener("click", () => navigate("forward"));

$("play-again").addEventListener("click", start);
function difficultyChanged() {
  const nightmare = $("simulations").value === "1024";
  $("difficulty-note").textContent = nightmare
    ? "NIGHTMARE · AI moves first by default. 1,024 MCTS simulations. Good luck."
    : `${$("simulations").value === "64" ? "Fast" : "Strong"} · ${Number($("simulations").value).toLocaleString()} MCTS simulations.`;
  if (nightmare) {
    $("checkpoint").value = "final";
    $("side").value = "black";
  }
  start();
}
$("simulations").addEventListener("change", difficultyChanged);
