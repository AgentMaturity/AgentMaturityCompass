/**
 * Attaches regulation-derived reporting clocks to an AMC incident and computes
 * due dates and overdue state from explicit timestamps. Nothing here reads the
 * wall clock: callers pass `nowTs`, so results are reproducible and testable.
 */
import type { Domain } from "../domains/domainRegistry.js";
import type { Incident } from "./incidentTypes.js";
import {
  REGULATORY_CLOCK_TABLE,
  type ClockDuration,
  type ClockSource,
  type ClockTrigger,
  type RegulatoryClock
} from "./regulatoryClocksTable.js";

export {
  REGULATORY_CLOCK_TABLE,
  type ClockDuration,
  type ClockDurationUnit,
  type ClockSource,
  type ClockTrigger,
  type RegulatoryClock
} from "./regulatoryClocksTable.js";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** A clock is DUE_SOON when its deadline is within this window of `nowTs`. */
export const DUE_SOON_WINDOW_MS = 24 * HOUR_MS;

export type ClockStatus =
  | "NOT_STARTED"    // trigger event has not been recorded
  | "PENDING"
  | "DUE_SOON"
  | "OVERDUE"
  | "SATISFIED"      // notification recorded on or before the deadline
  | "SATISFIED_LATE"; // notification recorded after the deadline

export interface IncidentClockInstance {
  clockId: string;
  instrument: string;
  article: string;
  authority: string;
  jurisdiction: string;
  trigger: ClockTrigger;
  triggerTs: number | null;
  dueTs: number | null;
  dueAt: string | null;
  deadline: ClockDuration;
  status: ClockStatus;
  overdueByMs: number | null;
  satisfiedTs: number | null;
  notify: readonly string[];
  requiredContent: readonly string[];
  condition: string;
  source: ClockSource;
}

export interface AttachRegulatoryClocksInput {
  incident: Incident;
  station: Domain;
  /** Evaluation instant. Required so overdue state never depends on Date.now(). */
  nowTs: number;
  /** Recorded trigger timestamps. AWARENESS defaults to incident.createdTs. */
  triggers?: Partial<Record<ClockTrigger, number>>;
  /** clockId -> timestamp at which the notification was submitted. */
  satisfied?: Record<string, number>;
}

export function listClockInstruments(): string[] {
  return [...new Set(REGULATORY_CLOCK_TABLE.map((clock) => clock.instrument))];
}

export function clocksForStation(station: Domain): RegulatoryClock[] {
  return REGULATORY_CLOCK_TABLE.filter((clock) => clock.stations.includes(station));
}

function assertFiniteTs(value: number, label: string): void {
  if (!Number.isFinite(value)) throw new Error(`${label} must be a finite timestamp`);
}

function isWeekendUtc(ts: number): boolean {
  const day = new Date(ts).getUTCDay();
  return day === 0 || day === 6;
}

function addMonthsUtc(ts: number, months: number): number {
  const date = new Date(ts);
  const targetMonthIndex = date.getUTCMonth() + months;
  const targetYear = date.getUTCFullYear() + Math.floor(targetMonthIndex / 12);
  const targetMonth = ((targetMonthIndex % 12) + 12) % 12;
  const lastDayOfTarget = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  const day = Math.min(date.getUTCDate(), lastDayOfTarget);
  return Date.UTC(
    targetYear, targetMonth, day,
    date.getUTCHours(), date.getUTCMinutes(), date.getUTCSeconds(), date.getUTCMilliseconds()
  );
}

/** Pure due-date arithmetic in UTC. Throws on a non-positive or non-integer amount. */
export function addDuration(triggerTs: number, duration: ClockDuration): number {
  assertFiniteTs(triggerTs, "triggerTs");
  if (!Number.isInteger(duration.amount) || duration.amount <= 0) {
    throw new Error(`clock duration amount must be a positive integer, got ${String(duration.amount)}`);
  }
  switch (duration.unit) {
    case "hours":
      return triggerTs + duration.amount * HOUR_MS;
    case "calendarDays":
      return triggerTs + duration.amount * DAY_MS;
    case "workDays": {
      let ts = triggerTs;
      let remaining = duration.amount;
      while (remaining > 0) {
        ts += DAY_MS;
        if (!isWeekendUtc(ts)) remaining -= 1;
      }
      return ts;
    }
    case "months":
      return addMonthsUtc(triggerTs, duration.amount);
    default: {
      const never: never = duration.unit;
      throw new Error(`unknown clock duration unit ${String(never)}`);
    }
  }
}

function resolveTriggerTs(
  trigger: ClockTrigger,
  awarenessTs: number,
  triggers: Partial<Record<ClockTrigger, number>>
): number | null {
  if (trigger === "AWARENESS") return awarenessTs;
  if (trigger === "CALENDAR_YEAR_END_AFTER_AWARENESS") {
    return Date.UTC(new Date(awarenessTs).getUTCFullYear() + 1, 0, 1, 0, 0, 0, 0);
  }
  const recorded = triggers[trigger];
  return recorded === undefined ? null : recorded;
}

function statusFor(nowTs: number, dueTs: number, satisfiedTs: number | null): ClockStatus {
  if (satisfiedTs !== null) return satisfiedTs <= dueTs ? "SATISFIED" : "SATISFIED_LATE";
  if (nowTs > dueTs) return "OVERDUE";
  if (dueTs - nowTs <= DUE_SOON_WINDOW_MS) return "DUE_SOON";
  return "PENDING";
}

export function attachRegulatoryClocks(input: AttachRegulatoryClocksInput): IncidentClockInstance[] {
  const { incident, station, nowTs } = input;
  assertFiniteTs(nowTs, "nowTs");
  const triggers = input.triggers ?? {};
  const satisfied = input.satisfied ?? {};
  const knownClockIds = new Set(REGULATORY_CLOCK_TABLE.map((clock) => clock.clockId));

  for (const [name, ts] of Object.entries(triggers)) {
    if (ts === undefined) continue;
    assertFiniteTs(ts, `trigger ${name}`);
    if (ts < incident.createdTs) {
      throw new Error(`trigger ${name} (${ts}) is before incident ${incident.incidentId} createdTs (${incident.createdTs})`);
    }
  }
  for (const clockId of Object.keys(satisfied)) {
    if (!knownClockIds.has(clockId)) throw new Error(`unknown clockId in satisfied: ${clockId}`);
  }

  const awarenessTs = triggers.AWARENESS ?? incident.createdTs;

  return clocksForStation(station).map((clock) => {
    const triggerTs = resolveTriggerTs(clock.trigger, awarenessTs, triggers);
    const satisfiedTs = satisfied[clock.clockId] ?? null;
    if (triggerTs === null) {
      return instance(clock, null, null, "NOT_STARTED", null, satisfiedTs);
    }
    if (satisfiedTs !== null && satisfiedTs < triggerTs) {
      throw new Error(`clock ${clock.clockId} satisfied at ${satisfiedTs} before its trigger at ${triggerTs}`);
    }
    const dueTs = addDuration(triggerTs, clock.deadline);
    const status = statusFor(nowTs, dueTs, satisfiedTs);
    const overdueByMs = status === "OVERDUE" ? nowTs - dueTs : null;
    return instance(clock, triggerTs, dueTs, status, overdueByMs, satisfiedTs);
  });
}

function instance(
  clock: RegulatoryClock,
  triggerTs: number | null,
  dueTs: number | null,
  status: ClockStatus,
  overdueByMs: number | null,
  satisfiedTs: number | null
): IncidentClockInstance {
  return {
    clockId: clock.clockId,
    instrument: clock.instrument,
    article: clock.article,
    authority: clock.authority,
    jurisdiction: clock.jurisdiction,
    trigger: clock.trigger,
    triggerTs,
    dueTs,
    dueAt: dueTs === null ? null : new Date(dueTs).toISOString(),
    deadline: clock.deadline,
    status,
    overdueByMs,
    satisfiedTs,
    notify: clock.notify,
    requiredContent: clock.requiredContent,
    condition: clock.condition,
    source: clock.source
  };
}
