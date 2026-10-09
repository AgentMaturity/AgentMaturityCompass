/**
 * The applicability compiler's contract (P1-10; docs/catalog/COMPILER.md): a deployment profile plus the catalog in,
 * a plan out (requirement decisions with reasons, an effective runtime policy and an evidence plan). Experimental:
 * a plan is evidence of conformity planning, never a compliance claim.
 */
import { z } from "zod";
import type { SignedDigest } from "../../crypto/signing/signerTypes.js";
import { validateStationScope } from "../../domains/stations.js";
import { LEGACY_OPERATING_PROFILE_SCHEMA_VERSION, OPERATING_PROFILE_SCHEMA_VERSION } from "../../domains/operatingProfiles/operatingProfileTypes.js";
import type { ActionClass } from "../../types.js";
import type { TrustContext } from "../../trust/trustContext.js";
import type { CatalogLockfile } from "../lockfile.js";
import type { LoadedCatalog } from "../loader.js";
import { STATIONS } from "../schema.js";
import type { BindingField, FactName, MergeComparator, MergeValue, Strictness, SupportLevel, TestType } from "../types.js";
import type { EffectiveMergeRule } from "./mergeStations.js";
import { stationMergeExceptionSchema, type ExceptionRejection } from "./stationException.js";

/** A compile refusal; `code` is stable (docs/catalog/COMPILER.md lists every code). */
export class CompileError extends Error {
  constructor(readonly code: string, message: string) {
    super(`${code}: ${message}`);
  }
}

export type FactProvenance = "asserted" | "observed" | "reviewed";
export interface Fact<T> {
  value: T | null;                      // null means unknown; never guess
  provenance: FactProvenance;
  source: string;                       // file path, evidence ref or reviewer id
  reviewedBy: { reviewer: string; date: string } | null;   // set exactly when provenance = "reviewed"
}
export type ParamValue = string | number | boolean | string[];

const text = z.string().min(1);
const term = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.-]*$/, "must be a vocabulary-style term");
const sha256 = z.string().regex(/^[0-9a-f]{64}$/, "must be 64 lowercase hex");
const fact = <T extends z.ZodType>(value: T) => z.strictObject({
  value: value.nullable(),
  provenance: z.enum(["asserted", "observed", "reviewed"]),
  source: text,
  reviewedBy: z.strictObject({ reviewer: text, date: z.iso.date() }).nullable()
}).refine((f) => (f.provenance === "reviewed") === (f.reviewedBy !== null), "reviewedBy is set exactly when provenance is reviewed");
const station = z.enum(STATIONS);

export const reviewerExceptionSchema = z.strictObject({
  id: term,
  controlId: text,
  parameter: text.nullable(),           // null = the whole control is excluded
  value: z.union([z.string(), z.number().int(), z.boolean(), z.array(z.string())]).nullable(),
  reason: text,
  approver: z.strictObject({ userId: text, role: text }),
  approvalRequestId: text,              // the signed decision in the approval engine; the plan's review covers it
  expiresAt: z.union([z.iso.date(), z.iso.datetime({ offset: true })])
});
export type ReviewerException = z.infer<typeof reviewerExceptionSchema>;

/** Strict: an unknown key, fact or station fails closed. */
export const deploymentProfileSchema = z.strictObject({
  profileVersion: z.literal(1),
  profileId: term,                      // also a path segment of the default output directory
  deployment: z.strictObject({ tenantId: text, workspaceId: text, deploymentId: text, agentIds: z.array(text).min(1) }),
  primaryStation: fact(station),
  stations: fact(z.array(station).min(1)),   // includes primaryStation
  domains: fact(z.array(term)),
  jurisdictions: fact(z.array(term)),
  roles: fact(z.array(term)),           // provider, deployer, distributor, vendor
  entityTypes: fact(z.array(term)),
  riskClass: fact(term),
  useCases: fact(z.array(term)),
  dataClasses: fact(z.array(term)),
  euRoleRecord: z.strictObject({ ref: text, sha256 }).nullable(),   // design rule 4: artifacts, not flags
  art63Record: z.strictObject({ ref: text, sha256 }).nullable(),
  operatingProfile: z.strictObject({
    path: text, sha256, schemaVersion: z.enum([OPERATING_PROFILE_SCHEMA_VERSION, LEGACY_OPERATING_PROFILE_SCHEMA_VERSION])
  }).nullable(),
  exceptions: z.array(reviewerExceptionSchema),
  mergeExceptions: z.array(stationMergeExceptionSchema).optional()
}).superRefine((p, ctx) => {
  if (p.primaryStation.value !== null && p.stations.value !== null) {
    for (const message of validateStationScope({ primary: p.primaryStation.value, stations: p.stations.value })) {
      ctx.addIssue({ code: "custom", path: ["stations"], message });
    }
  }
  const ids = p.exceptions.map((e) => e.id);
  if (new Set(ids).size !== ids.length) ctx.addIssue({ code: "custom", path: ["exceptions"], message: "exception ids must be unique" });
  const mergeIds = (p.mergeExceptions ?? []).map((e) => e.id);
  if (new Set(mergeIds).size !== mergeIds.length) ctx.addIssue({ code: "custom", path: ["mergeExceptions"], message: "merge exception ids must be unique" });
});
export type DeploymentProfile = z.infer<typeof deploymentProfileSchema>;

/**
 * `asOf` (ISO time) decides which reviewer exceptions have expired: the caller reads the clock, the compiler never
 * does. The previous plan is not an input: diffs and the weakening check run at signing (sign.ts).
 */
export interface CompileInput {
  profile: DeploymentProfile; catalog: LoadedCatalog; asOf: string;
  /** Operator-loaded pins at asOf, never a trust list supplied by the profile. Missing pins reject exceptions. */
  mergeExceptionTrust?: TrustContext;
}

export type Applicability = "applicable" | "not_applicable" | "unresolved";
export interface RequirementDecision {
  controlId: string; controlVersion: string; controlDigest: string; layer: 0 | 1 | 2 | 3;
  applicability: Applicability;
  reasons: string[];                    // each matched or failed clause with fact value and provenance
  missingFacts: FactName[];             // set when unresolved
  exclusion: { reason: string; source: "predicate" | "reviewer_exception"; exceptionId: string | null } | null;
  citationsInScope: string[];           // citation keys whose appliesWhen is true
  mandatory: boolean; support: SupportLevel;
  pulledInBy: string[];                 // "layer0", "station:wealth", "jurisdiction:US", "profile:<pack>"
}
export interface Conflict {
  parameter: string; controlIds: string[]; values: Array<ParamValue | MergeValue>;
  strictness: Strictness | MergeComparator;
  resolution: "stricter_applied" | "reviewer_exception" | "unresolved";
  appliedValue: ParamValue | MergeValue | null; exceptionId: string | null;
  mergeKey?: string;
  candidates?: Array<{ controlId: string; stations: string[]; value: MergeValue }>;
  chosenControlId?: string | null;
  exceptionRejected?: ExceptionRejection[];
  reason?: string;
}
export interface UnsupportedControl {
  controlId: string;
  reason: "enforcement_point_absent" | "producer_planned" | "manual_owner_unassigned" | "retired";
  detail: string;
}
export interface ApprovalRule { requiredApprovals: number; requireDistinctUsers: boolean; rolesAllowed: string[]; ttlMinutes: number; controlIds: string[] }
export interface EffectiveRuntimePolicy {
  toolPipeline: { visibleTools: string[]; approvalRequiredFor: ActionClass[];
                  guards: Array<{ id: string; params: Record<string, ParamValue>; controlIds: string[] }> };
  approvals: Partial<Record<ActionClass, ApprovalRule>>;
  egress: { mode: "deny_by_default"; allowHosts: string[];
            processorAllowlist: Array<{ host: string; dataClasses: string[]; basis: string }>; controlIds: string[] };
  deletion: { unknownHold: "deny"; retentionDays: Record<string, number>; controlIds: string[] };
  proposedSignedConfigs: { approvalPolicy: unknown; budgets: unknown; tools: unknown;
                           actionPolicy: unknown; firewall: unknown; opsPolicy: unknown };
  policyDigest: string;
}
export interface EvidencePlan {
  tests: Array<{ controlId: string; testId: string; type: TestType; attempts: number; fixtures: string[]; runOn: string[] }>;
  evidenceRequests: Array<{ controlId: string; contractId: string; producer: string;
                            bindingFields: BindingField[]; maxAgeDays: number; sampling: string }>;
  manualDuties: Array<{ controlId: string; duty: string; ownerRole: string; cadence: string; evidenceOfPerformance: string }>;
  releaseGates: Array<{ controlId: string; testId: string; blocking: boolean }>;
}
export interface CompiledPlan {
  planVersion: 1;
  compiler: { name: "amc-catalog-compiler"; version: string };
  profile: { profileId: string; sha256: string; factProvenance: Record<FactName, FactProvenance | "unknown"> };
  lock: CatalogLockfile;                // P1-09's lock: pins catalog and sources
  status: "ready" | "blocked";          // blocked: unresolved conflict or unresolved mandatory control
  requirements: RequirementDecision[];  // sorted by controlId
  conflicts: Conflict[];
  effectiveMergeRules?: EffectiveMergeRule[];
  mergeExceptionRejected?: ExceptionRejection[];
  unsupported: UnsupportedControl[];
  crosswalkLinks: Array<{ controlId: string; framework: string; clause: string; relation: string }>;  // informational
  runtimePolicy: EffectiveRuntimePolicy;
  evidencePlan: EvidencePlan;
  digest: string;                       // digestOf(the plan without `digest`); compiledAt, diff and signature sit outside
}
export interface PlanDiff {
  previousDigest: string;
  requirements: Array<{ controlId: string; change: "added" | "removed" | "applicability" | "version"; before: string | null; after: string | null; reason: string }>;
  runtimePolicy: Array<{ path: string; before: unknown; after: unknown }>;
  evidencePlan: Array<{ path: string; before: unknown; after: unknown }>;
  conflicts?: Array<{ path: string; before: unknown; after: unknown }>;
  mergeRules?: Array<{ path: string; before: unknown; after: unknown }>;
  mergeExceptionRejected?: Array<{ path: string; before: unknown; after: unknown }>;
}
export interface SignedPlan {
  plan: CompiledPlan; compiledAt: string;
  diff: PlanDiff | null;
  signature: SignedDigest;              // CONTROL_PLAN over plan.digest
  review: { status: "pending" | "approved" | "rejected"; approvalRequestId: string | null };
}
