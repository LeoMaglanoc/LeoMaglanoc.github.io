import init, { Game } from "./pkg/rustzero.js";
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
        await init();
        game = new Game("");
      } else {
        const [_, response] = await Promise.all([init(), fetch(`models/${data.checkpoint}.json`)]);
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
