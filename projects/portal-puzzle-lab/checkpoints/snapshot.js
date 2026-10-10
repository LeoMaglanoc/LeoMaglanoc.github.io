import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const files = [
  "index.html",
  "style.css",
  "package-lock.json",
  ...["src", "vendor", "licenses"].flatMap((d) =>
    readdirSync(resolve(root, d))
      .sort()
      .map((f) => `${d}/${f}`)
  ),
];
const checkpoint = {
  schema: 1,
  project: "Portal Puzzle Lab",
  created: "2026-10-10",
  mlModels: false,
  upstream: { repository: "https://github.com/efyang/portal-0.5", commit: "ff638719c82a7cb908172f29fe35cd0406af2e78", license: "MIT" },
  dependencies: { three: "0.180.0", "cannon-es": "0.20.0", playwright: "1.56.0" },
  contract: {
    physicsTimestep: 1 / 120,
    portalWidth: 1.9,
    portalHeight: 2.8,
    portalCentreY: 1.4,
    cooldownSeconds: 0.16,
    door: "non-latching cube pressure plate",
    chamber: "Escape",
  },
  sha256: Object.fromEntries(
    files.map((f) => [
      f,
      createHash("sha256")
        .update(readFileSync(resolve(root, f)))
        .digest("hex"),
    ])
  ),
};
writeFileSync(resolve(root, "checkpoints/release.json"), JSON.stringify(checkpoint, null, 2) + "\n");
console.log(`Recorded ${files.length} source/dependency hashes`);
