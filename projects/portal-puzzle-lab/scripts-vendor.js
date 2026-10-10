import { copyFileSync } from "node:fs";
for (const [from, to] of [
  ["three/build/three.module.js", "vendor/three.module.js"],
  ["three/build/three.core.js", "vendor/three.core.js"],
  ["cannon-es/dist/cannon-es.js", "vendor/cannon-es.js"],
  ["three/LICENSE", "licenses/THREE-MIT.txt"],
  ["cannon-es/LICENSE", "licenses/CANNON-ES-MIT.txt"],
])
  copyFileSync(`node_modules/${from}`, to);
