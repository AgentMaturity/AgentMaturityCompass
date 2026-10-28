import { spawnSync } from "node:child_process";
import { expect, test } from "vitest";

// docs/adapters/SUPPORT_MATRIX.md is generated from the adapter claim manifests; a hand edit fails here (P2-17).
test("the harness support matrix matches the adapter claim manifests", () => {
  const run = spawnSync(process.execPath, ["scripts/gen-harness-matrix.mjs", "--check"], { encoding: "utf8" });
  expect(run.stderr).toBe("");
  expect(run.status).toBe(0);
});
