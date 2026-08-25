import { mkdtempSync, rmSync, writeFileSync, chmodSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { probeBinaryVersion } from "../src/ledger/monitor.js";

/**
 * The version probe runs the binary AMC is about to observe — before it has
 * decided to observe it, and before any of the care the real spawn takes.
 *
 * As shipped it called `spawnSync(command, ["--version"])` with no `env` and
 * no `timeout`, three times. No `env` means Node passes the parent's, so every
 * provider API key in AMC's environment went to an unvetted binary; the spawn
 * twenty lines below it strips exactly those keys before running the same
 * program. And with no timeout, a binary that blocks on `--version` blocks AMC
 * forever.
 */
const dirs: string[] = [];

afterEach(() => {
  while (dirs.length > 0) {
    const dir = dirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

function scriptNamed(body: string): string {
  const dir = mkdtempSync(join(tmpdir(), "amc-probe-"));
  dirs.push(dir);
  const path = join(dir, "fake-binary.sh");
  writeFileSync(path, `#!/bin/sh\n${body}\n`);
  chmodSync(path, 0o755);
  return path;
}

describe("probing a binary's version", () => {
  it("does NOT hand it the provider keys in AMC's environment", () => {
    const dir = mkdtempSync(join(tmpdir(), "amc-probe-out-"));
    dirs.push(dir);
    const seen = join(dir, "seen.txt");
    const binary = scriptNamed(`echo "[$OPENAI_API_KEY][$ANTHROPIC_API_KEY]" > ${seen}\necho v1.0.0`);

    const prior = { o: process.env["OPENAI_API_KEY"], a: process.env["ANTHROPIC_API_KEY"] };
    process.env["OPENAI_API_KEY"] = "sk-openai-must-not-leak";
    process.env["ANTHROPIC_API_KEY"] = "sk-anthropic-must-not-leak";
    try {
      probeBinaryVersion(binary);
      const captured = existsSync(seen) ? readFileSync(seen, "utf8") : "";
      expect(captured, "the probe ran").not.toBe("");
      expect(captured, "a key reached a binary AMC had not yet decided to trust")
        .not.toContain("must-not-leak");
    } finally {
      if (prior.o === undefined) delete process.env["OPENAI_API_KEY"]; else process.env["OPENAI_API_KEY"] = prior.o;
      if (prior.a === undefined) delete process.env["ANTHROPIC_API_KEY"]; else process.env["ANTHROPIC_API_KEY"] = prior.a;
    }
  });

  it("gives up on a binary that hangs instead of blocking forever", () => {
    // Three attempts at 30s each used to mean an unkillable 90-second stall
    // before AMC even started the run it was asked for.
    const binary = scriptNamed("sleep 30");
    const startedAt = Date.now();
    const version = probeBinaryVersion(binary);
    const elapsed = Date.now() - startedAt;

    expect(version, "a hang is not a version").toBe("unknown");
    expect(elapsed, `took ${elapsed}ms; the probe must be bounded`).toBeLessThan(15_000);
  });

  it("still reports the version of a well-behaved binary", () => {
    // The hardening must not cost the thing the probe exists for.
    expect(probeBinaryVersion(scriptNamed("echo v4.2.1"))).toContain("v4.2.1");
  });

  it("reports unknown for a binary that does not exist", () => {
    expect(probeBinaryVersion("/definitely/not/here")).toBe("unknown");
  });
});
