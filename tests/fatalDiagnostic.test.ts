import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { writeFatalDiagnostic } from "../src/runtime/fatalDiagnostic.js";

/** DXA-10: a fatal process event leaves a bounded diagnostic with the original stack, and the exit is nonzero. */
const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });

function workspace(): string {
  const dir = mkdtempSync(join(tmpdir(), "amc-fatal-"));
  dirs.push(dir);
  mkdirSync(join(dir, ".amc"));
  return dir;
}

describe("fatal process diagnostics", () => {
  it("an unhandled rejection exits nonzero and leaves a diagnostic with the original stack and cause", () => {
    const cwd = workspace();
    const module = pathToFileURL(resolve("dist/runtime/fatalDiagnostic.js")).href;
    const script = `const m = await import(${JSON.stringify(module)}); m.installFatalHandlers();
      function deepFrame() { return Promise.reject(new Error("outer failure", { cause: new Error("root cause here") })); }
      deepFrame();`;
    const run = spawnSync(process.execPath, ["--input-type=module", "-e", script], { cwd, encoding: "utf8" });
    expect(run.status).toBe(1);
    expect(run.stderr).toContain("Unhandled rejection: outer failure");
    const dir = join(cwd, ".amc", "diagnostics");
    const files = readdirSync(dir);
    expect(files).toHaveLength(1);
    expect(run.stderr).toContain(join(dir, files[0]!));
    expect(statSync(join(dir, files[0]!)).mode & 0o077, "owner-only").toBe(0);
    const diagnostic = JSON.parse(readFileSync(join(dir, files[0]!), "utf8")) as { kind: string; error: { stack: string; cause: { message: string } } };
    expect(diagnostic.kind).toBe("unhandledRejection");
    expect(diagnostic.error.stack).toContain("deepFrame");
    expect(diagnostic.error.cause.message).toBe("root cause here");
  });

  it("bounds what it writes: cause depth, aggregate members and field size", () => {
    const cwd = workspace();
    let error: Error = new Error("x".repeat(40_000));
    for (let depth = 0; depth < 20; depth += 1) error = new Error(`level ${depth}`, { cause: error });
    const aggregate = new AggregateError(Array.from({ length: 40 }, (_, index) => new Error(`member ${index}`)), "many", { cause: error });
    const path = writeFatalDiagnostic("uncaughtException", aggregate, cwd)!;
    const text = readFileSync(path, "utf8");
    expect(text.length).toBeLessThanOrEqual(70_000);
    const parsed = JSON.parse(text) as { error?: { errors: unknown[]; errorsOmitted: number }; truncated?: boolean };
    if (parsed.truncated !== true) {
      expect(parsed.error!.errors).toHaveLength(16);
      expect(parsed.error!.errorsOmitted).toBe(24);
    }
    expect(text).toContain("cause chain deeper than the bound");
  });
});
