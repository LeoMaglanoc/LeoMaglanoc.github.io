import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("demo registry uses a metadata file below the static base path", async () => {
  const source = await readFile(new URL("../src/main.js", import.meta.url), "utf8");
  assert.match(source, /freiburg3_long_office_household/);
  assert.match(source, /import\.meta\.env\.BASE_URL/);
});
