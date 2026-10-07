/**
 * The Regulated Control Catalog record format (P1-09). The zod schemas in schema.ts infer to exactly these types; a
 * compile-time check there fails the build when they drift. docs/catalog/CONTROL_RECORD.md describes every field.
 *
 * Citations are law as data: they carry the P0-25 citation-record fields (src/compliance/citations/citationRecord.ts)
 * and reuse its status-type vocabulary, so there is one spelling of each status type in AMC.
 */
import type { CitationStatusType } from "../compliance/citations/citationRecord.js";
import type { Domain as Station } from "../domains/domainRegistry.js";

export type { CitationStatusType, Station };
export type SupportLevel = "experimental" | "reviewed" | "qualified" | "retired";
export type Level = "L1" | "L2" | "L3" | "L4" | "L5";
export type EnforcementPoint = "tool_pipeline" | "approvals" | "egress" | "deletion_executor";
export type TestType = "runtime_enforced" | "executed_adversarial" | "drill"
  | "configuration_check" | "document_review";
export type OracleKind = "enforcement_receipt" | "system_of_record" | "external_observer"
  | "ledger_state" | "signed_config" | "human_assessor";
export type Strictness = "max" | "min" | "true_wins" | "union" | "intersection" | "none";
export type InvalidationTrigger = "model_version" | "prompt_version" | "tool_version"
  | "corpus_version" | "policy_version" | "deployment_version";
export type FactName = "stations" | "primaryStation" | "domains" | "jurisdictions" | "roles"
  | "entityTypes" | "riskClass" | "useCases" | "dataClasses";
export type Predicate =
  | { always: true }
  | { all: Predicate[] } | { any: Predicate[] } | { not: Predicate }
  | { fact: FactName; includesAny: string[] }
  | { fact: FactName; includesAll: string[] }
  | { fact: FactName; equals: string };
export type BindingField = "tenantId" | "workspaceId" | "deploymentId" | "agentId" | "principalId"
  | "sessionId" | "subjectId" | "resourceId" | "controlId" | "controlVersion" | "policyDigest" | "producerId";

export interface Citation {
  key: string;                          // unique within the control
  registerId: string | null;            // S5 register entry id, when one exists
  instrument: string;
  clause: string;
  edition: string;
  jurisdiction: string;                 // vocabulary term: "US", "US-NY", "EU", "IN", ...
  statusType: CitationStatusType;
  superseded: { by: string; on: string } | null;   // historical citations only
  effectiveDate: string | null;         // YYYY-MM-DD
  complianceDueDate: string | null;     // YYYY-MM-DD, kept separate from effectiveDate
  dateNote: string | null;              // required when either date is null (P0-25 rule)
  url: string;                          // https, allowlisted host
  retrieval: { state: "verified"; retrievedAt: string; contentSha256: string }
    | { state: "unverified"; reason: string };
  appliesWhen: Predicate | null;        // e.g. HIPAA only for covered entities
  legalReview: { reviewer: string; credential: string; date: string } | null;
  note: string | null;
}
export interface Binding {
  kind: "enforcement_point" | "manual";
  points: EnforcementPoint[];           // non-empty if and only if kind = enforcement_point
  mechanism: string;
  parameters: Array<{ name: string; value: string | number | boolean | string[]; strictness: Strictness }>;
  manualDuty: { duty: string; ownerRole: string; cadence: string; evidenceOfPerformance: string } | null;
}
export interface ControlTest {
  id: string;
  type: TestType;
  oracle: { kind: OracleKind; observes: string };
  fixtures: { positive: string[]; negative: string[] };   // paths relative to catalog/fixtures/
  passCriteria: string;
  attempts: number;                     // >= 1; executed_adversarial >= 25
}
export interface EvidenceContract {
  id: string;
  producer: string;                     // id in catalog/producers.yaml
  bindingFields: BindingField[];        // must include controlId and one scope field
  freshness: { maxAgeDays: number };
  sampling: { method: "all" | "random" | "stratified"; ratePercent: number | null; minItems: number | null };
  retention: { mode: "regime_max" } | { mode: "fixed"; days: number; basis: string };
  residency: { mode: "inherit_deployment" } | { mode: "pinned"; regions: string[]; basis: string };
}
export interface ControlRecord {
  id: string;                           // /^L[0-3](-[A-Z0-9]{2,8}){1,2}-[0-9]{2,3}$/
  version: string;                      // semver
  support: SupportLevel;
  layer: 0 | 1 | 2 | 3;
  family: string | null;
  stations: Station[];                  // at least one; Layer 0 lists all seven
  title: string;
  statement: string;                    // one testable sentence
  riskRationale: string;
  mandatory: boolean;
  applicability: { predicate: Predicate; reasons: string[]; exclusions: Array<{ when: Predicate; reason: string }> };
  citations: Citation[];
  binding: Binding;
  tests: ControlTest[];
  evidence: EvidenceContract[];
  invalidatedBy: InvalidationTrigger[];
  owner: { role: string };              // vocabulary: ciso, dpo, senior_manager, head_of_qa, ...
  clock: { clockId: string; deadline: { amount: number; unit: "hours" | "calendarDays" | "workDays" | "months" } } | null;
  levels: Level[];
  crosswalk: Array<{ framework: string; clause: string; relation: "equivalent" | "partial" | "conflicting"; rationale: string }>;
  review: { status: "pending" | "approved" | "rejected" | "expired"; expert: string | null; credential: string | null;
            reviewedAt: string | null; nextReview: string | null };
  provenance: { draftedBy: "human" | "ai"; draftedAt: string; approvedBy: string | null };
}
export interface PackManifest {
  id: string; version: string; layer: 0 | 1 | 2 | 3; title: string;
  stations: Station[]; jurisdictions: string[];
  compilerCompat: string;               // semver range
  publisher: string; maintainers: Array<{ name: string; role: string }>;
  licence: string;                      // SPDX id: "MIT" until D-04, then its decision
  support: SupportLevel;                // declared; P1-33 gates it
  controls: string[];
  stewardship: { partner: string | null; updatePlan: string | null; triageTargetDays: number | null; coverageDoc: string | null };
}
export interface ProducerRecord {
  id: string;                           // "amc.leases.issuer"
  module: string;                       // emitting source path
  emits: string[];                      // event types, audit types or receipt kinds
  maxClaimKind: "observed" | "self_reported" | "synthetic_example";
  status: "available" | "planned";
  plannedBy: string | null;             // plan key when planned, e.g. "P1-02"
}
export interface FixtureEnvelope {
  fixtureVersion: 1;
  controlId: string;
  polarity: "positive" | "negative";
  evidenceClass: "valid" | "violation" | "stale" | "replayed" | "contradictory" | "cross_tenant" | "empty"
    | "unknown_authority" | "unknown_hold" | "unknown_residency" | "unknown_applicability";
  setup: Record<string, unknown>;       // read by the harness for the binding point
  expected: { result: "allow" | "deny" | "pass" | "fail" | "not_evaluated"; reasonCode: string | null };
}
