import Database from "better-sqlite3";
import { createHash, generateKeyPairSync, randomUUID, verify } from "node:crypto";
import { chmodSync, copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { signHexDigest } from "../src/crypto/keys.js";
import { computeIncidentHash, createIncidentStore, type IncidentStoreInstance } from "../src/incidents/incidentStore.js";
import type { Incident, IncidentClockEvent } from "../src/incidents/incidentTypes.js";
import {
  CLOCK_LISTING_NOTES, IncidentInputError, MAX_FUTURE_SKEW_MS, clockListing,
  loadIncidentClocks, parseIsoTimestamp, parseStation, recordIncidentClockEvent,
  type RecordIncidentClockEventInput
} from "../src/incidents/incidentClockEvents.js";
import { attachRegulatoryClocks } from "../src/incidents/regulatoryClocks.js";

const T = Date.UTC(2026, 2, 2, 10);
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const NYDFS = "nydfs-500-17-notice";
const US_CLOCKS = [
  NYDFS, "nydfs-500-17-extortion-notice", "nydfs-500-17-extortion-explanation",
  "glba-314-4j-ftc-notice", "bsa-1020-320-sar-filing"
];

// Independent flat event-preimage encoding. No product hash/verifier is used here.
function eventDigest(event: IncidentClockEvent): Buffer {
  const fields = {
    event_id: event.eventId, incident_id: event.incidentId, kind: event.kind,
    trigger_or_clock_id: event.triggerOrClockId, station: event.station, ts: event.ts,
    recorded_ts: event.recordedTs, recorded_by: event.recordedBy
  };
  const sorted = Object.fromEntries(Object.entries(fields).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0));
  return createHash("sha256").update(JSON.stringify(sorted)).digest();
}

function authentic(event: IncidentClockEvent, publicKey: string): boolean {
  return verify(null, eventDigest(event), publicKey, Buffer.from(event.signature, "base64"));
}

interface Fixture {
  root: string;
  incident: Incident;
  publicKey: string;
  otherPublicKey: string;
  readonly db: Database.Database;
  readonly store: IncidentStoreInstance;
  record(patch?: Partial<RecordIncidentClockEventInput>): IncidentClockEvent;
  reopen(): void;
  corruptCopy(eventId: string, field: "ts" | "station", value: number | string): IncidentStoreInstance;
}

function withFixture(body: (fixture: Fixture) => void): void {
  const root = mkdtempSync(join(tmpdir(), "amc-p117-clock-events-"));
  chmodSync(root, 0o700);
  const handles: Database.Database[] = [];
  const observations: unknown[] = [];
  const errors: unknown[] = [];
  try {
    const keys = generateKeyPairSync("ed25519");
    const privateKey = keys.privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    const publicKey = keys.publicKey.export({ type: "spki", format: "pem" }).toString();
    const otherPublicKey = generateKeyPairSync("ed25519").publicKey.export({ type: "spki", format: "pem" }).toString();
    // Local operator anchor exists before any incident/event/database artifact.
    writeFileSync(join(root, "monitor.pub.pem"), publicKey, { mode: 0o600, flag: "wx" });
    const file = join(root, "incidents.sqlite");
    let db = new Database(file);
    handles.push(db);
    chmodSync(file, 0o600);
    let store = createIncidentStore(db);
    store.initTables();
    const unsigned: Omit<Incident, "incident_hash" | "signature"> = {
      incidentId: `inc_${randomUUID()}`, agentId: "p117-fixture-agent", severity: "CRITICAL", state: "OPEN",
      title: "Local clock qualification fixture", description: "Operator-stated incident; no legal applicability claim.",
      triggerType: "MANUAL", triggerId: "p117-fixture", rootCauseClaimIds: [], affectedQuestionIds: [],
      causalEdges: [], timelineEventIds: [], createdTs: T, updatedTs: T, resolvedTs: null,
      postmortemRef: null, prev_incident_hash: "GENESIS_INCIDENT"
    };
    const incident_hash = computeIncidentHash(unsigned);
    const incident: Incident = { ...unsigned, incident_hash, signature: signHexDigest(incident_hash, privateKey) };
    store.insertIncident(incident);
    const reopen = () => {
      db.close();
      db = new Database(file);
      handles.push(db);
      store = createIncidentStore(db);
    };
    const fixture: Fixture = {
      root, incident, publicKey, otherPublicKey,
      get db() { return db; },
      get store() { return store; },
      record(patch = {}) {
        const event = recordIncidentClockEvent(store, {
          incidentId: incident.incidentId, station: "wealth", kind: "TRIGGER",
          triggerOrClockId: "INCIDENT_DETERMINATION", ts: T, recordedBy: "fixture:owner",
          privateKeyPem: privateKey, publicKeys: [publicKey], now: () => T + HOUR, ...patch
        });
        observations.push({ event });
        return event;
      },
      reopen,
      corruptCopy(eventId, field, value) {
        // Exercise cryptographic admission after cold disk corruption, separately
        // from the live store's SQL UPDATE guard. Never weaken the original DB.
        db.close();
        const originalSha256 = createHash("sha256").update(readFileSync(file)).digest("hex");
        const copy = join(root, `corrupt-${field}.sqlite`);
        copyFileSync(file, copy);
        chmodSync(copy, 0o600);
        db = new Database(file);
        handles.push(db);
        store = createIncidentStore(db);
        const damaged = new Database(copy);
        handles.push(damaged);
        damaged.exec("DROP TRIGGER protect_incident_clock_events_immutable");
        const column = field === "ts" ? "ts" : "station";
        expect(damaged.prepare(`UPDATE incident_clock_events SET ${column} = ? WHERE event_id = ?`).run(value, eventId).changes).toBe(1);
        expect(createHash("sha256").update(readFileSync(file)).digest("hex")).toBe(originalSha256);
        observations.push({ corruption: { field, eventId, originalSha256, copy } });
        return createIncidentStore(damaged);
      }
    };
    body(fixture);
  } catch (error) {
    errors.push(error);
  } finally {
    for (const db of handles.reverse()) {
      try { if (db.open) db.close(); } catch (error) { errors.push(error); }
    }
    try {
      writeFileSync(join(root, "observations.json"), JSON.stringify({ observations, errorCount: errors.length }, null, 2), { mode: 0o600, flag: "wx" });
    } catch (error) { errors.push(error); }
    if (errors.length === 0) {
      try { rmSync(root, { recursive: true }); } catch (error) { errors.push(error); }
    }
    if (errors.length) console.error(`P117 retained clock fixture: ${root}`);
  }
  if (errors.length === 1) throw errors[0];
  if (errors.length) throw new AggregateError(errors, "P117 clock fixture body/cleanup failure");
}

describe("stored signed incident clock events", () => {
  test("persists a genuine signed row and verifies after closing and reopening SQLite", () => withFixture((f) => {
    const event = f.record();
    expect(authentic(event, f.publicKey)).toBe(true);
    expect(authentic(event, f.otherPublicKey)).toBe(false);
    expect(event.recordedTs).toBe(T + HOUR);
    expect(event.ts).toBe(T);
    f.reopen();
    expect(f.store.getIncidentClockEvents(f.incident.incidentId)).toEqual([event]);
    const loaded = loadIncidentClocks(f.store, f.incident.incidentId, "wealth", T + HOUR, [f.publicKey]);
    expect(loaded.events).toEqual([event]);
    expect(loaded.clocks.find((c) => c.clockId === NYDFS)?.dueTs).toBe(T + 72 * HOUR);
  }));

  test.each([
    { label: "before due", notified: T + 71 * HOUR, status: "SATISFIED" },
    { label: "at due", notified: T + 72 * HOUR, status: "SATISFIED" },
    { label: "after due", notified: T + 72 * HOUR + 1, status: "SATISFIED_LATE" }
  ])("trigger then notified $label", ({ notified, status }) => withFixture((f) => {
    f.record();
    const event = f.record({ kind: "NOTIFIED", triggerOrClockId: NYDFS, ts: notified, now: () => notified + HOUR });
    expect(authentic(event, f.publicKey)).toBe(true);
    f.reopen();
    const loaded = loadIncidentClocks(f.store, f.incident.incidentId, "wealth", notified + HOUR, [f.publicKey]);
    expect(loaded.clocks.find((c) => c.clockId === NYDFS)).toMatchObject({ status, satisfiedTs: notified, dueTs: T + 72 * HOUR });
    expect(loaded.events).toHaveLength(2);
  }));

  test("rejects a pre-creation notice even when its trigger has not started, with no appended row", () => withFixture((f) => {
    // No INCIDENT_DETERMINATION exists. Removing only createdTs admission must
    // genuinely insert this notice; trigger validation cannot mask the control.
    expect(() => f.record({ kind: "NOTIFIED", triggerOrClockId: NYDFS, ts: T - 1 })).toThrow(IncidentInputError);
    expect(f.store.getIncidentClockEvents(f.incident.incidentId)).toEqual([]);
  }));

  test("rejects a trigger before creation without appending", () => withFixture((f) => {
    expect(() => f.record({ ts: T - 1 })).toThrow(/backdated/);
    expect(f.store.getIncidentClockEvents(f.incident.incidentId)).toEqual([]);
  }));

  test("accepts exactly five minutes skew and refuses one millisecond more", () => withFixture((f) => {
    const boundary = f.record({ ts: T + MAX_FUTURE_SKEW_MS, now: () => T });
    expect(authentic(boundary, f.publicKey)).toBe(true);
    expect(() => f.record({ ts: T + MAX_FUTURE_SKEW_MS + 1, now: () => T })).toThrow(/future-dated/);
    expect(f.store.getIncidentClockEvents(f.incident.incidentId)).toEqual([boundary]);
  }));

  test.each([
    { patch: { kind: "NOTIFIED" as const, triggerOrClockId: "unknown-clock" }, reason: /unknown clock/ },
    { patch: { triggerOrClockId: "UNKNOWN_TRIGGER" }, reason: /unknown trigger/ },
    { patch: { recordedBy: " " }, reason: /recordedBy/ },
    { patch: { ts: Number.NaN }, reason: /finite/ }
  ])("refuses invalid event $patch", ({ patch, reason }) => withFixture((f) => {
    expect(() => f.record(patch)).toThrow(reason);
    expect(f.store.getIncidentClockEvents(f.incident.incidentId)).toEqual([]);
  }));

  test("refuses a notice before its actual trigger and a second notice", () => withFixture((f) => {
    f.record({ ts: T + HOUR });
    expect(() => f.record({ kind: "NOTIFIED", triggerOrClockId: NYDFS, ts: T + HOUR - 1 })).toThrow(/before its trigger/);
    const first = f.record({ kind: "NOTIFIED", triggerOrClockId: NYDFS, ts: T + 2 * HOUR, now: () => T + 3 * HOUR });
    expect(() => f.record({ kind: "NOTIFIED", triggerOrClockId: NYDFS, ts: T + 3 * HOUR, now: () => T + 3 * HOUR })).toThrow(/already recorded/);
    expect(f.store.getIncidentClockEvents(f.incident.incidentId)).toHaveLength(2);
    expect(authentic(first, f.publicKey)).toBe(true);
  }));

  test("earlier genuine trigger claims may bring a deadline forward, never postpone it", () => withFixture((f) => {
    f.record({ ts: T + 2 * HOUR, now: () => T + 3 * HOUR });
    f.record({ ts: T + HOUR, now: () => T + 3 * HOUR });
    const loaded = loadIncidentClocks(f.store, f.incident.incidentId, "wealth", T + 3 * HOUR, [f.publicKey]);
    expect(loaded.clocks.find((c) => c.clockId === NYDFS)?.dueTs).toBe(T + 73 * HOUR);
  }));

  test("live SQL append-only guards reject UPDATE and DELETE", () => withFixture((f) => {
    const event = f.record();
    expect(() => f.db.prepare("UPDATE incident_clock_events SET ts = ? WHERE event_id = ?").run(T + 1, event.eventId)).toThrow(/append-only/);
    expect(() => f.db.prepare("DELETE FROM incident_clock_events WHERE event_id = ?").run(event.eventId)).toThrow(/cannot be deleted/);
    expect(f.store.getIncidentClockEvents(f.incident.incidentId)).toEqual([event]);
  }));

  test("cold edited timestamp is refused by event id after valid original signature proof", () => withFixture((f) => {
    const event = f.record();
    expect(authentic(event, f.publicKey)).toBe(true);
    const damaged = f.corruptCopy(event.eventId, "ts", T + 1);
    expect(authentic(damaged.getIncidentClockEvents(f.incident.incidentId)[0]!, f.publicKey)).toBe(false);
    expect(() => loadIncidentClocks(damaged, f.incident.incidentId, "wealth", T + HOUR, [f.publicKey])).toThrow(`clock event ${event.eventId} refused: signature verification failed`);
    expect(loadIncidentClocks(f.store, f.incident.incidentId, "wealth", T + HOUR, [f.publicKey]).events).toEqual([event]);
  }));

  test("editing signed station cannot hide a corrupt row from its original station query", () => withFixture((f) => {
    const event = f.record();
    expect(authentic(event, f.publicKey)).toBe(true);
    const damaged = f.corruptCopy(event.eventId, "station", "technology");
    expect(authentic(damaged.getIncidentClockEvents(f.incident.incidentId)[0]!, f.publicKey)).toBe(false);
    // Once station is corrupt, a filter cannot safely attribute the original row.
    // Validate all incident signatures before selecting the requested station.
    expect(() => loadIncidentClocks(damaged, f.incident.incidentId, "wealth", T + HOUR, [f.publicKey])).toThrow(`clock event ${event.eventId} refused: signature verification failed`);
  }));

  test("authentic other-station rows remain independent and wrong trust keys refuse", () => withFixture((f) => {
    const wealth = f.record();
    const technology = f.record({ station: "technology" });
    expect(authentic(technology, f.publicKey)).toBe(true);
    expect(loadIncidentClocks(f.store, f.incident.incidentId, "wealth", T + HOUR, [f.publicKey]).events).toEqual([wealth]);
    expect(loadIncidentClocks(f.store, f.incident.incidentId, "technology", T + HOUR, [f.publicKey]).events).toEqual([technology]);
    expect(() => loadIncidentClocks(f.store, f.incident.incidentId, "wealth", T + HOUR, [f.otherPublicKey])).toThrow(wealth.eventId);
  }));

  test("listing serializes operator and server times plus local-trust and applicability limits", () => withFixture((f) => {
    const event = f.record();
    const listing = clockListing(loadIncidentClocks(f.store, f.incident.incidentId, "wealth", T + HOUR, [f.publicKey]), "wealth", T + HOUR);
    const json = JSON.parse(JSON.stringify(listing)) as typeof listing;
    expect(json).toMatchObject({ incidentId: f.incident.incidentId, station: "wealth", now: "2026-03-02T11:00:00.000Z" });
    expect(json.events).toEqual([{ eventId: event.eventId, kind: "TRIGGER", triggerOrClockId: "INCIDENT_DETERMINATION", at: "2026-03-02T10:00:00.000Z", recordedAt: "2026-03-02T11:00:00.000Z", recordedBy: "fixture:owner" }]);
    expect(json.notes).toEqual([...CLOCK_LISTING_NOTES]);
    expect(json.notes.join(" ")).toMatch(/experimental/);
    expect(json.notes.join(" ")).toMatch(/local audit trail, not independent proof/);
    expect(json.notes.join(" ")).toMatch(/does not file notices/);
  }));
});

describe("US financial clock literals at a fixed date", () => {
  test.each([
    { id: NYDFS, due: T + 72 * HOUR },
    { id: "nydfs-500-17-extortion-notice", due: T + 24 * HOUR },
    { id: "nydfs-500-17-extortion-explanation", due: T + 30 * DAY },
    { id: "glba-314-4j-ftc-notice", due: T + 30 * DAY },
    { id: "bsa-1020-320-sar-filing", due: T + HOUR + 30 * DAY }
  ])("$id has an independent literal due-date expectation", ({ id, due }) => withFixture((f) => {
    const clocks = attachRegulatoryClocks({ incident: f.incident, station: "wealth", nowTs: T + HOUR,
      triggers: { INCIDENT_DETERMINATION: T, EXTORTION_PAYMENT: T, INITIAL_DETECTION: T + HOUR } });
    expect(clocks.find((c) => c.clockId === id)?.dueTs).toBe(due);
  }));

  test("wealth lists five, technology excludes SAR, health excludes the five and sources remain experimental", () => withFixture((f) => {
    const list = (station: "wealth" | "technology" | "health") => attachRegulatoryClocks({ incident: f.incident, station, nowTs: T });
    const wealth = list("wealth").filter((c) => US_CLOCKS.includes(c.clockId));
    expect(wealth.map((c) => c.clockId).sort()).toEqual([...US_CLOCKS].sort());
    expect(list("technology").filter((c) => US_CLOCKS.includes(c.clockId)).map((c) => c.clockId).sort()).toEqual(US_CLOCKS.filter((id) => !id.startsWith("bsa-")).sort());
    expect(list("health").filter((c) => US_CLOCKS.includes(c.clockId))).toEqual([]);
    const glba = wealth.find((c) => c.clockId === "glba-314-4j-ftc-notice")!;
    expect(glba.condition).toMatch(/500 or more consumers/);
    expect(wealth.find((c) => c.clockId === "bsa-1020-320-sar-filing")?.requiredContent.join(" ")).toMatch(/Never disclose the SAR or its existence/);
    for (const clock of wealth) {
      expect(new URL(clock.source.url).hostname).toMatch(/(^|\.)(govinfo\.gov|ecfr\.gov|dfs\.ny\.gov)$/);
      expect(clock.source.retrievedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(clock.review).toBe("experimental: agent-drafted, expert review pending (D-08)");
    }
  }));

  test("station and ISO parsing reject an unknown station and a timezone-free timestamp", () => {
    expect(parseStation("wealth")).toBe("wealth");
    expect(() => parseStation("unknown-station")).toThrow(IncidentInputError);
    expect(parseIsoTimestamp("2026-03-02T10:00:00Z", "at")).toBe(T);
    expect(() => parseIsoTimestamp("2026-03-02T10:00:00", "at")).toThrow(IncidentInputError);
  });
});
