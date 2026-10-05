// Test adapter only: executes the actual browser Worker and WASM in Node.
import { parentPort } from "node:worker_threads";
import { readFile } from "node:fs/promises";
globalThis.self = globalThis;
self.postMessage = (data) => parentPort.postMessage(data);
globalThis.fetch = async (input) => {
  const url = input instanceof URL ? input : new URL("../web/" + input, import.meta.url);
  const bytes = await readFile(url);
  return new Response(bytes, { headers: { "Content-Type": url.pathname.endsWith(".wasm") ? "application/wasm" : "application/json" } });
};
await import("../web/worker.js");
parentPort.on("message", (data) => self.onmessage({ data }));
