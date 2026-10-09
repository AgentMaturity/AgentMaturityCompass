/**
 * Zod schemas for every catalog file (P1-09). Objects are strict: an unknown key fails. Rules a shape cannot state are
 * refinements that carry their own issue code (`CAT_SUPPORT_GATE`); every other failure is `CAT_SCHEMA`. Numbers are
 * integers everywhere, so a non-JS verifier can reproduce the digests (canonicalize is not RFC 8785).
 */
import semver from "semver";
import { z } from "zod";
import { CITATION_STATUS_TYPES } from "../compliance/citations/citationRecord.js";
import { validateStationScope } from "../domains/stations.js";
import type {
  Binding, Citation, ControlRecord, ControlTest, EvidenceContract, FactName, FixtureEnvelope, PackManifest, Predicate,
  ProducerRecord, Station
} from "./types.js";

export interface CatalogIssue {
  code: string;
  severity: "error" | "warning";
  file: string;
  controlId: string | null;
  path: string;
  message: string;
}

export const STATIONS = ["education", "environment", "health", "wealth", "technology", "mobility", "governance"] as const satisfies readonly Station[];
export const FACT_NAMES = ["stations", "primaryStation", "domains", "jurisdictions", "roles", "entityTypes", "riskClass", "useCases", "dataClasses"] as const satisfies readonly FactName[];
const SCOPE_FIELDS = ["tenantId", "workspaceId", "deploymentId", "agentId"] as const;
const CONTROL_ID = /^L[0-3](-[A-Z0-9]{2,8}){1,2}-[0-9]{2,3}$/;
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(-[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?$/;

const text = z.string().min(1);
const isoDate = z.iso.date();
const int = z.number().int();
const version = z.string().regex(SEMVER, "must be a semver version");
const station = z.enum(STATIONS);
const layer = z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]);
const supportLevel = z.enum(["experimental", "reviewed", "qualified", "retired"]);
const term = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.-]*$/, "must be a vocabulary term");

export const crossStationProfileSchema = z.strictObject({
  id: term, name: text, primary: station, stations: z.array(station).min(2),
  exampleAgents: z.array(text).min(1), adds: text
}).superRefine((p, ctx) => {
  for (const message of validateStationScope(p, { minStations: 2 })) flag(ctx, "CAT_SCHEMA", ["stations"], message);
});
export const crossStationProfilesSchema = z.array(crossStationProfileSchema).superRefine((profiles, ctx) => {
  unique(ctx, profiles.map((p) => p.id), [], "profile id", "CAT_DUPLICATE_ID");
});

export const controlMergeSchema = z.strictObject({
  key: term,
  comparator: z.enum(["duration-max", "duration-min", "count-min", "enum-order", "boolean-required"]),
  value: z.union([text, int.min(0), z.boolean(), z.strictObject({
    amount: int.min(1), unit: z.enum(["hours", "calendarDays", "workDays", "months"])
  })]),
  order: z.array(text).min(1).optional()
}).superRefine((m, ctx) => {
  const duration = typeof m.value === "object";
  if (m.comparator.startsWith("duration-") && !duration) flag(ctx, "CAT_SCHEMA", ["value"], "duration comparisons need a ClockDuration");
  if (m.comparator === "count-min" && typeof m.value !== "number") flag(ctx, "CAT_SCHEMA", ["value"], "count-min needs a non-negative integer");
  if (m.comparator === "boolean-required" && typeof m.value !== "boolean") flag(ctx, "CAT_SCHEMA", ["value"], "boolean-required needs a boolean");
  if (m.comparator === "enum-order") {
    if (typeof m.value !== "string" || !m.order?.includes(m.value)) flag(ctx, "CAT_SCHEMA", ["value"], "enum-order needs a value in its weakest-first order");
    unique(ctx, m.order ?? [], ["order"], "enum value");
  } else if (m.order !== undefined) flag(ctx, "CAT_SCHEMA", ["order"], "order is only valid for enum-order");
});

/** Adds a refinement issue that keeps its own catalog code. */
function flag(ctx: z.RefinementCtx, code: string, path: PropertyKey[], message: string): void {
  ctx.addIssue({ code: "custom", path, message, params: { code } });
}

function unique(ctx: z.RefinementCtx, values: readonly string[], path: PropertyKey[], what: string, code = "CAT_SCHEMA"): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) flag(ctx, code, path, `duplicate ${what} "${value}"`);
    seen.add(value);
  }
}

/** The seven operators of the applicability grammar (ADR-011). Evaluation is P1-10's; this is shape only. */
export const predicateSchema: z.ZodType<Predicate> = z.lazy(() => z.union([
  z.strictObject({ always: z.literal(true) }),
  z.strictObject({ all: z.array(predicateSchema).min(1) }),
  z.strictObject({ any: z.array(predicateSchema).min(1) }),
  z.strictObject({ not: predicateSchema }),
  z.strictObject({ fact: z.enum(FACT_NAMES), includesAny: z.array(term).min(1) }),
  z.strictObject({ fact: z.enum(FACT_NAMES), includesAll: z.array(term).min(1) }),
  z.strictObject({ fact: z.enum(FACT_NAMES), equals: term })
])).meta({ id: "predicate", title: "Applicability predicate" });

export const citationSchema = z.strictObject({
  key: term,
  registerId: text.nullable(),
  instrument: text,
  clause: text,
  edition: text,
  jurisdiction: term,
  statusType: z.enum(CITATION_STATUS_TYPES),
  superseded: z.strictObject({ by: text, on: isoDate }).nullable(),
  effectiveDate: isoDate.nullable(),
  complianceDueDate: isoDate.nullable(),
  dateNote: text.nullable(),
  url: text,
  retrieval: z.discriminatedUnion("state", [
    z.strictObject({ state: z.literal("verified"), retrievedAt: isoDate, contentSha256: z.string().regex(/^[0-9a-f]{64}$/, "must be 64 lowercase hex") }),
    z.strictObject({ state: z.literal("unverified"), reason: text })
  ]),
  appliesWhen: predicateSchema.nullable(),
  legalReview: z.strictObject({ reviewer: text, credential: text, date: isoDate }).nullable(),
  note: text.nullable()
}).superRefine((c, ctx) => {
  if (c.effectiveDate && c.complianceDueDate && c.complianceDueDate < c.effectiveDate) {
    flag(ctx, "CAT_SCHEMA", ["complianceDueDate"], "complianceDueDate is before effectiveDate");
  }
  if ((c.effectiveDate === null || c.complianceDueDate === null) && c.dateNote === null) {
    flag(ctx, "CAT_SCHEMA", ["dateNote"], "dateNote is required when a date is null (P0-25 citation record)");
  }
});

export const bindingSchema = z.strictObject({
  kind: z.enum(["enforcement_point", "manual"]),
  points: z.array(z.enum(["tool_pipeline", "approvals", "egress", "deletion_executor"])),
  mechanism: text,
  parameters: z.array(z.strictObject({
    name: text,
    value: z.union([z.string(), int, z.boolean(), z.array(z.string())]),
    strictness: z.enum(["max", "min", "true_wins", "union", "intersection", "none"])
  })),
  manualDuty: z.strictObject({ duty: text, ownerRole: term, cadence: text, evidenceOfPerformance: text }).nullable()
}).superRefine((b, ctx) => {
  if (b.kind === "enforcement_point" && (b.points.length === 0 || b.manualDuty !== null)) {
    flag(ctx, "CAT_SCHEMA", ["points"], "an enforcement_point binding needs non-empty points and manualDuty: null");
  }
  if (b.kind === "manual" && (b.points.length > 0 || b.manualDuty === null)) {
    flag(ctx, "CAT_SCHEMA", ["manualDuty"], "a manual binding needs empty points and a full manualDuty");
  }
  unique(ctx, b.points, ["points"], "enforcement point");
});

const fixturePath = z.string().regex(/^L[0-3][A-Z0-9-]*\/(positive|negative)\/[A-Za-z0-9][A-Za-z0-9._-]*\.json$/, "must be <controlId>/<positive|negative>/<name>.json");

export const controlTestSchema = z.strictObject({
  id: text,
  type: z.enum(["runtime_enforced", "executed_adversarial", "drill", "configuration_check", "document_review"]),
  oracle: z.strictObject({
    kind: z.enum(["enforcement_receipt", "system_of_record", "external_observer", "ledger_state", "signed_config", "human_assessor"]),
    observes: text
  }),
  fixtures: z.strictObject({ positive: z.array(fixturePath), negative: z.array(fixturePath) }),
  passCriteria: text,
  attempts: int.min(1)
}).superRefine((t, ctx) => {
  if (t.type === "executed_adversarial" && t.attempts < 25) {
    flag(ctx, "CAT_SCHEMA", ["attempts"], "an executed_adversarial test needs attempts >= 25");
  }
  unique(ctx, [...t.fixtures.positive, ...t.fixtures.negative], ["fixtures"], "fixture");
});

export const evidenceContractSchema = z.strictObject({
  id: text,
  producer: text,
  bindingFields: z.array(z.enum(["tenantId", "workspaceId", "deploymentId", "agentId", "principalId", "sessionId", "subjectId",
    "resourceId", "controlId", "controlVersion", "policyDigest", "producerId"])),
  freshness: z.strictObject({ maxAgeDays: int.min(1) }),
  sampling: z.strictObject({ method: z.enum(["all", "random", "stratified"]), ratePercent: int.min(1).max(100).nullable(), minItems: int.min(0).nullable() }),
  retention: z.discriminatedUnion("mode", [
    z.strictObject({ mode: z.literal("regime_max") }),
    z.strictObject({ mode: z.literal("fixed"), days: int.min(1), basis: text })
  ]),
  residency: z.discriminatedUnion("mode", [
    z.strictObject({ mode: z.literal("inherit_deployment") }),
    z.strictObject({ mode: z.literal("pinned"), regions: z.array(text).min(1), basis: text })
  ])
}).superRefine((e, ctx) => {
  if (!e.bindingFields.includes("controlId") || !e.bindingFields.some((f) => (SCOPE_FIELDS as readonly string[]).includes(f))) {
    flag(ctx, "CAT_SCHEMA", ["bindingFields"], `bindingFields must include controlId and one of ${SCOPE_FIELDS.join(", ")}`);
  }
  unique(ctx, e.bindingFields, ["bindingFields"], "binding field");
});

/** Support gate: reviewed and qualified content carries verified, legally reviewed citations and an approved review. */
function supportGate(r: ControlRecord, ctx: z.RefinementCtx): void {
  if (r.support !== "reviewed" && r.support !== "qualified") return;
  r.citations.forEach((c, i) => {
    if (c.retrieval.state !== "verified" || c.legalReview === null) {
      flag(ctx, "CAT_SUPPORT_GATE", ["citations", i], `${r.support} needs every citation verified and legally reviewed`);
    }
  });
  const { status, expert, credential, reviewedAt, nextReview } = r.review;
  if (status !== "approved" || !expert || !credential || !reviewedAt || !nextReview) {
    flag(ctx, "CAT_SUPPORT_GATE", ["review"], `${r.support} needs an approved review with expert, credential, reviewedAt and nextReview`);
  }
  if (r.provenance.draftedBy === "ai" && r.provenance.approvedBy === null) {
    flag(ctx, "CAT_SUPPORT_GATE", ["provenance", "approvedBy"], `${r.support} AI-drafted content needs provenance.approvedBy`);
  }
}

function recordRules(r: ControlRecord, ctx: z.RefinementCtx): void {
  if (Number(r.id[1]) !== r.layer) flag(ctx, "CAT_SCHEMA", ["layer"], `layer ${r.layer} does not match id ${r.id}`);
  unique(ctx, r.stations, ["stations"], "station");
  if (r.layer === 0 && r.stations.length !== STATIONS.length) flag(ctx, "CAT_SCHEMA", ["stations"], "a Layer 0 control lists all seven stations");
  unique(ctx, r.citations.map((c) => c.key), ["citations"], "citation key", "CAT_DUPLICATE_ID");
  unique(ctx, r.tests.map((t) => t.id), ["tests"], "test id", "CAT_DUPLICATE_ID");
  unique(ctx, r.evidence.map((e) => e.id), ["evidence"], "evidence id", "CAT_DUPLICATE_ID");
  r.tests.forEach((t, i) => { if (!t.id.startsWith(`${r.id}-T`)) flag(ctx, "CAT_SCHEMA", ["tests", i, "id"], `test id must start with ${r.id}-T`); });
  r.evidence.forEach((e, i) => { if (!e.id.startsWith(`${r.id}-E`)) flag(ctx, "CAT_SCHEMA", ["evidence", i, "id"], `evidence id must start with ${r.id}-E`); });
  if (r.mandatory && r.binding.kind === "enforcement_point"
    && !r.tests.some((t) => t.fixtures.positive.length > 0 && t.fixtures.negative.length > 0)) {
    flag(ctx, "CAT_SCHEMA", ["tests"], "a mandatory enforced control needs a test with at least one positive and one negative fixture");
  }
  unique(ctx, r.levels, ["levels"], "level");
  unique(ctx, r.invalidatedBy, ["invalidatedBy"], "invalidation trigger");
  supportGate(r, ctx);
}

export const controlRecordSchema = z.strictObject({
  id: z.string().regex(CONTROL_ID, "must match L<layer>-<FAMILY>[-<SUB>]-<NN>"),
  version,
  support: supportLevel,
  layer,
  family: text.nullable(),
  stations: z.array(station).min(1),
  title: text,
  statement: text,
  riskRationale: text,
  mandatory: z.boolean(),
  applicability: z.strictObject({
    predicate: predicateSchema,
    reasons: z.array(text).min(1),
    exclusions: z.array(z.strictObject({ when: predicateSchema, reason: text }))
  }),
  citations: z.array(citationSchema),
  binding: bindingSchema,
  merge: controlMergeSchema.optional(),
  tests: z.array(controlTestSchema),
  evidence: z.array(evidenceContractSchema),
  invalidatedBy: z.array(z.enum(["model_version", "prompt_version", "tool_version", "corpus_version", "policy_version", "deployment_version"])),
  owner: z.strictObject({ role: term }),
  clock: z.strictObject({
    clockId: text,
    deadline: z.strictObject({ amount: int.min(1), unit: z.enum(["hours", "calendarDays", "workDays", "months"]) })
  }).nullable(),
  levels: z.array(z.enum(["L1", "L2", "L3", "L4", "L5"])).min(1),
  crosswalk: z.array(z.strictObject({ framework: term, clause: text, relation: z.enum(["equivalent", "partial", "conflicting"]), rationale: text })),
  review: z.strictObject({
    status: z.enum(["pending", "approved", "rejected", "expired"]),
    expert: text.nullable(),
    credential: text.nullable(),
    reviewedAt: isoDate.nullable(),
    nextReview: isoDate.nullable()
  }),
  provenance: z.strictObject({ draftedBy: z.enum(["human", "ai"]), draftedAt: isoDate, approvedBy: text.nullable() })
}).superRefine(recordRules);

export const packManifestSchema = z.strictObject({
  id: z.string().regex(/^[a-z][a-z0-9]*(\.[a-z0-9][a-z0-9-]*)+$/, "must be a dotted lowercase pack id"),
  version,
  layer,
  title: text,
  stations: z.array(station).min(1),
  jurisdictions: z.array(term),
  compilerCompat: text.refine((range) => semver.validRange(range) !== null, "must be a semver range"),
  publisher: text,
  maintainers: z.array(z.strictObject({ name: text, role: text })).min(1),
  licence: z.string().regex(/^[A-Za-z0-9.+-]+$/, "must be an SPDX licence id"),
  support: supportLevel,
  controls: z.array(z.string().regex(CONTROL_ID, "must be a control id")),
  stewardship: z.strictObject({ partner: text.nullable(), updatePlan: text.nullable(), triageTargetDays: int.min(1).nullable(), coverageDoc: text.nullable() })
}).superRefine((p, ctx) => {
  unique(ctx, p.controls, ["controls"], "control", "CAT_DUPLICATE_ID");
  unique(ctx, p.stations, ["stations"], "station");
});

export const producerRecordSchema = z.strictObject({
  id: z.string().regex(/^[a-z][A-Za-z0-9]*(\.[a-z][A-Za-z0-9]*)+$/, "must be a dotted producer id"),
  module: text,
  emits: z.array(text).min(1),
  maxClaimKind: z.enum(["observed", "self_reported", "synthetic_example"]),
  status: z.enum(["available", "planned"]),
  plannedBy: z.string().regex(/^[A-Z][A-Z0-9]*-\d+$/, "must be a plan key").nullable()
}).superRefine((p, ctx) => {
  if ((p.status === "planned") !== (p.plannedBy !== null)) flag(ctx, "CAT_SCHEMA", ["plannedBy"], "plannedBy is set exactly when status is planned");
});

export const producersFileSchema = z.strictObject({ producers: z.array(producerRecordSchema) }).superRefine((f, ctx) => {
  unique(ctx, f.producers.map((p) => p.id), ["producers"], "producer id", "CAT_DUPLICATE_ID");
});

const termList = z.array(term);
export const vocabularySchema = z.strictObject({
  stations: z.array(station),
  jurisdictions: termList,
  roles: termList,
  entityTypes: termList,
  riskClasses: termList,
  useCases: termList,
  dataClasses: termList,
  domains: termList,
  ownerRoles: termList,
  frameworks: termList
}).superRefine((v, ctx) => {
  for (const [key, list] of Object.entries(v)) unique(ctx, list, [key], `${key} term`);
});
export type Vocabulary = z.infer<typeof vocabularySchema>;

export const catalogManifestSchema = z.strictObject({
  id: z.string().regex(/^[a-z][a-z0-9]*(\.[a-z0-9][a-z0-9-]*)+$/, "must be a dotted lowercase id"),
  version,
  compilerCompat: text.refine((range) => semver.validRange(range) !== null, "must be a semver range"),
  publisher: text,
  maintainers: z.array(z.strictObject({ name: text, role: text })).min(1),
  licence: z.string().regex(/^[A-Za-z0-9.+-]+$/, "must be an SPDX licence id")
});
export type CatalogManifest = z.infer<typeof catalogManifestSchema>;

export const publisherHostsSchema = z.strictObject({
  hosts: z.array(z.strictObject({ host: z.string().regex(/^[a-z0-9-]+(\.[a-z0-9-]+)+$/, "must be a lowercase hostname"), publisher: text }))
});

export const fixtureEnvelopeSchema = z.strictObject({
  fixtureVersion: z.literal(1),
  controlId: z.string().regex(CONTROL_ID, "must be a control id"),
  polarity: z.enum(["positive", "negative"]),
  evidenceClass: z.enum(["valid", "violation", "stale", "replayed", "contradictory", "cross_tenant", "empty", "unknown_authority",
    "unknown_hold", "unknown_residency", "unknown_applicability"]),
  setup: z.record(z.string(), z.unknown()),
  expected: z.strictObject({ result: z.enum(["allow", "deny", "pass", "fail", "not_evaluated"]), reasonCode: text.nullable() })
});

/** Maps zod issues to catalog issues; a refinement keeps its own code, everything else is CAT_SCHEMA. */
export function zodToCatalogIssues(error: z.ZodError, file: string, controlId: string | null): CatalogIssue[] {
  return error.issues.map((issue) => {
    const params = issue.code === "custom" ? (issue as { params?: { code?: unknown } }).params : undefined;
    return {
      code: typeof params?.code === "string" ? params.code : "CAT_SCHEMA",
      severity: "error",
      file,
      controlId,
      path: issue.path.map(String).join("."),
      message: issue.message
    };
  });
}

// Compile-time proof that each schema infers to the exported type: the build fails when either side drifts.
type Same<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
type Assert<T extends true> = T;
export type SchemaInfersExportedTypes = [
  Assert<Same<z.infer<typeof controlRecordSchema>, ControlRecord>>,
  Assert<Same<z.infer<typeof citationSchema>, Citation>>,
  Assert<Same<z.infer<typeof bindingSchema>, Binding>>,
  Assert<Same<z.infer<typeof controlTestSchema>, ControlTest>>,
  Assert<Same<z.infer<typeof evidenceContractSchema>, EvidenceContract>>,
  Assert<Same<z.infer<typeof packManifestSchema>, PackManifest>>,
  Assert<Same<z.infer<typeof producerRecordSchema>, ProducerRecord>>,
  Assert<Same<z.infer<typeof fixtureEnvelopeSchema>, FixtureEnvelope>>,
  Assert<Same<(typeof STATIONS)[number], Station>>
];
