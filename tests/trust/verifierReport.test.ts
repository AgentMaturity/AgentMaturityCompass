import { describe, expect, it } from "vitest";
import { amcVersion } from "../../src/version.js";
import { buildVerifierReport, verifierReportSchema, type IssuerAdmission } from "../../src/trust/index.js";
import { context } from "./trustFixtures.js";

const NOW = new Date("2026-10-16T10:04:11.000Z");
const artifact = { kind: "bundle", path: "run-42.amcbundle", sha256: "c".repeat(64) };
const signature = (status: IssuerAdmission["status"]): IssuerAdmission => ({
  signature: "manifest.sig", purpose: "artifact-seal", keyId: "d".repeat(64), status,
  source: status === "admitted" ? "trust-list" : null, listId: status === "admitted" ? "acme-prod" : null, timeBasis: null, detail: null
});
const build = (input: Partial<Parameters<typeof buildVerifierReport>[0]> = {}) => buildVerifierReport({
  artifact, context: context({ asOf: NOW }), integrityErrors: [], signatures: [signature("admitted")],
  anchoring: { status: "not-applicable", detail: null }, verifiedAt: NOW, ...input
});

describe("VerifierReportV1", () => {
  it("trusts only intact artifacts whose every signature is admitted, and leaves P1-06 dimensions not evaluated", () => {
    const report = build();
    expect(report).toEqual({
      type: "amc.verifier-report", version: 1, artifact,
      verifier: { name: "agent-maturity-compass", version: amcVersion },
      verifiedAt: NOW.toISOString(), asOf: NOW.toISOString(),
      integrity: { status: "pass", errors: [] },
      issuerAdmission: { status: "pass", signatures: [signature("admitted")] },
      anchoring: { status: "not-applicable", detail: null },
      scope: { status: "not-evaluated", reasons: [] }, freshness: { status: "not-evaluated", reasons: [] },
      completeness: { status: "not-evaluated", reasons: [] }, satisfaction: { status: "not-evaluated", reasons: [] },
      trusted: true, overrides: [], warnings: []
    });
    expect(verifierReportSchema.parse(report)).toEqual(report);
  });

  it("is untrusted on integrity errors, refused or missing signatures, and unanchored ledgers", () => {
    expect(build({ integrityErrors: ["manifest digest mismatch"] })).toMatchObject({ integrity: { status: "fail" }, trusted: false });
    expect(build({ signatures: [signature("admitted"), signature("not-pinned")] })).toMatchObject({ issuerAdmission: { status: "fail" }, trusted: false });
    expect(build({ signatures: [] })).toMatchObject({ issuerAdmission: { status: "not-evaluated" }, trusted: false });
    expect(build({ anchoring: { status: "unanchored", detail: "monitor key read from the workspace" } }).trusted).toBe(false);
    expect(build({ anchoring: { status: "anchored", detail: "--expect-monitor" } }).trusted).toBe(true);
  });

  it("records allow flags as overrides and never turns them into trust", () => {
    const report = build({ context: context({ asOf: NOW, allowUnpinned: true, allowUnanchored: true }),
      signatures: [signature("unpinned-allowed")], anchoring: { status: "unanchored", detail: null } });
    expect(report).toMatchObject({ overrides: ["allow-unpinned", "allow-unanchored"], trusted: false, integrity: { status: "pass" } });
  });

  it("labels workspace self-trust as a self-check", () => {
    expect(build({ context: context({ mode: "workspace-self", asOf: NOW }) }).warnings.join(" ")).toContain("workspace-self");
  });

  it("parses the documented example and refuses unknown fields", () => {
    const example = { ...build(), trusted: false, issuerAdmission: { status: "fail", signatures: [{ ...signature("not-pinned"),
      detail: "not pinned by --pubkey or any trust list" }] }, anchoring: { status: "anchored", detail: "monitor key pinned by --expect-monitor" } };
    expect(verifierReportSchema.safeParse(example).success).toBe(true);
    expect(verifierReportSchema.safeParse({ ...example, score: 5 }).success).toBe(false);
  });
});
