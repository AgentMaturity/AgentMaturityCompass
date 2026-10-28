/**
 * The incident clock runtime (P2-26 slice A). When a detector or a person opens an incident, startIncidentClocks decides
 * once, from the active compiled plan and the deployment profile it pins, which F4 clocks apply, and records that
 * decision as one signed, append-only row (ledger migration 15) so backups and HA carry it. Applicability is decided
 * only from plan facts: a clock whose jurisdiction or entity type is declared absent never starts; a clock whose
 * condition the plan cannot decide is NEEDS_CLASSIFICATION, never dropped and never treated as applicable, until a
 * person classifies it with a signed REPORT_REQUIRED or NO_REPORT_REQUIRED oversight record naming the clock.
 *
 * AWARENESS is the incident's ledger creation time; every later trigger is P1-17's signed TRIGGER clock event, which a
 * person records. Every clock stays experimental until the D-08 experts approve it. AMC never files a notice.
 */
import type Database from "better-sqlite3";
import { activeControlPlan } from "../catalog/compiler/activate.js";
import { getPublicKeyHistory, getSigningKey, signHexDigest, verifyHexDigestAny } from "../crypto/keys.js";
import { listDomainIds, type Domain } from "../domains/domainRegistry.js";
import { loadDestinationRegistrySnapshot, loadPinnedDeploymentProfile } from "../residency/destinationRegistry.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import { loadIncidentClocks } from "./incidentClockEvents.js";
import { createIncidentStore } from "./incidentStore.js";
import { oversightRecordPath, readOversightRecords, verifyOversightChain, workspaceOversightPublicKeys } from "./oversightRecord.js";
import {
  CLOCK_REVIEW_STATUS, clocksForStation, type ClockStatus, type ClockTrigger, type IncidentClockInstance, type RegulatoryClock
} from "./regulatoryClocks.js";

type ClockApplicability = "APPLICABLE" | "NEEDS_CLASSIFICATION";
type RuntimeClockStatus = ClockStatus | "NEEDS_CLASSIFICATION" | "NOT_APPLICABLE";

export interface ClockPlanFacts {
  planDigest: string;
  stations: Domain[];
  /** null: the plan's profile is not pinned through the signed residency registry, so the fact is unknown. */
  jurisdictions: string[] | null;
  entityTypes: string[] | null;
}

export interface ClockDecision { clockId: string; station: Domain; applicability: ClockApplicability; reason: string }

export interface ClockRun {
  incidentId: string;
  status: "started" | "not_evaluated";
  reason: string | null;
  planDigest: string | null;
  decisions: ClockDecision[];
  decidedTs: number;
  signature: string;
}

export interface RuntimeClock extends Omit<IncidentClockInstance, "status"> {
  station: Domain;
  status: RuntimeClockStatus;
  applicability: ClockApplicability;
  decisionReason: string;
  /** The oversight record that classified a NEEDS_CLASSIFICATION clock, if any. */
  classifiedBy: string | null;
  experimental: true;
}

/** Triggers only AMC derives; every other trigger is a determination a person records, which decides the condition. */
const DERIVED_TRIGGERS: ReadonlySet<ClockTrigger> = new Set<ClockTrigger>(["AWARENESS", "CALENDAR_YEAR_END_AFTER_AWARENESS"]);

/**
 * The entity-type term (catalog/vocabulary.yaml) a clock's condition names, by clock id prefix, first match wins.
 * Experimental like the clocks themselves: an expert confirms each mapping under D-08.
 */
const CLOCK_ENTITY_TYPES: ReadonlyArray<readonly [prefix: string, entityType: string]> = [
  ["hipaa-164-410", "hipaa_business_associate"],
  ["hipaa-164-4", "hipaa_covered_entity"],
  ["dora-", "eu_financial_entity"],
  ["glba-", "non_bank_financial_institution"]
];

type Fact = "match" | "absent" | "unknown";

/** Whether the declared jurisdictions include the clock's. A US-wide declaration cannot decide a state clock. */
export function jurisdictionFact(clockJurisdiction: string, declared: readonly string[] | null): Fact {
  if (declared === null) return "unknown";
  if (clockJurisdiction.startsWith("EU")) return declared.includes("EU") ? "match" : "absent";
  if (clockJurisdiction === "US-federal") return declared.some((j) => j === "US" || j.startsWith("US-")) ? "match" : "absent";
  const covered = declared.includes(clockJurisdiction) || (clockJurisdiction === "US-NY" && declared.includes("US-NYC"));
  if (covered) return "match";
  return clockJurisdiction.startsWith("US-") && declared.includes("US") ? "unknown" : "absent";
}

function entityFact(clockId: string, entityTypes: readonly string[] | null): Fact | null {
  const term = CLOCK_ENTITY_TYPES.find(([prefix]) => clockId.startsWith(prefix))?.[1];
  if (term === undefined) return null;
  if (entityTypes === null) return "unknown";
  return entityTypes.includes(term) ? "match" : "absent";
}

/** null: the plan's facts rule the clock out. Otherwise the clock is recorded, applicable or for a person to classify. */
export function decideClock(clock: RegulatoryClock, facts: Pick<ClockPlanFacts, "jurisdictions" | "entityTypes">): Omit<ClockDecision, "station"> | null {
  const jurisdiction = jurisdictionFact(clock.jurisdiction, facts.jurisdictions);
  if (jurisdiction === "absent") return null;
  const entity = entityFact(clock.clockId, facts.entityTypes);
  if (entity === "absent") return null;
  const classify = (reason: string) => ({ clockId: clock.clockId, applicability: "NEEDS_CLASSIFICATION" as const, reason });
  if (jurisdiction === "unknown") return classify(`the plan's jurisdictions do not decide ${clock.jurisdiction}`);
  if (entity === "unknown") return classify("the plan's entity types are unknown");
  if (DERIVED_TRIGGERS.has(clock.trigger)) return classify(`the condition cannot be decided from plan facts: ${clock.condition}`);
  return { clockId: clock.clockId, applicability: "APPLICABLE",
    reason: `${clock.jurisdiction} declared${entity === "match" ? " with the condition's entity type" : ""}; the person who records ${clock.trigger} decides the condition` };
}

function stationOf(value: string): Domain | null {
  return listDomainIds().find((id) => id === value) ?? null;
}

/** The active plan's stations and, when the signed residency registry pins the plan's profile, its facts. null without a plan. */
function loadClockPlanFacts(workspace: string): ClockPlanFacts | null {
  const plan = activeControlPlan(workspace);
  if (plan === null) return null;
  const tagged = plan.requirements.flatMap((r) => r.pulledInBy).filter((tag) => tag.startsWith("station:")).map((tag) => stationOf(tag.slice(8)));
  let profile: ReturnType<typeof loadPinnedDeploymentProfile> | null = null;
  const snapshot = loadDestinationRegistrySnapshot(workspace);
  if (snapshot.state === "verified" && snapshot.registry.profile) {
    try { profile = loadPinnedDeploymentProfile(workspace, snapshot.registry, plan.profile.sha256); } catch { profile = null; }
  }
  const stations = profile?.stations.value ?? tagged.filter((s): s is Domain => s !== null);
  return { planDigest: plan.digest, stations: [...new Set(stations)].sort(), jurisdictions: profile?.jurisdictions.value ?? null,
    entityTypes: profile?.entityTypes.value ?? null };
}

/** Every candidate clock of the plan's stations, once each, decided from the facts. */
function decideClocks(facts: ClockPlanFacts): ClockDecision[] {
  const seen = new Set<string>();
  return facts.stations.flatMap((station) => clocksForStation(station).flatMap((clock) => {
    if (seen.has(clock.clockId)) return [];
    seen.add(clock.clockId);
    const decision = decideClock(clock, facts);
    return decision === null ? [] : [{ ...decision, station }];
  }));
}

type UnsignedRun = Omit<ClockRun, "signature">;
const runDigest = (run: UnsignedRun) => sha256Hex(canonicalize({ ...run, v: 1 }));

interface RunRow { incident_id: string; status: string; reason: string | null; plan_digest: string | null; decisions_json: string; decided_ts: number; signature: string }

export function readClockRun(db: Database.Database, incidentId: string, publicKeys: string[]): ClockRun | null {
  const row = db.prepare("SELECT * FROM incident_clock_runs WHERE incident_id = ?").get(incidentId) as RunRow | undefined;
  if (!row) return null;
  const run: ClockRun = { incidentId: row.incident_id, status: row.status as ClockRun["status"], reason: row.reason, planDigest: row.plan_digest,
    decisions: JSON.parse(row.decisions_json) as ClockDecision[], decidedTs: row.decided_ts, signature: row.signature };
  const { signature, ...unsigned } = run;
  if (!verifyHexDigestAny(runDigest(unsigned), signature, publicKeys)) throw new Error(`clock run for ${incidentId} refused: signature verification failed`);
  return run;
}

export interface StartIncidentClocksInput {
  workspace: string;
  db: Database.Database;
  incidentId: string;
  nowTs: number;
  /** Signs the run digest; defaults to the workspace ledger-row key, which loadIncidentClocks' monitor history verifies. */
  sign?: (digestHex: string) => string;
  /** Test seam; defaults to loadClockPlanFacts(workspace). */
  facts?: ClockPlanFacts | null;
}

/**
 * Decides and records the incident's clocks once. Idempotent: an existing run is returned unchanged, so a later plan
 * never rewrites what applied when the incident opened. Without an active plan the run is not_evaluated.
 */
export function startIncidentClocks(input: StartIncidentClocksInput): ClockRun {
  const store = createIncidentStore(input.db);
  store.initTables();
  const incident = store.getIncident(input.incidentId);
  if (!incident) throw new Error(`incident not found: ${input.incidentId}`);
  const existing = readClockRun(input.db, input.incidentId, getPublicKeyHistory(input.workspace, "monitor"));
  if (existing) return existing;
  let facts: ClockPlanFacts | null;
  let reason: string | null = null;
  try {
    facts = input.facts !== undefined ? input.facts : loadClockPlanFacts(input.workspace);
    if (facts === null) reason = "no active compiled plan: applicable clocks are not evaluated";
  } catch (error) {
    facts = null;
    reason = `the active compiled plan could not be read: ${error instanceof Error ? error.message : String(error)}`;
  }
  const unsigned: UnsignedRun = { incidentId: incident.incidentId, status: facts === null ? "not_evaluated" : "started", reason,
    planDigest: facts?.planDigest ?? null, decisions: facts === null ? [] : decideClocks(facts), decidedTs: input.nowTs };
  const sign = input.sign ?? ((digest: string) => signHexDigest(digest, getSigningKey(input.workspace, "ledger-row")));
  const run: ClockRun = { ...unsigned, signature: sign(runDigest(unsigned)) };
  input.db.prepare(`INSERT INTO incident_clock_runs (incident_id, status, reason, plan_digest, decisions_json, decided_ts, signature)
    VALUES (?, ?, ?, ?, ?, ?, ?)`).run(run.incidentId, run.status, run.reason, run.planDigest, JSON.stringify(run.decisions), run.decidedTs, run.signature);
  return run;
}

/** clockId -> the latest verified oversight record that classified it; empty when the chain does not verify (fail closed). */
function classifications(workspace: string, incident: Parameters<typeof verifyOversightChain>[1]): Map<string, { recordId: string; required: boolean }> {
  const out = new Map<string, { recordId: string; required: boolean }>();
  let records;
  try {
    records = readOversightRecords(oversightRecordPath(workspace, incident.incidentId));
    if (!verifyOversightChain(records, incident, workspaceOversightPublicKeys(workspace)).ok) return out;
  } catch {
    return out;
  }
  for (const record of records) {
    if (record.decision !== "REPORT_REQUIRED" && record.decision !== "NO_REPORT_REQUIRED") continue;
    for (const clockId of record.clockIds) out.set(clockId, { recordId: record.recordId, required: record.decision === "REPORT_REQUIRED" });
  }
  return out;
}

export interface IncidentRuntimeClocks { run: ClockRun | null; clocks: RuntimeClock[]; notes: readonly string[] }

const RUNTIME_CLOCK_NOTES: readonly string[] = [
  `Clock rows are ${CLOCK_REVIEW_STATUS}; every clock is experimental until the D-08 experts approve it. This is not legal advice.`,
  "Applicability comes from the active compiled plan's facts; NEEDS_CLASSIFICATION waits for a person's signed REPORT_REQUIRED or NO_REPORT_REQUIRED oversight record.",
  "A NEEDS_CLASSIFICATION clock shows the deadline it would have if it applies.",
  "AMC computes deadlines and drafts notices for people to review; it does not file notices."
];

/** The incident's recorded clocks at nowTs, with P1-17's verified trigger and notice events and verified classifications. */
export function incidentRuntimeClocks(p: { workspace: string; db: Database.Database; incidentId: string; nowTs: number }): IncidentRuntimeClocks {
  const store = createIncidentStore(p.db);
  const incident = store.getIncident(p.incidentId);
  if (!incident) throw new Error(`incident not found: ${p.incidentId}`);
  const monitorKeys = getPublicKeyHistory(p.workspace, "monitor");
  const run = readClockRun(p.db, p.incidentId, monitorKeys);
  if (run === null || run.decisions.length === 0) return { run, clocks: [], notes: RUNTIME_CLOCK_NOTES };
  const classified = classifications(p.workspace, incident);
  const byStation = new Map<Domain, Map<string, IncidentClockInstance>>();
  for (const station of new Set(run.decisions.map((d) => d.station))) {
    byStation.set(station, new Map(loadIncidentClocks(store, p.incidentId, station, p.nowTs, monitorKeys).clocks.map((c) => [c.clockId, c])));
  }
  const clocks = run.decisions.flatMap((decision): RuntimeClock[] => {
    const instance = byStation.get(decision.station)?.get(decision.clockId);
    if (!instance) return [];
    const classification = decision.applicability === "NEEDS_CLASSIFICATION" ? classified.get(decision.clockId) : undefined;
    let status: RuntimeClockStatus = instance.status;
    if (decision.applicability === "NEEDS_CLASSIFICATION") {
      status = classification === undefined ? "NEEDS_CLASSIFICATION" : classification.required ? instance.status : "NOT_APPLICABLE";
    }
    return [{ ...instance, station: decision.station, status, applicability: decision.applicability, decisionReason: decision.reason,
      classifiedBy: classification?.recordId ?? null, experimental: true }];
  });
  return { run, clocks, notes: RUNTIME_CLOCK_NOTES };
}
