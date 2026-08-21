import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Score modules credit an agent when a candidate evidence path exists. 138 of
 * 213 `src/` paths named no module in the repository. Most reflect capabilities
 * AMC genuinely lacks, but nineteen were simply wrong: the criterion looked for
 * `src/ops/rateLimiter.ts` while the rate limiter ships at
 * `src/product/toolRateLimiter.ts`, so AMC reported hasRateLimiting:false for a
 * feature it has. Fixing those moved fail-secure governance 71 → 86 and output
 * integrity 86 → 100 on AMC's own tree.
 *
 * A wrong path and an absent capability both score zero forever, with nothing
 * to tell them apart — so the absent set is frozen and anything new fails.
 */
describe("evidence paths", () => {
  it("introduces no path naming a module nobody wrote", () => {
    const result = spawnSync(process.execPath, ["scripts/evidence-path-check.mjs"], {
      cwd: process.cwd(),
      encoding: "utf8"
    });
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
  });

  it("credits the capabilities AMC actually ships", () => {
    // These were the repointed ones; each must name a module that exists.
    const repointed = [
      "src/product/toolRateLimiter.ts",
      "src/shield/sanitizer.ts",
      "src/observability/anomalyDetector.ts",
      "src/product/loopDetector.ts",
      "src/watch/behavioralProfiler.ts",
      "src/sandbox/sandbox.ts",
      "src/runtime/traceLogger.ts",
      "src/runtime/truthProtocol.ts",
      "src/agents/monitor.ts"
    ];
    for (const path of repointed) {
      expect(existsSync(join(process.cwd(), path)), path).toBe(true);
    }

    const referenced = readdirSync(join(process.cwd(), "src", "score"))
      .filter((f) => f.endsWith(".ts"))
      .map((f) => readFileSync(join(process.cwd(), "src", "score", f), "utf8"))
      .join("\n");
    for (const path of repointed) {
      expect(referenced, `${path} should be cited as evidence`).toContain(path);
    }
  });

  it("keeps the frozen list honest — every entry really is absent", () => {
    const registry = JSON.parse(
      readFileSync(join(process.cwd(), "scripts", "evidence-paths.json"), "utf8")
    );
    const stillMissing = registry.knownAbsentCapabilities.filter(
      (p: string) => !existsSync(join(process.cwd(), p))
    );
    expect(stillMissing).toEqual(registry.knownAbsentCapabilities);
  });
});
