/**
 * The effective-policy receipt (P1-12): which compiled policy, controls, guards and guardrails were in force for one
 * native session, and every way the session runs below a regulated profile. Written before the session's first
 * governed tool call, and again when its guard set changes, as an `EFFECTIVE_POLICY` audit row through the session's
 * writer and as a signed artifact (`effective-policy-receipt`) under `.amc/effective-policy/`. Small on purpose:
 * control ids and digests, never the policy body. A receipt shows what AMC enforced and where; it is not a compliance
 * claim, and a receipt for one policy digest is no evidence for a session that ran another.
 */
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import YAML from "yaml";
import type { ActiveCompiledPolicy } from "../catalog/compiler/activate.js";
import type { EnforcementPoint } from "../catalog/types.js";
import { sessionGuardrailEnforcement, type Enforcement } from "../enforce/guardrailRuntimeBindings.js";
import { getAgentPaths } from "../fleet/paths.js";
import { signArtifactFile } from "../lifecycle/artifactSignature.js";
import { pathExists, readUtf8, writeFileAtomic } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import { workspaceIdFromDirectory } from "../workspaces/workspaceId.js";

export type { Enforcement };
type Binding = "tool-pipeline" | "approvals" | "egress" | "deletion-executor" | "manual";
export type PolicyDowngrade = "no_compiled_policy" | "unenforced_domain_rules";

export interface EffectivePolicyReceiptV1 {
  readonly schema: "amc.effective-policy-receipt/v1";
  readonly receiptId: string;
  readonly sessionId: string;
  readonly workspaceId: string;
  readonly agentId: string;
  readonly issuedAt: string;
  /** Digests are 64 hex. An active compiled plan is what makes the workspace a regulated profile. */
  readonly compiledPolicy: { readonly digest: string; readonly planDigest: string; readonly revision: number; readonly lockDigest: string } | null;
  readonly controls: readonly {
    readonly controlId: string;
    readonly controlVersion: string;
    readonly binding: Binding;
    readonly enforcement: Enforcement;
    readonly boundary: string | null;
    readonly review: "pending" | "approved" | "rejected" | "expired";
  }[];
  readonly guardLabels: readonly string[];
  readonly guardrails: readonly { readonly name: string; readonly enforcement: Enforcement; readonly boundary: string | null }[];
  /** Domain-apply rules from the agent's guardrails.yaml: proposals, never enforced by AMC. */
  readonly domainRules: readonly { readonly id: string; readonly enforcement: "none" }[];
  /** P1-07 removed the opt-out: STRICT_EVIDENCE_BINDING only prints a warning, so binding is always on. */
  readonly strictEvidenceBinding: { readonly enabled: true; readonly source: "default" };
  readonly downgrades: readonly PolicyDowngrade[];
  /** The lease the session's calls are bound to, accepted by the pipeline's verifier when this was written (P1-67); else null. */
  readonly leaseId: string | null;
}

const BINDING: Record<EnforcementPoint, Binding> = {
  tool_pipeline: "tool-pipeline", approvals: "approvals", egress: "egress", deletion_executor: "deletion-executor"
};
/** Where each binding is enforced today. Egress and deletion rules stay on the policy object for P2-01. */
const BOUNDARY: Record<Binding, string | null> = {
  "tool-pipeline": "tool-pipeline:guard:compiled-policy", approvals: "approvals", egress: null, "deletion-executor": null, manual: null
};
const hex = (digest: string): string => digest.replace(/^sha256:/, "");

/** Rule ids `amc domain apply` wrote: legacy `domainRules` booleans and `domainRuleProposals`. None is enforced. */
function domainRuleIds(workspace: string, agentId: string): string[] {
  const path = getAgentPaths(workspace, agentId).guardrails;
  if (!pathExists(path)) return [];
  const doc = (YAML.parse(readUtf8(path)) ?? {}) as { domainRules?: unknown; domainRuleProposals?: unknown };
  const legacy = doc.domainRules && typeof doc.domainRules === "object"
    ? Object.entries(doc.domainRules as Record<string, unknown>).filter(([, on]) => on === true).map(([id]) => id) : [];
  const proposed = Array.isArray(doc.domainRuleProposals)
    ? doc.domainRuleProposals.flatMap((row) => (typeof (row as { id?: unknown })?.id === "string" ? [(row as { id: string }).id] : [])) : [];
  return [...new Set([...legacy, ...proposed])].sort();
}

export interface ReceiptInput {
  readonly workspace: string;
  readonly sessionId: string;
  readonly agentId: string;
  readonly policy: ActiveCompiledPolicy | null;
  readonly guardLabels: readonly string[];
  /** A verified lease id only; the caller verifies (P1-67). */
  readonly leaseId?: string | null;
}

export function buildEffectivePolicyReceipt(input: ReceiptInput): EffectivePolicyReceiptV1 {
  const { policy } = input;
  const controls = (policy?.controls ?? []).flatMap((control) =>
    (control.points.length > 0 ? control.points : [null]).map((point) => {
      const binding = point === null ? "manual" : BINDING[point];
      const boundary = point !== null && control.compiledPoints.includes(point) ? BOUNDARY[binding] : null;
      return { controlId: control.controlId, controlVersion: control.controlVersion, binding,
        enforcement: boundary === null ? "none" as const : "enforced" as const, boundary, review: control.review };
    }));
  const domainRules = domainRuleIds(input.workspace, input.agentId).map((id) => ({ id, enforcement: "none" as const }));
  const approvalRequired = (policy?.runtimePolicy.toolPipeline.approvalRequiredFor.length ?? 0) > 0;
  return {
    schema: "amc.effective-policy-receipt/v1",
    receiptId: `epr_${randomUUID()}`,
    sessionId: input.sessionId,
    workspaceId: workspaceIdFromDirectory(input.workspace),
    agentId: input.agentId,
    issuedAt: new Date().toISOString(),
    compiledPolicy: policy ? { digest: hex(policy.runtimePolicy.policyDigest), planDigest: hex(policy.planDigest),
      revision: policy.revision, lockDigest: hex(policy.lockDigest) } : null,
    controls,
    guardLabels: [...input.guardLabels],
    guardrails: sessionGuardrailEnforcement(input.workspace, { guardLabels: input.guardLabels, approvalRequired }),
    domainRules,
    strictEvidenceBinding: { enabled: true, source: "default" },
    downgrades: [...(policy ? [] : ["no_compiled_policy" as const]), ...(domainRules.length > 0 ? ["unenforced_domain_rules" as const] : [])],
    leaseId: input.leaseId ?? null
  };
}

/**
 * Builds the receipt, signs it as an artifact, then records it as an `EFFECTIVE_POLICY` audit row through `record`,
 * which returns the row's evidence event id when the writer reports one. Any failure throws: the caller fails closed.
 */
export function writeEffectivePolicyReceipt(input: ReceiptInput & { readonly record: (row: Record<string, unknown>) => string | null }):
  { readonly receipt: EffectivePolicyReceiptV1; readonly evidenceRef: string } {
  const receipt = buildEffectivePolicyReceipt(input);
  const path = join(input.workspace, ".amc", "effective-policy", `${receipt.receiptId}.json`);
  const text = `${JSON.stringify(receipt, null, 2)}\n`;
  writeFileAtomic(path, text, 0o644);
  signArtifactFile({ workspace: input.workspace, path, artifactKind: "effective-policy-receipt" });
  const eventId = input.record({ auditType: "EFFECTIVE_POLICY", ...receipt, artifactSha256: sha256Hex(text) });
  return { receipt, evidenceRef: eventId ?? `effective-policy-receipt:${receipt.receiptId}` };
}
