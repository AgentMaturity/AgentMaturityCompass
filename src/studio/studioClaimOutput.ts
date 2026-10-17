/**
 * Claim labels for Studio routes that feed result pages (P0-23). The request handler binds the
 * matched route to the response, and Studio's JSON helper passes every 2xx body through
 * withClaimBody, so the claim comes from the shared service and studioServer.ts does not grow.
 */
import type { ServerResponse } from "node:http";
import { join } from "node:path";
import { labelResult, matchResultRoute, resultFamily, type ResultRoute } from "../api/resultRouteRegistry.js";
import { envelopeForStoredRun } from "../claims/eligibility/adapters/results.js";
import { claimFields, type ClaimFields } from "../claims/eligibility/index.js";
import { evaluateDiagnosticEvidenceReadiness } from "../diagnostic/evidenceReadiness.js";
import { sealedRunReportVerifies } from "../diagnostic/reportSeal.js";
import { loadRunReport } from "../diagnostic/runReportResolution.js";
import { getAgentPaths } from "../fleet/paths.js";
import type { DiagnosticReport } from "../types.js";

const DIAGNOSTIC = { source: "diagnostic_report" } as const;

export const STUDIO_RESULT_ROUTES: readonly ResultRoute[] = [
  ...resultFamily("studio", "/", "runtime_observation", [
    ["POST", "diagnostic/run", DIAGNOSTIC], ["POST", "diagnostic/self-run", DIAGNOSTIC], ["GET", "runs/:id/report", DIAGNOSTIC],
    ["POST", "passport/create"], ["GET", "passport/cache/latest"], ["POST", "passport/verify"], ["GET", "passport/badge"],
    ["GET", "org/scorecards/latest"], ["GET", "org/runs/:id"], ["GET", "forecast/latest"], ["GET", "outcomes/report"],
    ["GET", "value/report"], ["GET", "standard/verify"], ["GET", "trust/status"], ["GET", "transparency/verify"],
    ["POST", "audit/binder/create"], ["GET", "audit/binders/:id/verify"], ["GET", "compliance/verify"],
    ["GET", "industry-packs/list", { items: "packs" }],
    // access and checkout are pack-gate routes, not results.
    ["GET", "industry-packs/:id", { except: ["access", "checkout"] }]
  ]),
  ...resultFamily("studio", "/", "executed_test", [
    ["POST", "assurance/run"], ["GET", "assurance/runs", { items: "runs" }], ["GET", "assurance/runs/:id"],
    ["POST", "assurance/cert/issue"], ["GET", "assurance/cert/latest"], ["POST", "bench/compare"],
    ["GET", "bench/comparison/latest"], ["GET", "benchmarks/stats"]
  ]),
  ...resultFamily("studio", "/", "runtime_observation",
    [["GET", "compliance/report", { source: "compliance_report" }], ["GET", "compliance/fleet"]], true)
];

/** Truth rule 6, on every pack-gate response. */
export const ENTITLEMENT_NOTE =
  "Payment unlocks access to pack content; it never changes a result, a trust tier or a verification outcome.";

const bound = new WeakMap<ServerResponse, { route: ResultRoute; workspace: string; claim?: ClaimFields }>();

export function bindStudioResultRoute(res: ServerResponse, method: string, pathname: string, workspace: string): void {
  const route = matchResultRoute(STUDIO_RESULT_ROUTES, method, pathname);
  if (route) bound.set(res, { route, workspace });
}

/** Verify the original stored report after authorization, before adding display-only readiness. */
export function studioStoredRunReport(res: ServerResponse, workspace: string, runId: string,
  auth: { isAdmin: boolean; agentId: string | null }): { status: number; body: unknown } {
  if (runId.includes("/") || runId.includes("\\") || runId.includes(String.fromCharCode(0))) {
    return { status: 400, body: { error: "invalid run id" } };
  }
  const reportFiles = [join(getAgentPaths(workspace).runsDir, runId + ".json"), join(workspace, ".amc", "runs", runId + ".json")];
  let report: DiagnosticReport;
  try {
    report = loadRunReport(workspace, runId);
  } catch (error) {
    const missing = error as NodeJS.ErrnoException | null;
    if (missing?.code === "ENOENT" && typeof missing.path === "string" && reportFiles.includes(missing.path)) {
      return { status: 404, body: { error: "run report not found" } };
    }
    throw error;
  }
  if (!auth.isAdmin && auth.agentId && report.agentId !== auth.agentId) {
    return { status: 403, body: { error: "scope does not include this agent" } };
  }
  const binding = bound.get(res);
  if (binding) binding.claim = claimFields(envelopeForStoredRun(report, {
    sealVerified: sealedRunReportVerifies(workspace, report as unknown as Record<string, unknown>), now: Date.now()
  }));
  return { status: 200, body: { ...report, evidenceReadiness: evaluateDiagnosticEvidenceReadiness(report) } };
}

/** A 2xx body from a listed route, with its claim: fields beside a single result, a `claim` on each list item. */
export function withClaimBody(res: ServerResponse, status: number, body: unknown): unknown {
  const binding = bound.get(res);
  if (!binding || status < 200 || status >= 300 || typeof body !== "object" || body === null || Array.isArray(body)) return body;
  if (binding.claim) return { ...body, ...binding.claim };
  const labelled = labelResult(binding.route, body, binding.workspace);
  return { ...(labelled.data as Record<string, unknown>), ...labelled.claim };
}
