import { afterAll, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Runs each examples/regulated-industries/<station>/run.mjs against the built
 * CLI in a fresh temp directory, with a parent environment that carries only
 * PATH (no provider key, no license key) and with outbound sockets denied by
 * the examples' own preload. Then checks the artifacts and their provenance.
 */
const ROOT = process.cwd();
const EXAMPLES = join(ROOT, "examples", "regulated-industries");
const CLI = join(ROOT, "dist", "cli.js");
const STATIONS = ["health", "wealth", "governance"] as const;
const ARTIFACTS = [
  "domain-modules.json",
  "pack-catalog.json",
  "pack-run-gate.json",
  "risk-classification.json",
  "assurance-pack.json",
  "agent-run.json",
  "agent-verify.json",
  "evidence.json",
  "binder.amcaudit"
];
const RISK_TIERS = ["UNACCEPTABLE", "HIGH", "LIMITED", "MINIMAL"];

const sha256 = (buf: Buffer | string) => createHash("sha256").update(buf).digest("hex");
const readJson = (path: string) => JSON.parse(readFileSync(path, "utf8"));

let passed = 0;
afterAll(() => {
  // stderr: the default non-TTY reporter does not echo captured stdout.
  process.stderr.write(`examples=${passed}\n`);
});

describe("regulated-industry examples run keyless against the built CLI", () => {
  it("has a built CLI to run against (pnpm build)", () => {
    expect(existsSync(CLI), `missing ${CLI}; run pnpm build`).toBe(true);
  });

  for (const station of STATIONS) {
    it(`${station}: completes and every output carries provenance`, () => {
      const workdir = mkdtempSync(join(tmpdir(), `amc-o20-${station}-`));
      try {
        const run = spawnSync(
          process.execPath,
          [join(EXAMPLES, station, "run.mjs"), "--cli", CLI, "--workdir", workdir, "--deny-network"],
          { encoding: "utf8", env: { PATH: process.env.PATH ?? "" }, timeout: 600_000 }
        );
        expect(run.status, `${run.stdout}\n${run.stderr}`).toBe(0);

        const out = join(workdir, "workspace", "out");
        const summary = readJson(join(out, "summary.json"));
        const fixture = readJson(join(EXAMPLES, station, "fixture.json"));

        // Provenance of the run itself.
        expect(summary.station).toBe(station);
        expect(summary.provenance.cliSha256).toBe(sha256(readFileSync(CLI)));
        expect(summary.provenance.fixtureSha256).toBe(sha256(readFileSync(join(EXAMPLES, station, "fixture.json"))));
        expect(summary.provenance.sourceCommit).toMatch(/^([0-9a-f]{40}|unknown)$/);
        expect(summary.provenance.node).toBe(process.version);
        expect(summary.provenance.amcVersion).toMatch(/^\d+\.\d+\.\d+/);
        expect(summary.network).toEqual({ mode: "denied", attempts: [] });

        // Every listed artifact exists and matches its recorded digest.
        const listed = summary.artifacts.map((a: { path: string }) => a.path.replace(/^out\//, ""));
        expect(listed.sort()).toEqual([...ARTIFACTS].sort());
        for (const artifact of summary.artifacts as Array<{ path: string; sha256: string }>) {
          const path = join(workdir, "workspace", artifact.path);
          expect(existsSync(path), artifact.path).toBe(true);
          expect(sha256(readFileSync(path)), artifact.path).toBe(artifact.sha256);
        }
        for (const step of summary.steps as Array<{ id: string; exitCode: number; expectedExit: number }>) {
          expect(step.exitCode, step.id).toBe(step.expectedExit);
        }

        // Station content comes from the CLI, keyed by the fixture.
        expect(readJson(join(out, "domain-modules.json")).length).toBeGreaterThan(0);
        expect(readJson(join(out, "pack-catalog.json")).packs.some((p: { packId: string }) => p.packId === fixture.industryPack)).toBe(true);
        expect(readJson(join(out, "assurance-pack.json")).id).toBe(fixture.assurancePack);
        expect(RISK_TIERS).toContain(readJson(join(out, "risk-classification.json")).riskTier);

        // Paid and target-dependent steps fail closed instead of producing a score.
        expect(readJson(join(out, "pack-run-gate.json")).error).toBe("industry_packs_locked");
        const gate = summary.steps.find((s: { id: string }) => s.id === "assurance-gate");
        expect(gate.exitCode).toBe(2);

        // The stub turn is recorded, verified, and exported with its hash chain.
        const agentRun = readJson(join(out, "agent-run.json"));
        const verify = readJson(join(out, "agent-verify.json"));
        expect(verify.sessionId).toBe(agentRun.sessionId);
        expect(verify.ok).toBe(true);
        const evidence = readJson(join(out, "evidence.json"));
        expect(evidence.includeChain).toBe(true);
        expect(evidence.chainInvalidCount).toBe(0);
        expect(evidence.records.length).toBeGreaterThan(0);
        for (const record of evidence.records) {
          expect(record.eventHash).toMatch(/^[0-9a-f]{64}$/);
          expect(record.writerSignature.length).toBeGreaterThan(0);
          expect(record.chainValid).toBe(true);
        }
        expect(evidence.records.some((r: { sessionId: string }) => r.sessionId === agentRun.sessionId)).toBe(true);
        const binderStep = summary.steps.find((s: { id: string }) => s.id === "binder-verify");
        expect(binderStep.exitCode).toBe(0);
        passed += 1;
      } finally {
        rmSync(workdir, { recursive: true, force: true });
      }
    }, 600_000);
  }

  it("README appendix citations resolve to the quoted text", () => {
    const readme = readFileSync(join(EXAMPLES, "README.md"), "utf8");
    const [body, appendix] = readme.split(/^## Appendix: citations$/m);
    expect(appendix, "README needs an '## Appendix: citations' section").toBeDefined();
    const rows = [...appendix.matchAll(/^\| (C\d+) \| `([^`]+):(\d+)` \| `(.+)` \|$/gm)];
    expect(rows.length).toBeGreaterThan(0);
    const ids = new Set<string>();
    for (const [, id, file, line, snippet] of rows) {
      ids.add(id);
      const lines = readFileSync(join(ROOT, file), "utf8").split("\n");
      // Markdown tables escape "|" as "\|" inside cells.
      expect(lines[Number(line) - 1] ?? "", `${id} ${file}:${line}`).toContain(snippet.replace(/\\\|/g, "|"));
    }
    const cited = new Set([...body.matchAll(/\[(C\d+)\]/g)].map((m) => m[1]));
    expect([...cited].sort()).toEqual([...ids].sort());
  });
});
