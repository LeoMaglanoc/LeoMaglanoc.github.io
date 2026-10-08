import loadMujoco from "../../assets/interactive/dexterous-rl/runtime/mujoco.js";
import { MujocoThreeRenderer } from "../../assets/interactive/shared/mujoco-three-renderer.js";
let mj;
let renderer, model, data;
const output = document.querySelector("#output");
const assert = (condition, message) => {
  if (!condition) throw Error(message);
};
async function run(kind) {
  try {
    output.textContent = "Loading…";
    mj ??= await loadMujoco();
    renderer?.dispose();
    renderer = null;
    data?.delete();
    data = null;
    model?.delete();
    model = null;
    let base = new URL(`../../assets/interactive/${kind === "g1" ? "g1" : "dexterous-rl"}/`, import.meta.url);
    let config;
    if (kind === "primitives") {
      mj.FS.writeFile(
        "/primitives.xml",
        '<mujoco><worldbody><geom type="plane" size="3 3 .1" rgba=".1 .2 .2 1"/>' +
          ["sphere", "capsule", "ellipsoid", "cylinder", "box"]
            .map((type, i) => `<geom type="${type}" size=".12 .2 .25" pos="${(i - 2) * 0.45} 0 .3" rgba=".6 .8 .6 ${i === 4 ? ".5" : "1"}"/>`)
            .join("") +
          "</worldbody></mujoco>"
      );
      model = mj.MjModel.from_xml_path("/primitives.xml");
    } else {
      const root = `/${kind}`;
      for (const dir of [root, `${root}/meshes`, `${root}/textures`]) if (!mj.FS.analyzePath(dir).exists) mj.FS.mkdir(dir);
      const json = async (p) => (await fetch(new URL(p, base))).json();
      const manifest = await json(kind === "g1" ? "asset-manifest.json" : "manifest.json");
      const paths =
        kind === "g1"
          ? [manifest.scene, manifest.model, ...manifest.meshes.map((p) => "robots/g1/meshes/" + p)]
          : manifest.filter((p) => !["policy.onnx", "config.json"].includes(p));
      await Promise.all(
        paths.map(async (p) => {
          const dest = kind === "g1" ? p.replace("robots/g1/", "") : p;
          mj.FS.writeFile(`${root}/${dest}`, new Uint8Array(await (await fetch(new URL(p, base))).arrayBuffer()));
        })
      );
      model = mj.MjModel.from_xml_path(`${root}/scene.xml`);
      if (kind === "hand") config = await json("config.json");
    }
    data = new mj.MjData(model);
    if (config) {
      data.qpos.set(config.initial_qpos);
      data.ctrl.set(config.initial_ctrl);
    }
    mj.mj_forward(model, data);
    const exclude = [];
    for (let i = 0; i < model.ngeom; i++)
      if (
        (kind === "g1" && model.geom_group[i] === 0 && model.geom_type[i] !== 0) ||
        (kind === "hand" && model.geom_bodyid[i] === model.body("goal").id)
      )
        exclude.push(i);
    renderer = new MujocoThreeRenderer({
      canvas: document.querySelector("canvas"),
      mujoco: mj,
      model,
      data,
      sourceNormals: !document.querySelector("#generated").checked,
      geomGroups: kind === "g1" ? [0, 1] : kind === "hand" ? [1, 2] : [0],
      excludeGeomIds: exclude,
    }).initialize();
    renderer.setCameraPreset(
      kind === "hand" ? { position: [0.24, -0.32, 0.75], target: [-0.065, 0, 0.54] } : { position: [2.7, -3.1, 1.45], target: [0, 0, 0.65] }
    );
    const expected = Array.from({ length: model.ngeom }, (_, i) => i).filter(
      (i) => renderer.option.geomgroup[model.geom_group[i]] && !exclude.includes(i)
    );
    assert(renderer.objects.size === expected.length, "Missing/extra visualization geoms");
    const original = new Set(renderer.objects.values());
    const cacheCount = renderer.geometryCache.size;
    const costs = [];
    // Warm up allocations, then catch owned-vector leaks over a long run.
    for (let frame = 0; frame < 10; frame++) renderer.updateScene();
    const heapBytes = data.qpos.buffer.byteLength;
    for (let frame = 0; frame < 3000; frame++) {
      const start = performance.now();
      renderer.updateScene();
      costs.push(performance.now() - start);
    }
    assert(data.qpos.buffer.byteLength === heapBytes, "WASM heap grew during repeated scene updates");
    assert(
      renderer.geometryCache.size === cacheCount && [...renderer.objects.values()].every((o) => original.has(o)),
      "Frame allocations changed geometry or meshes"
    );
    let sourceNormals = 0;
    for (const mesh of renderer.objects.values()) {
      const i = mesh.userData.geomId;
      if (model.geom_type[i] !== 0)
        assert(
          Math.hypot(...mesh.position.toArray().map((v, j) => v - data.geom_xpos[i * 3 + j])) < 1e-5,
          `World position mismatch: geom ${i}, ${mesh.position.toArray()} vs ${Array.from(data.geom_xpos.slice(i * 3, i * 3 + 3))}`
        );
      assert(mesh.material.opacity === undefined || Math.abs(mesh.material.opacity - model.geom_rgba[i * 4 + 3]) < 1e-5, "Alpha mismatch");
      if (mesh.geometry.userData.sourceNormals) sourceNormals++;
    }
    costs.sort((a, b) => a - b);
    const report = {
      model: kind,
      result: "PASS",
      geoms: expected.length,
      sourceNormalMeshes: sourceNormals,
      cachedGeometries: cacheCount,
      stableFrames: costs.length,
      heapBytes,
      sceneUpdateMedianMs: costs[Math.floor(costs.length * 0.5)],
      sceneUpdateP95Ms: costs[Math.floor(costs.length * 0.95)],
    };
    if (kind === "hand") {
      const physical = [...renderer.objects.values()].find((o) => o.userData.geomId === model.geom("object/cube_visual").id);
      assert(physical && Array.isArray(physical.material) && physical.material.every((m) => m.map), "Missing authored cube face textures");
      report.cubeTextureFaces = physical.material.length;
    }
    output.textContent = JSON.stringify(report, null, 2);
    renderer.update();
  } catch (e) {
    output.textContent = "FAIL: " + e.stack;
    console.error(e);
  }
}
for (const kind of ["g1", "hand", "primitives"]) document.querySelector("#" + kind).onclick = () => run(kind);
function frame() {
  requestAnimationFrame(frame);
  renderer?.update();
}
requestAnimationFrame(frame);
