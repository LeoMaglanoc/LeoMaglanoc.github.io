import init, { Game } from "./pkg/rustzero.js?v=value-lookahead-1";
const initialize = () => init({ module_or_path: new URL("./pkg/rustzero_bg.wasm?v=value-lookahead-1", import.meta.url) });
let game,
  epoch = 0;
self.onmessage = async ({ data }) => {
  const token = ++epoch;
  const send = (result) => self.postMessage({ id: data.id, ...result });
  try {
    if (data.type === "init") {
      const start = performance.now();
      let inferenceMs = null;
      if (data.local) {
        await initialize();
        game = new Game("");
      } else {
        const [_, response] = await Promise.all([initialize(), fetch(`models/${data.checkpoint}.json`)]);
        if (!response.ok) throw new Error("Checkpoint could not be loaded.");
        game = new Game(await response.text());
        const t = performance.now();
        game.inference();
        inferenceMs = performance.now() - t;
      }
      send({ type: "ready", state: JSON.parse(game.state()), startupMs: performance.now() - start, inferenceMs });
    } else if (data.type === "play") {
      game.play(data.action);
      send({ type: "state", state: JSON.parse(game.state()) });
    } else if (data.type === "back" || data.type === "forward") {
      game[data.type](data.human);
      send({ type: "history", state: JSON.parse(game.state()) });
    } else if (data.type === "search") {
      const start = performance.now(),
        root = JSON.parse(game.state());
      if (root.terminal !== null) throw new Error("Game is already finished.");
      if (Number(data.simulations) === 0 && !data.policyOnly) {
        const result = JSON.parse(game.value_lookahead());
        game.play(result.best);
        send({
          type: "complete",
          valueOnly: true,
          action: result.best,
          state: JSON.parse(game.state()),
          root,
          ...result,
          moveMs: performance.now() - start,
        });
        return;
      }
      if (Number(data.simulations) === 0) {
        const { policy, value } = JSON.parse(game.inference());
        const best = root.legal.reduce((a, b) => (policy[b.action] > policy[a.action] ? b : a));
        const maxLogit = policy[best.action];
        const weights = root.legal.map((move) => Math.exp(policy[move.action] - maxLogit));
        const total = weights.reduce((sum, weight) => sum + weight, 0);
        const stats = root.legal.map((move, i) => ({
          action: move.action,
          visits: 0,
          prior: weights[i] / total,
          probability: weights[i] / total,
        }));
        game.play(best.action);
        send({
          type: "complete",
          policyOnly: true,
          action: best.action,
          state: JSON.parse(game.state()),
          root,
          value,
          stats,
          moveMs: performance.now() - start,
        });
        return;
      }
      game.start_search();
      let result;
      const budget = Math.max(1, Math.min(1024, Number(data.simulations) || 256));
      for (let done = 0; done < budget; done += 32) {
        if (epoch !== token) return;
        result = JSON.parse(game.search_chunk(Math.min(32, budget - done)));
        send({ type: "search", ...result, root, done: Math.min(done + 32, budget), budget });
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      if (epoch !== token) return;
      const action = game.finish_search();
      send({ type: "complete", action, state: JSON.parse(game.state()), root, ...result, moveMs: performance.now() - start });
    }
  } catch (error) {
    if (epoch === token) send({ type: "error", message: error.message || String(error) });
  }
};
