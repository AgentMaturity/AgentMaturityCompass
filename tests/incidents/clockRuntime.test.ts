/** P2-26 slice A: clocks start from recorded triggers, undecidable ones wait for a person, and drafts are never sent. */
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { getPublicKeyHistory, getSigningKey, signHexDigest } from "../../src/crypto/keys.js";
import { decideClock, incidentRuntimeClocks, jurisdictionFact, startIncidentClocks, type ClockPlanFacts } from "../../src/incidents/clockRuntime.js";
import { recordIncidentClockEvent } from "../../src/incidents/incidentClockEvents.js";
import { computeIncidentHash, createIncidentStore } from "../../src/incidents/incidentStore.js";
import type { Incident } from "../../src/incidents/incidentTypes.js";
import { NOTICE_DRAFT_BANNER, incidentNoticeDrafts } from "../../src/incidents/noticeDraft.js";
import { REGULATORY_CLOCK_TABLE } from "../../src/incidents/regulatoryClocksTable.js";
import { openLedger, type Ledger } from "../../src/ledger/ledger.js";
import { buildBlockerInbox, DEFAULT_INBOX_SOURCES } from "../../src/operator/blockerInbox.js";
import { initWorkspace } from "../../src/workspace.js";

vi.setConfig({ testTimeout: 60_000 });
const T = Date.UTC(2026, 9, 27, 10);
const HOUR = 3_600_000;
let workspace: string;
let ledger: Ledger;

const facts = (over: Partial<ClockPlanFacts> = {}): ClockPlanFacts =>
  ({ planDigest: "sha256:fixture", stations: ["wealth"], jurisdictions: ["US", "US-NY"], entityTypes: ["bank"], ...over });

function openIncident(id = "inc_p226"): Incident {
  const store = createIncidentStore(ledger.db);
  store.initTables();
  const unsigned: Omit<Incident, "incident_hash" | "signature"> = {
    incidentId: id, agentId: "default", severity: "CRITICAL", state: "OPEN", title: "P2-26 fixture", description: "fixture",
    triggerType: "MANUAL", triggerId: id, rootCauseClaimIds: [], affectedQuestionIds: [], causalEdges: [], timelineEventIds: [],
    createdTs: T, updatedTs: T, resolvedTs: null, postmortemRef: null, prev_incident_hash: "GENESIS_INCIDENT"
  };
  const incident_hash = computeIncidentHash(unsigned);
  const incident = { ...unsigned, incident_hash, signature: signHexDigest(incident_hash, getSigningKey(workspace, "ledger-row")) };
  store.insertIncident(incident);
  return incident;
}

function trigger(incidentId: string, triggerName: string, ts: number, station: "wealth" = "wealth") {
  return recordIncidentClockEvent(createIncidentStore(ledger.db), {
    incidentId, station, kind: "TRIGGER", triggerOrClockId: triggerName, ts, recordedBy: "cli:operator",
    privateKeyPem: getSigningKey(workspace, "ledger-row"), publicKeys: getPublicKeyHistory(workspace, "monitor"), now: () => ts
  });
}

const clock = (incidentId: string, clockId: string, nowTs: number) =>
  incidentRuntimeClocks({ workspace, db: ledger.db, incidentId, nowTs }).clocks.find((c) => c.clockId === clockId);

beforeEach(() => {
  workspace = realpathSync(mkdtempSync(join(tmpdir(), "amc-p226-clocks-")));
  initWorkspace({ workspacePath: workspace, agentId: "default", trustBoundaryMode: "isolated" });
  ledger = openLedger(workspace);
});
afterEach(() => {
  ledger.close();
  rmSync(workspace, { recursive: true, force: true });
});

describe("applicability from plan facts", () => {
  test("a Wealth deployment with New York facts: the NYDFS clock starts at its declared trigger and falls due 72 hours later", () => {
    const incident = openIncident();
    const run = startIncidentClocks({ workspace, db: ledger.db, incidentId: incident.incidentId, nowTs: T, facts: facts() });
    expect(run.decisions).toContainEqual(expect.objectContaining({ clockId: "nydfs-500-17-notice", applicability: "APPLICABLE", station: "wealth" }));
    expect(clock(incident.incidentId, "nydfs-500-17-notice", T)?.status).toBe("NOT_STARTED");
    trigger(incident.incidentId, "INCIDENT_DETERMINATION", T + HOUR);
    const started = clock(incident.incidentId, "nydfs-500-17-notice", T + 2 * HOUR)!;
    expect(started.triggerTs).toBe(T + HOUR);
    expect(started.dueTs).toBe(T + 73 * HOUR);
    expect(started.experimental).toBe(true);
  });

  test("DORA's classification clock stays NOT_STARTED until a signed CLASSIFICATION_MAJOR, then falls due 4 hours later", () => {
    const incident = openIncident();
    startIncidentClocks({ workspace, db: ledger.db, incidentId: incident.incidentId, nowTs: T,
      facts: facts({ jurisdictions: ["EU"], entityTypes: ["eu_financial_entity"] }) });
    const id = "dora-rts-2025-301-art5-initial-classification";
    expect(clock(incident.incidentId, id, T + HOUR)?.status).toBe("NOT_STARTED");
    trigger(incident.incidentId, "CLASSIFICATION_MAJOR", T + 2 * HOUR);
    expect(clock(incident.incidentId, id, T + 3 * HOUR)).toMatchObject({ status: "DUE_SOON", dueTs: T + 6 * HOUR });
    expect(clock(incident.incidentId, id, T + 7 * HOUR)?.status).toBe("OVERDUE");
  });

  test("an undecidable condition is NEEDS_CLASSIFICATION with an inbox item; a non-applicable jurisdiction starts no clock", () => {
    const incident = openIncident();
    const run = startIncidentClocks({ workspace, db: ledger.db, incidentId: incident.incidentId, nowTs: T,
      facts: facts({ stations: ["technology"], jurisdictions: ["EU"], entityTypes: [] }) });
    expect(run.decisions).toContainEqual(expect.objectContaining({ clockId: "eu-cra-early-warning-24h", applicability: "NEEDS_CLASSIFICATION" }));
    expect(run.decisions.some((d) => d.clockId.startsWith("tx-"))).toBe(false);
    expect(clock(incident.incidentId, "eu-cra-early-warning-24h", T + HOUR)).toMatchObject({ status: "NEEDS_CLASSIFICATION", dueTs: T + 24 * HOUR });
    const inbox = buildBlockerInbox({ workspace, nowTs: T + HOUR, sources: { incidentClocks: DEFAULT_INBOX_SOURCES.incidentClocks! } });
    expect(inbox.items).toContainEqual(expect.objectContaining({ id: `clock:${incident.incidentId}:eu-cra-early-warning-24h:NEEDS_CLASSIFICATION`,
      kind: "not_evaluated", dueTs: T + 24 * HOUR }));
  });

  test("unknown facts never drop a clock; an asserted absent entity type does", () => {
    const dora = REGULATORY_CLOCK_TABLE.find((c) => c.clockId === "dora-rts-2025-301-art5-initial-classification")!;
    expect(decideClock(dora, { jurisdictions: null, entityTypes: null })?.applicability).toBe("NEEDS_CLASSIFICATION");
    expect(decideClock(dora, { jurisdictions: ["EU"], entityTypes: null })?.applicability).toBe("NEEDS_CLASSIFICATION");
    expect(decideClock(dora, { jurisdictions: ["EU"], entityTypes: ["bank"] })).toBeNull();
    expect(jurisdictionFact("US-NY", ["US"])).toBe("unknown");
    expect(jurisdictionFact("US-NY", ["EU"])).toBe("absent");
  });

  test("no active plan: the run is not_evaluated and the inbox says so", () => {
    const incident = openIncident();
    const run = startIncidentClocks({ workspace, db: ledger.db, incidentId: incident.incidentId, nowTs: T });
    expect(run).toMatchObject({ status: "not_evaluated", decisions: [] });
    const inbox = buildBlockerInbox({ workspace, nowTs: T, sources: { incidentClocks: DEFAULT_INBOX_SOURCES.incidentClocks! } });
    expect(inbox.items).toEqual([expect.objectContaining({ id: `clocks:${incident.incidentId}`, kind: "not_evaluated" })]);
  });

  test("the run is recorded once, append-only and signed", () => {
    const incident = openIncident();
    const first = startIncidentClocks({ workspace, db: ledger.db, incidentId: incident.incidentId, nowTs: T, facts: facts() });
    expect(startIncidentClocks({ workspace, db: ledger.db, incidentId: incident.incidentId, nowTs: T + 1, facts: null })).toEqual(first);
    expect(() => ledger.db.prepare("DELETE FROM incident_clock_runs").run()).toThrow(/append-only/);
    ledger.db.exec("DROP TRIGGER incident_clock_runs_append_only");
    ledger.db.prepare("UPDATE incident_clock_runs SET decisions_json = '[]'").run();
    expect(() => incidentRuntimeClocks({ workspace, db: ledger.db, incidentId: incident.incidentId, nowTs: T })).toThrow(/signature verification failed/);
  });
});

describe("triggers and drafts", () => {
  test("a trigger before incident creation is refused", () => {
    const incident = openIncident();
    startIncidentClocks({ workspace, db: ledger.db, incidentId: incident.incidentId, nowTs: T, facts: facts() });
    expect(() => recordIncidentClockEvent(createIncidentStore(ledger.db), {
      incidentId: incident.incidentId, station: "wealth", kind: "TRIGGER", triggerOrClockId: "INCIDENT_DETERMINATION", ts: T - HOUR,
      recordedBy: "cli:operator", privateKeyPem: getSigningKey(workspace, "ledger-row"), publicKeys: getPublicKeyHistory(workspace, "monitor"), now: () => T
    })).toThrow(/backdated/);
  });

  test("the notice draft holds deadline, recipients, checklist, missing items and the banner; no outbound call", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const incident = openIncident();
    startIncidentClocks({ workspace, db: ledger.db, incidentId: incident.incidentId, nowTs: T, facts: facts() });
    trigger(incident.incidentId, "INCIDENT_DETERMINATION", T + HOUR);
    const { drafts } = incidentNoticeDrafts({ workspace, db: ledger.db, incidentId: incident.incidentId, nowTs: T + 2 * HOUR });
    const nydfs = drafts.find((d) => d.json.clockId === "nydfs-500-17-notice")!;
    expect(nydfs.json).toMatchObject({ banner: NOTICE_DRAFT_BANNER, deadline: new Date(T + 73 * HOUR).toISOString() });
    expect(nydfs.json.recipients.length).toBeGreaterThan(0);
    expect(nydfs.json.checklist.length).toBe(3);
    expect(nydfs.json.missing).toContainEqual(expect.objectContaining({ item: "human-oversight-record" }));
    expect(nydfs.markdown).toContain(NOTICE_DRAFT_BANNER);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
