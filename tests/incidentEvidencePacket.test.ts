import { generateKeyPairSync } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import type { Incident, IncidentTransition } from "../src/incidents/incidentTypes.js";
import { attachRegulatoryClocks } from "../src/incidents/regulatoryClocks.js";
import { signHexDigest } from "../src/crypto/keys.js";
import {
  appendOversightRecord,
  computeOversightRecordHash,
  createOversightRecord,
  readOversightRecords,
  verifyOversightRecord
} from "../src/incidents/oversightRecord.js";
import {
  buildEvidencePacket,
  renderEvidencePacketMarkdown
} from "../src/incidents/evidencePacket.js";

const TRIGGER_TS = Date.UTC(2026, 2, 2, 10, 0, 0, 0);
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

const keyPair = generateKeyPairSync("ed25519");
const PRIVATE_PEM = keyPair.privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const PUBLIC_PEM = keyPair.publicKey.export({ type: "spki", format: "pem" }).toString();
const OTHER_PUBLIC_PEM = generateKeyPairSync("ed25519")
  .publicKey.export({ type: "spki", format: "pem" })
  .toString();

const tempDirs: string[] = [];
afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function fixtureIncident(overrides: Partial<Incident> = {}): Incident {
  return {
    incidentId: "inc-health-001",
    agentId: "agent-clinical-intake",
    severity: "CRITICAL",
    state: "INVESTIGATING",
    title: "PHI disclosed in agent tool output",
    description: "Agent emitted unsecured PHI for 12 patients into a shared channel.",
    triggerType: "GOVERNANCE_VIOLATION",
    triggerId: "firewall-deny-7f3a",
    rootCauseClaimIds: [],
    affectedQuestionIds: ["HC-PHI-2"],
    causalEdges: [],
    timelineEventIds: [],
    createdTs: TRIGGER_TS,
    updatedTs: TRIGGER_TS + HOUR_MS,
    resolvedTs: null,
    postmortemRef: null,
    prev_incident_hash: "GENESIS_INCIDENT",
    incident_hash: "a".repeat(64),
    signature: "unsigned-fixture",
    ...overrides
  };
}

function reviewInput(incident: Incident, reviewedTs: number) {
  return {
    incident,
    reviewerId: "oncall-sre-jdoe",
    reviewedTs,
    decision: "REPORT_REQUIRED" as const,
    rationale: "PHI of 12 individuals left the trust boundary; HIPAA individual notice applies.",
    clockIds: ["hipaa-164-404-individual-notice"],
    privateKeyPem: PRIVATE_PEM
  };
}

describe("human oversight record", () => {
  test("signs a record tied to the incident hash and verifies with the matching public key", () => {
    const incident = fixtureIncident();
    const record = createOversightRecord(reviewInput(incident, TRIGGER_TS + 2 * HOUR_MS));
    expect(record.incidentHash).toBe(incident.incident_hash);
    expect(record.recordHash).toMatch(/^[a-f0-9]{64}$/);
    expect(verifyOversightRecord(record, incident, [PUBLIC_PEM])).toEqual({ ok: true, errors: [] });
    const wrongKey = verifyOversightRecord(record, incident, [OTHER_PUBLIC_PEM]);
    expect(wrongKey.ok).toBe(false);
    expect(wrongKey.errors.join(" ")).toMatch(/signature/);
  });

  test("cannot be backdated past the incident timestamp", () => {
    const incident = fixtureIncident();
    expect(() => createOversightRecord(reviewInput(incident, TRIGGER_TS - 1))).toThrow(/backdated/);
    expect(() => createOversightRecord(reviewInput(incident, TRIGGER_TS))).not.toThrow();
  });

  test("a stored record whose reviewedTs was edited to precede the incident fails verification", () => {
    const incident = fixtureIncident();
    const record = createOversightRecord(reviewInput(incident, TRIGGER_TS + HOUR_MS));
    const forged = { ...record, reviewedTs: TRIGGER_TS - DAY_MS };
    const result = verifyOversightRecord(forged, incident, [PUBLIC_PEM]);
    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toMatch(/backdated/);
  });

  test("a validly signed but backdated record is rejected by the verifier itself", () => {
    // Bypass createOversightRecord's guard: hash and sign a backdated payload directly.
    const incident = fixtureIncident();
    const payload = {
      v: 1 as const,
      recordId: "forged-backdated",
      incidentId: incident.incidentId,
      incidentHash: incident.incident_hash,
      reviewerId: "oncall-sre-jdoe",
      reviewedTs: TRIGGER_TS - DAY_MS,
      decision: "ACKNOWLEDGED" as const,
      rationale: "signed with a valid key but dated before the incident",
      clockIds: [],
      prevRecordHash: null
    };
    const recordHash = computeOversightRecordHash(payload);
    const signature = signHexDigest(recordHash, PRIVATE_PEM);
    const result = verifyOversightRecord({ ...payload, recordHash, signature }, incident, [PUBLIC_PEM]);
    expect(result.ok).toBe(false);
    expect(result.errors).toEqual([
      expect.stringMatching(/backdated/)
    ]);
  });

  test("a record for a different incident hash is rejected", () => {
    const incident = fixtureIncident();
    const record = createOversightRecord(reviewInput(incident, TRIGGER_TS + HOUR_MS));
    const other = fixtureIncident({ incident_hash: "b".repeat(64) });
    const result = verifyOversightRecord(record, other, [PUBLIC_PEM]);
    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toMatch(/incident hash/);
  });

  test("requires a reviewer and a rationale", () => {
    const incident = fixtureIncident();
    expect(() =>
      createOversightRecord({ ...reviewInput(incident, TRIGGER_TS + 1), reviewerId: " " })
    ).toThrow(/reviewerId/);
    expect(() =>
      createOversightRecord({ ...reviewInput(incident, TRIGGER_TS + 1), rationale: "" })
    ).toThrow(/rationale/);
  });

  test("append-only JSONL file round-trips and chains records", () => {
    const dir = mkdtempSync(join(tmpdir(), "amc-oversight-"));
    tempDirs.push(dir);
    const file = join(dir, "inc-health-001.jsonl");
    const incident = fixtureIncident();
    const first = createOversightRecord(reviewInput(incident, TRIGGER_TS + HOUR_MS));
    appendOversightRecord(file, first);
    const second = createOversightRecord({
      ...reviewInput(incident, TRIGGER_TS + 3 * HOUR_MS),
      decision: "ESCALATED",
      prevRecordHash: first.recordHash
    });
    appendOversightRecord(file, second);

    const stored = readOversightRecords(file);
    expect(stored.map((r) => r.recordId)).toEqual([first.recordId, second.recordId]);
    expect(stored[1]?.prevRecordHash).toBe(first.recordHash);
    expect(stored[0]?.prevRecordHash).toBeNull();
    for (const record of stored) {
      expect(verifyOversightRecord(record, incident, [PUBLIC_PEM]).ok).toBe(true);
    }
  });
});

describe("incident evidence packet", () => {
  test("lists missing evidence explicitly when nothing beyond the incident exists", () => {
    const incident = fixtureIncident();
    const clocks = attachRegulatoryClocks({ incident, station: "health", nowTs: TRIGGER_TS + DAY_MS });
    const packet = buildEvidencePacket({
      incident,
      station: "health",
      generatedTs: TRIGGER_TS + DAY_MS,
      clocks
    });

    const missingItems = packet.missing.map((m) => m.item);
    expect(missingItems).toContain("human-oversight-record");
    expect(missingItems).toContain("ledger-receipts");
    expect(missingItems).toContain("state-transitions");
    expect(missingItems).toContain("timeline-events");
    expect(missingItems).toContain("root-cause-claims");
    expect(missingItems).toContain("postmortem");
    expect(missingItems).toContain("resolution-timestamp");
    for (const item of packet.missing) {
      expect(item.reason.length).toBeGreaterThan(0);
    }
    expect(packet.oversight).toEqual([]);
    expect(packet.receipts).toEqual([]);
    expect(packet.packetSha256).toMatch(/^[a-f0-9]{64}$/);
  });

  test("includes supplied evidence verbatim and drops the corresponding missing items", () => {
    const incident = fixtureIncident({ rootCauseClaimIds: ["claim-42"] });
    const clocks = attachRegulatoryClocks({ incident, station: "health", nowTs: TRIGGER_TS + DAY_MS });
    const record = createOversightRecord(reviewInput(incident, TRIGGER_TS + 2 * HOUR_MS));
    const transition: IncidentTransition = {
      transitionId: "tr-1",
      incidentId: incident.incidentId,
      fromState: "OPEN",
      toState: "INVESTIGATING",
      reason: "on-call picked up",
      ts: TRIGGER_TS + HOUR_MS,
      signature: "unsigned-fixture"
    };
    const packet = buildEvidencePacket({
      incident,
      station: "health",
      generatedTs: TRIGGER_TS + DAY_MS,
      clocks,
      transitions: [transition],
      oversightRecords: [record],
      oversightPublicKeys: [PUBLIC_PEM],
      receipts: [{ receiptId: "rcpt-1", kind: "tool_action", ts: TRIGGER_TS - HOUR_MS, verified: true }],
      timelineEvents: [{ eventId: "evt-1", ts: TRIGGER_TS - HOUR_MS, summary: "tool call emitted PHI" }]
    });

    const missingItems = packet.missing.map((m) => m.item);
    expect(missingItems).not.toContain("human-oversight-record");
    expect(missingItems).not.toContain("ledger-receipts");
    expect(missingItems).not.toContain("state-transitions");
    expect(missingItems).not.toContain("timeline-events");
    expect(missingItems).not.toContain("root-cause-claims");
    expect(missingItems).toContain("postmortem");
    expect(packet.oversight[0]?.recordId).toBe(record.recordId);
    expect(packet.oversight[0]?.signatureVerified).toBe(true);
    expect(packet.transitions).toEqual([transition]);
    expect(packet.receipts[0]?.receiptId).toBe("rcpt-1");
  });

  test("an oversight record that fails verification is reported, not silently accepted", () => {
    const incident = fixtureIncident();
    const clocks = attachRegulatoryClocks({ incident, station: "health", nowTs: TRIGGER_TS + DAY_MS });
    const record = createOversightRecord(reviewInput(incident, TRIGGER_TS + 2 * HOUR_MS));
    const packet = buildEvidencePacket({
      incident,
      station: "health",
      generatedTs: TRIGGER_TS + DAY_MS,
      clocks,
      oversightRecords: [record],
      oversightPublicKeys: [OTHER_PUBLIC_PEM]
    });
    expect(packet.oversight[0]?.signatureVerified).toBe(false);
    expect(packet.missing.map((m) => m.item)).toContain("human-oversight-record");
  });

  test("lists unverified clock sources and overdue clocks", () => {
    const incident = fixtureIncident();
    const nowTs = TRIGGER_TS + 61 * DAY_MS;
    const clocks = attachRegulatoryClocks({ incident, station: "health", nowTs });
    const packet = buildEvidencePacket({ incident, station: "health", generatedTs: nowTs, clocks });
    expect(packet.unverifiedSources.length).toBeGreaterThan(0);
    for (const source of packet.unverifiedSources) {
      expect(source.reason.length).toBeGreaterThan(0);
    }
    expect(packet.overdueClockIds).toContain("hipaa-164-404-individual-notice");
  });

  test("renders Markdown with the missing list and the clock table", () => {
    const incident = fixtureIncident();
    const clocks = attachRegulatoryClocks({ incident, station: "health", nowTs: TRIGGER_TS + DAY_MS });
    const packet = buildEvidencePacket({ incident, station: "health", generatedTs: TRIGGER_TS + DAY_MS, clocks });
    const markdown = renderEvidencePacketMarkdown(packet);
    expect(markdown).toContain("# Incident evidence packet");
    expect(markdown).toContain("## Missing evidence");
    expect(markdown).toContain("human-oversight-record");
    expect(markdown).toContain("45 CFR 164.404");
    expect(markdown).toContain("2026-05-01T10:00:00.000Z");
    expect(markdown).toContain(packet.packetSha256);
  });

  test("a packet generated before the incident timestamp is rejected", () => {
    const incident = fixtureIncident();
    expect(() =>
      buildEvidencePacket({ incident, station: "health", generatedTs: TRIGGER_TS - 1, clocks: [] })
    ).toThrow(/before incident/);
  });
});
