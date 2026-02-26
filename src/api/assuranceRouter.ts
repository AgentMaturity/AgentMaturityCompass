/**
 * assuranceRouter.ts — Assurance API routes backed by the unified assurance runner.
 *
 * Full CLI parity with: amc assurance list|describe|init|verify-policy|policy|
 * policy-apply|run|runs|show|cert-issue|cert-verify|cert-latest|scheduler *|
 * waiver *|history|verify|patch|readiness|default-policy|verify-workspace|
 * toctou|compound-threats|shutdown-compliance|advanced-threats|
 * fp-submit|fp-resolve|fp-list|fp-cost|fp-tuning-report
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod";
import {
  assuranceCertIssueForApi,
  assuranceCertLatestForApi,
  assuranceCertVerifyForApi,
  assuranceDefaultPolicyForApi,
  assuranceInitForApi,
  assurancePolicyApplyForApi,
  assurancePolicyForApi,
  assuranceReadinessGate,
  assuranceRunDetailForApi,
  assuranceRunForApi,
  assuranceRunsForApi,
  assuranceSchedulerEnableForApi,
  assuranceSchedulerRunNowForApi,
  assuranceSchedulerStatusForApi,
  assuranceWaiverRequestForApi,
  assuranceWaiverRevokeForApi,
  assuranceWaiverStatusForApi
} from "../assurance/assuranceControlPlane.js";
import { getAssurancePack, listAssurancePacks } from "../assurance/packs/index.js";
import {
  listAssuranceHistory,
  verifyAssuranceRun,
  applyAssurancePatchKit
} from "../assurance/assuranceRunner.js";
import {
  verifyAssuranceCertificateFile,
  verifyAssuranceWorkspace
} from "../assurance/assuranceVerifier.js";
import {
  submitFPReport,
  resolveFPReport,
  listFPReports,
  computeFPCostSummary,
  generateFPTuningReport
} from "../assurance/falsePositiveTracker.js";
import {
  apiError,
  apiSuccess,
  bodyJson,
  bodyJsonSchema,
  isRequestBodyError,
  pathParam,
  queryParam
} from "./apiHelpers.js";

/* ── Shared schemas & helpers ──────────────────────────────────────── */

const assuranceRunBodySchema = z.object({
  scopeType: z.unknown().optional(),
  scope: z.unknown().optional(),
  scopeId: z.unknown().optional(),
  id: z.unknown().optional(),
  pack: z.unknown().optional(),
  windowDays: z.unknown().optional()
}).strict();

function parseScopeType(raw: unknown): "WORKSPACE" | "NODE" | "AGENT" {
  const normalized = String(raw ?? "WORKSPACE").toUpperCase();
  if (normalized === "WORKSPACE" || normalized === "NODE" || normalized === "AGENT") {
    return normalized;
  }
  throw new Error("scopeType must be WORKSPACE|NODE|AGENT");
}

function parseWindowDays(raw: unknown): number | undefined {
  if (raw === undefined || raw === null || raw === "") {
    return undefined;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error("windowDays must be a positive number");
  }
  return Math.trunc(parsed);
}

function parsePack(raw: unknown): string {
  const pack = String(raw ?? "all");
  if (pack === "all") {
    return pack;
  }
  const available = new Set(listAssurancePacks().map((row) => row.id));
  if (!available.has(pack)) {
    throw new Error(`pack must be all or one of: ${[...available].sort((a, b) => a.localeCompare(b)).join("|")}`);
  }
  return pack;
}

export async function handleAssuranceRoute(
  pathname: string,
  method: string,
  req: IncomingMessage,
  res: ServerResponse,
  workspace = process.cwd()
): Promise<boolean> {

  /* ── GET /api/v1/assurance/packs — list packs ────────────────── */
  if (pathname === "/api/v1/assurance/packs" && method === "GET") {
    const packs = listAssurancePacks().map((pack) => ({
      id: pack.id,
      title: pack.title,
      description: pack.description,
      scenarioCount: pack.scenarios.length
    }));
    apiSuccess(res, {
      count: packs.length,
      packs
    });
    return true;
  }

  /* ── GET /api/v1/assurance/packs/:packId — describe pack ─────── */
  const packParams = pathParam(pathname, "/api/v1/assurance/packs/:packId");
  if (packParams && method === "GET") {
    try {
      const pack = getAssurancePack(packParams.packId!);
      apiSuccess(res, pack);
    } catch (err) {
      apiError(res, 404, err instanceof Error ? err.message : "pack not found");
    }
    return true;
  }

  /* ── POST /api/v1/assurance/init — initialize policy ─────────── */
  if (pathname === "/api/v1/assurance/init" && method === "POST") {
    try {
      const out = assuranceInitForApi(workspace);
      apiSuccess(res, out);
    } catch (err) {
      apiError(res, 400, err instanceof Error ? err.message : "init failed");
    }
    return true;
  }

  /* ── GET /api/v1/assurance/policy — print policy ─────────────── */
  if (pathname === "/api/v1/assurance/policy" && method === "GET") {
    try {
      apiSuccess(res, assurancePolicyForApi(workspace));
    } catch (err) {
      apiError(res, 400, err instanceof Error ? err.message : "policy read failed");
    }
    return true;
  }

  /* ── POST /api/v1/assurance/policy — apply policy ────────────── */
  if (pathname === "/api/v1/assurance/policy" && method === "POST") {
    try {
      const body = await bodyJson<{ policy: unknown }>(req);
      if (!body.policy) {
        apiError(res, 400, "body must contain a 'policy' object");
        return true;
      }
      const out = assurancePolicyApplyForApi({ workspace, policy: body.policy });
      apiSuccess(res, out);
    } catch (err) {
      if (isRequestBodyError(err)) {
        apiError(res, err.statusCode, err.message);
        return true;
      }
      apiError(res, 400, err instanceof Error ? err.message : "policy apply failed");
    }
    return true;
  }

  /* ── GET /api/v1/assurance/policy/verify — verify policy sig ─── */
  if (pathname === "/api/v1/assurance/policy/verify" && method === "GET") {
    try {
      const sig = assurancePolicyForApi(workspace).signature;
      apiSuccess(res, sig);
    } catch (err) {
      apiError(res, 400, err instanceof Error ? err.message : "policy verify failed");
    }
    return true;
  }

  /* ── GET /api/v1/assurance/policy/default — default policy ───── */
  if (pathname === "/api/v1/assurance/policy/default" && method === "GET") {
    apiSuccess(res, assuranceDefaultPolicyForApi());
    return true;
  }

  /* ── GET /api/v1/assurance/readiness — readiness gate ────────── */
  if (pathname === "/api/v1/assurance/readiness" && method === "GET") {
    try {
      apiSuccess(res, assuranceReadinessGate(workspace));
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : "readiness check failed");
    }
    return true;
  }

  /* ── GET /api/v1/assurance/history — run history ─────────────── */
  if (pathname === "/api/v1/assurance/history" && method === "GET") {
    try {
      const agentId = queryParam(req.url ?? "", "agentId");
      const rows = listAssuranceHistory({ workspace, agentId });
      apiSuccess(res, { runs: rows });
    } catch (err) {
      apiError(res, 400, err instanceof Error ? err.message : "history failed");
    }
    return true;
  }

  /* ── POST /api/v1/assurance/verify — verify run determinism ──── */
  if (pathname === "/api/v1/assurance/verify" && method === "POST") {
    try {
      const body = await bodyJson<{ assuranceRunId: string; agentId?: string }>(req);
      if (!body.assuranceRunId) {
        apiError(res, 400, "assuranceRunId is required");
        return true;
      }
      const result = await verifyAssuranceRun({
        workspace,
        assuranceRunId: body.assuranceRunId,
        agentId: body.agentId
      });
      apiSuccess(res, result);
    } catch (err) {
      if (isRequestBodyError(err)) {
        apiError(res, err.statusCode, err.message);
        return true;
      }
      apiError(res, 400, err instanceof Error ? err.message : "verify failed");
    }
    return true;
  }

  /* ── POST /api/v1/assurance/patch — apply patch kit ──────────── */
  if (pathname === "/api/v1/assurance/patch" && method === "POST") {
    try {
      const body = await bodyJson<{ assuranceRunId: string; agentId?: string }>(req);
      if (!body.assuranceRunId) {
        apiError(res, 400, "assuranceRunId is required");
        return true;
      }
      const result = await applyAssurancePatchKit({
        workspace,
        assuranceRunId: body.assuranceRunId,
        agentId: body.agentId
      });
      apiSuccess(res, result);
    } catch (err) {
      if (isRequestBodyError(err)) {
        apiError(res, err.statusCode, err.message);
        return true;
      }
      apiError(res, 400, err instanceof Error ? err.message : "patch failed");
    }
    return true;
  }

  /* ── GET /api/v1/assurance/workspace/verify — verify workspace ─ */
  if (pathname === "/api/v1/assurance/workspace/verify" && method === "GET") {
    try {
      apiSuccess(res, verifyAssuranceWorkspace({ workspace }));
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : "workspace verify failed");
    }
    return true;
  }

  /* ── POST /api/v1/assurance/cert — issue certificate ─────────── */
  if (pathname === "/api/v1/assurance/cert" && method === "POST") {
    try {
      const body = await bodyJson<{ runId: string; outFile?: string }>(req);
      if (!body.runId) {
        apiError(res, 400, "runId is required");
        return true;
      }
      const result = await assuranceCertIssueForApi({
        workspace,
        runId: body.runId,
        outFile: body.outFile
      });
      apiSuccess(res, result);
    } catch (err) {
      if (isRequestBodyError(err)) {
        apiError(res, err.statusCode, err.message);
        return true;
      }
      apiError(res, 400, err instanceof Error ? err.message : "cert issue failed");
    }
    return true;
  }

  /* ── POST /api/v1/assurance/cert/verify — verify certificate ─── */
  if (pathname === "/api/v1/assurance/cert/verify" && method === "POST") {
    try {
      const body = await bodyJson<{ file: string }>(req);
      if (!body.file) {
        apiError(res, 400, "file path is required");
        return true;
      }
      apiSuccess(res, assuranceCertVerifyForApi({ file: body.file }));
    } catch (err) {
      if (isRequestBodyError(err)) {
        apiError(res, err.statusCode, err.message);
        return true;
      }
      apiError(res, 400, err instanceof Error ? err.message : "cert verify failed");
    }
    return true;
  }

  /* ── GET /api/v1/assurance/cert/latest — latest certificate ──── */
  if (pathname === "/api/v1/assurance/cert/latest" && method === "GET") {
    try {
      apiSuccess(res, assuranceCertLatestForApi(workspace));
    } catch (err) {
      apiError(res, 400, err instanceof Error ? err.message : "cert latest failed");
    }
    return true;
  }

  /* ── GET /api/v1/assurance/scheduler — scheduler status ──────── */
  if (pathname === "/api/v1/assurance/scheduler" && method === "GET") {
    try {
      apiSuccess(res, assuranceSchedulerStatusForApi(workspace));
    } catch (err) {
      apiError(res, 400, err instanceof Error ? err.message : "scheduler status failed");
    }
    return true;
  }

  /* ── POST /api/v1/assurance/scheduler/run — run now ──────────── */
  if (pathname === "/api/v1/assurance/scheduler/run" && method === "POST") {
    try {
      const out = await assuranceSchedulerRunNowForApi({ workspace });
      apiSuccess(res, out);
    } catch (err) {
      apiError(res, 400, err instanceof Error ? err.message : "scheduler run failed");
    }
    return true;
  }

  /* ── POST /api/v1/assurance/scheduler/enable — enable ────────── */
  if (pathname === "/api/v1/assurance/scheduler/enable" && method === "POST") {
    try {
      apiSuccess(res, assuranceSchedulerEnableForApi({ workspace, enabled: true }));
    } catch (err) {
      apiError(res, 400, err instanceof Error ? err.message : "scheduler enable failed");
    }
    return true;
  }

  /* ── POST /api/v1/assurance/scheduler/disable — disable ──────── */
  if (pathname === "/api/v1/assurance/scheduler/disable" && method === "POST") {
    try {
      apiSuccess(res, assuranceSchedulerEnableForApi({ workspace, enabled: false }));
    } catch (err) {
      apiError(res, 400, err instanceof Error ? err.message : "scheduler disable failed");
    }
    return true;
  }

  /* ── POST /api/v1/assurance/waiver — request waiver ──────────── */
  if (pathname === "/api/v1/assurance/waiver" && method === "POST") {
    try {
      const body = await bodyJson<{ agentId?: string; reason: string; hours: number }>(req);
      if (!body.reason || !body.hours) {
        apiError(res, 400, "reason and hours are required");
        return true;
      }
      const out = assuranceWaiverRequestForApi({
        workspace,
        agentId: body.agentId ?? "default",
        reason: body.reason,
        hours: body.hours
      });
      apiSuccess(res, out);
    } catch (err) {
      if (isRequestBodyError(err)) {
        apiError(res, err.statusCode, err.message);
        return true;
      }
      apiError(res, 400, err instanceof Error ? err.message : "waiver request failed");
    }
    return true;
  }

  /* ── GET /api/v1/assurance/waiver — waiver status ────────────── */
  if (pathname === "/api/v1/assurance/waiver" && method === "GET") {
    try {
      apiSuccess(res, assuranceWaiverStatusForApi(workspace));
    } catch (err) {
      apiError(res, 400, err instanceof Error ? err.message : "waiver status failed");
    }
    return true;
  }

  /* ── POST /api/v1/assurance/waiver/revoke — revoke waiver ────── */
  if (pathname === "/api/v1/assurance/waiver/revoke" && method === "POST") {
    try {
      const body = await bodyJson<{ waiverId?: string }>(req);
      const out = assuranceWaiverRevokeForApi({
        workspace,
        waiverId: body.waiverId
      });
      apiSuccess(res, out);
    } catch (err) {
      if (isRequestBodyError(err)) {
        apiError(res, err.statusCode, err.message);
        return true;
      }
      apiError(res, 400, err instanceof Error ? err.message : "waiver revoke failed");
    }
    return true;
  }

  /* ── POST /api/v1/assurance/lab/:packName — lab packs ────────── */
  const labParams = pathParam(pathname, "/api/v1/assurance/lab/:packName");
  if (labParams && method === "POST") {
    try {
      const body = await bodyJson<{ agentId: string }>(req);
      if (!body.agentId) {
        apiError(res, 400, "agentId is required");
        return true;
      }
      const packName = labParams.packName!;
      let result: unknown;
      switch (packName) {
        case "toctou": {
          const { runToctouPack } = await import("../lab/packs/toctouPack.js");
          result = await runToctouPack(body.agentId);
          break;
        }
        case "compound-threats": {
          const { runCompoundThreatPack } = await import("../lab/packs/compoundThreatPack.js");
          result = await runCompoundThreatPack(body.agentId);
          break;
        }
        case "shutdown-compliance": {
          const { runShutdownCompliancePack } = await import("../lab/packs/shutdownCompliancePack.js");
          result = await runShutdownCompliancePack(body.agentId);
          break;
        }
        case "advanced-threats": {
          const { runAdvancedThreatsPack } = await import("../lab/packs/advancedThreatsPack.js");
          result = await runAdvancedThreatsPack(body.agentId);
          break;
        }
        default:
          apiError(res, 404, `unknown lab pack: ${packName}. Available: toctou, compound-threats, shutdown-compliance, advanced-threats`);
          return true;
      }
      apiSuccess(res, result);
    } catch (err) {
      if (isRequestBodyError(err)) {
        apiError(res, err.statusCode, err.message);
        return true;
      }
      apiError(res, 400, err instanceof Error ? err.message : "lab pack failed");
    }
    return true;
  }

  /* ── POST /api/v1/assurance/fp — submit FP report ────────────── */
  if (pathname === "/api/v1/assurance/fp" && method === "POST") {
    try {
      const body = await bodyJson<{
        scenarioId: string;
        packId: string;
        assuranceRunId: string;
        response?: string;
        justification: string;
        reportedBy?: string;
      }>(req);
      if (!body.scenarioId || !body.packId || !body.assuranceRunId || !body.justification) {
        apiError(res, 400, "scenarioId, packId, assuranceRunId, and justification are required");
        return true;
      }
      const report = submitFPReport({
        scenarioId: body.scenarioId,
        packId: body.packId,
        assuranceRunId: body.assuranceRunId,
        response: body.response ?? "",
        justification: body.justification,
        reportedBy: body.reportedBy ?? "api-user"
      });
      apiSuccess(res, report);
    } catch (err) {
      if (isRequestBodyError(err)) {
        apiError(res, err.statusCode, err.message);
        return true;
      }
      apiError(res, 400, err instanceof Error ? err.message : "fp submit failed");
    }
    return true;
  }

  /* ── GET /api/v1/assurance/fp — list FP reports ──────────────── */
  if (pathname === "/api/v1/assurance/fp" && method === "GET") {
    const packId = queryParam(req.url ?? "", "packId");
    const status = queryParam(req.url ?? "", "status") as "open" | "confirmed" | "rejected" | undefined;
    const reports = listFPReports({ packId, status });
    apiSuccess(res, { count: reports.length, reports });
    return true;
  }

  /* ── POST /api/v1/assurance/fp/resolve — resolve FP report ───── */
  if (pathname === "/api/v1/assurance/fp/resolve" && method === "POST") {
    try {
      const body = await bodyJson<{ reportId: string; status: "confirmed" | "rejected"; reason: string }>(req);
      if (!body.reportId || !body.status || !body.reason) {
        apiError(res, 400, "reportId, status, and reason are required");
        return true;
      }
      const result = resolveFPReport(body.reportId, {
        status: body.status,
        reason: body.reason
      });
      if (!result) {
        apiError(res, 404, "report not found or already resolved");
        return true;
      }
      apiSuccess(res, result);
    } catch (err) {
      if (isRequestBodyError(err)) {
        apiError(res, err.statusCode, err.message);
        return true;
      }
      apiError(res, 400, err instanceof Error ? err.message : "fp resolve failed");
    }
    return true;
  }

  /* ── GET /api/v1/assurance/fp/cost — FP cost summary ─────────── */
  if (pathname === "/api/v1/assurance/fp/cost" && method === "GET") {
    const packId = queryParam(req.url ?? "", "packId");
    const summaries = computeFPCostSummary(packId);
    apiSuccess(res, { summaries });
    return true;
  }

  /* ── GET /api/v1/assurance/fp/tuning — FP tuning report ──────── */
  if (pathname === "/api/v1/assurance/fp/tuning" && method === "GET") {
    const windowDays = queryParam(req.url ?? "", "windowDays");
    const threshold = queryParam(req.url ?? "", "threshold");
    const windowMs = (windowDays ? parseInt(windowDays, 10) : 30) * 86400000;
    const report = generateFPTuningReport({
      windowStartTs: Date.now() - windowMs,
      windowEndTs: Date.now(),
      fpRateThreshold: threshold ? parseFloat(threshold) : undefined
    });
    apiSuccess(res, report);
    return true;
  }

  /* ── GET /api/v1/assurance — list runs (legacy) ──────────────── */
  if (pathname === "/api/v1/assurance" && method === "GET") {
    apiSuccess(res, {
      runs: assuranceRunsForApi(workspace)
    });
    return true;
  }

  /* ── POST /api/v1/assurance — run assurance ──────────────────── */
  if (pathname === "/api/v1/assurance" && method === "POST") {
    try {
      const body = await bodyJsonSchema(req, assuranceRunBodySchema);
      const scopeType = parseScopeType(body.scopeType ?? body.scope);
      const scopeIdRaw = body.scopeId ?? body.id;
      const scopeId = typeof scopeIdRaw === "string" && scopeIdRaw.trim().length > 0 ? scopeIdRaw.trim() : undefined;
      const pack = parsePack(body.pack);
      const windowDays = parseWindowDays(body.windowDays);
      const out = await assuranceRunForApi({
        workspace,
        scopeType,
        scopeId,
        pack,
        windowDays
      });
      apiSuccess(res, out);
    } catch (err) {
      if (isRequestBodyError(err)) {
        apiError(res, err.statusCode, err.message);
        return true;
      }
      apiError(res, 400, err instanceof Error ? err.message : "invalid request");
    }
    return true;
  }

  /* ── GET /api/v1/assurance/:runId — show run detail ──────────── */
  const runParams = pathParam(pathname, "/api/v1/assurance/:runId");
  if (runParams && method === "GET") {
    const runId = runParams.runId;
    if (!runId) {
      apiError(res, 400, "runId is required");
      return true;
    }
    const detail = assuranceRunDetailForApi({
      workspace,
      runId
    });
    if (!detail.run) {
      apiError(res, 404, "Assurance run not found");
      return true;
    }
    apiSuccess(res, detail);
    return true;
  }

  return false;
}
