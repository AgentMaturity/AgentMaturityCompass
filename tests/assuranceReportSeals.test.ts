import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { assuranceReadinessGate } from "../src/assurance/assuranceControlPlane.js";
import { latestAssuranceByPack } from "../src/assurance/assuranceRunner.js";
import { issueCertificate, verifyCertificate } from "../src/assurance/certificate.js";
import { writeSignedGatePolicy } from "../src/ci/gate.js";
import { runDiagnostic } from "../src/diagnostic/runner.js";
import { getAgentPaths } from "../src/fleet/paths.js";
import { initWorkspace } from "../src/workspace.js";
import { sha256Hex } from "../src/utils/hash.js";
import { canonicalize } from "../src/utils/json.js";
import { writeSealedReport } from "./helpers/sealedRun.js";
import { writeProvenancedAssuranceReport } from "./helpers/provenancedAssurance.js";
import { workspaceKeyTrust } from "./helpers/trustContext.js";

/**
 * Security sweep 2026-10-31: assurance report readers other than scanVerifiedAssuranceByPack parsed report files with no
 * seal check. A planted unsealed "latest" report passed the /readyz assurance gate, fed certificate issuance and the
 * governor's assurance gate, and certificate verification only checked that the seal fields were non-empty.
 */
const dirs: string[] = [];
afterEach(() => {
  while (dirs.length > 0) rmSync(dirs.pop()!, { recursive: true, force: true });
});

function workspace(): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "amc-assurance-seals-")));
  dirs.push(dir);
  initWorkspace({ workspacePath: dir, trustBoundaryMode: "isolated" });
  return dir;
}

const reportsDir = (dir: string) => join(getAgentPaths(dir, "default").reportsDir, "assurance");
const pack = (packId: string, score0to100: number) => ({ packId, title: packId, scenarioCount: 1, passCount: 1, failCount: 0, score0to100,
  trustTier: "OBSERVED", scenarioResults: [] });
const report = (id: string, ts: number, overall: number, packs = [pack("injection", overall)]) => ({ assuranceRunId: id, agentId: "default", ts,
  mode: "supervise", windowStartTs: ts - 1_000, windowEndTs: ts, trustTier: "OBSERVED", status: "VALID", verificationPassed: true,
  packResults: packs, overallScore0to100: overall, integrityIndex: 1, trustLabel: "HIGH TRUST" });

/** What an attacker with workspace write plants: a newer report with no seal at all. */
function plantUnsealed(dir: string, id: string, ts: number, overall: number): void {
  mkdirSync(reportsDir(dir), { recursive: true });
  writeFileSync(join(reportsDir(dir), `${id}.json`), JSON.stringify(report(id, ts, overall)));
}

describe("assurance readers take sealed reports only, and a refused newer report blocks", () => {
  test("the readiness gate is not passed by a planted unsealed latest report", () => {
    const dir = workspace();
    writeProvenancedAssuranceReport(dir, { name: "sealed-low", ts: Date.now() - 60_000, packs: [{ packId: "injection", scenarios: [{ pass: true, score0to100: 40 }], score0to100: 40 }] });
    expect(assuranceReadinessGate(dir)).toMatchObject({ ok: false, reasons: expect.arrayContaining(["ASSURANCE_THRESHOLD_BREACH"]) });
    plantUnsealed(dir, "planted-high", Date.now(), 100);
    const gate = assuranceReadinessGate(dir);
    expect(gate.ok).toBe(false);
    expect(gate.reasons).toContain("ASSURANCE_EVIDENCE_UNVERIFIABLE");
    expect(gate.latestRunId).not.toBe("planted-high");
  });

  test("latestAssuranceByPack refuses when the newest report is unsealed instead of falling back to an older one", () => {
    const dir = workspace(), now = Date.now();
    writeProvenancedAssuranceReport(dir, { name: "sealed-old", ts: now - 60_000, packs: [{ packId: "injection", scenarios: [{ pass: true, score0to100: 20 }], score0to100: 20 }] });
    expect(latestAssuranceByPack({ workspace: dir, agentId: "default", windowStartTs: 0, windowEndTs: now + 1 }).get("injection")?.score0to100).toBe(20);
    plantUnsealed(dir, "planted-new", now, 100);
    expect(() => latestAssuranceByPack({ workspace: dir, agentId: "default", windowStartTs: 0, windowEndTs: now + 1 }))
      .toThrow(/INSUFFICIENT_EVIDENCE: .*planted-new\.json/);
  });

  test("the governor's verified assurance summary counts sealed reports only, and an unverified one reads as missing", async () => {
    const { verifiedGovernorAssuranceSummary } = await import("../src/assurance/assuranceRunner.js");
    const dir = workspace(), now = Date.now();
    writeProvenancedAssuranceReport(dir, { name: "sealed", ts: now - 60_000, packs: [
      { packId: "injection", scenarios: [{ pass: true, score0to100: 20 }], score0to100: 20 }, { packId: "unsafe_tooling", scenarios: [{ pass: true, score0to100: 30 }], score0to100: 30 }] });
    expect(verifiedGovernorAssuranceSummary(dir, "default", 0, now + 1)).toEqual({ packs: {
      injection: { score: 20, succeeded: 0, observed: true }, unsafe_tooling: { score: 30, succeeded: 0, observed: true } } });
    plantUnsealed(dir, "planted", now - 120_000, 100);
    expect(verifiedGovernorAssuranceSummary(dir, "default", 0, now + 1)).toEqual({ packs: {} });
  });

  test("certificate verification recomputes each carried assurance report's hash and checks its seal", async () => {
    const dir = workspace();
    const run = await runDiagnostic({ workspace: dir, window: "14d", targetName: "default", claimMode: "auto" });
    const policyPath = join(dir, "policy.json");
    writeSignedGatePolicy({ workspace: dir, policyPath, policy: { minIntegrityIndex: 0, minOverall: 0,
      minLayer: { "Strategic Agent Operations": 0, "Leadership & Autonomy": 0, "Culture & Alignment": 0, Resilience: 0, Skills: 0 },
      requireObservedForLevel5: false, denyIfLowTrust: false } });
    const certFile = join(dir, "run.amccert");
    await issueCertificate({ workspace: dir, runId: run.runId, policyPath, outFile: certFile });
    expect((await verifyCertificate({ certFile, trust: workspaceKeyTrust(dir) })).errors).toEqual([]);
    // A forged report added to the archive: seal fields present but neither hash nor signature its own.
    const root = realpathSync(mkdtempSync(join(tmpdir(), "amc-cert-forge-")));
    dirs.push(root);
    expect(spawnSync("tar", ["-xzf", certFile, "-C", root]).status).toBe(0);
    mkdirSync(join(root, "assurance"), { recursive: true });
    writeFileSync(join(root, "assurance", "forged.json"), JSON.stringify({ ...report("forged", run.ts, 100), reportJsonSha256: "f".repeat(64), runSealSig: "Zm9yZ2Vk" }));
    // Hash recomputed honestly, seal not the issuer's.
    const body = { ...report("resealed", run.ts, 100), reportJsonSha256: "", runSealSig: "" };
    writeFileSync(join(root, "assurance", "resealed.json"), JSON.stringify({ ...body, reportJsonSha256: sha256Hex(canonicalize(body)), runSealSig: "Zm9yZ2Vk" }));
    const forged = join(root, "..", `${readdirSync(root).length}-forged.amccert`);
    expect(spawnSync("tar", ["-czf", forged, "-C", root, "."]).status).toBe(0);
    dirs.push(forged);
    const verdict = await verifyCertificate({ certFile: forged, trust: workspaceKeyTrust(dir) });
    expect(verdict.ok).toBe(false);
    expect(verdict.errors).toContain("assurance report hash mismatch: forged.json");
    expect(verdict.errors).toContain("assurance report seal signature invalid: resealed.json");
  }, 120_000);
});
