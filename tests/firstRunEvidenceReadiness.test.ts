import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { evaluateDiagnosticEvidenceReadiness } from "../src/diagnostic/evidenceReadiness.js";

const workspaces: string[] = [];

function workspace(): string {
  const dir = mkdtempSync(join(tmpdir(), "amc-first-run-readiness-"));
  workspaces.push(dir);
  return dir;
}

function readinessInput(overrides: Record<string, unknown> = {}) {
  return {
    status: "VALID" as const,
    verificationPassed: true,
    trustBoundaryViolated: false,
    trustBoundaryMessage: null,
    integrityIndex: 0.9,
    trustLabel: "HIGH TRUST" as const,
    evidenceCoverage: 0.8,
    evidenceTrustCoverage: { observed: 0.8, attested: 0.2, selfReported: 0 },
    ...overrides
  };
}

afterEach(() => {
  while (workspaces.length > 0) {
    const dir = workspaces.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

describe("diagnostic evidence readiness", () => {
  test("separates artifact integrity from claim readiness", () => {
    const empty = evaluateDiagnosticEvidenceReadiness(readinessInput({
      integrityIndex: 0,
      trustLabel: "UNRELIABLE — DO NOT USE FOR CLAIMS",
      evidenceCoverage: 0,
      evidenceTrustCoverage: { observed: 0, attested: 0, selfReported: 0 }
    }));
    expect(empty.status).toBe("INSUFFICIENT_EVIDENCE");
    expect(empty.claimEligible).toBe(false);
    expect(empty.reasonCodes).toContain("NO_ACCEPTED_EVIDENCE");
    expect(empty.claimBoundary).toContain("Signing proves integrity, not evidence sufficiency");

    const limited = evaluateDiagnosticEvidenceReadiness(readinessInput({
      integrityIndex: 0.52,
      trustLabel: "LOW TRUST",
      evidenceCoverage: 0.52
    }));
    expect(limited.status).toBe("LIMITED");
    expect(limited.claimEligible).toBe(false);

    const ready = evaluateDiagnosticEvidenceReadiness(readinessInput());
    expect(ready.status).toBe("READY");
    expect(ready.claimEligible).toBe(true);

    const unsigned = evaluateDiagnosticEvidenceReadiness(readinessInput({
      status: "UNSIGNED",
      verificationPassed: false
    }));
    expect(unsigned.status).toBe("UNVERIFIED");
    expect(unsigned.claimEligible).toBe(false);
    expect(unsigned.reasonCodes).toContain("ARTIFACT_UNSIGNED");

    const malformed = evaluateDiagnosticEvidenceReadiness(readinessInput({ integrityIndex: Number.NaN }));
    expect(malformed.status).toBe("UNVERIFIED");
    expect(malformed.reasonCodes).toContain("MISSING_EVIDENCE_METADATA");
  });

  test("bare amc fails closed on claim readiness in a clean workspace", () => {
    const dir = workspace();
    const env = { ...process.env, NO_COLOR: "1" };
    delete env.AMC_VAULT_PASSPHRASE;
    delete env.AMC_VAULT_PASSPHRASE_FILE;
    delete env.AMC_NO_SIGN;

    const result = spawnSync(process.execPath, [resolve(process.cwd(), "dist/cli.js"), "--json"], {
      cwd: dir,
      env,
      encoding: "utf8",
      timeout: 120_000
    });

    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    const output = JSON.parse(result.stdout) as {
      status: string;
      artifactStatus: string;
      evidenceStatus: string;
      artifactVerificationPassed: boolean;
      claimEligible: boolean;
      signed: boolean;
      firstResultSla: { met: boolean };
      reportJsonPath: string;
      reportMarkdownPath: string;
      lifecycleArtifactPath: string;
    };
    expect(output.status).toBe("VALID");
    expect(output.artifactStatus).toBe("VALID");
    expect(output.evidenceStatus).toBe("INSUFFICIENT_EVIDENCE");
    expect(output.artifactVerificationPassed).toBe(true);
    expect(output.claimEligible).toBe(false);
    expect(output.signed).toBe(true);
    expect(output.firstResultSla.met).toBe(true);

    const report = JSON.parse(readFileSync(output.reportJsonPath, "utf8")) as {
      status: string;
      evidenceReadiness?: { status: string; claimEligible: boolean };
    };
    expect(report.status).toBe("VALID");
    expect(report.evidenceReadiness).toMatchObject({
      status: "INSUFFICIENT_EVIDENCE",
      claimEligible: false
    });

    const lifecycle = JSON.parse(readFileSync(output.lifecycleArtifactPath, "utf8")) as {
      surfaces: { Score: { status: string; summary: string } };
      evidence: { diagnosticReport: { artifactStatus: string; evidenceStatus: string; claimEligible: boolean } };
    };
    expect(lifecycle.surfaces.Score.status).toBe("partial");
    expect(lifecycle.surfaces.Score.summary).toContain("not claim-ready");
    expect(lifecycle.evidence.diagnosticReport).toMatchObject({
      artifactStatus: "VALID",
      evidenceStatus: "INSUFFICIENT_EVIDENCE",
      claimEligible: false
    });

    const markdown = readFileSync(output.reportMarkdownPath, "utf8");
    expect(markdown).toContain("Artifact Status: **VALID**");
    expect(markdown).toContain("Evidence Readiness: **INSUFFICIENT_EVIDENCE**");
    expect(markdown).toContain("Claim Eligible: **NO**");
    expect(markdown).toContain("Signing proves integrity, not evidence sufficiency");

    const htmlPath = join(dir, "first-report.html");
    const htmlResult = spawnSync(process.execPath, [
      resolve(process.cwd(), "dist/cli.js"),
      "report",
      "latest",
      "--html",
      htmlPath
    ], {
      cwd: dir,
      env,
      encoding: "utf8",
      timeout: 120_000
    });
    expect(htmlResult.status, `${htmlResult.stdout}\n${htmlResult.stderr}`).toBe(0);
    const html = readFileSync(htmlPath, "utf8");
    expect(html).toContain('amc<span class="cursor">_</span> / report');
    expect(html).toContain("Evidence Readiness:</strong> INSUFFICIENT_EVIDENCE");
    expect(html).toContain("Claim Eligible:</strong> NO");
    expect(html).toContain("/5 weighted");
    expect(html).not.toContain("% weighted");

    const onboarding = JSON.parse(readFileSync(join(dir, ".amc", "onboarding", "state.json"), "utf8")) as {
      status: string;
      refs: { runId: string | null };
    };
    expect(onboarding.status).toBe("complete");
    expect(onboarding.refs.runId).toBeTruthy();
  });
});
