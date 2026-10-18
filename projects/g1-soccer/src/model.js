import loadMujoco from "../runtime/mujoco.js";
import { loadAsset, loadMeshes } from "./assets.js";
export async function loadModel() {
  const mj = await loadMujoco();
  const base = new URL("../", import.meta.url);
  const manifest = await loadAsset(
    new URL("manifest.json", base),
    "asset manifest",
    (r) => r.json(),
  );
  const fs = mj.FS;
  for (const path of [
    "/soccer",
    "/soccer/g1_description",
    "/soccer/g1_description/meshes",
  ])
    if (!fs.analyzePath(path).exists) fs.mkdir(path);
  await Promise.all(
    ["soccer_field.xml", "g1_description/g1_12dof.xml"].map(async (path) => {
      const text = await loadAsset(new URL(`scene/${path}`, base), path, (r) =>
        r.text(),
      );
      fs.writeFile(`/soccer/${path}`, text);
    }),
  );
  await loadMeshes(manifest.meshes, async (name) => {
    const bytes = await loadAsset(
      new URL(`../g1/robots/g1/meshes/${name}`, base),
      name,
    );
    fs.writeFile(
      `/soccer/g1_description/meshes/${name}`,
      new Uint8Array(bytes),
    );
  });
  const model = mj.MjModel.from_xml_path("/soccer/soccer_field.xml");
  if (!model) throw Error("Could not compile the soccer scene.");
  const data = new mj.MjData(model);
  mj.mj_forward(model, data);
  return { mj, model, data };
}
