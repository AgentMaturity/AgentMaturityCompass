import { spawnSync } from "node:child_process";
import { verify } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { signIndustryPackAuditJson } from "../src/audit/binderSigner.js";
import { signingRoute } from "../src/crypto/signing/signer.js";
import {
  buildIndustryPackAudit, industryPackAuditClaim, renderIndustryPackAuditMarkdown,
  signIndustryPackAudit, verifyIndustryPackAuditChecksum, verifyIndustryPackAuditSignature,
  type IndustryPackAudit, type IndustryPackAuditVerification,
} from "../src/domains/industryPackAudit.js";
import { getPackById } from "../src/domains/industryPacks.js";
import { canonicalize } from "../src/utils/json.js";
import { sha256Hex } from "../src/utils/hash.js";
import { initWorkspace } from "../src/workspace.js";
import { ed25519KeyId, verifierReportSchema, verdictExitCode, type TrustContext } from "../src/trust/index.js";
import { pinnedTrust, workspaceKeyPem } from "./helpers/trustContext.js";

const NOW = 1_700_000_000_000;
const root = resolve(__dirname, "..");
const allowVariants = [
  { name: "strict", allowUnpinned: false, allowUnanchored: false },
  { name: "allow-unpinned", allowUnpinned: true, allowUnanchored: false },
  { name: "allow-unanchored", allowUnpinned: false, allowUnanchored: true },
  { name: "both allows", allowUnpinned: true, allowUnanchored: true },
] as const;
let fixture: string;
let evidence: string;
let workspace: string;
let otherWorkspace: string;
let auditorPem: string;
let otherPem: string;
let auditorId: string;
let otherId: string;
let trust: TrustContext;
let otherTrust: TrustContext;
let answered: IndustryPackAudit;
let answeredBeforeSigning: string;
let signed: IndustryPackAudit;
let foreign: IndustryPackAudit;
let attackerEnvelope: IndustryPackAudit;
const observations: Array<{ name: string; auditSha256: string; claim: ReturnType<typeof industryPackAuditClaim>;
  verification: IndustryPackAuditVerification }> = [];

function audit(level: number, responses = true): IndustryPackAudit {
  const pack = getPackById("clinical-trials");
  if (!pack) throw new Error("clinical-trials pack is required");
  return buildIndustryPackAudit({ pack, now: NOW,
    responses: responses ? Object.fromEntries(pack.questions.map(question => [question.id, level])) : {} });
}

function rechecksum(value: IndustryPackAudit): void {
  const { receiptHash: _hash, signature: _signature, ...body } = value;
  value.receiptHash = sha256Hex(canonicalize(body));
}

function selfReported(value: IndustryPackAudit): void {
  expect(value.schemaVersion).toBe("amc.industry-pack-audit/5"); // P1-44 bumped /3 to /4 (NOT_EVALUATED controls), P1-42 to /5
  expect(value.overall.claimKind).toBe("self_reported");
  expect(value.overall.eligibleLevel).toBe(1);
  expect(industryPackAuditClaim(value)).toMatchObject({ claimKind: "self_reported", eligibleLevel: 1,
    statusDimensions: { result: "not_evaluated", evidence: "incomplete" } });
  const labels = renderIndustryPackAuditMarkdown(value).split("\n").filter(line => line.startsWith("**Claim:** "));
  expect(labels).toHaveLength(value.controls.length + 1);
  for (const label of labels) expect(label).toContain("**Claim:** Self-reported · **Result:** not evaluated");
}

function check(name: string, value: IndustryPackAudit, context: TrustContext = trust,
  publicKeyPem?: string): IndustryPackAuditVerification {
  selfReported(value);
  const result = verifyIndustryPackAuditSignature(value, { trust: context, publicKeyPem });
  verifierReportSchema.parse(result.report);
  for (const dimension of ["scope", "freshness", "completeness", "satisfaction"] as const)
    expect(result.report[dimension].status).toBe("not-evaluated");
  const bytes = JSON.stringify(value, null, 2) + "\n";
  writeFileSync(join(evidence, `${name}.audit.json`), bytes, { mode: 0o600 });
  observations.push({ name, auditSha256: sha256Hex(bytes), claim: industryPackAuditClaim(value), verification: result });
  return result;
}

function admitted(result: IndustryPackAuditVerification, id: string): void {
  expect(result).toMatchObject({ ok: true, signed: true, checksumOk: true, signatureOk: true,
    keyFingerprint: `sha256:${id}`, errors: [] });
  expect(result.report).toMatchObject({ trusted: true, integrity: { status: "pass", errors: [] }, overrides: [],
    issuerAdmission: { status: "pass", signatures: [{ keyId: id, purpose: "artifact-seal", status: "admitted" }] } });
  expect(verdictExitCode(result.report)).toBe(0);
}

beforeAll(() => {
  expect([22, 24]).toContain(Number(process.versions.node.split(".")[0]));
  fixture = mkdtempSync(join(tmpdir(), "amc-p0-20-audit-signing-"));
  evidence = process.env.AMC_P0_20_SIGNING_EVIDENCE_DIR
    ?? mkdtempSync(join(tmpdir(), "amc-p0-20-signing-evidence-"));
  mkdirSync(evidence, { recursive: true, mode: 0o700 });
  const home = join(fixture, "operator-home");
  mkdirSync(home, { mode: 0o700 });
  vi.stubEnv("HOME", home);
  vi.stubEnv("AMC_HOME", home);
  vi.stubEnv("AMC_VAULT_PASSPHRASE", "p0-20-owned-audit-signing-fixture");
  workspace = join(fixture, "workspace-a");
  otherWorkspace = join(fixture, "workspace-b");
  initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
  initWorkspace({ workspacePath: otherWorkspace, trustBoundaryMode: "isolated" });
  expect(signingRoute(workspace, "BUNDLE")).toBe("vault");
  expect(signingRoute(otherWorkspace, "BUNDLE")).toBe("vault");
  // Record operator pins from newly initialized workspaces BEFORE any audit signature exists.
  auditorPem = workspaceKeyPem(workspace, "auditor");
  otherPem = workspaceKeyPem(otherWorkspace, "auditor");
  auditorId = ed25519KeyId(auditorPem)!;
  otherId = ed25519KeyId(otherPem)!;
  expect(auditorId).toMatch(/^[0-9a-f]{64}$/);
  expect(otherId).not.toBe(auditorId);
  trust = pinnedTrust([{ publicKeyPem: auditorPem, purposes: ["artifact-seal"] }]);
  otherTrust = pinnedTrust([{ publicKeyPem: otherPem, purposes: ["artifact-seal"] }]);
  const inputPaths = ["src/domains/industryPackAudit.ts", "src/audit/binderSigner.ts", "src/org/orgSigner.ts",
    "src/trust/admission.ts", "src/trust/signatureCheck.ts", "tests/helpers/trustContext.ts",
    "tests/industryPackAudit.test.ts", "tests/industryPackAuditSigningQualification.test.ts"];
  writeFileSync(join(evidence, "pins-before-signing.json"), JSON.stringify({ node: process.version,
    executable: process.execPath, capturedAt: new Date().toISOString(),
    auditor: { publicKeyPem: auditorPem, keyId: auditorId, trust },
    otherAuditor: { publicKeyPem: otherPem, keyId: otherId, trust: otherTrust },
    sourceInputs: inputPaths.map(path => ({ path, sha256: sha256Hex(readFileSync(join(root, path))) })) }, null, 2) + "\n", { mode: 0o600 });
  answered = audit(3);
  answeredBeforeSigning = canonicalize(answered);
  signed = signIndustryPackAudit(workspace, answered);
  foreign = signIndustryPackAudit(otherWorkspace, answered);
  const { signature: _previous, ...unsigned } = signed;
  const replacement = signIndustryPackAuditJson(otherWorkspace, unsigned);
  attackerEnvelope = { ...unsigned, signature: { ...replacement, keyFingerprint: `sha256:${otherId}` } };
  writeFileSync(join(evidence, "signed-after-pins.json"), JSON.stringify({ signedAt: new Date().toISOString(),
    signed, foreign, attackerEnvelope }, null, 2) + "\n", { mode: 0o600 });
  console.info(`P0-20 signing evidence: ${evidence}`);
}, 120_000);

afterAll(() => {
  try {
    if (evidence) writeFileSync(join(evidence, "verification-observations.json"), JSON.stringify(observations, null, 2) + "\n", { mode: 0o600 });
    if (fixture) rmSync(fixture, { recursive: true, force: true });
  } finally { vi.unstubAllEnvs(); }
}, 120_000);

describe("P0-20 genuine signed audit and independent issuer admission", () => {
  test("untouched /4 audit verifies under the independently recorded auditor pin", () => {
    admitted(check("untouched", signed), auditorId);
    expect(canonicalize(answered)).toBe(answeredBeforeSigning);
    expect(answered.signature).toBeNull();
    expect(signed.receiptHash).toBe(answered.receiptHash);
    const { signature, ...unsigned } = signed;
    expect(signature?.envelope).toMatchObject({ signer: { type: "VAULT", attestationLevel: "SOFTWARE" } });
    expect(signature?.digestSha256).toBe(sha256Hex(canonicalize(unsigned)));
    expect(verify(null, Buffer.from(signature!.digestSha256, "hex"), auditorPem,
      Buffer.from(signature!.signature, "base64"))).toBe(true);
  });

  test("amc audit binder verify labels a trusted signed audit with its own claim in strict mode", () => {
    const file = join(fixture, "cli-signed-audit.json"), pin = join(fixture, "cli-auditor.pub");
    writeFileSync(file, JSON.stringify(signed)); writeFileSync(pin, auditorPem);
    const home = join(fixture, "cli-home"); mkdirSync(home, { recursive: true });
    const run = spawnSync(process.execPath, [join(root, "dist", "cli.js"), "audit", "binder", "verify", file, "--pubkey", pin, "--json"], {
      cwd: workspace, encoding: "utf8", timeout: 60_000, env: { PATH: process.env.PATH, HOME: home, AMC_HOME: home, NO_COLOR: "1",
        AMC_CLAIM_LABELS_STRICT: "1", AMC_VAULT_PASSPHRASE: "p0-20-owned-audit-signing-fixture", AMC_CONTROL_CHECKPOINT_DIR: join(fixture, "cli-checkpoints") } });
    expect(run.status, run.stderr).toBe(0);
    const body = JSON.parse(run.stdout) as { claimKind?: string; claimLabel?: string };
    expect(body.claimKind).toBe("self_reported"); expect(body.claimLabel).toMatch(/^Claim: Self-reported/);
  });

  test.each([false, true])("an embedded key or explicit PEM is only a locator, explicit PEM=%s", explicit => {
    const result = check(`locator-${explicit}`, signed, pinnedTrust([]), explicit ? auditorPem : undefined);
    expect(result).toMatchObject({ ok: false, checksumOk: true, signatureOk: true });
    expect(result.errors.map(error => error.code)).toEqual(["SIGNER_UNTRUSTED"]);
    expect(result.report.issuerAdmission.signatures[0]).toMatchObject({ keyId: auditorId, status: "not-pinned" });
    expect(verdictExitCode(result.report)).toBe(1);
  });

  test("changing a control to PASS and recomputing its checksum cannot preserve the real signature", () => {
    const tampered = structuredClone(signed);
    expect(tampered.controls[0]!.status).toBe("ADEQUATE");
    tampered.controls[0] = { ...tampered.controls[0]!, level: 5, status: "PASS" };
    rechecksum(tampered);
    expect(verifyIndustryPackAuditChecksum(tampered)).toBe(true);
    expect(tampered.signature).toEqual(signed.signature);
    const result = check("tamper-rechecksum", tampered);
    expect(result).toMatchObject({ ok: false, checksumOk: true, signatureOk: false });
    expect(result.errors.map(error => error.code)).toContain("DIGEST_MISMATCH");
    expect(result.errors.map(error => error.code)).toContain("SIGNATURE_INVALID");
    expect(result.report.integrity.status).toBe("fail");
    expect(verdictExitCode(result.report)).toBe(1);
  });

  test.each(allowVariants)("a genuinely foreign workspace signature remains untrusted: $name", variant => {
    const context = { ...trust, ...variant };
    const result = check(`foreign-${variant.name.replaceAll(" ", "-")}`, foreign, context);
    expect(result).toMatchObject({ ok: false, signed: true, checksumOk: true, signatureOk: true,
      keyFingerprint: `sha256:${otherId}` });
    expect(result.errors.map(error => error.code)).toEqual(["SIGNER_UNTRUSTED"]);
    expect(result.report).toMatchObject({ trusted: false, integrity: { status: "pass", errors: [] } });
    expect(result.report.issuerAdmission.signatures[0]).toMatchObject({ keyId: otherId, purpose: "artifact-seal",
      status: variant.allowUnpinned ? "unpinned-allowed" : "not-pinned" });
    expect(verdictExitCode(result.report)).toBe(variant.allowUnpinned ? 2 : 1);
  });

  test.each(allowVariants)("a real attacker-signed replacement envelope cannot pin itself: $name", variant => {
    const result = check(`attacker-${variant.name.replaceAll(" ", "-")}`, attackerEnvelope, { ...trust, ...variant });
    expect(result).toMatchObject({ ok: false, signed: true, checksumOk: true, signatureOk: true,
      keyFingerprint: `sha256:${otherId}` });
    expect(result.errors.map(error => error.code)).toEqual(["SIGNER_UNTRUSTED"]);
    expect(result.report.trusted).toBe(false);
    expect(result.report.integrity).toEqual({ status: "pass", errors: [] });
    expect(result.report.issuerAdmission.signatures[0]?.status).toBe(variant.allowUnpinned ? "unpinned-allowed" : "not-pinned");
    expect(verdictExitCode(result.report)).toBe(variant.allowUnpinned ? 2 : 1);
  });

  test("foreign and attacker envelopes genuinely verify when their independently captured issuer is admitted", () => {
    admitted(check("foreign-admitted-control", foreign, otherTrust), otherId);
    admitted(check("attacker-admitted-control", attackerEnvelope, otherTrust), otherId);
    expect(attackerEnvelope.signature?.envelope?.sigB64).toBe(attackerEnvelope.signature?.signature);
  });

  test.each(allowVariants)("a checksum-only bundle remains UNSIGNED: $name", variant => {
    const result = check(`unsigned-${variant.name.replaceAll(" ", "-")}`, answered, { ...trust, ...variant });
    expect(result).toMatchObject({ ok: false, signed: false, checksumOk: true, signatureOk: false, keyFingerprint: null });
    expect(result.errors.map(error => error.code)).toEqual(["UNSIGNED"]);
    expect(result.report.trusted).toBe(false);
    expect(result.report.integrity.status).toBe("fail");
    expect(verdictExitCode(result.report)).toBe(1);
    expect(renderIndustryPackAuditMarkdown(answered)).toContain("Checksum only — not signed");
  });

  test("the unanswered baseline is a synthetic example and cannot be signed", () => {
    const baseline = audit(1, false);
    expect(baseline.overall).toMatchObject({ claimKind: "synthetic_example", eligibleLevel: null,
      selfAssessment: { complete: false, answered: 0 } });
    // P1-44: an unanswered control is not evaluated, with no level (it was an L1 default before).
    expect(baseline.controls.every(control => control.level === null && control.status === "NOT_EVALUATED")).toBe(true);
    expect(baseline.signature).toBeNull();
    expect(verifyIndustryPackAuditChecksum(baseline)).toBe(true);
    expect(() => signIndustryPackAudit(workspace, baseline)).toThrow("synthetic_example results cannot be signed");
    expect(baseline.signature).toBeNull();
    writeFileSync(join(evidence, "synthetic-refused.audit.json"), JSON.stringify(baseline, null, 2) + "\n", { mode: 0o600 });
  });

  test("the signer refuses a body that does not match its checksum", () => {
    const changed = structuredClone(answered);
    changed.packName += " changed";
    selfReported(changed);
    expect(verifyIndustryPackAuditChecksum(changed)).toBe(false);
    expect(() => signIndustryPackAudit(workspace, changed)).toThrow("the audit checksum does not match its body");
    expect(changed.signature).toBeNull();
  });

  test.each([3, 5])("real answers at L%s stay self-reported, not evaluated and capped after signing", level => {
    const unsigned = audit(level);
    selfReported(unsigned);
    const value = signIndustryPackAudit(workspace, unsigned);
    selfReported(value);
    admitted(check(`claim-cap-${level}`, value), auditorId);
    expect(value.overall.selfAssessment).toMatchObject({ complete: true, answered: value.controls.length });
  });
});
