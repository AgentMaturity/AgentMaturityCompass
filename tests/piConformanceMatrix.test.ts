import { spawnSync } from "node:child_process";
import { expect, test } from "vitest";

// docs/adapters/pi.md's conformance matrix is generated from the P1-22 qualification receipt; a hand edit fails here.
test("the Pi conformance matrix in docs/adapters/pi.md matches its qualification receipt", () => {
  const run = spawnSync(process.execPath, ["scripts/gen-pi-conformance-matrix.mjs", "--check"], { encoding: "utf8" });
  expect(run.stderr).toBe("");
  expect(run.status).toBe(0);
});
