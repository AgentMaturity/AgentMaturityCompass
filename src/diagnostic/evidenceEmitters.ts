import type { ClaimKind } from "../claims/eligibility/types.js";
import { producerOfMeta, type EvidenceProducer } from "../claims/evidenceProvenance.js";
import type { EvidenceEventType, TrustTier } from "../types.js";

/**
 * The emitters whose rows may count toward a maturity level (P1-07).
 *
 * A gate requirement is only honest when something in AMC actually writes the row it asks for. Before this
 * registry every L3, L4 and L5 gate named audit types that only the dogfood seeder wrote, so no real workspace
 * could reach them. An entry here names the module that writes the row and the literal it writes;
 * `scripts/check-gate-reachability.mjs` (`npm run check:gates`) proves both, and fails when an evaluated gate asks
 * for a row no entry produces.
 *
 * A row is admitted for an entry only when its shape matches (same event type, and the same `meta.auditType` or
 * `meta.metricKey` when the entry names one) AND its provenance matches: the producer derived from the row (P0-18
 * `producerOfMeta`) must be the entry's `producer`, and its effective trust tier (P0-18 `effectiveTrustTier`, as
 * parsed by `parseEvidenceEventWith`) must be the tier the entry's `claimKind` writes. Shape alone admits nothing.
 *
 * Which question a row evidences above L1 is never read from the row: ./evidenceMaps/ names the emitters per
 * question and level (P1-07 security review).
 *
 * The dogfood seeder (src/dogfood/) is never an entry. Importers are `self_reported`.
 */
export type EmitterLevelUse = "L1" | "L2" | "L3" | "L4";

export interface EmitterEntry {
  id: string;
  module: string;
  eventType: EvidenceEventType;
  auditType?: string;
  metricKey?: string;
  /** A meta field the emitter writes only for the rows this entry stands for (for example a declared scope). */
  requiresMeta?: string;
  claimKind: ClaimKind;
  /** Who writes the row, as P0-18 derives it from the row's provenance. */
  producer: Exclude<EvidenceProducer, "synthetic">;
  levelUse: EmitterLevelUse[];
}

export const EVIDENCE_EMITTERS: readonly EmitterEntry[] = [
  // A governed tool call (src/tools/toolEvidence.ts). Rows carry `questionIds` from LIVE_PROJECTION_RULES.
  { id: "tool-call-allowed", module: "src/tools/toolEvidence.ts", eventType: "audit", auditType: "TOOL_CALL_ALLOWED", claimKind: "observed", producer: "amc-runtime", levelUse: ["L1", "L2"] },
  { id: "tool-call-denied", module: "src/tools/toolEvidence.ts", eventType: "audit", auditType: "TOOL_CALL_DENIED", claimKind: "observed", producer: "amc-runtime", levelUse: ["L1", "L2"] },
  { id: "tool-call-failed", module: "src/tools/toolEvidence.ts", eventType: "audit", auditType: "TOOL_CALL_FAILED", claimKind: "observed", producer: "amc-runtime", levelUse: ["L1"] },
  { id: "tool-call-outcome", module: "src/tools/toolEvidence.ts", eventType: "metric", metricKey: "tool_call_outcome", claimKind: "observed", producer: "amc-runtime", levelUse: ["L1", "L2"] },
  { id: "tool-output-digest", module: "src/tools/toolEvidence.ts", eventType: "stdout", claimKind: "observed", producer: "amc-runtime", levelUse: ["L1"] },
  // A scope-declared delegation (src/diagnostic/spineEvidenceProjection.ts): only it writes `meta.delegationScope`.
  { id: "delegation-settled", module: "src/diagnostic/spineEvidenceProjection.ts", eventType: "audit", auditType: "DELEGATION_SETTLED", requiresMeta: "delegationScope", claimKind: "observed", producer: "amc-runtime", levelUse: ["L1", "L2"] },
  { id: "delegate-report-digest", module: "src/diagnostic/spineEvidenceProjection.ts", eventType: "stdout", claimKind: "observed", producer: "amc-runtime", levelUse: ["L1"] },
  // Signed artifact provenance (`amc artifact sign`).
  { id: "artifact-provenance", module: "src/artifact/artifactProvenance.ts", eventType: "artifact", claimKind: "observed", producer: "amc-runtime", levelUse: ["L1"] },
  // External eval imports: self-reported by provenance (meta.source eval_import), so L1 at most.
  { id: "eval-import-case", module: "src/eval/evalImporters.ts", eventType: "test", claimKind: "self_reported", producer: "import", levelUse: ["L1"] },
  { id: "eval-import-score", module: "src/eval/evalImporters.ts", eventType: "metric", metricKey: "external_eval_score", claimKind: "self_reported", producer: "import", levelUse: ["L1"] },
  { id: "eval-import-calibration", module: "src/eval/evalImporters.ts", eventType: "metric", metricKey: "confidence_calibration_error", claimKind: "self_reported", producer: "import", levelUse: ["L1"] }
];

/**
 * Modules that emit literal `auditType` values none of which can evidence maturity, one line each saying why.
 * `npm run check:gates` fails on a literal audit emission whose type has no entry above and whose module is not here,
 * so a new audit type is classified before it can be scored. Being listed here can only keep a row from counting.
 */
export const NON_MATURITY_AUDIT_MODULES: ReadonlyArray<{ module: string; why: string }> = [
  { module: "src/a4/a4Store.ts", why: "A4 project transitions and gate decisions; governance bookkeeping, untagged, never maturity evidence" },
  { module: "src/actions/actionJournal.ts", why: "action receipt states and dropped-telemetry counts (P1-03); AMC enforcement bookkeeping, untagged, never maturity evidence" },
  { module: "src/agent/agentToolset.ts", why: "native shell confinement settings; untagged, so they bind to no question" },
  { module: "src/agent/compaction/autoCompact.ts", why: "context compaction bookkeeping (P1-37); token counts before and after, not agent behaviour" },
  { module: "src/approvals/approvalStudioService.ts", why: "operator approval decisions about AMC actions, not the scored agent's behaviour" },
  { module: "src/archetypes/index.ts", why: "operator applied an archetype to AMC configuration" },
  { module: "src/assurance/assuranceRunner.ts", why: "assurance run bookkeeping; scenario results are `test` rows, untagged" },
  { module: "src/assurance/evidenceWriters.ts", why: "assurance run start and abort bookkeeping" },
  { module: "src/assurance/packs/mobilityFunctionalSafetyPack.ts", why: "failure findings; a finding against the agent cannot raise its level" },
  { module: "src/bridge/bridgeAuth.ts", why: "lease refusal; read only by score caps" },
  { module: "src/bridge/bridgePolicyEnforcer.ts", why: "bridge refusals; read only by score caps and penalties" },
  { module: "src/bridge/bridgeServer.ts", why: "bridge failures and policy violations; read only by score caps" },
  { module: "src/budgets/budgets.ts", why: "operator budget reset" },
  { module: "src/cli.ts", why: "operator pairing and ad hoc guard checks" },
  { module: "src/correlation/correlate.ts", why: "trace correlation failures; they lower the integrity index" },
  { module: "src/diagnostic/audits.ts", why: "the diagnostic's own derived findings; excluded from scoring and read as penalties" },
  { module: "src/diagnostic/runner.ts", why: "the diagnostic's own findings about a run" },
  { module: "src/drift/driftDetector.ts", why: "drift regressions and freezes; they cap scores" },
  { module: "src/enforce/actionEvidenceLogic.ts", why: "policy evidence-logic changes; untagged, so they bind to no question" },
  { module: "src/enforce/scopeTemplates.ts", why: "policy scope template applied; untagged, so it binds to no question" },
  { module: "src/eoc/flows.ts", why: "education, ownership and commitment bookkeeping" },
  { module: "src/eval/evalImporters.ts", why: "import bookkeeping and imported failures; self-reported by provenance" },
  { module: "src/gateway/server.ts", why: "gateway refusals and misconfiguration; read only by score caps and penalties" },
  { module: "src/ingest/ingest.ts", why: "ingest bookkeeping; imported rows are self-reported" },
  { module: "src/integrations/integrationDispatcher.ts", why: "outbound integration dispatch bookkeeping" },
  { module: "src/integrations/noCodeWebhookAdapters.ts", why: "webhook ingestion; external reports are self-reported" },
  { module: "src/ops/backup/backupEngine.ts", why: "AMC backup operations" },
  { module: "src/ops/maintenance/maintenanceCli.ts", why: "AMC maintenance operations" },
  { module: "src/ops/metrics/metricsServer.ts", why: "AMC metrics endpoint lifecycle" },
  { module: "src/ops/productionWiring.ts", why: "AMC overhead accounting and insider-risk signals" },
  { module: "src/ops/retention/retentionEngine.ts", why: "AMC retention operations" },
  { module: "src/org/orgCommitments.ts", why: "organisation bookkeeping" },
  { module: "src/outcomes/outcomeApi.ts", why: "webhook outcome ingestion; external reports are self-reported" },
  { module: "src/policy/effectivePolicyReceipt.ts", why: "the compiled policy a session ran under (P1-12); AMC configuration, untagged, never maturity evidence" },
  { module: "src/policyPacks/packApply.ts", why: "policy pack applied; untagged, so it binds to no question" },
  { module: "src/residency/checkEgress.ts", why: "residency route refusals (P2-01): AMC enforcement bookkeeping; the control result is not_evaluated and makes no pass claim" },
  { module: "src/residency/deletionGate.ts", why: "deletion admission records (P2-01): legal-hold enforcement bookkeeping, never maturity evidence" },
  { module: "src/residency/legalHoldRegistry.ts", why: "legal-hold register initialization, rebind and legacy-release acknowledgements (P2-01): owner governance bookkeeping, never maturity evidence" },
  { module: "src/sandbox/sandbox.ts", why: "sandbox enablement; untagged, read by the L5 sandbox cap" },
  { module: "src/session/sessionResume.ts", why: "AMC's own session-log boundary record (instrumentation, not maturity)" },
  { module: "src/session/spill/spillLifecycle.ts", why: "AMC's own spill erasure records (instrumentation, not maturity)" },
  { module: "src/shield/exploitConfirmation.ts", why: "operator-scoped exploit confirmation workflow" },
  { module: "src/studio/signatures.ts", why: "operator re-signed AMC configuration" },
  { module: "src/studio/studioServer.ts", why: "Studio operator actions on AMC itself" },
  { module: "src/studio/studioSupervisor.ts", why: "Studio runtime lifecycle and configuration signature failures" },
  { module: "src/toolhub/toolhubJournal.ts", why: "ToolHub approval consumption and quorum rows (P1-54, moved from toolhubServer.ts); read only by score caps and penalties" },
  { module: "src/toolhub/toolhubServer.ts", why: "ToolHub approval workflow and refusals; read only by score caps and penalties" },
  { module: "src/tools/builtin/planTool.ts", why: "session plan bookkeeping (P1-43); the agent's own notes, never maturity evidence" },
  { module: "src/tools/builtin/todoTool.ts", why: "session todo bookkeeping (P1-43); the agent's own notes, never maturity evidence" },
  { module: "src/tools/builtin/webFetchTool.ts", why: "web egress decisions (P1-43); untagged, so they bind to no question" },
  { module: "src/tools/builtin/webSearchTool.ts", why: "web egress decisions (P1-43); untagged, so they bind to no question" },
  { module: "src/tools/toolEvidence.ts", why: "authorization records (P1-02) for AMC enforcement; untagged, so they bind to no question" },
  { module: "src/watch/continuousMonitor.ts", why: "score-drop alert about a prior score" },
  { module: "src/watch/observabilityBridge.ts", why: "observability ingestion; external reports are self-reported" },
  { module: "src/workspaces/workspaceRouter.ts", why: "workspace override refusal" }
];

const EMITTERS_BY_ID = new Map(EVIDENCE_EMITTERS.map((entry) => [entry.id, entry]));

export function emitterById(id: string): EmitterEntry | undefined {
  return EMITTERS_BY_ID.get(id);
}

type AdmissionRow = { event_type: string; meta: Record<string, unknown>; trustTier: TrustTier };

const TIERS_BY_CLAIM: Partial<Record<ClaimKind, ReadonlySet<TrustTier>>> = {
  observed: new Set<TrustTier>(["OBSERVED", "OBSERVED_HARDENED"]),
  self_reported: new Set<TrustTier>(["SELF_REPORTED"])
};

/** True when the row has this emitter's shape AND provenance. `trustTier` must be the effective tier (P0-18). */
export function emitterAdmits(entry: EmitterEntry, event: AdmissionRow): boolean {
  return event.event_type === entry.eventType
    && (entry.auditType === undefined || event.meta.auditType === entry.auditType)
    && (entry.metricKey === undefined || event.meta.metricKey === entry.metricKey)
    && (entry.requiresMeta === undefined || Object.hasOwn(event.meta, entry.requiresMeta))
    && producerOfMeta(event.meta) === entry.producer
    && TIERS_BY_CLAIM[entry.claimKind]?.has(event.trustTier) === true;
}

/** True when some registered emitter admits the row. Only such rows count toward L1 and above. */
export function fromRegisteredEmitter(event: AdmissionRow): boolean {
  return EVIDENCE_EMITTERS.some((entry) => emitterAdmits(entry, event));
}
