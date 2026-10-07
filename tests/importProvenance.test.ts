import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { runNeutralImport } from "../src/importers/neutralImporter.js";
import type { DiagnosticReport } from "../src/types.js";

/**
 * AMC-1506 — an import must not invent maturity or observed evidence.
 *
 * Reproduced at 4247e610: a five-row Pi v3 session containing a failed tool
 * call and a model error imported as finalLevel 4, confidence .9, integrity
 * .72 and OBSERVED coverage .166667. Every one of those numbers came from file
 * classification — how many files were recognised, how confidently, with what
 * parse flags — none from executed, verified behaviour. The report was UNSIGNED
 * and segregated from scored runs, so this is a misleading import claim rather
 * than a scorer bypass; it is still a maturity claim AMC cannot back.
 *
 * The rule these tests pin: parsed files yield ZERO inferred maturity, zero
 * measured integrity, zero receipt correlation, zero observed/attested
 * coverage, and every derived view says so.
 */

const roots: string[] = [];

function scratch(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  roots.push(dir);
  return dir;
}

afterEach(() => {
  while (roots.length > 0) {
    const dir = roots.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

/** Pi v3 session JSONL (CURRENT_SESSION_VERSION = 3 at b2602be7): header + tree-linked entries. */
function piV3SessionWithFailures(): string {
  const dir = scratch("amc-import-pi-v3-");
  const t = (n: number) => new Date(Date.UTC(2026, 8, 8, 0, 0, n)).toISOString();
  const rows = [
    { type: "session", version: 3, id: "sess-1", timestamp: t(0), cwd: "/work" },
    { type: "message", id: "m1", parentId: null, timestamp: t(1), message: { role: "user", content: "run the tests" } },
    {
      type: "message", id: "m2", parentId: "m1", timestamp: t(2),
      message: {
        role: "assistant", provider: "anthropic", model: "claude-x", stopReason: "toolUse",
        content: [{ type: "toolCall", id: "call-1", name: "bash", arguments: { command: "npm test" } }]
      }
    },
    { type: "message", id: "m3", parentId: "m2", timestamp: t(3), message: { role: "toolResult", toolCallId: "call-1", isError: true, content: "npm ERR! 3 tests failed" } },
    {
      type: "message", id: "m4", parentId: "m3", timestamp: t(4),
      message: { role: "assistant", provider: "anthropic", model: "claude-x", content: [], stopReason: "error", errorMessage: "rate limited" }
    }
  ];
  writeFileSync(join(dir, "pi-session.jsonl"), rows.map((row) => JSON.stringify(row)).join("\n") + "\n");
  return dir;
}

function arbitraryConfigJson(): string {
  const dir = scratch("amc-import-config-");
  writeFileSync(join(dir, "agent.config.json"), JSON.stringify({
    model: "gpt-x", temperature: 0.2, tools: ["bash", "read"], provider: { name: "openai", timeoutMs: 30000 }
  }, null, 2));
  return dir;
}

function importInto(inputPath: string) {
  const workspace = scratch("amc-import-ws-");
  mkdirSync(join(workspace, ".amc"), { recursive: true });
  const result = runNeutralImport({ workspace, inputPath, agentId: "default", mode: "import", retainOriginals: false });
  const report = JSON.parse(readFileSync(result.diagnosticReportPath!, "utf8")) as DiagnosticReport;
  const markdown = readFileSync(result.diagnosticMarkdownPath!, "utf8");
  return { workspace, result, report, markdown };
}

function expectNothingInferred(report: DiagnosticReport): void {
  expect(report.status).toBe("UNSIGNED");
  expect(report.verificationPassed).toBe(false);
  // Measured quantities an import cannot have measured.
  expect(report.integrityIndex).toBe(0);
  expect(report.correlationRatio).toBe(0);
  expect(report.evidenceCoverage).toBe(0);
  expect(report.evidenceTrustCoverage.observed).toBe(0);
  expect(report.evidenceTrustCoverage.attested).toBe(0);
  // Maturity: none inferred, none claimed, and classifier confidence is not
  // score confidence. Emitting no question rows at all satisfies this; any
  // row that is emitted must be all-zero.
  for (const row of report.questionScores) {
    expect(row.finalLevel).toBe(0);
    expect(row.supportedMaxLevel).toBe(0);
    expect(row.claimedLevel).toBe(0);
    expect(row.confidence).toBe(0);
  }
  for (const layer of report.layerScores) {
    expect(layer.avgFinalLevel).toBe(0);
    expect(layer.confidenceWeightedFinalLevel).toBe(0);
  }
  expect(report.trustLabel).toBe("UNRELIABLE — DO NOT USE FOR CLAIMS");
}

describe("AMC-1506 — imports invent nothing", () => {
  test("a failed Pi v3 session yields zero inferred maturity and no observed evidence", () => {
    const { report, result, markdown } = importInto(piV3SessionWithFailures());
    expect(result.plan.categories).toContain("event-log");
    expectNothingInferred(report);
    // Everything it did bring is self-reported, and said to be.
    expect(report.evidenceTrustCoverage.selfReported).toBe(1);
    expect(markdown).toMatch(/import-only|not measured|no maturity evaluation|not a score/i);
    expect(markdown).not.toMatch(/claim-ready/i);
  });

  test("an arbitrary config file yields the same zeros", () => {
    const { report } = importInto(arbitraryConfigJson());
    expectNothingInferred(report);
  });

  test("episode and lifecycle views disclose import-only measurement, no positive Score/Shield verdict", () => {
    const { result } = importInto(piV3SessionWithFailures());
    const episode = result.episode!.episode;
    expect(episode.evaluations.integrityIndex).toBe(0);
    for (const row of episode.failureClassifications) expect(row.finalLevel).toBe(0);

    const surfaces = (result.lifecycleRun!.artifact as unknown as { surfaces: Record<string, { status: string; summary: string }> }).surfaces;
    expect(surfaces.Score.status).not.toBe("complete");
    expect(surfaces.Score.summary).toMatch(/import/i);
    expect(surfaces.Score.summary).not.toMatch(/claim-ready|maturity score generated/i);
    expect(surfaces.Shield.status).not.toBe("complete");
    expect(surfaces.Shield.summary).toMatch(/import/i);
  });
});
