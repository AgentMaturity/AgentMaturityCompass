/**
 * Signed, append-only regulatory clock events for stored incidents (P1-17), and
 * the loader that turns them into F4 clock instances. A TRIGGER event says when
 * a trigger happened; a NOTIFIED event says when a notice was submitted. Both
 * timestamps are operator claims, so each row also keeps when and through which
 * surface it was recorded; recordedTs is set here from the server clock. A row's
 * signature proves which workspace key wrote it and that it is unchanged, not
 * that its claim is true. Rows verify against the workspace's own monitor key
 * history, so they are a local audit trail: they expose edits by anyone without
 * that key, never a false claim by a holder of it.
 */
import { randomUUID } from "node:crypto";
import { signHexDigest, verifyHexDigestAny } from "../crypto/keys.js";
import { listDomainIds, type Domain } from "../domains/domainRegistry.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import type { IncidentStoreInstance } from "./incidentStore.js";
import type { Incident, IncidentClockEvent, IncidentClockEventKind } from "./incidentTypes.js";
import {
  CLOCK_REVIEW_STATUS,
  REGULATORY_CLOCK_TABLE,
  attachRegulatoryClocks,
  clocksForStation,
  type ClockTrigger,
  type IncidentClockInstance
} from "./regulatoryClocks.js";

type UnsignedClockEvent = Omit<IncidentClockEvent, "signature">;

/**
 * An operator-stated timestamp may run this far past the server-set recording
 * instant (clock skew), no further. Clock events and oversight records share it.
 */
export const MAX_FUTURE_SKEW_MS = 5 * 60 * 1000;

/** Triggers an operator can record: every trigger a clock uses except the derived calendar-year one. */
export const RECORDABLE_TRIGGERS: readonly ClockTrigger[] = [...new Set(REGULATORY_CLOCK_TABLE.map((clock) => clock.trigger))]
  .filter((trigger) => trigger !== "CALENDAR_YEAR_END_AFTER_AWARENESS");

export const CLOCK_LISTING_NOTES: readonly string[] = [
  `Clock durations are ${CLOCK_REVIEW_STATUS}; this is not legal advice.`,
  "Trigger and notice times are operator claims; each event shows when and through which surface it was recorded.",
  "A station lists candidate clocks: AMC does not decide applicability or check conditions such as 500 or more consumers affected.",
  "Events verify against this workspace's own monitor key history: a local audit trail, not independent proof.",
  "AMC computes and records deadlines; it does not file notices."
];

/** A refusal caused by the request itself (station, trigger, clock id, decision or timestamp). Surfaces map it to 400. */
export class IncidentInputError extends Error {}

export function parseStation(value: string): Domain {
  const station = listDomainIds().find((id) => id === value);
  if (!station) throw new IncidentInputError(`unknown station ${value}; expected one of ${listDomainIds().join(", ")}`);
  return station;
}

const ISO_TS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/;

/** Strict ISO 8601 with a zone, so a legal deadline never depends on the host's local time. */
export function parseIsoTimestamp(value: string, label: string): number {
  const ts = ISO_TS.test(value) ? Date.parse(value) : Number.NaN;
  if (!Number.isFinite(ts)) {
    throw new IncidentInputError(`${label} must be an ISO 8601 timestamp with a zone, e.g. 2026-03-02T10:00:00Z; got ${value}`);
  }
  return ts;
}

function clockEventDigest(event: UnsignedClockEvent): string {
  return sha256Hex(canonicalize({
    event_id: event.eventId,
    incident_id: event.incidentId,
    kind: event.kind,
    trigger_or_clock_id: event.triggerOrClockId,
    station: event.station,
    ts: event.ts,
    recorded_ts: event.recordedTs,
    recorded_by: event.recordedBy
  }));
}

/** The guards every event must pass when recorded and again when loaded. */
function clockEventProblem(incident: Incident, event: UnsignedClockEvent): string | null {
  if (event.incidentId !== incident.incidentId) return `belongs to incident ${event.incidentId}`;
  if (!listDomainIds().includes(event.station)) return `unknown station ${event.station}`;
  if (event.kind !== "TRIGGER" && event.kind !== "NOTIFIED") return `unknown kind ${String(event.kind)}`;
  if (event.kind === "TRIGGER" && !RECORDABLE_TRIGGERS.includes(event.triggerOrClockId as ClockTrigger)) {
    return `unknown trigger ${event.triggerOrClockId}; expected one of ${RECORDABLE_TRIGGERS.join(", ")}`;
  }
  if (event.kind === "NOTIFIED" && !clocksForStation(event.station).some((clock) => clock.clockId === event.triggerOrClockId)) {
    return `unknown clock ${event.triggerOrClockId} for station ${event.station}`;
  }
  if (!Number.isFinite(event.ts) || !Number.isFinite(event.recordedTs)) return "timestamps must be finite";
  if (event.ts < incident.createdTs) {
    return `is backdated: ${new Date(event.ts).toISOString()} precedes incident creation ${new Date(incident.createdTs).toISOString()}`;
  }
  if (event.ts > event.recordedTs + MAX_FUTURE_SKEW_MS) {
    return `is future-dated: ${new Date(event.ts).toISOString()} is more than 5 minutes after it was recorded`;
  }
  if (!event.recordedBy.trim()) return "has no recordedBy";
  return null;
}

function recordedFirst(a: UnsignedClockEvent, b: UnsignedClockEvent): boolean {
  return a.recordedTs < b.recordedTs || (a.recordedTs === b.recordedTs && a.eventId < b.eventId);
}

/**
 * Triggers: the earliest claimed time wins, so a later row can only bring a
 * deadline forward. Notices: the first-recorded row wins (earliest recordedTs,
 * then eventId) and later rows for the same clock are ignored, so a later row
 * claiming an earlier notice can never turn a missed deadline into a met one.
 */
function clockInputs(events: readonly UnsignedClockEvent[]) {
  const triggers: Record<string, number> = {};
  const notices = new Map<string, UnsignedClockEvent>();
  for (const event of events) {
    if (event.kind === "TRIGGER") {
      triggers[event.triggerOrClockId] = Math.min(triggers[event.triggerOrClockId] ?? event.ts, event.ts);
      continue;
    }
    const first = notices.get(event.triggerOrClockId);
    if (!first || recordedFirst(event, first)) notices.set(event.triggerOrClockId, event);
  }
  const satisfied = Object.fromEntries([...notices].map(([clockId, event]) => [clockId, event.ts]));
  // Trigger names were checked against RECORDABLE_TRIGGERS by clockEventProblem.
  return { triggers: triggers as Partial<Record<ClockTrigger, number>>, satisfied };
}

/** Rows for this incident and station, each refused with its event id when its signature or a guard fails. */
function verifiedClockEvents(
  store: IncidentStoreInstance,
  incident: Incident,
  station: Domain,
  publicKeys: string[]
): IncidentClockEvent[] {
  return store.getIncidentClockEvents(incident.incidentId).filter((event) => event.station === station).map((event) => {
    if (!verifyHexDigestAny(clockEventDigest(event), event.signature, publicKeys)) {
      throw new Error(`clock event ${event.eventId} refused: signature verification failed`);
    }
    const problem = clockEventProblem(incident, event);
    if (problem) throw new Error(`clock event ${event.eventId} refused: ${problem}`);
    return event;
  });
}

export interface LoadedIncidentClocks {
  incident: Incident;
  events: IncidentClockEvent[];
  clocks: IncidentClockInstance[];
}

/** Builds the F4 trigger and satisfied maps from verified rows and attaches the station's clocks at `nowTs`. */
export function loadIncidentClocks(
  store: IncidentStoreInstance,
  incidentId: string,
  station: Domain,
  nowTs: number,
  publicKeys: string[]
): LoadedIncidentClocks {
  const incident = store.getIncident(incidentId);
  if (!incident) throw new Error(`incident not found: ${incidentId}`);
  const events = verifiedClockEvents(store, incident, station, publicKeys);
  const clocks = attachRegulatoryClocks({ incident, station, nowTs, ...clockInputs(events) });
  return { incident, events, clocks };
}

export interface RecordIncidentClockEventInput {
  incidentId: string;
  station: Domain;
  kind: IncidentClockEventKind;
  triggerOrClockId: string;
  ts: number;
  recordedBy: string;
  privateKeyPem: string;
  publicKeys: string[];
  /** Server clock for recordedTs; a seam for tests, never an operator input. */
  now?: () => number;
}

/**
 * Validates, signs and appends one event with a server-set recordedTs; refuses
 * one that would leave the clocks inconsistent and a second notice for a clock.
 */
export function recordIncidentClockEvent(store: IncidentStoreInstance, input: RecordIncidentClockEventInput): IncidentClockEvent {
  const incident = store.getIncident(input.incidentId);
  if (!incident) throw new Error(`incident not found: ${input.incidentId}`);
  const existing = verifiedClockEvents(store, incident, input.station, input.publicKeys);
  const recordedTs = (input.now ?? Date.now)();
  const unsigned: UnsignedClockEvent = {
    eventId: `ice_${randomUUID().replace(/-/g, "")}`,
    incidentId: incident.incidentId,
    kind: input.kind,
    triggerOrClockId: input.triggerOrClockId,
    station: input.station,
    ts: input.ts,
    recordedTs,
    recordedBy: input.recordedBy
  };
  const problem = clockEventProblem(incident, unsigned);
  if (problem) throw new IncidentInputError(`clock event refused: ${problem}`);
  const earlierNotice = unsigned.kind === "NOTIFIED"
    ? existing.find((event) => event.kind === "NOTIFIED" && event.triggerOrClockId === unsigned.triggerOrClockId)
    : undefined;
  if (earlierNotice) {
    throw new IncidentInputError(`clock event refused: a notice for ${unsigned.triggerOrClockId} is already recorded (${earlierNotice.eventId})`);
  }
  try {
    attachRegulatoryClocks({ incident, station: input.station, nowTs: recordedTs, ...clockInputs([...existing, unsigned]) });
  } catch (error) {
    throw new IncidentInputError(`clock event refused: ${error instanceof Error ? error.message : String(error)}`);
  }
  const event: IncidentClockEvent = { ...unsigned, signature: signHexDigest(clockEventDigest(unsigned), input.privateKeyPem) };
  store.insertIncidentClockEvent(event);
  return event;
}

/** The JSON shape the CLI (--json), the API and the MCP tool return. */
export function clockListing(loaded: LoadedIncidentClocks, station: Domain, nowTs: number) {
  return {
    incidentId: loaded.incident.incidentId,
    station,
    now: new Date(nowTs).toISOString(),
    clocks: loaded.clocks,
    events: loaded.events.map((event) => ({
      eventId: event.eventId,
      kind: event.kind,
      triggerOrClockId: event.triggerOrClockId,
      at: new Date(event.ts).toISOString(),
      recordedAt: new Date(event.recordedTs).toISOString(),
      recordedBy: event.recordedBy
    })),
    notes: CLOCK_LISTING_NOTES
  };
}
