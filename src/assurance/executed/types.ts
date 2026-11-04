/** Unexecuted proposal. Public spec records are separate from synthetic fixture diagnostics. */
import type { AgentResponder, AgentToolDefinition } from "../agentResponder.js";

export type OracleKind = "enforcement_receipt" | "system_of_record" | "external_observer" | "ledger_state" | "signed_config" | "human_assessor";
export interface ExecutedScenario {
  id: string;
  packId: string;
  controlIds: string[];
  fixture: { environment: string; seed: string };
  task: string;
  attempts: number;
  oracle: { id: string; kind: OracleKind };
  passCriteria: { maxUnauthorizedEffects: 0; maxAttackSuccessRate: number | null };
  benignControl: string | null;
  judged: { judgeId: string; calibrationId: string } | null;
}
export interface ExecutedScenarioResult {
  scenarioId: string;
  attempts: number;
  unauthorizedEffects: number;
  attackSuccessRate: number | null;
  benignControlPassed: boolean | null;
  outcome: "pass" | "fail" | "not_evaluated";
  evidence: Array<{ kind: "ledger_event" | "receipt" | "system_of_record"; id: string; sha256: string }>;
}
export type Family = "cold-chain" | "clinical-trials" | "ferpa" | "phi" | "model-risk" | "recall-sulphur";
export type Objective = "cold-chain-release" | "clinical-trial-state" | "clinical-consent" | "clinical-event-safety" | "ferpa-access" | "phi-boundaries" | "model-risk-state" | "recall-closure" | "sulphur-use";
/** Constructed by the source-owned registry, never from responder/tool JSON. */
export interface CompiledScenario {
  scenario: ExecutedScenario;
  family: Family;
  objective: Objective;
  controlId: string;
  controlVersion: string;
  expectation: "complete" | "deny_unsafe";
  requiredOperations: ReadonlyArray<{ operation: string; resourceId: string; arguments?: Record<string, unknown> }>;
}
export interface Binding {
  tenantId: string; workspaceId: string; deploymentId: string; agentId: string;
  controlId: string; controlVersion: string; policyDigest: string; runId: string;
  attemptId: string; fixtureDigest: string;
}
export interface Effect {
  binding: Binding; sequence: number; operation: string; resourceId: string; at: string;
  outcome: "committed" | "denied"; payload?: string; endpointId?: string; channel?: string; purposeId?: string;
}
export interface SignedRecord { body: string; signature: string }
interface Lot {
  id: string; samples: Array<{ at: string; temperature: number }>;
  dispositionId: string | null; quarantined: boolean;
}
interface ColdState { kind: "cold-chain"; lots: Lot[]; released: string[] }
interface ClinicalState {
  kind: "clinical-trials"; jurisdiction: string; protocolVersion: string;
  participants: Array<{ id: string; consentVersion: string | null }>;
  reports: Array<{ id: string; triggerAt: string; reportedAt: string }>;
  corrections: SignedRecord[];
}
interface FerpaState {
  kind: "ferpa"; principalId: string; institutionId: string; role: "registrar" | "student";
  records: Array<{ id: string; institutionId: string; studentId: string }>;
  exports: Array<{ recordId: string; recipientInstitutionId: string; exceptionId: string | null; at: string; purpose?: string }>;
}
interface PhiState { kind: "phi"; marker: string; registeredBoundaries: string[] }
interface ModelState {
  kind: "model-risk"; inputs: { a: number; b: number; drift: number } | null;
  decisions: Array<{ value: number; reasonSources: string[];
    usedInputs?: Array<{ id: string; value: number; sha256: string }>;
    reasonLinks?: Array<{ inputId: string; inputSha256: string }> }>; alarms: string[];
}
interface RecallState {
  kind: "recall-sulphur"; variant: "recall"; lots: string[]; edges: Array<[string, string]>;
  affectedIngredientId: string; recalled: string[];
}
interface SulphurState {
  kind: "recall-sulphur"; variant: "sulphur"; boundaryVersion: string | null;
  uses: Array<{ voyageId: string; at: string; sulphurPercent: number; zoneId: string;
    boundaryVersion: string | null; exceptionId: string | null }>;
}
export type State = ColdState | ClinicalState | FerpaState | PhiState | ModelState | RecallState | SulphurState;
export interface Capture { binding: Binding; now: string; policyId: string; effects: Effect[]; state: State }
/** Held outside effect records and model-controlled arguments. All values are synthetic and unreviewed. */
export interface FixturePolicy {
  family: Family; objective: Objective; id: string; authorityPublicKey: string;
  initialState: State; initialStateSha256: string; fixtureDigest: string; now: string; scenarioDigest: string; rulesSha256: string; executionSeed: string;
  fixture: { environment: string; seed: string };
  signedRecords: ReadonlyMap<string, SignedRecord>;
  cold: { min: number; max: number; maxAgeMs: number; authorizedActors: readonly string[] };
  trial: { jurisdiction: string; deadlineMs: number; initialHeads: ReadonlyMap<string, string>;
    authorizedActors: readonly string[]; requiredEvents: ReadonlyMap<string, string>; requiredCorrections: readonly string[] };
  exceptions: ReadonlyMap<string, { institutionId: string; recipientInstitutionId: string; recordId: string; expiresAt: string }>;
  endpoints: ReadonlyMap<string, { contractId: string | null }>;
  semantic: {
    minimum: { purposeId: string; fields: Array<{ id: string; value: string; dataClass: string }>;
      requiredFields: string[]; allowedFields: string[] | null; allowedDataClasses: string[] | null } | null;
    ferpa: { allowedPurposes: string[] | null } | null;
    model: { inputIds: string[] } | null;
    sulphur: { exceptionAuthorityKnown: boolean } | null;
  };
  modelAnswer: { value: number; reasonSources: string[]; driftThreshold: number };
  boundaries: ReadonlyMap<string, { from: string; until: string; zoneId: string; maxSulphurPercent: number }>;
}
export interface OracleResult {
  outcome: "pass" | "fail" | "not_evaluated";
  unauthorizedEffects: number; reasons: string[]; decisiveSequences: number[];
}
export interface Fixture {
  claimAttempt(): void;
  readonly tools: AgentToolDefinition[];
  snapshotPolicy(): FixturePolicy;
  dispatch(call: { toolName: string; arguments: Record<string, unknown> }): void;
  capture(): Capture;
}
export interface Attempt {
  binding: Binding; outcome: OracleResult["outcome"]; unauthorizedEffects: number;
  reasons: string[]; invocationComplete: boolean; capture: Capture | null; policy: Record<string, unknown> | null; claimKind: "synthetic_example";
}
export interface SeedContext { seed: string; now: string; scope: Omit<Binding, "attemptId" | "fixtureDigest"> }
export type Responder = Pick<AgentResponder, "respond" | "target">;
export interface SeededScenarioRun {
  result: ExecutedScenarioResult;
  claimKind: "synthetic_example";
  regulatedEligible: false;
  localOutcome: OracleResult["outcome"];
  completedAttempts: number;
  conclusiveAttempts: number;
  fixtureAttemptRate: number | null;
  fixtureWilson95: [number, number] | null;
  reasons: string[];
  attemptResults: Attempt[];
  benignAttemptResults: Attempt[];
}
