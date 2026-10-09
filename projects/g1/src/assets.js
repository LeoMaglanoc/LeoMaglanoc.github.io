// A temporary CDN failure must not permanently prevent the robot from starting.
export async function loadAsset(url, label, read = response => response.arrayBuffer(), {
  fetcher = fetch,
  wait = ms => new Promise(resolve => setTimeout(resolve, ms)),
} = {}) {
  for (let attempt = 0; attempt < 4; attempt++) {
    let retryable = true;
    try {
      const response = await fetcher(url, {
        cache: attempt ? "no-store" : "default",
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) {
        retryable = response.status === 408 || response.status === 429 || response.status >= 500;
        throw new Error(`Could not load ${label} (${response.status})`);
      }
      return await read(response);
    } catch (error) {
      if (!retryable || attempt === 3) {
        if (error.message?.startsWith(`Could not load ${label} (`)) throw error;
        throw new Error(`Could not load ${label}: ${error.message || error}`, { cause: error });
      }
      await wait(350 * 2 ** attempt);
    }
  }
}

// Keep a small number of downloads in flight, including their retries.
export async function loadMeshes(meshes, load) {
  let next = 0;
  let failure;
  async function worker() {
    while (!failure && next < meshes.length) {
      const mesh = meshes[next++];
      try {
        await load(mesh);
      } catch (error) {
        failure ||= error;
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(4, meshes.length) }, worker));
  if (failure) throw failure;
}
