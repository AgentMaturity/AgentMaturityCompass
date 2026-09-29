import { spawnSync } from "node:child_process";
import { createHash, generateKeyPairSync } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";

function snapshot(root: string): Record<string, string | { sha256: string; mtimeMs: number }> {
  const entries: Record<string, string | { sha256: string; mtimeMs: number }> = {};
  for (const relative of readdirSync(root, { recursive: true }).map(String).sort()) {
    const path = join(root, relative);
    const stat = statSync(path);
    entries[relative] = stat.isFile() ? {
      sha256: createHash("sha256").update(readFileSync(path)).digest("hex"),
      mtimeMs: stat.mtimeMs,
    } : "directory";
  }
  return entries;
}

it("readiness leaves a fresh public-only workspace unchanged without creating a vault or evidence stores", () => {
  const workspace = mkdtempSync(join(tmpdir(), "amc-readiness-public-only-"));
  try {
    const keys = join(workspace, ".amc", "keys");
    mkdirSync(keys, { recursive: true });
    for (const role of ["monitor", "auditor", "lease", "session"]) {
      const { publicKey } = generateKeyPairSync("ed25519");
      writeFileSync(join(keys, `${role}_ed25519.pub`), publicKey.export({ type: "spki", format: "pem" }));
      writeFileSync(join(keys, `${role}_history.json`), "[]\n");
    }
    const before = snapshot(workspace);
    const env = { ...process.env };
    delete env.AMC_GUARD_EVENTS_DB_PATH;
    delete env.AMC_GUARD_RECEIPTS_WORKSPACE;
    delete env.AMC_NO_SIGN;
    const moduleUrl = new URL("../src/score/productionReadiness.ts", import.meta.url).href;
    // Only this child changes cwd. It exercises real default paths and modules
    // without consulting the developer workspace or inheriting the test sink.
    const result = spawnSync(process.execPath, [
      "--import", import.meta.resolve("tsx"), "--input-type=module", "--eval",
      `import { assessProductionReadiness } from ${JSON.stringify(moduleUrl)};
       console.log(JSON.stringify(assessProductionReadiness("missing-agent", { strictMode: true })));`,
    ], { cwd: workspace, env, encoding: "utf8", timeout: 20_000 });
    expect(result.error).toBeUndefined();
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ ready: false, score: 0 });
    expect(snapshot(workspace)).toEqual(before);
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});
