import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import YAML from "yaml";
import { resolveApiRolePolicy } from "../src/api/accessPolicy.js";
import { handleApiRoute, matchApiRoute } from "../src/api/index.js";
import { API_RESULT_ROUTES } from "../src/api/resultRouteRegistry.js";
import { envelopeForStoredRun } from "../src/claims/eligibility/adapters/results.js";
import { claimFields, type ClaimFields } from "../src/claims/eligibility/render.js";
import { evaluateDiagnosticEvidenceReadiness } from "../src/diagnostic/evidenceReadiness.js";
import { sealedRunReportVerifies } from "../src/diagnostic/reportSeal.js";
import { getAgentPaths } from "../src/fleet/paths.js";
import { openLedger } from "../src/ledger/ledger.js";
import { getPublicMethodologyManifest } from "../src/methodology/publicMethodology.js";
import { generateFullOpenApiSpec } from "../src/studio/openapi.js";
import type { DiagnosticReport } from "../src/types.js";
import { sha256Hex } from "../src/utils/hash.js";
import { canonicalize } from "../src/utils/json.js";
import { lockVault } from "../src/vault/vault.js";
import { initWorkspace } from "../src/workspace.js";

const roots: string[] = [];
const claimRef = "#/components/schemas/ClaimResult";
const normalizePath = (path: string): string => path.replace(/^\/api(?=\/v1\/)/, "").replace(/:\w+|\{[^}]+\}/g, "{}");

type OpenApiSpec = ReturnType<typeof generateFullOpenApiSpec>;

function localReference(spec: OpenApiSpec, ref: string): unknown {
  if (!ref.startsWith("#/")) throw new Error(`Non-local OpenAPI reference cannot be resolved without transport: ${ref}`);
  const target = ref.slice(2).split("/").reduce<unknown>((node, part) => {
    const key = part.replace(/~1/g, "/").replace(/~0/g, "~");
    return node !== null && typeof node === "object" && Object.hasOwn(node, key)
      ? (node as Record<string, unknown>)[key] : undefined;
  }, spec);
  if (target === undefined) throw new Error(`Unresolved local OpenAPI reference: ${ref}`);
  return target;
}

// Compare actual schema references, including local reference chains, never descriptions.
function referencesClaimResult(value: unknown, spec: OpenApiSpec, seen = new Set<string>()): boolean {
  if (value === null || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some((item) => referencesClaimResult(item, spec, seen));
  const object = value as Record<string, unknown>;
  if (object.$ref === claimRef) return true;
  if (typeof object.$ref === "string" && !seen.has(object.$ref)) {
    const next = new Set(seen).add(object.$ref);
    if (referencesClaimResult(localReference(spec, object.$ref), spec, next)) return true;
  }
  return Object.values(object).some((item) => referencesClaimResult(item, spec, seen));
}

function captureEvidence(name: string, value: unknown): void {
  if (!process.env.P023_API_CLAIM_EVIDENCE_DIR) return;
  mkdirSync(process.env.P023_API_CLAIM_EVIDENCE_DIR, { recursive: true });
  writeFileSync(join(process.env.P023_API_CLAIM_EVIDENCE_DIR, `${name}.json`), `${JSON.stringify(value, null, 2)}\n`);
}

function resultOperationViolations(spec: OpenApiSpec, evidenceName: string): string[] {
  const violations: string[] = [];
  const accounting: Array<{ method: string; path: string; matchingPaths: string[]; operationCount: number; successes: unknown[] }> = [];
  const registryKeys = API_RESULT_ROUTES.map((route) => `${route.method} ${normalizePath(route.path)}`);
  expect(new Set(registryKeys).size).toBe(registryKeys.length);
  for (const route of API_RESULT_ROUTES) {
    const label = `${route.method} ${route.path}`;
    const keys = Object.keys(spec.paths).filter((path) => normalizePath(path) === normalizePath(route.path));
    const operations = keys.map((key) => (spec.paths[key] as Record<string, any>)[route.method.toLowerCase()]).filter(Boolean);
    if (operations.length !== 1) {
      violations.push(`${label}: expected exactly one operation, found ${operations.length}`);
    }
    const successes: Array<{ status: string; mediaTypes: string[]; claimReference: boolean; error?: string }> = [];
    if (operations.length === 1) {
      const responses = Object.entries(operations[0].responses ?? {}).filter(([status]) => /^2\d\d$/.test(status));
      if (responses.length === 0) violations.push(`${label}: no declared successful response`);
      for (const [status, original] of responses) {
        try {
          let response = original as Record<string, unknown>;
          const seen = new Set<string>();
          while (typeof response.$ref === "string") {
            if (seen.has(response.$ref)) throw new Error(`Circular response reference: ${response.$ref}`);
            seen.add(response.$ref);
            response = localReference(spec, response.$ref) as Record<string, unknown>;
          }
          const content = (response.content ?? {}) as Record<string, { schema?: unknown }>;
          const claimReference = Object.values(content).some((media) => referencesClaimResult(media.schema, spec));
          successes.push({ status, mediaTypes: Object.keys(content), claimReference });
          if (!claimReference) violations.push(`${label}: ${status} response schemas lack ${claimRef}`);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          successes.push({ status, mediaTypes: [], claimReference: false, error: message });
          violations.push(`${label}: ${status} ${message}`);
        }
      }
    }
    accounting.push({ method: route.method, path: route.path, matchingPaths: keys, operationCount: operations.length, successes });
  }
  captureEvidence(evidenceName, { registryCount: API_RESULT_ROUTES.length, violations, accounting });
  return violations;
}

function requireClaimComponents(spec: ReturnType<typeof generateFullOpenApiSpec>): void {
  expect(spec.components.schemas.ClaimResult).toMatchObject({
    required: ["claimKind", "statusDimensions", "claimLabel"],
    properties: {
      claimKind: { $ref: "#/components/schemas/ClaimKind" },
      statusDimensions: { $ref: "#/components/schemas/StatusDimensions" },
      claimLabel: { type: "string" },
    },
  });
  expect(spec.components.schemas).toHaveProperty("ClaimKind");
  expect(spec.components.schemas).toHaveProperty("StatusDimensions");
}

beforeEach(() => {
  expect([22, 24], "API claim fixtures require a qualified Node major").toContain(Number(process.versions.node.split(".")[0]));
  vi.stubEnv("AMC_VAULT_PASSPHRASE", "p0-23-owned-api-claims-passphrase");
  vi.stubEnv("AMC_VAULT_PASSPHRASE_FILE", undefined);
});

afterEach(() => {
  try {
    for (const workspace of roots.splice(0)) {
      lockVault(workspace);
      rmSync(workspace, { recursive: true, force: true });
    }
  } finally {
    vi.unstubAllEnvs();
  }
});

function workspaceFixture(): string {
  const workspace = mkdtempSync(join(tmpdir(), "amc-p0-23-api-claims-"));
  roots.push(workspace);
  initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
  return workspace;
}

// Historic report input deliberately carries observed metadata. Its valid seal proves bytes,
// not that AMC 1.1.1 evaluated the claims; the stored-run rule must still apply.
function storeRun(workspace: string, version: string, runId: string, sealed: boolean): DiagnosticReport {
  const now = Date.now();
  const report: DiagnosticReport = {
    agentId: "default", runId, ts: now, windowStartTs: now - 60_000, windowEndTs: now,
    status: "VALID", verificationPassed: true, trustBoundaryViolated: false, trustBoundaryMessage: null,
    integrityIndex: 0.92, trustLabel: "HIGH TRUST", targetProfileId: null,
    layerScores: [{ layerName: "Resilience", avgFinalLevel: 4, confidenceWeightedFinalLevel: 4 }],
    questionScores: [], inflationAttempts: [], unsupportedClaimCount: 0, contradictionCount: 0,
    correlationRatio: 1, invalidReceiptsCount: 0, correlationWarnings: [], evidenceCoverage: 1,
    evidenceTrustCoverage: { observed: 1, attested: 0, selfReported: 0 },
    targetDiff: [], prioritizedUpgradeActions: [], evidenceToCollectNext: [],
    methodology: { ...getPublicMethodologyManifest(), amcVersion: version },
    runSealSig: "", reportJsonSha256: "",
  };
  if (sealed) {
    report.reportJsonSha256 = sha256Hex(canonicalize(report));
    const ledger = openLedger(workspace);
    try { report.runSealSig = ledger.signRunHash(report.reportJsonSha256); }
    finally { ledger.close(); }
  }
  const file = join(getAgentPaths(workspace, report.agentId).runsDir, `${report.runId}.json`);
  mkdirSync(getAgentPaths(workspace, report.agentId).runsDir, { recursive: true });
  writeFileSync(file, JSON.stringify(report), "utf8");
  return JSON.parse(readFileSync(file, "utf8")) as DiagnosticReport;
}

interface CapturedResponse {
  handled: boolean;
  status: number;
  headers: Record<string, string>;
  body: string;
  json: { ok: boolean; data?: DiagnosticReport; error?: string } & Partial<ClaimFields>;
}

// Only HTTP I/O is captured, as in apiLifecycleEvidence.test.ts. The dispatcher, report
// loader, signature verifier and claim producers are real. Studio authentication is upstream.
async function readRun(workspace: string, runId: string): Promise<CapturedResponse> {
  const pathname = `/api/v1/score/run/${runId}`;
  const req = Readable.from([]) as unknown as IncomingMessage;
  req.method = "GET";
  req.url = pathname;
  const state = { status: 0, headers: {} as Record<string, string>, body: "" };
  const res = {
    writeHead(status: number, headers?: Record<string, string>) {
      state.status = status;
      state.headers = headers ?? {};
      return res;
    },
    end(chunk?: string | Buffer) { if (chunk !== undefined) state.body += chunk.toString(); },
  } as unknown as ServerResponse;
  const handled = await handleApiRoute(pathname, "GET", req, res, workspace);
  const response = { handled, ...state, json: JSON.parse(state.body) as CapturedResponse["json"] };
  // Optional diagnostic evidence is exact serialized output, without changing dispatcher behavior.
  captureEvidence(runId, response);
  return response;
}

function requireSuccess(response: CapturedResponse, report: DiagnosticReport): void {
  expect(response.handled).toBe(true);
  expect(response.status).toBe(200);
  expect(response.headers["Content-Type"]).toBe("application/json");
  expect(response.json.ok).toBe(true);
  expect(response.json.data).toEqual(report);
  expect(response.json).not.toHaveProperty("error");
}

describe("API result claim contracts (P0-23)", () => {
  test("saved OpenAPI has every registered result operation and its ClaimResult JSON schema", () => {
    const spec = YAML.parse(readFileSync(new URL("../website/openapi.yaml", import.meta.url), "utf8"));
    requireClaimComponents(spec);
    expect(resultOperationViolations(spec, "saved-openapi-accounting")).toEqual([]);
  });

  test("generated OpenAPI has every registered result operation and its ClaimResult JSON schema", () => {
    const spec = generateFullOpenApiSpec();
    requireClaimComponents(spec);
    expect(resultOperationViolations(spec, "generated-openapi-accounting")).toEqual([]);
  });

  test("the stored-run route retains protected human-read access metadata", () => {
    const pathname = "/api/v1/score/run/p0-23-fixture";
    expect(matchApiRoute(pathname)).toMatchObject({ id: "score", auth: "protected", methods: ["GET", "POST"] });
    expect(resolveApiRolePolicy(pathname, "GET")).toEqual({ access: "read", roles: ["VIEWER", "OPERATOR", "APPROVER", "AUDITOR", "OWNER"] });
  });

  test("a real sealed 1.1.1 stored run stays legacy self-reported in the actual dispatcher response", async () => {
    const workspace = workspaceFixture();
    const report = storeRun(workspace, "1.1.1", "legacy-1-1-1-api", true);
    expect(sealedRunReportVerifies(workspace, report as unknown as Record<string, unknown>)).toBe(true);
    expect(evaluateDiagnosticEvidenceReadiness(report).status).toBe("READY");
    const expected = claimFields(envelopeForStoredRun(report, { sealVerified: true, now: Date.now() }));
    expect(expected.claimKind).toBe("self_reported");
    expect(expected.statusDimensions.result).toBe("not_evaluated");
    expect(expected.claimLabel).toMatch(/^Claim: Legacy \(1\.x\), self-reported/);
    const response = await readRun(workspace, report.runId);
    requireSuccess(response, report);
    expect(response.json).toMatchObject(expected);
  });

  test("a current sealed stored run preserves its observed claim and current result", async () => {
    const workspace = workspaceFixture();
    const report = storeRun(workspace, "1.2.0", "current-sealed-api", true);
    expect(sealedRunReportVerifies(workspace, report as unknown as Record<string, unknown>)).toBe(true);
    const expected = claimFields(envelopeForStoredRun(report, { sealVerified: true, now: Date.now() }));
    expect(expected.claimKind).toBe("observed");
    expect(expected.statusDimensions.result).toBe("pass");
    const response = await readRun(workspace, report.runId);
    requireSuccess(response, report);
    expect(response.json).toMatchObject(expected);
  });

  test("a tampered current stored run never inherits observed or positive claim fields", async () => {
    const workspace = workspaceFixture();
    const report = storeRun(workspace, "1.2.0", "current-tampered-api", true);
    report.integrityIndex = 0.95;
    writeFileSync(join(getAgentPaths(workspace, report.agentId).runsDir, `${report.runId}.json`), JSON.stringify(report));
    expect(sealedRunReportVerifies(workspace, report as unknown as Record<string, unknown>)).toBe(false);
    const response = await readRun(workspace, report.runId);
    requireSuccess(response, report);
    expect(response.json.claimKind).toBe("self_reported");
    expect(response.json.statusDimensions?.result).toBe("not_evaluated");
    expect(response.json.claimLabel).toMatch(/^Claim: Self-reported/);
  });

  test("an unsealed current stored run cannot promote its own observed metadata", async () => {
    const workspace = workspaceFixture();
    const report = storeRun(workspace, "1.2.0", "current-unsealed-api", false);
    expect(sealedRunReportVerifies(workspace, report as unknown as Record<string, unknown>)).toBe(false);
    const response = await readRun(workspace, report.runId);
    requireSuccess(response, report);
    expect(response.json.claimKind).toBe("self_reported");
    expect(response.json.statusDimensions?.result).toBe("not_evaluated");
    expect(response.json.claimLabel).toMatch(/^Claim: Self-reported/);
  });

  test("a missing stored run keeps the actual 404 error contract without fabricated claims", async () => {
    const response = await readRun(workspaceFixture(), "missing-api-run");
    expect(response.handled).toBe(true);
    expect(response.status).toBe(404);
    expect(response.json.ok).toBe(false);
    expect(response.json.error).toBeTypeOf("string");
    expect(response.json).not.toHaveProperty("data");
    for (const key of ["claimKind", "statusDimensions", "claimLabel"]) expect(response.json).not.toHaveProperty(key);
  });
});
