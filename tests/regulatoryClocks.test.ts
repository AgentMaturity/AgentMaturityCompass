import { describe, expect, test } from "vitest";
import type { Incident } from "../src/incidents/incidentTypes.js";
import {
  REGULATORY_CLOCK_TABLE,
  addDuration,
  attachRegulatoryClocks,
  clocksForStation,
  listClockInstruments
} from "../src/incidents/regulatoryClocks.js";

// Fixed trigger: 2026-03-02T10:00:00.000Z. No Date.now() anywhere in this file.
const TRIGGER_TS = Date.UTC(2026, 2, 2, 10, 0, 0, 0);
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

function fixtureIncident(overrides: Partial<Incident> = {}): Incident {
  return {
    incidentId: "inc-health-001",
    agentId: "agent-clinical-intake",
    severity: "CRITICAL",
    state: "OPEN",
    title: "PHI disclosed in agent tool output",
    description: "Agent emitted unsecured PHI for 12 patients into a shared channel.",
    triggerType: "GOVERNANCE_VIOLATION",
    triggerId: "firewall-deny-7f3a",
    rootCauseClaimIds: [],
    affectedQuestionIds: [],
    causalEdges: [],
    timelineEventIds: [],
    createdTs: TRIGGER_TS,
    updatedTs: TRIGGER_TS,
    resolvedTs: null,
    postmortemRef: null,
    prev_incident_hash: "GENESIS_INCIDENT",
    incident_hash: "0".repeat(64),
    signature: "unsigned-fixture",
    ...overrides
  };
}

describe("regulatory clock table", () => {
  test("has at least 6 instruments, each with url + retrievedAt or verified:false", () => {
    const instruments = listClockInstruments();
    expect(instruments.length).toBeGreaterThanOrEqual(6);
    for (const clock of REGULATORY_CLOCK_TABLE) {
      expect(clock.source.url).toMatch(/^https:\/\//);
      expect(clock.source.retrievedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
      if (!clock.source.verified) {
        expect(clock.source.reason).toBeTruthy();
      }
    }
  });

  test("clock ids are unique and every clock names at least one station", () => {
    const ids = REGULATORY_CLOCK_TABLE.map((clock) => clock.clockId);
    expect(new Set(ids).size).toBe(ids.length);
    for (const clock of REGULATORY_CLOCK_TABLE) {
      expect(clock.stations.length).toBeGreaterThan(0);
      expect(clock.notify.length).toBeGreaterThan(0);
      expect(clock.requiredContent.length).toBeGreaterThan(0);
    }
  });

  test("health station surfaces HIPAA and EU AI Act clocks", () => {
    const instruments = new Set(clocksForStation("health").map((clock) => clock.instrument));
    expect([...instruments].some((name) => /45 CFR 164\.404/.test(name))).toBe(true);
    expect([...instruments].some((name) => /2024\/1689/.test(name))).toBe(true);
  });
});

describe("due-date arithmetic from a fixed trigger", () => {
  test("hours add exactly", () => {
    expect(addDuration(TRIGGER_TS, { amount: 72, unit: "hours" })).toBe(TRIGGER_TS + 72 * HOUR_MS);
  });

  test("calendar days add exactly across a month boundary", () => {
    const due = addDuration(TRIGGER_TS, { amount: 60, unit: "calendarDays" });
    expect(due).toBe(TRIGGER_TS + 60 * DAY_MS);
    expect(new Date(due).toISOString()).toBe("2026-05-01T10:00:00.000Z");
  });

  test("work days skip Saturday and Sunday (UTC)", () => {
    // 2026-03-02 is a Monday; 5 work days later is Monday 2026-03-09.
    const due = addDuration(TRIGGER_TS, { amount: 5, unit: "workDays" });
    expect(new Date(due).toISOString()).toBe("2026-03-09T10:00:00.000Z");
  });

  test("months add a calendar month and clamp the day", () => {
    const jan31 = Date.UTC(2026, 0, 31, 9, 0, 0, 0);
    expect(new Date(addDuration(jan31, { amount: 1, unit: "months" })).toISOString()).toBe(
      "2026-02-28T09:00:00.000Z"
    );
    expect(new Date(addDuration(TRIGGER_TS, { amount: 1, unit: "months" })).toISOString()).toBe(
      "2026-04-02T10:00:00.000Z"
    );
  });

  test("rejects non-positive or non-integer amounts", () => {
    expect(() => addDuration(TRIGGER_TS, { amount: 0, unit: "hours" })).toThrow();
    expect(() => addDuration(TRIGGER_TS, { amount: 1.5, unit: "calendarDays" })).toThrow();
  });
});

describe("attachRegulatoryClocks on a health incident", () => {
  test("lists HIPAA individual notice and EU AI Act clocks with computed due dates", () => {
    const clocks = attachRegulatoryClocks({
      incident: fixtureIncident(),
      station: "health",
      nowTs: TRIGGER_TS + DAY_MS
    });

    const hipaa = clocks.find((clock) => clock.clockId === "hipaa-164-404-individual-notice");
    expect(hipaa).toBeDefined();
    expect(hipaa?.triggerTs).toBe(TRIGGER_TS);
    expect(hipaa?.dueTs).toBe(TRIGGER_TS + 60 * DAY_MS);
    expect(hipaa?.dueAt).toBe("2026-05-01T10:00:00.000Z");
    expect(hipaa?.status).toBe("PENDING");

    const aiAct = clocks.find((clock) => clock.clockId === "eu-ai-act-73-2-serious-incident");
    expect(aiAct).toBeDefined();
    expect(aiAct?.dueTs).toBe(TRIGGER_TS + 15 * DAY_MS);
    expect(aiAct?.dueAt).toBe("2026-03-17T10:00:00.000Z");

    const death = clocks.find((clock) => clock.clockId === "eu-ai-act-73-4-death");
    expect(death?.dueTs).toBe(TRIGGER_TS + 10 * DAY_MS);
    const widespread = clocks.find((clock) => clock.clockId === "eu-ai-act-73-3-widespread");
    expect(widespread?.dueTs).toBe(TRIGGER_TS + 2 * DAY_MS);
  });

  test("the awareness trigger defaults to incident.createdTs and can be overridden", () => {
    const awareness = TRIGGER_TS + 6 * HOUR_MS;
    const clocks = attachRegulatoryClocks({
      incident: fixtureIncident(),
      station: "health",
      nowTs: awareness,
      triggers: { AWARENESS: awareness }
    });
    const aiAct = clocks.find((clock) => clock.clockId === "eu-ai-act-73-2-serious-incident");
    expect(aiAct?.triggerTs).toBe(awareness);
    expect(aiAct?.dueTs).toBe(awareness + 15 * DAY_MS);
  });

  test("a trigger earlier than the incident timestamp is rejected", () => {
    expect(() =>
      attachRegulatoryClocks({
        incident: fixtureIncident(),
        station: "health",
        nowTs: TRIGGER_TS,
        triggers: { AWARENESS: TRIGGER_TS - 1 }
      })
    ).toThrow(/before incident/);
  });

  test("clocks whose trigger has not happened are NOT_STARTED with no due date", () => {
    const clocks = attachRegulatoryClocks({
      incident: fixtureIncident(),
      station: "wealth",
      nowTs: TRIGGER_TS
    });
    const intermediate = clocks.find((clock) => clock.clockId === "dora-rts-2025-301-art5-intermediate");
    expect(intermediate).toBeDefined();
    expect(intermediate?.status).toBe("NOT_STARTED");
    expect(intermediate?.dueTs).toBeNull();
    expect(intermediate?.dueAt).toBeNull();
  });

  test("a chained trigger starts the dependent clock", () => {
    const initialSubmitted = TRIGGER_TS + 3 * HOUR_MS;
    const clocks = attachRegulatoryClocks({
      incident: fixtureIncident(),
      station: "wealth",
      nowTs: initialSubmitted,
      triggers: { INITIAL_NOTIFICATION: initialSubmitted }
    });
    const intermediate = clocks.find((clock) => clock.clockId === "dora-rts-2025-301-art5-intermediate");
    expect(intermediate?.status).toBe("PENDING");
    expect(intermediate?.dueTs).toBe(initialSubmitted + 72 * HOUR_MS);
  });
});

describe("overdue detection", () => {
  test("is PENDING before the deadline, DUE_SOON inside the window, OVERDUE after it", () => {
    const base = { incident: fixtureIncident(), station: "health" as const };
    const dueTs = TRIGGER_TS + 60 * DAY_MS;

    const pending = attachRegulatoryClocks({ ...base, nowTs: dueTs - 10 * DAY_MS });
    expect(pending.find((c) => c.clockId === "hipaa-164-404-individual-notice")?.status).toBe("PENDING");

    const dueSoon = attachRegulatoryClocks({ ...base, nowTs: dueTs - 2 * HOUR_MS });
    expect(dueSoon.find((c) => c.clockId === "hipaa-164-404-individual-notice")?.status).toBe("DUE_SOON");

    const atDeadline = attachRegulatoryClocks({ ...base, nowTs: dueTs });
    expect(atDeadline.find((c) => c.clockId === "hipaa-164-404-individual-notice")?.status).toBe("DUE_SOON");

    const overdue = attachRegulatoryClocks({ ...base, nowTs: dueTs + 1 });
    const clock = overdue.find((c) => c.clockId === "hipaa-164-404-individual-notice");
    expect(clock?.status).toBe("OVERDUE");
    expect(clock?.overdueByMs).toBe(1);
  });

  test("a satisfied clock is SATISFIED even after the deadline, but not if satisfied late", () => {
    const base = { incident: fixtureIncident(), station: "health" as const };
    const dueTs = TRIGGER_TS + 60 * DAY_MS;

    const onTime = attachRegulatoryClocks({
      ...base,
      nowTs: dueTs + 5 * DAY_MS,
      satisfied: { "hipaa-164-404-individual-notice": dueTs - DAY_MS }
    });
    expect(onTime.find((c) => c.clockId === "hipaa-164-404-individual-notice")?.status).toBe("SATISFIED");

    const late = attachRegulatoryClocks({
      ...base,
      nowTs: dueTs + 5 * DAY_MS,
      satisfied: { "hipaa-164-404-individual-notice": dueTs + DAY_MS }
    });
    expect(late.find((c) => c.clockId === "hipaa-164-404-individual-notice")?.status).toBe("SATISFIED_LATE");
  });

  test("a satisfaction timestamp before the trigger is rejected", () => {
    expect(() =>
      attachRegulatoryClocks({
        incident: fixtureIncident(),
        station: "health",
        nowTs: TRIGGER_TS,
        satisfied: { "hipaa-164-404-individual-notice": TRIGGER_TS - 1 }
      })
    ).toThrow(/before its trigger/);
  });
});
