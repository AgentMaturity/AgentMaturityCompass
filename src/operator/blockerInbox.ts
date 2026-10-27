/**
 * The operator's blocker inbox (P2-22, backlog A14): what blocks a regulated claim, across A4 projects and the workspace.
 * It never reads "all clear" by default: a source that fails adds a source_unavailable item and is named in `sources`;
 * a workspace with no A4 project or no recorded control result yields not_evaluated items, never an empty inbox. Kinds
 * are A4's BlockerKind vocabulary (design §7 rule 3). P2-24's exceptions join once that issue lands.
 */
import { listAssuranceWaivers } from "../assurance/assurancePolicyStore.js";
import { conformanceView } from "../a4/a4Conformance.js";
import type { BlockerKind } from "../a4/a4Readiness.js";
import { openLedger } from "../ledger/ledger.js";
import { loadOperatorConfig, readA4Projects } from "./operatorSources.js";

export interface BlockerItem {
  id: string; kind: BlockerKind; controlId: string | null;
  subject: { agentId: string | null; deploymentId: string | null };
  severity: "mandatory" | "advisory"; since: number; dueTs: number | null;
  nextAction: string; links: string[];
}
export interface BlockerInbox { items: BlockerItem[]; sources: Record<string, "ok" | "unavailable">; evaluatedAt: string; expiryWindowDays: number }

const DAY_MS = 86_400_000;
const subject = (agentId: string | null) => ({ agentId, deploymentId: null });
const projectLink = (projectId: string) => `/console/a4.html#${projectId}`;

interface InboxSourceContext { workspace: string; nowTs: number; windowMs: number }
export type InboxSource = (ctx: InboxSourceContext) => BlockerItem[];

/** P1-11's dimensions as kinds: not evaluated; evidence incomplete, stale, contradictory or untrusted; review pending. */
export function blockerKindsOfControl(control: { result: string; evidence: string; review: string }): BlockerKind[] {
  const evidence: Record<string, BlockerKind> = { incomplete: "evidence_missing", stale: "evidence_stale", contradictory: "evidence_contradictory", untrusted: "evidence_untrusted" };
  return [
    ...(control.result === "not_evaluated" ? ["not_evaluated" as const] : []),
    ...(evidence[control.evidence] ? [evidence[control.evidence]!] : []),
    ...(control.review === "pending" ? ["review_pending" as const] : [])
  ];
}

/** A4: every readiness item not READY or COMPLETE, and every Adapt control result's open dimensions. */
const a4Source: InboxSource = ({ workspace, nowTs }) => readA4Projects(workspace, nowTs, (projects) => {
  if (projects.length === 0) {
    return [{ id: "a4:none", kind: "not_evaluated", controlId: null, subject: subject(null), severity: "mandatory", since: nowTs, dueTs: null,
      nextAction: "No A4 project exists, so no control has been evaluated. Create a project and record its control results.", links: ["/console/a4.html"] }];
  }
  return projects.flatMap((project): BlockerItem[] => {
    const readiness = project.readiness();
    const since = project.state.project.updated_ts;
    const items = readiness.items.filter((item) => item.status !== "READY" && item.status !== "COMPLETE").map((item): BlockerItem => ({
      id: `a4:${project.projectId}:${item.id}`, kind: item.kind ?? "not_evaluated", controlId: null, subject: subject(project.agentId),
      severity: item.mandatory ? "mandatory" : "advisory", since, dueTs: null,
      nextAction: item.nextAction?.label ?? `${item.status}: ${item.reasonCodes.join(", ") || "no reason code"}`, links: [projectLink(project.projectId)]
    }));
    const statement = conformanceView(workspace, project.state, "adapt", nowTs, () => readiness.items);
    const controls = statement.planDigest === null
      ? [{ id: `a4:${project.projectId}:results`, kind: "not_evaluated" as const, controlId: null, subject: subject(project.agentId), severity: "mandatory" as const,
        since, dueTs: null, nextAction: "No control results are recorded for this project's plan (Adapt Review).", links: [projectLink(project.projectId)] }]
      : statement.controls.filter((control) => control.applicability.state === "applicable").flatMap((control) => blockerKindsOfControl(control).map((kind): BlockerItem => ({
        id: `a4:${project.projectId}:control:${control.controlId}:${kind}`, kind, controlId: control.controlId, subject: subject(project.agentId),
        severity: "mandatory", since, dueTs: null,
        nextAction: control.result === "not_evaluated" ? `Not evaluated: ${"notEvaluatedReason" in control ? control.notEvaluatedReason ?? "" : ""}`.trim()
          : `Control ${control.controlId}: evidence ${control.evidence}, review ${control.review}`, links: [projectLink(project.projectId)]
      })));
    return [...items, ...controls];
  });
});

/** Assurance waivers that expire inside the window (activeAssuranceWaiver's rule: allowReadyDespiteAssuranceFail). */
const waiverSource: InboxSource = ({ workspace, nowTs, windowMs }) => listAssuranceWaivers(workspace)
  .filter((waiver) => waiver.allowReadyDespiteAssuranceFail && waiver.expiresTs > nowTs && waiver.expiresTs <= nowTs + windowMs)
  .map((waiver) => ({ id: `waiver:${waiver.waiverId}`, kind: "waiver_expiring", controlId: null,
    subject: subject(waiver.scope.type === "AGENT" ? waiver.scope.id : null), severity: "mandatory", since: waiver.createdTs, dueTs: waiver.expiresTs,
    nextAction: "Re-run assurance or renew the waiver before it expires.", links: ["/console/assurance.html"] }));

/** P1-03 receipts left outcome_unknown: each blocks its agent's journaled calls until resolved. */
const receiptSource: InboxSource = ({ workspace }) => {
  const ledger = openLedger(workspace, { readonly: true });
  try {
    const rows = ledger.db.prepare("SELECT execution_id, agent_id, tool_name, updated_ts FROM action_executions WHERE state = 'outcome_unknown' ORDER BY updated_ts")
      .all() as Array<{ execution_id: string; agent_id: string; tool_name: string; updated_ts: number }>;
    return rows.map((row) => ({ id: `receipt:${row.execution_id}`, kind: "outcome_unknown", controlId: null, subject: subject(row.agent_id),
      severity: "mandatory", since: row.updated_ts, dueTs: null,
      nextAction: `Resolve the outcome of ${row.tool_name} (execution ${row.execution_id}) before the agent's next journaled call.`, links: [] }));
  } finally {
    ledger.close();
  }
};

export const DEFAULT_INBOX_SOURCES: Readonly<Record<string, InboxSource>> = { a4: a4Source, assuranceWaivers: waiverSource, actionReceipts: receiptSource };

/** Mandatory first, then the earliest due time (none last), then the oldest. */
const byPriority = (a: BlockerItem, b: BlockerItem): number => (a.severity === b.severity ? 0 : a.severity === "mandatory" ? -1 : 1)
  || (a.dueTs ?? Infinity) - (b.dueTs ?? Infinity) || a.since - b.since || a.id.localeCompare(b.id);

export function buildBlockerInbox(p: { workspace: string; nowTs: number; sources?: Readonly<Record<string, InboxSource>> }): BlockerInbox {
  const { expiryWindowDays } = loadOperatorConfig(p.workspace).inbox;
  const ctx: InboxSourceContext = { workspace: p.workspace, nowTs: p.nowTs, windowMs: expiryWindowDays * DAY_MS };
  const sources: Record<string, "ok" | "unavailable"> = {};
  const items: BlockerItem[] = [];
  for (const [name, source] of Object.entries(p.sources ?? DEFAULT_INBOX_SOURCES)) {
    try {
      items.push(...source(ctx));
      sources[name] = "ok";
    } catch (error) {
      sources[name] = "unavailable";
      const code = (error as { code?: unknown }).code;
      items.push({ id: `source:${name}`, kind: "source_unavailable", controlId: null, subject: subject(null), severity: "mandatory", since: p.nowTs, dueTs: null,
        nextAction: `The ${name} source could not be read${typeof code === "string" ? ` (${code})` : ""}; nothing it holds is shown as clear.`, links: [] });
    }
  }
  return { items: items.sort(byPriority), sources, evaluatedAt: new Date(p.nowTs).toISOString(), expiryWindowDays };
}
