import type { ActionClass } from "../../types.js";
import type { ReceiptKind } from "../../receipts/receipt.js";
import type { Domain } from "../domainRegistry.js";
import type { IndustryPack } from "../industryPacks.js";

/**
 * A regulated-agent blueprint: the agent definition an operator reviews and
 * signs BEFORE the agent's first turn. It is a design-time artifact, derived
 * from an industry pack (or a whole station), and it never grants anything by
 * itself: registration into `.amc/agents.yaml` is a separate, signed step, and
 * every runtime gate (approval policy, action policy, budgets, tool allowlist)
 * still applies to whatever the operator registers.
 */

export type RiskTier = IndustryPack["riskTier"];

export interface BlueprintGuardrail {
  /** Stable id: `<packId>:<questionId>`. */
  readonly id: string;
  /** The rule as it appears in the role prompt. Always contains the question id. */
  readonly text: string;
  readonly derivedFrom: {
    readonly packId: string;
    readonly questionId: string;
    readonly dimension: string;
    readonly regulatoryRef: string;
  };
}

export interface GuardrailSelection {
  readonly mode: "all-questions" | "top-weighted-per-pack";
  readonly perPack: number | null;
  /** Question ids the station-level selection left out, so nothing is silent. */
  readonly omittedQuestionIds: readonly string[];
}

export interface BlueprintToolScope {
  readonly classes: readonly ActionClass[];
  /** Tool-name patterns the operator intends to allow. Empty until the operator fills it. */
  readonly allowlist: readonly string[];
  readonly allowlistNote: string;
}

export interface BlueprintApprovals {
  /** Classes in scope whose default approval policy requires at least one approver. */
  readonly gatedClasses: readonly ActionClass[];
  readonly requiredApprovals: number;
  readonly requireDistinctUsers: boolean;
  readonly rolesAllowed: readonly string[];
  readonly ttlMinutes: number;
  /** Classes whose default action policy sets `requireExecTicket: true`. */
  readonly requireExecTicketFor: readonly ActionClass[];
}

export interface BlueprintBudget {
  readonly basis: string;
  readonly daily: {
    readonly maxLlmRequests: number;
    readonly maxLlmTokens: number;
    readonly maxCostUsd: number;
    readonly maxToolExecutes: Readonly<Record<ActionClass, number>>;
  };
}

export interface BlueprintEvidence {
  readonly receipts: readonly ReceiptKind[];
  readonly binderSections: readonly string[];
}

export interface BlueprintSource {
  readonly title: string;
  readonly url: string | null;
  readonly retrievedAt: string | null;
  /** Always false here: the render cites the pack, it does not retrieve primary text. */
  readonly verified: false;
  readonly reason: string;
  readonly citedBy: readonly string[];
}

export interface BlueprintProfile {
  readonly source: "pack-risk-tier" | "station-profile-source";
  readonly tier: RiskTier;
  readonly ruleId: string;
  readonly forbiddenClasses: readonly ActionClass[];
  /** Classes the default budget zero-quotas; forbidden in every station. */
  readonly zeroQuotaClasses: readonly ActionClass[];
}

export interface AgentBlueprint {
  readonly schemaVersion: 1;
  readonly station: Domain;
  readonly packId?: string;
  readonly name: string;
  readonly purpose: string;
  /** Pack `keyRisks`, verbatim. Not guardrails: they cite no question. */
  readonly riskStatements: readonly string[];
  /** Pack `euAIActClassification` strings, deduped. */
  readonly classification: readonly string[];
  readonly profile: BlueprintProfile;
  readonly guardrails: readonly BlueprintGuardrail[];
  readonly guardrailSelection: GuardrailSelection;
  readonly toolScope: BlueprintToolScope;
  readonly approvals: BlueprintApprovals;
  readonly budget: BlueprintBudget;
  readonly requiredAssurancePacks: readonly string[];
  readonly evidence: BlueprintEvidence;
  readonly sources: readonly BlueprintSource[];
  readonly renderedFrom: { readonly packIds: readonly string[]; readonly questionCount: number };
}

export interface BlueprintRequest {
  readonly station: string;
  readonly packId?: string;
  readonly name?: string;
  readonly purpose?: string;
  readonly toolClasses?: readonly ActionClass[];
  readonly allowlist?: readonly string[];
  readonly approvals?: Partial<Pick<BlueprintApprovals, "requiredApprovals" | "requireDistinctUsers" | "rolesAllowed" | "ttlMinutes">>;
}

export interface BlueprintRefusal {
  readonly rule: string;
  readonly message: string;
}

export type BlueprintVerdict =
  | { readonly ok: true }
  | { readonly ok: false; readonly refusals: readonly BlueprintRefusal[] };

export class BlueprintRefusedError extends Error {
  readonly refusals: readonly BlueprintRefusal[];

  constructor(refusals: readonly BlueprintRefusal[]) {
    super(`blueprint refused by ${refusals.length} rule(s): ${refusals.map((refusal) => `${refusal.rule} -- ${refusal.message}`).join("; ")}`);
    this.name = "BlueprintRefusedError";
    this.refusals = refusals;
  }
}
