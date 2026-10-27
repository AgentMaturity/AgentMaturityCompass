import { parseWindowToMs } from "../utils/time.js";
import { canonicalize } from "../utils/json.js";
import { openLedger, type Ledger } from "../ledger/ledger.js";
import { readdirSync } from "node:fs";
import { getAgentPaths, resolveAgentId } from "../fleet/paths.js";
import { pathExists, readUtf8 } from "../utils/fs.js";
import { loadCase, loadCasebook, verifyCasebook } from "./casebookStore.js";

interface CaseRunResult {
  caseId: string;
  title: string;
  success: boolean;
  valuePoints: number;
  reasons: string[];
  costTokens: number;
  correlationRatio: number;
}

function parseAuditType(metaJson: string): string {
  try {
    const parsed = JSON.parse(metaJson) as Record<string, unknown>;
    return typeof parsed.auditType === "string" ? parsed.auditType : "";
  } catch {
    return "";
  }
}

function parseUsageTokens(metaJson: string): number {
  try {
    const parsed = JSON.parse(metaJson) as Record<string, unknown>;
    const usage = parsed.usage;
    if (!usage || typeof usage !== "object") {
      return 0;
    }
    const row = usage as Record<string, unknown>;
    const vals = [row.total_tokens, row.totalTokens, row.input_tokens, row.inputTokens, row.output_tokens, row.outputTokens]
      .map((v) => (typeof v === "number" && Number.isFinite(v) ? v : 0));
    return vals.reduce((acc, value) => acc + value, 0);
  } catch {
    return 0;
  }
}

function latestCorrelationRatio(workspace: string, agentId: string): number {
  const paths = getAgentPaths(workspace, agentId);
  if (!pathExists(paths.runsDir)) {
    return 1;
  }
  const files = (pathExists(paths.runsDir) ? readdirSync(paths.runsDir) : [])
    .filter((name: string) => name.endsWith(".json"))
    .sort((a: string, b: string) => a.localeCompare(b));
  if (files.length === 0) {
    return 1;
  }
  try {
    const latest = JSON.parse(readUtf8(`${paths.runsDir}/${files[files.length - 1]}`)) as { correlationRatio?: number };
    return typeof latest.correlationRatio === "number" ? latest.correlationRatio : 1;
  } catch {
    return 1;
  }
}

function runCasebookAtWindow(params: {
  workspace: string;
  agentId?: string;
  casebookId: string;
  mode: "supervise" | "sandbox";
  window?: string;
}, windowBounds?: { startedTs: number; endedTs: number }, actualLedger?: Ledger): {
  casebookId: string;
  agentId: string;
  mode: "supervise" | "sandbox";
  startedTs: number;
  endedTs: number;
  results: CaseRunResult[];
} {
  const agentId = resolveAgentId(params.workspace, params.agentId);
  const verify = verifyCasebook(params.workspace, params.casebookId, agentId);
  if (!verify.valid) {
    throw new Error(`casebook verification failed: ${verify.reasons.join("; ")}`);
  }
  const loaded = loadCasebook(params.workspace, params.casebookId, agentId);
  const start = windowBounds?.startedTs ?? Date.now() - parseWindowToMs(params.window ?? "14d");
  const end = windowBounds?.endedTs ?? Date.now();
  const correlationRatio = latestCorrelationRatio(params.workspace, agentId);
  if (actualLedger !== undefined && actualLedger.workspace !== params.workspace) throw new Error("casebook reader belongs to another workspace");
  const ledger = actualLedger ?? openLedger(params.workspace);
  try {
    const evidence = ledger.getEventsBetween(start, end).filter((event) => {
      try {
        const meta = JSON.parse(event.meta_json) as Record<string, unknown>;
        return (meta.agentId ?? "default") === agentId;
      } catch {
        return false;
      }
    });

    const llmTokens = evidence
      .filter((event) => event.event_type === "llm_response")
      .reduce((sum, event) => sum + parseUsageTokens(event.meta_json), 0);

    const toolActions = evidence.filter((event) => event.event_type === "tool_action");
    const audits = evidence
      .filter((event) => event.event_type === "audit")
      .map((event) => parseAuditType(event.meta_json))
      .filter((audit) => audit.length > 0);

    const perCaseCost = loaded.casebook.caseIds.length > 0 ? llmTokens / loaded.casebook.caseIds.length : 0;

    const results: CaseRunResult[] = loaded.casebook.caseIds.map((caseId) => {
      const kase = loadCase(params.workspace, params.casebookId, caseId, agentId);
      const reasons: string[] = [];
      if ((kase.riskTier === "high" || kase.riskTier === "critical") && params.mode !== "sandbox") {
        reasons.push("high-risk case requires sandbox mode");
      }
      if (kase.validators.minCorrelationRatio > correlationRatio) {
        reasons.push(`correlation ratio ${correlationRatio.toFixed(3)} below required ${kase.validators.minCorrelationRatio.toFixed(3)}`);
      }
      for (const audit of kase.validators.forbiddenAudits) {
        if (audits.includes(audit)) {
          reasons.push(`forbidden audit detected: ${audit}`);
        }
      }
      if (kase.validators.requiredToolActions.length > 0 && toolActions.length === 0) {
        reasons.push("required tool action evidence missing");
      }
      if (kase.validators.requireReceipts) {
        const missingReceipt = toolActions.some((event) => {
          try {
            const meta = JSON.parse(event.meta_json) as Record<string, unknown>;
            return typeof meta.receipt !== "string" || meta.receipt.length === 0;
          } catch {
            return true;
          }
        });
        if (missingReceipt) {
          reasons.push("tool action receipt missing");
        }
      }
      const success = reasons.length === 0;
      return {
        caseId: kase.caseId,
        title: kase.title,
        success,
        valuePoints: success ? kase.scoring.valuePoints : 0,
        reasons,
        costTokens: Number(perCaseCost.toFixed(4)),
        correlationRatio
      };
    });

    return {
      casebookId: params.casebookId,
      agentId,
      mode: params.mode,
      startedTs: start,
      endedTs: end,
      results
    };
  } finally {
    if (actualLedger === undefined) ledger.close();
  }
}

/** Existing public API and return shape; default evidence clocks remain unchanged. */
export function runCasebook(params: Parameters<typeof runCasebookAtWindow>[0]): ReturnType<typeof runCasebookAtWindow> {
  return runCasebookAtWindow(params);
}

/** Internal experiment publication consumer: revalidate the same actual read-only evidence windows and validators. */
export function assertCasebookRunCurrent(params: Parameters<typeof runCasebook>[0], prepared: ReturnType<typeof runCasebook>, actualLedger?: Ledger): void {
  const current = runCasebookAtWindow(params, { startedTs: prepared.startedTs, endedTs: prepared.endedTs }, actualLedger);
  if (canonicalize(current) !== canonicalize(prepared)) throw new Error("experiment casebook inputs changed while signing");
}
