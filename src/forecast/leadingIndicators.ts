import { openLedger } from "../ledger/ledger.js";
import type { ForecastLeadingIndicator } from "./forecastSchema.js";

function parseAuditType(metaJson: string): string {
  try {
    const parsed = JSON.parse(metaJson) as Record<string, unknown>;
    if (typeof parsed.auditType === "string") {
      return parsed.auditType;
    }
  } catch {
    // ignored
  }
  return "";
}

function makeDirection(delta: number): "WORSENING" | "IMPROVING" | "STABLE" {
  if (Math.abs(delta) < 1e-9) {
    return "STABLE";
  }
  return delta > 0 ? "WORSENING" : "IMPROVING";
}

function indicatorFromCounts(params: {
  id: string;
  label: string;
  current: number;
  previous: number;
  eventHashes: string[];
  explanationTemplateId: string;
}): ForecastLeadingIndicator {
  const delta = params.current - params.previous;
  const denom = Math.max(1, params.previous);
  const robustZ = Number((delta / Math.sqrt(denom)).toFixed(6));
  return {
    id: params.id,
    label: params.label,
    direction: makeDirection(delta),
    magnitude: Number((delta / denom).toFixed(6)),
    robustZ,
    evidenceRefs: {
      runIds: [],
      eventHashes: params.eventHashes
    },
    explanationTemplateId: params.explanationTemplateId
  };
}

function leadingIndicators(params: {
  workspace: string;
  agentId?: string;
  windowStartTs: number;
  windowEndTs: number;
}, readonly = false): ForecastLeadingIndicator[] {
  const mid = Math.floor((params.windowStartTs + params.windowEndTs) / 2);
  const ledger = openLedger(params.workspace, { readonly });
  try {
    const events = ledger.getEventsBetween(params.windowStartTs, params.windowEndTs).filter((event) => {
      if (!params.agentId) {
        return true;
      }
      try {
        const meta = JSON.parse(event.meta_json) as Record<string, unknown>;
        const eventAgentId = typeof meta.agentId === "string" ? meta.agentId : "default";
        return eventAgentId === params.agentId;
      } catch {
        return false;
      }
    });

    const auditEvents = events
      .filter((event) => event.event_type === "audit")
      .map((event) => ({
        ts: event.ts,
        hash: event.event_hash,
        auditType: parseAuditType(event.meta_json)
      }));
    const approvals = auditEvents.filter((event) => event.auditType.startsWith("APPROVAL_"));
    const freezes = auditEvents.filter((event) => event.auditType.includes("FREEZE"));
    const signatureFailures = auditEvents.filter((event) => event.auditType.includes("SIGNATURE_INVALID"));
    const budgetExceeded = auditEvents.filter((event) => event.auditType === "BUDGET_EXCEEDED");
    const leaseIssues = auditEvents.filter((event) => event.auditType.startsWith("LEASE_"));
    const pluginIntegrity = auditEvents.filter((event) => event.auditType.includes("PLUGIN_INTEGRITY"));

    const splitCount = (rows: Array<{ ts: number; hash: string }>) => ({
      previous: rows.filter((row) => row.ts < mid).length,
      current: rows.filter((row) => row.ts >= mid).length,
      hashes: rows.map((row) => row.hash).slice(-20)
    });

    const approvalCounts = splitCount(approvals);
    const freezeCounts = splitCount(freezes);
    const signatureCounts = splitCount(signatureFailures);
    const budgetCounts = splitCount(budgetExceeded);
    const leaseCounts = splitCount(leaseIssues);
    const pluginCounts = splitCount(pluginIntegrity);

    return [
      indicatorFromCounts({
        id: "approval_backlog_age",
        label: "Approvals backlog age",
        current: approvalCounts.current,
        previous: approvalCounts.previous,
        eventHashes: approvalCounts.hashes,
        explanationTemplateId: "IND_APPROVAL_BACKLOG_AGE_V1"
      }),
      indicatorFromCounts({
        id: "freeze_events",
        label: "Freeze events",
        current: freezeCounts.current,
        previous: freezeCounts.previous,
        eventHashes: freezeCounts.hashes,
        explanationTemplateId: "IND_FREEZE_EVENTS_V1"
      }),
      indicatorFromCounts({
        id: "signature_failures",
        label: "Signature failures",
        current: signatureCounts.current,
        previous: signatureCounts.previous,
        eventHashes: signatureCounts.hashes,
        explanationTemplateId: "IND_SIGNATURE_FAILURES_V1"
      }),
      indicatorFromCounts({
        id: "budget_exceeded",
        label: "Budget exceeded events",
        current: budgetCounts.current,
        previous: budgetCounts.previous,
        eventHashes: budgetCounts.hashes,
        explanationTemplateId: "IND_BUDGET_EXCEEDED_V1"
      }),
      indicatorFromCounts({
        id: "lease_issues",
        label: "Lease denials and mismatches",
        current: leaseCounts.current,
        previous: leaseCounts.previous,
        eventHashes: leaseCounts.hashes,
        explanationTemplateId: "IND_LEASE_ISSUES_V1"
      }),
      indicatorFromCounts({
        id: "plugin_integrity",
        label: "Plugin integrity failures",
        current: pluginCounts.current,
        previous: pluginCounts.previous,
        eventHashes: pluginCounts.hashes,
        explanationTemplateId: "IND_PLUGIN_INTEGRITY_V1"
      })
    ];
  } finally {
    ledger.close();
  }
}

export function computeLeadingIndicators(params: { workspace: string; agentId?: string; windowStartTs: number; windowEndTs: number }): ForecastLeadingIndicator[] {
  return leadingIndicators(params);
}
/** Both connection lifetimes are synchronous and closed before returning; the final read never initializes a writer. */
export function captureLeadingIndicators(input: { workspace: string; agentId?: string; windowStartTs: number; windowEndTs: number }) {
  const params = { ...input }, indicators = leadingIndicators(params), expected = JSON.stringify(indicators);
  return { indicators, assertCurrent() {
    if (JSON.stringify(leadingIndicators(params, true)) !== expected) throw new Error("selected forecast audit indicator inputs changed while signing");
  } };
}
