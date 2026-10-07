import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  claimKindSchema,
  renderClaimLabel,
  statusDimensionsSchema,
  type DiagnosticReportClaimInput
} from "../src/claims/eligibility/index.js";
import { getPrivateKeyPem, signHexDigest } from "../src/crypto/keys.js";
import { buildGrcEvidenceManifest } from "../src/exports/grcEvidenceExport.js";
import { runGrcExportCli } from "../src/exports/grcCli.js";
import { getAgentPaths } from "../src/fleet/paths.js";
import type { LayerName } from "../src/types.js";
import { sha256Hex } from "../src/utils/hash.js";
import { canonicalize } from "../src/utils/json.js";
import { initWorkspace } from "../src/workspace.js";

const FRAMEWORKS = ["SOC2", "NIST_AI_RMF", "ISO_42001", "EU_AI_ACT"] as const;
const READINESS = ["READY", "INSUFFICIENT_EVIDENCE", "UNVERIFIED"] as const;
const COVERAGE = [0, 0.39, 0.4, 0.75, 1];
const LEVELS = [0, 2.5, 4, 5];
const SEALS = [true, false];
const STATUSES = ["VALID", "INVALID", "UNSIGNED"] as const;
const NOW = 1_700_000_100_000;

type Readiness = (typeof READINESS)[number];
type RunFixture = DiagnosticReportClaimInput & { ts: number; evidenceReadiness: { status: string } };

function layers(level: number | null): DiagnosticReportClaimInput["layerScores"] {
  if (level === null) return [];
  return (["Strategic Agent Operations", "Leadership & Autonomy"] as LayerName[])
    .map((layerName) => ({ layerName, avgFinalLevel: level, confidenceWeightedFinalLevel: level }));
}

/** A run whose fields ask for the given readiness; the stored readiness field claims it too. */
function run(fields: { readiness?: Readiness; coverage?: number; level?: number | null;
  status?: (typeof STATUSES)[number]; agentId?: string; runId?: string; ts?: number }): RunFixture {
  const readiness = fields.readiness ?? "READY";
  const coverage = fields.coverage ?? 0.9;
  return {
    agentId: fields.agentId ?? "default",
    runId: fields.runId ?? "run-1",
    ts: fields.ts ?? 1_700_000_000_000,
    windowEndTs: fields.ts ?? 1_700_000_000_000,
    status: fields.status ?? "VALID",
    verificationPassed: true,
    trustBoundaryViolated: readiness === "UNVERIFIED",
    trustBoundaryMessage: null,
    integrityIndex: readiness === "INSUFFICIENT_EVIDENCE" ? 0.2 : 0.82,
    trustLabel: "HIGH TRUST",
    evidenceCoverage: coverage,
    evidenceTrustCoverage: { observed: coverage, attested: 0, selfReported: 0 },
    layerScores: layers(fields.level === undefined ? 4.2 : fields.level),
    contradictionCount: 0,
    evidenceReadiness: { status: readiness }
  };
}

describe("GRC export never derives a control result from run arithmetic", () => {
  test.each(FRAMEWORKS)("%s: every control is not evaluated across the readiness/coverage/level/seal/status grid", (framework) => {
    let cases = 0;
    for (const readiness of READINESS) for (const coverage of COVERAGE) for (const level of LEVELS)
      for (const sealVerified of SEALS) for (const status of STATUSES) {
        const where = JSON.stringify({ framework, readiness, coverage, level, sealVerified, status });
        const manifest = buildGrcEvidenceManifest(framework, run({ readiness, coverage, level, status }), { sealVerified, now: NOW });
        expect(manifest.schemaVersion, where).toBe("amc.grc-evidence.v2");
        expect(JSON.stringify(manifest), where).not.toMatch(/"(PASS|PARTIAL|FAIL|NOT_READY)"/);
        expect(manifest.controls.length, where).toBe(3);
        for (const control of manifest.controls) {
          const dims = control.claim.statusDimensions;
          expect(dims.result, where).toBe("not_evaluated");
          expect(control.claim.reasons, where).toContain("UNBOUND_EVIDENCE");
          expect(dims.applicability.state, where).toBe("unresolved");
          expect(control.claim.eligibleLevel, where).toBeNull();
          expect(statusDimensionsSchema.parse(dims), where).toEqual(dims);
          expect(claimKindSchema.parse(control.claim.claimKind), where).toBe(control.claim.claimKind);
          expect(control.label, where).toBe(renderClaimLabel(control.claim).line);
          if (!sealVerified) expect(control.claim.claimKind, where).not.toBe("observed");
          // Only a verified seal over a VALID run lets a control's evidence count as trusted.
          const trusted = sealVerified && status === "VALID";
          expect(dims.evidence === "untrusted", where).toBe(!trusted);
          expect(control.claim.reasons.includes("SIGNATURE_INVALID"), where).toBe(!trusted);
        }
        expect(manifest.run.label, where).toBe(renderClaimLabel(manifest.run.claim).line);
        if (!sealVerified) {
          expect(manifest.run.claim.claimKind, where).not.toBe("observed");
          expect(manifest.run.claim.statusDimensions.result, where).not.toBe("pass");
        }
        cases += 1;
      }
    expect(cases).toBe(READINESS.length * COVERAGE.length * LEVELS.length * SEALS.length * STATUSES.length);
  });

  test("a sealed run with contradictions marks every control's evidence contradictory", () => {
    const manifest = buildGrcEvidenceManifest("SOC2", { ...run({}), contradictionCount: 2 }, { sealVerified: true, now: NOW });
    for (const control of manifest.controls) {
      expect(control.claim.statusDimensions.evidence).toBe("contradictory");
      expect(control.claim.reasons).toContain("CONTRADICTORY_EVIDENCE");
      expect(control.claim.statusDimensions.result).toBe("not_evaluated");
    }
  });

  test("a run without layer scores reports maturityLevel null, never 0", () => {
    const manifest = buildGrcEvidenceManifest("SOC2", run({ level: null }), { sealVerified: true, now: NOW });
    const maturity = manifest.run.signals.find((signal) => signal.name === "maturityLevel");
    expect(maturity?.value).toBeNull();
    expect(manifest.run.claim.eligibleLevel).toBeNull();
  });
});

describe("amc export grc selects and verifies the run", () => {
  const roots: string[] = [];
  afterEach(() => {
    vi.restoreAllMocks();
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  });

  function workspace(): string {
    const dir = mkdtempSync(join(tmpdir(), "amc-grc-truth-"));
    roots.push(dir);
    process.env.AMC_VAULT_PASSPHRASE = "grc-export-truth-passphrase";
    initWorkspace({ workspacePath: dir, trustBoundaryMode: "isolated" });
    return dir;
  }

  /** Writes a run as the runner does: hash with the seal fields emptied, then sign with the auditor key. */
  function writeRun(ws: string, dir: string, report: RunFixture, seal: boolean): string {
    const base = { ...report, reportJsonSha256: "", runSealSig: "" };
    const hash = sha256Hex(canonicalize(base));
    const sealed = { ...base, reportJsonSha256: hash, runSealSig: seal ? signHexDigest(hash, getPrivateKeyPem(ws, "auditor")) : "unsigned" };
    mkdirSync(dir, { recursive: true });
    const file = join(dir, `${report.runId}.json`);
    writeFileSync(file, JSON.stringify(sealed, null, 2));
    return file;
  }

  function exportJson(ws: string, agentId: string): Record<string, unknown> & {
    runId: string; agentId: string;
    run: { claim: { claimKind: string; statusDimensions: { evidence: string } } };
    controls: Array<{ claim: { claimKind: string } }>;
  } {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    runGrcExportCli({ workspace: ws, agentId, framework: "SOC2", out: "grc.json" });
    vi.restoreAllMocks();
    return JSON.parse(readFileSync(join(ws, "grc.json"), "utf8"));
  }

  test("a sealed READY run at level 4.2 exports no PASS, and its human output says not evaluated", () => {
    const ws = workspace();
    writeRun(ws, getAgentPaths(ws, "default").runsDir, run({ readiness: "READY", coverage: 0.9, level: 4.2 }), true);
    const lines: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => { lines.push(args.join(" ")); });
    runGrcExportCli({ workspace: ws, agentId: "default", framework: "SOC2", out: "grc.json" });
    const written = readFileSync(join(ws, "grc.json"), "utf8");
    expect(written).not.toMatch(/"PASS"|"PARTIAL"/);
    const manifest = JSON.parse(written) as { run: { claim: { claimKind: string } } };
    expect(manifest.run.claim.claimKind).toBe("observed");
    const text = lines.join("\n");
    expect(text).not.toMatch(/\bPASS\b/);
    expect(text).toMatch(/CC7\.3 not evaluated — Evaluation of security events/);
  });

  test("--json prints the v2 manifest, --sarif writes run findings, and an unknown framework is refused", () => {
    const ws = workspace();
    writeRun(ws, getAgentPaths(ws, "default").runsDir, run({ coverage: 0.5 }), false);
    const lines: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => { lines.push(args.join(" ")); });
    runGrcExportCli({ workspace: ws, agentId: "default", framework: "eu_ai_act", out: "grc.json", sarif: "grc.sarif", json: true });
    const printed = JSON.parse(lines.join("\n")) as { schemaVersion: string; framework: string };
    // stdout adds the run's claim fields (P0-22) to the manifest written to disk.
    const written = JSON.parse(readFileSync(join(ws, "grc.json"), "utf8")) as { run: { claim: { claimKind: string; statusDimensions: unknown }; label: string } };
    expect(printed).toEqual({ ...written, claimKind: written.run.claim.claimKind, statusDimensions: written.run.claim.statusDimensions,
      claimLabel: written.run.label });
    expect(printed.schemaVersion).toBe("amc.grc-evidence.v2");
    expect(printed.framework).toBe("EU_AI_ACT");
    const sarif = JSON.parse(readFileSync(join(ws, "grc.sarif"), "utf8")) as { runs: Array<{ results: Array<{ ruleId: string }> }> };
    expect(sarif.runs[0]!.results.map((r) => r.ruleId)).toEqual(["AMC-GRC-RUN-UNVERIFIED", "AMC-GRC-EVIDENCE-NOT-READY", "AMC-GRC-LOW-COVERAGE"]);
    expect(() => runGrcExportCli({ workspace: ws, agentId: "default", framework: "HIPAA", out: "x.json" }))
      .toThrow(/--framework must be one of/);
  });

  test("a run edited to VALID without a valid seal is untrusted and never observed", () => {
    const ws = workspace();
    const file = writeRun(ws, getAgentPaths(ws, "default").runsDir,
      { ...run({ status: "INVALID", coverage: 0.9, level: 4.2 }), verificationPassed: false }, true);
    const edited = { ...JSON.parse(readFileSync(file, "utf8")), status: "VALID", verificationPassed: true };
    writeFileSync(file, JSON.stringify(edited, null, 2));
    const manifest = exportJson(ws, "default");
    expect(manifest.run.claim.statusDimensions.evidence).toBe("untrusted");
    expect(manifest.run.claim.claimKind).not.toBe("observed");
    for (const control of manifest.controls) expect(control.claim.claimKind).not.toBe("observed");
  });

  test("--agent a never exports agent b's run", () => {
    const ws = workspace();
    writeRun(ws, getAgentPaths(ws, "a").runsDir, run({ agentId: "a", runId: "run-a", ts: 1_700_000_000_000 }), true);
    const newerB = run({ agentId: "b", runId: "run-b", ts: 1_700_000_500_000 });
    writeRun(ws, getAgentPaths(ws, "b").runsDir, newerB, true);
    writeRun(ws, join(ws, ".amc", "runs"), newerB, true);
    const manifest = exportJson(ws, "a");
    expect(manifest.runId).toBe("run-a");
    expect(manifest.agentId).toBe("a");
  });

  test("the newest run by ts is exported, whatever the file-name order", () => {
    const ws = workspace();
    const dir = getAgentPaths(ws, "default").runsDir;
    writeRun(ws, dir, run({ runId: "0aaa-newest", ts: 1_700_000_900_000 }), true);
    writeRun(ws, dir, run({ runId: "5bbb-middle", ts: 1_700_000_500_000 }), true);
    writeRun(ws, dir, run({ runId: "fccc-oldest", ts: 1_700_000_100_000 }), true);
    expect(exportJson(ws, "default").runId).toBe("0aaa-newest");
  });

  test("a newer failed run is exported over an older run marked VALID", () => {
    const ws = workspace();
    const dir = getAgentPaths(ws, "default").runsDir;
    writeRun(ws, dir, run({ runId: "old-valid", ts: 1_700_000_100_000 }), true);
    writeRun(ws, dir, { ...run({ runId: "new-invalid", status: "INVALID", ts: 1_700_000_900_000 }), verificationPassed: false }, true);
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    runGrcExportCli({ workspace: ws, agentId: "default", framework: "SOC2", out: "grc.json", sarif: "grc.sarif" });
    expect((JSON.parse(readFileSync(join(ws, "grc.json"), "utf8")) as { runId: string }).runId).toBe("new-invalid");
    const sarif = JSON.parse(readFileSync(join(ws, "grc.sarif"), "utf8")) as { runs: Array<{ results: Array<{ ruleId: string; level: string }> }> };
    expect(sarif.runs[0]!.results).toContainEqual(expect.objectContaining({ ruleId: "AMC-GRC-RUN-UNVERIFIED", level: "error" }));
  });

  test("an older unsealed file claiming VALID never displaces the newest sealed run", () => {
    const ws = workspace();
    const dir = getAgentPaths(ws, "default").runsDir;
    writeRun(ws, dir, { ...run({ runId: "new-sealed", status: "INVALID", ts: 1_700_000_900_000 }), verificationPassed: false }, true);
    writeRun(ws, join(ws, ".amc", "runs"), run({ runId: "forged-old", ts: 1_600_000_000_000 }), false);
    expect(exportJson(ws, "default").runId).toBe("new-sealed");
  });

  test("no runs gives the existing error and a non-zero exit", () => {
    const ws = workspace();
    expect(() => runGrcExportCli({ workspace: ws, agentId: "default", framework: "SOC2", out: "grc.json" }))
      .toThrow(/No run reports found/);
    const cli = spawnSync(process.execPath, [resolve(process.cwd(), "dist/cli.js"), "export", "grc", "--framework", "SOC2", "--out", "grc.json"], {
      cwd: ws, encoding: "utf8", env: { ...process.env, NO_COLOR: "1" }, timeout: 60_000
    });
    expect(cli.status).not.toBe(0);
    expect(cli.stderr).toMatch(/No run reports found/);
  });
});
