import test from "node:test";
import assert from "node:assert/strict";
import { loadAsset, loadMeshes } from "../src/assets.js";

const instant = { wait: async () => {} };
test("503 retries bypass cache and recover the mesh bytes", async () => {
  const caches = [];
  const delays = [];
  const bytes = await loadAsset("/mesh", "pelvis_contour_link.STL", undefined, {
    fetcher: async (_, options) => {
      caches.push(options.cache);
      return caches.length < 3 ? new Response("", { status: 503 }) : new Response("mesh");
    },
    wait: async (ms) => delays.push(ms),
  });
  assert.equal(new TextDecoder().decode(bytes), "mesh");
  assert.deepEqual(caches, ["default", "no-store", "no-store"]);
  assert.deepEqual(delays, [350, 700]);
});
test("permanent 404 fails immediately; persistent 503 stops after four attempts", async () => {
  for (const [status, expected] of [
    [404, 1],
    [503, 4],
  ]) {
    let calls = 0;
    await assert.rejects(
      loadAsset("/mesh", "pelvis", undefined, {
        ...instant,
        fetcher: async () => {
          calls++;
          return new Response("", { status });
        },
      }),
      new RegExp(`pelvis.*${status}`)
    );
    assert.equal(calls, expected);
  }
});
test("network and interrupted response-body failures are retried", async () => {
  let calls = 0;
  const result = await loadAsset("/mesh", "pelvis", undefined, {
    ...instant,
    fetcher: async () => {
      calls++;
      if (calls === 1) throw new TypeError("Failed to fetch");
      if (calls === 2)
        return {
          ok: true,
          arrayBuffer: async () => {
            throw new TypeError("body interrupted");
          },
        };
      return new Response("complete");
    },
  });
  assert.equal(new TextDecoder().decode(result), "complete");
  assert.equal(calls, 3);
});
test("mesh pool limits concurrency to four and loads every mesh once", async () => {
  let active = 0;
  let peak = 0;
  const loaded = [];
  const meshes = Array.from({ length: 27 }, (_, i) => i);
  await loadMeshes(meshes, async (mesh) => {
    active++;
    peak = Math.max(peak, active);
    await new Promise((resolve) => setImmediate(resolve));
    loaded.push(mesh);
    active--;
  });
  assert.equal(peak, 4);
  assert.deepEqual(
    loaded.sort((a, b) => a - b),
    meshes
  );
});
test("pool stops queuing after failure and drains active downloads before rejecting", async () => {
  let active = 0;
  const started = [];
  await assert.rejects(
    loadMeshes(
      Array.from({ length: 27 }, (_, i) => i),
      async (mesh) => {
        started.push(mesh);
        active++;
        await new Promise((resolve) => setImmediate(resolve));
        active--;
        if (mesh === 0) throw new Error("offline");
      }
    ),
    /offline/
  );
  assert.deepEqual(started, [0, 1, 2, 3]);
  assert.equal(active, 0);
});
