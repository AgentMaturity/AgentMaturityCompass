import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { request as httpRequest } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { envelopeForStoredRun } from "../src/claims/eligibility/adapters/results.js";
import { claimFields } from "../src/claims/eligibility/render.js";
import { claimKindSchema, statusDimensionsSchema } from "../src/claims/eligibility/index.js";
import { getPublicKeyHistory } from "../src/crypto/keys.js";
import { evaluateDiagnosticEvidenceReadiness } from "../src/diagnostic/evidenceReadiness.js";
import { sealedRunReportVerifies } from "../src/diagnostic/reportSeal.js";
import { getIndustryPackEntitlement } from "../src/domains/industryPackEntitlement.js";
import { getAgentPaths } from "../src/fleet/paths.js";
import { openLedger } from "../src/ledger/ledger.js";
import { getPublicMethodologyManifest } from "../src/methodology/publicMethodology.js";
import { ENTITLEMENT_NOTE } from "../src/studio/studioClaimOutput.js";
import { startStudioApiServer } from "../src/studio/studioServer.js";
import { ensureAgentToken } from "../src/studio/studioState.js";
import type { DiagnosticReport } from "../src/types.js";
import { sha256Hex } from "../src/utils/hash.js";
import { canonicalize } from "../src/utils/json.js";
import { lockVault } from "../src/vault/vault.js";
import { initWorkspace } from "../src/workspace.js";
import { testIndustryPackLicence, type TestIndustryPackLicence } from "./helpers/industryPackLicence.js";

const ADMIN = "p0-23-owned-studio-claim-admin";
const roots: string[] = [];
const licences: TestIndustryPackLicence[] = [];
const servers: Array<Awaited<ReturnType<typeof startStudioApiServer>>> = [];

beforeEach(() => {
  expect([22, 24], "Studio claim fixtures require a qualified Node major").toContain(Number(process.versions.node.split(".")[0]));
  vi.stubEnv("AMC_VAULT_PASSPHRASE", "p0-23-owned-studio-claim-passphrase");
  vi.stubEnv("AMC_VAULT_PASSPHRASE_FILE", undefined);
  vi.stubEnv("AMC_A4_PREVIEW", undefined);
  for (const prefix of ["AMC_INDUSTRY_PACKS", "AMC_DOMAIN_PACKS"]) {
    for (const suffix of ["LICENSE_KEY", "LICENSE_PUBLIC_KEY", "LICENSE_PRIVATE_KEY", "LICENSE_SECRET", "ACTIVE", "CHECKOUT_URL", "VERIFY_URL"]) {
      vi.stubEnv(`${prefix}_${suffix}`, undefined);
    }
  }
  for (const key of ["OPENAI_API_KEY", "ANTHROPIC_API_KEY", "GOOGLE_API_KEY", "GEMINI_API_KEY", "AZURE_OPENAI_API_KEY"]) {
    vi.stubEnv(key, undefined);
  }
});

afterEach(async () => {
  const errors: unknown[] = [];
  for (const server of servers.splice(0).reverse()) {
    try { await server.close(); } catch (error) { errors.push(error); }
  }
  for (const workspace of roots.splice(0)) {
    try {
      lockVault(workspace);
      rmSync(workspace, { recursive: true, force: true });
    } catch (error) { errors.push(error); }
  }
  for (const licence of licences.splice(0)) licence.cleanup();
  vi.unstubAllEnvs();
  if (errors.length > 0) throw new AggregateError(errors, "Studio claim fixture cleanup failed");
});

function captureEvidence(name: string, value: unknown): void {
  if (!process.env.P023_STUDIO_CLAIM_EVIDENCE_DIR) return;
  mkdirSync(process.env.P023_STUDIO_CLAIM_EVIDENCE_DIR, { recursive: true });
  writeFileSync(join(process.env.P023_STUDIO_CLAIM_EVIDENCE_DIR, `${name}.json`), `${JSON.stringify(value, null, 2)}\n`);
}

async function studioFixture() {
  const workspace = realpathSync(mkdtempSync(join(tmpdir(), "amc-p0-23-studio-claims-")));
  roots.push(workspace);
  initWorkspace({ workspacePath: workspace, agentId: "default", trustBoundaryMode: "isolated" });
  const server = await startStudioApiServer({ workspace, host: "127.0.0.1", port: 0, token: ADMIN });
  servers.push(server);
  expect(new URL(server.url).hostname).toBe("127.0.0.1");
  return { workspace, server };
}
type Fixture = Awaited<ReturnType<typeof studioFixture>>;
interface Response { status: number; contentType: string; body: string; json: Record<string, any> }

// Actual HTTP is restricted to this fixture's loopback origin; there is no external transport.
function get(fixture: Fixture, path: string, evidenceName: string, token: string | null = ADMIN, agentToken?: string): Promise<Response> {
  const target = new URL(path, fixture.server.url);
  expect(target.origin).toBe(fixture.server.url);
  expect(target.hostname).toBe("127.0.0.1");
  return new Promise((resolve, reject) => {
    const req = httpRequest(target, {
      method: "GET", headers: { Connection: "close", ...(token === null ? {} : { "x-amc-admin-token": token }),
        ...(agentToken === undefined ? {} : { "x-amc-agent-token": agentToken }) },
    }, response => {
      const chunks: Buffer[] = [];
      response.on("data", chunk => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
      response.on("error", reject);
      response.on("end", () => {
        try {
          const body = Buffer.concat(chunks).toString("utf8");
          const result = { status: response.statusCode ?? 0, contentType: String(response.headers["content-type"] ?? ""),
            body, json: JSON.parse(body) as Response["json"] };
          captureEvidence(evidenceName, { method: "GET", path,
            credentialType: agentToken !== undefined ? "agent" : token === null ? "none" : "admin", ...result });
          resolve(result);
        } catch (error) { reject(error); }
      });
    });
    req.setTimeout(10_000, () => req.destroy(new Error("Studio claim loopback request timed out")));
    req.on("error", reject);
    req.end();
  });
}

function storeRun(workspace: string, params: { runId: string; version: string; seal: boolean; storedReadiness: boolean }): DiagnosticReport {
  const now = Date.now();
  const report: DiagnosticReport = {
    agentId: "default", runId: params.runId, ts: now, windowStartTs: now - 60_000, windowEndTs: now,
    status: "VALID", verificationPassed: true, trustBoundaryViolated: false, trustBoundaryMessage: null,
    integrityIndex: 0.92, trustLabel: "HIGH TRUST", targetProfileId: null,
    layerScores: [{ layerName: "Resilience", avgFinalLevel: 4, confidenceWeightedFinalLevel: 4 }],
    questionScores: [], inflationAttempts: [], unsupportedClaimCount: 0, contradictionCount: 0,
    correlationRatio: 1, invalidReceiptsCount: 0, correlationWarnings: [], evidenceCoverage: 1,
    evidenceTrustCoverage: { observed: 1, attested: 0, selfReported: 0 },
    targetDiff: [], prioritizedUpgradeActions: [], evidenceToCollectNext: [],
    methodology: { ...getPublicMethodologyManifest(), amcVersion: params.version },
    runSealSig: "", reportJsonSha256: "",
  };
  // Current diagnostic writers store this before signing; historical reports may omit it.
  if (params.storedReadiness) report.evidenceReadiness = evaluateDiagnosticEvidenceReadiness(report);
  if (params.seal) {
    report.reportJsonSha256 = sha256Hex(canonicalize(report));
    const ledger = openLedger(workspace);
    try { report.runSealSig = ledger.signRunHash(report.reportJsonSha256); }
    finally { ledger.close(); }
  }
  const file = join(getAgentPaths(workspace, report.agentId).runsDir, `${report.runId}.json`);
  mkdirSync(getAgentPaths(workspace, report.agentId).runsDir, { recursive: true });
  writeFileSync(file, JSON.stringify(report), "utf8");
  const stored = JSON.parse(readFileSync(file, "utf8")) as DiagnosticReport;
  expect(sealedRunReportVerifies(workspace, stored as unknown as Record<string, unknown>)).toBe(params.seal);
  captureEvidence(`${params.runId}-stored`, { report: stored, auditorPublicKeyHistory: getPublicKeyHistory(workspace, "auditor"), sealVerified: params.seal });
  return stored;
}

function requireReport(response: Response, report: DiagnosticReport): void {
  expect(response.status, response.body).toBe(200);
  expect(response.contentType).toContain("application/json");
  const { claimKind: _, statusDimensions: __, claimLabel: ___, evidenceReadiness, ...returned } = response.json;
  const { evidenceReadiness: storedReadiness, ...stored } = report;
  expect(returned).toEqual(stored);
  expect(evidenceReadiness).toEqual(evaluateDiagnosticEvidenceReadiness(report));
  if (storedReadiness) expect(evidenceReadiness).toEqual(storedReadiness);
  expect(response.json).not.toHaveProperty("error");
  expect(claimKindSchema.safeParse(response.json.claimKind).success).toBe(true);
  expect(statusDimensionsSchema.safeParse(response.json.statusDimensions).success).toBe(true);
}

function requireError(response: Response): void {
  expect(response.contentType).toContain("application/json");
  expect(response.json.error).toBeTypeOf("string");
  for (const key of ["claimKind", "statusDimensions", "claimLabel", "runId", "runSealSig"]) expect(response.json).not.toHaveProperty(key);
}

/** A licence signed by a key pinned in a temp AMC home trust list (P1-51), the only key a licence gate accepts. */
function signedEntitlement(workspace: string): void {
  const licence = testIndustryPackLicence();
  licences.push(licence);
  for (const [key, value] of Object.entries(licence.env)) vi.stubEnv(key, value);
  expect(getIndustryPackEntitlement(workspace)).toMatchObject({ active: true, source: "env" });
}

describe("Studio claims over actual authenticated loopback HTTP (P0-23)", () => {
  test("a sealed legacy run retains the canonical legacy claim after Studio report decoration", async () => {
    const fixture = await studioFixture();
    const report = storeRun(fixture.workspace, { runId: "studio-legacy-1-1-1", version: "1.1.1", seal: true, storedReadiness: false });
    const expected = claimFields(envelopeForStoredRun(report, { sealVerified: true, now: Date.now() }));
    expect(expected.claimKind).toBe("self_reported");
    expect(expected.statusDimensions.result).toBe("not_evaluated");
    expect(expected.claimLabel).toMatch(/^Claim: Legacy \(1\.x\), self-reported/);
    const response = await get(fixture, `/runs/${report.runId}/report`, report.runId);
    requireReport(response, report);
    expect(response.json).toMatchObject(expected);
  });

  test("a current sealed run with stored readiness retains its observed claim", async () => {
    const fixture = await studioFixture();
    const report = storeRun(fixture.workspace, { runId: "studio-current-sealed", version: "1.2.0", seal: true, storedReadiness: true });
    const expected = claimFields(envelopeForStoredRun(report, { sealVerified: true, now: Date.now() }));
    expect(expected.claimKind).toBe("observed");
    expect(expected.statusDimensions.result).toBe("pass");
    const response = await get(fixture, `/runs/${report.runId}/report`, report.runId);
    requireReport(response, report);
    expect(response.json).toMatchObject(expected);
  });

  test("a legacy version cannot become observed even when its stored readiness also verifies", async () => {
    const fixture = await studioFixture();
    const report = storeRun(fixture.workspace, { runId: "studio-legacy-with-readiness", version: "1.1.1", seal: true, storedReadiness: true });
    const expected = claimFields(envelopeForStoredRun(report, { sealVerified: true, now: Date.now() }));
    expect(expected.claimKind).toBe("self_reported");
    expect(expected.statusDimensions.result).toBe("not_evaluated");
    expect(expected.claimLabel).toMatch(/^Claim: Legacy \(1\.x\), self-reported/);
    const response = await get(fixture, `/runs/${report.runId}/report`, report.runId);
    requireReport(response, report);
    expect(response.json).toMatchObject(expected);
  });

  test("adding display readiness does not invalidate a current report's valid stored seal", async () => {
    const fixture = await studioFixture();
    const report = storeRun(fixture.workspace, { runId: "studio-current-no-readiness", version: "1.2.0", seal: true, storedReadiness: false });
    const expected = claimFields(envelopeForStoredRun(report, { sealVerified: true, now: Date.now() }));
    expect(expected.claimKind).toBe("observed");
    expect(expected.statusDimensions.result).toBe("pass");
    const response = await get(fixture, `/runs/${report.runId}/report`, report.runId);
    requireReport(response, report);
    expect(response.json).toMatchObject(expected);
  });

  test("an unsealed current report cannot promote its own observed metadata", async () => {
    const fixture = await studioFixture();
    const report = storeRun(fixture.workspace, { runId: "studio-current-unsealed", version: "1.2.0", seal: false, storedReadiness: true });
    const response = await get(fixture, `/runs/${report.runId}/report`, report.runId);
    requireReport(response, report);
    expect(response.json.claimKind).toBe("self_reported");
    expect(response.json.statusDimensions.result).toBe("not_evaluated");
    expect(response.json.claimLabel).toMatch(/^Claim: Self-reported/);
  });

  test("a tampered current report cannot inherit its prior valid seal", async () => {
    const fixture = await studioFixture();
    const report = storeRun(fixture.workspace, { runId: "studio-current-tampered", version: "1.2.0", seal: true, storedReadiness: true });
    report.integrityIndex = 0.95;
    writeFileSync(join(getAgentPaths(fixture.workspace, report.agentId).runsDir, `${report.runId}.json`), JSON.stringify(report));
    expect(sealedRunReportVerifies(fixture.workspace, report as unknown as Record<string, unknown>)).toBe(false);
    const response = await get(fixture, `/runs/${report.runId}/report`, report.runId);
    requireReport(response, report);
    expect(response.json.claimKind).toBe("self_reported");
    expect(response.json.statusDimensions.result).toBe("not_evaluated");
    expect(response.json.claimLabel).toMatch(/^Claim: Self-reported/);
  });

  test.each([null, "invalid-owned-studio-token"])("refuses report access with admin credential %s", async token => {
    const fixture = await studioFixture();
    const report = storeRun(fixture.workspace, { runId: "studio-auth-control", version: "1.2.0", seal: true, storedReadiness: true });
    const response = await get(fixture, `/runs/${report.runId}/report`, token === null ? "studio-auth-missing" : "studio-auth-invalid", token);
    requireError(response);
    expect(response.status).toBe(401);
    expect(response.json).toEqual({ error: "missing or invalid token" });
  });

  test("a missing stored run returns 404 without a fabricated result claim", async () => {
    const fixture = await studioFixture();
    const response = await get(fixture, "/runs/studio-missing-run/report", "studio-missing-run");
    requireError(response);
    expect(response.status, response.body).toBe(404);
  });

  test("malformed stored JSON keeps its sanitized 400 instead of becoming a missing run", async () => {
    const fixture = await studioFixture();
    const report = storeRun(fixture.workspace, { runId: "studio-malformed-run", version: "1.2.0", seal: true, storedReadiness: true });
    writeFileSync(join(getAgentPaths(fixture.workspace, report.agentId).runsDir, `${report.runId}.json`), "{invalid JSON");
    const response = await get(fixture, `/runs/${report.runId}/report`, report.runId);
    requireError(response);
    expect(response.status).toBe(400);
    expect(response.json).toEqual({ error: "invalid JSON body" });
  });

  test.each(["default", "p023-other-agent"])("preserves stored-report scope for a real %s bearer token", async agentId => {
    const fixture = await studioFixture();
    const report = storeRun(fixture.workspace, { runId: "studio-agent-scope", version: "1.2.0", seal: true, storedReadiness: true });
    const token = ensureAgentToken(fixture.workspace, agentId).token;
    const response = await get(fixture, `/runs/${report.runId}/report`, `studio-scope-${agentId}`, null, token);
    if (agentId === report.agentId) {
      requireReport(response, report);
    } else {
      requireError(response);
      expect(response.status).toBe(403);
      expect(response.json).toEqual({ error: "scope does not include this agent" });
    }
  });

  test.each(["../studio-private-run", "..\\studio-private-run", "\u0000studio-private-run"])(
    "refuses a decoded run ID outside the exact file-name contract: %j", async runId => {
      const fixture = await studioFixture();
      const report = storeRun(fixture.workspace, { runId: "studio-contained-run", version: "1.2.0", seal: true, storedReadiness: true });
      const privateFile = join(getAgentPaths(fixture.workspace, report.agentId).rootDir, "studio-private-run.json");
      const original = JSON.stringify(report);
      writeFileSync(privateFile, original);
      const response = await get(fixture, `/runs/${encodeURIComponent(runId)}/report`, `studio-invalid-id-${encodeURIComponent(runId)}`);
      requireError(response);
      expect(response.status).toBe(400);
      expect(response.json).toEqual({ error: "invalid run id" });
      expect(readFileSync(privateFile, "utf8")).toBe(original);
    }
  );

  test("an unknown authenticated Studio route keeps its 404 error contract", async () => {
    const response = await get(await studioFixture(), "/p0-23-unknown-owned-route", "studio-unknown-route");
    requireError(response);
    expect(response.status).toBe(404);
    expect(response.json).toEqual({ error: "not found" });
  });

  test("paid catalog access changes content availability without changing any pack claim or truth-rule note", async () => {
    const fixture = await studioFixture();
    expect(getIndustryPackEntitlement(fixture.workspace).active).toBe(false);
    const unpaid = await get(fixture, "/industry-packs/list", "studio-catalog-unpaid");
    expect(unpaid.status, unpaid.body).toBe(200);
    expect(unpaid.json.entitlement.active).toBe(false);
    expect(unpaid.json.entitlementNote).toBe(ENTITLEMENT_NOTE);
    expect(ENTITLEMENT_NOTE).toBe("Payment unlocks access to pack content; it never changes a result, a trust tier or a verification outcome.");
    expect(unpaid.json.packs.length).toBeGreaterThan(0);
    const packId = unpaid.json.packs[0].packId;
    const refused = await get(fixture, `/industry-packs/${encodeURIComponent(packId)}`, "studio-pack-unpaid-refusal");
    requireError(refused);
    expect(refused.status).toBe(402);
    expect(refused.json).toMatchObject({ error: "industry_packs_locked", entitlement: { active: false }, entitlementNote: ENTITLEMENT_NOTE });
    signedEntitlement(fixture.workspace);
    const paid = await get(fixture, "/industry-packs/list", "studio-catalog-paid");
    expect(paid.status, paid.body).toBe(200);
    expect(paid.json.entitlement.active).toBe(true);
    expect(paid.json.entitlementNote).toBe(ENTITLEMENT_NOTE);
    expect(paid.json.packs.map((pack: { packId: string }) => pack.packId)).toEqual(unpaid.json.packs.map((pack: { packId: string }) => pack.packId));
    for (let i = 0; i < unpaid.json.packs.length; i += 1) {
      const before = unpaid.json.packs[i], after = paid.json.packs[i];
      expect(before.locked).toBe(true);
      expect(after.locked).toBe(false);
      expect(before.claim.claimKind).toBe("self_reported");
      expect(before.claim.statusDimensions.result).toBe("not_evaluated");
      expect(before.claim.claimLabel).toMatch(/^Claim: Self-reported/);
      expect(claimKindSchema.safeParse(before.claim.claimKind).success).toBe(true);
      expect(statusDimensionsSchema.safeParse(before.claim.statusDimensions).success).toBe(true);
      expect(after.claim).toEqual(before.claim);
    }
    const content = await get(fixture, `/industry-packs/${encodeURIComponent(packId)}`, "studio-pack-paid");
    expect(content.status, content.body).toBe(200);
    expect(content.json.pack.id).toBe(packId);
    expect(content.json.entitlement.active).toBe(true);
    expect(content.json.entitlementNote).toBe(ENTITLEMENT_NOTE);
    expect(content.json.claimKind).toBe("self_reported");
    expect(content.json.statusDimensions.result).toBe("not_evaluated");
    expect(content.json.claimLabel).toMatch(/^Claim: Self-reported/);
  });

  test.each(["__proto__", "constructor", "toString", "hasOwnProperty"])("a genuine signed entitlement still refuses inherited pack ID %s", async packId => {
    const fixture = await studioFixture();
    signedEntitlement(fixture.workspace);
    const response = await get(fixture, `/industry-packs/${encodeURIComponent(packId)}`, `studio-pack-inherited-${packId}`);
    requireError(response);
    expect(response.status).toBe(404);
    expect(response.json).toEqual({ error: "industry pack not found" });
  });
});
