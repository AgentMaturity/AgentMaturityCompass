// AMC-1516: the neutral importer's only producer of portable external evidence.
// Synthetic traces; this checks the projection contract, not any real producer.
import { describe, expect, test } from "vitest";
import type { ProductionTrace } from "../src/agents/traceIngestion.js";
import { neutralExternalEvidenceProfiles } from "../src/importers/externalEvidenceExport.js";
import type { NeutralImportCandidate } from "../src/importers/neutralImporter.js";
import { verifyExternalEvidence } from "../src/standard/externalEvidenceProfile.js";

const ingestedAt = "2026-10-03T00:00:00.000Z";
const candidate = (overrides: Partial<NeutralImportCandidate> = {}): NeutralImportCandidate => ({
  category: "trace-jsonl", path: "/fixture/traces.jsonl", format: "jsonl", digest: "d".repeat(64), bytes: 1, recordCount: 1,
  confidence: 1, summary: "synthetic", redactionCount: 0, ...overrides
});
const trace = (overrides: Partial<ProductionTrace> = {}): ProductionTrace => ({
  traceId: "t", agentId: "agent", agentType: "fixture", input: "PRIVATE-INPUT-CONTENT", output: "PRIVATE-OUTPUT-CONTENT",
  durationMs: null, timestamp: null, metadata: {}, ...overrides
});
const project = (traces: ProductionTrace[], overrides: Partial<NeutralImportCandidate> = {}) =>
  neutralExternalEvidenceProfiles({ candidate: candidate(overrides), traces, ingestedAt });

describe("neutralExternalEvidenceProfiles", () => {
  test("produces a valid self-reported unsigned import that omits payload content and infers no edges", () => {
    const [profile, ...rest] = project([trace({ sessionId: "s", metadata: { parentId: "p", role: "user", password: "PRIVATE-META" } })]);
    expect(rest).toEqual([]);
    expect(verifyExternalEvidence(profile)).toMatchObject({ ok: true, trustTier: "SELF_REPORTED", signatureVerified: false });
    expect(profile).toMatchObject({ provenance: { trustTier: "SELF_REPORTED", captureMethod: "import", authorityId: null }, signature: null,
      source: { producer: "neutral-artifact", version: "unversioned", originalSha256: "d".repeat(64), mediaType: "application/x-ndjson" },
      session: { id: `import:${"d".repeat(64)}:0`, parentSessionId: null } });
    expect(profile!.events[0]).toEqual({ id: "trace-0", parentId: null, toolCallId: null, kind: "metadata", outcome: "unknown",
      sourceTime: null, durationNs: null, cost: null,
      attributes: { sourceTraceId: "t", sourceSessionId: "s", agentId: "agent", agentType: "fixture", "source.parentId": "p", "source.role": "user" } });
    expect(JSON.stringify(profile)).not.toMatch(/PRIVATE-/);
  });

  test("recognized source formats name the producer and media type", () => {
    const [profile] = project([trace()], { format: "yaml", sourceFormat: { name: "dsh-session", version: 2 } as NeutralImportCandidate["sourceFormat"] });
    expect(profile!.source).toMatchObject({ producer: "dsh-session", version: "2", mediaType: "application/yaml" });
  });

  test("cancellation and failure are kept apart and never become success", () => {
    const events = project([
      trace({ metadata: { callbackTelemetry: { cancelled: true } } }),
      trace({ metadata: { rejectionKind: "AbortError" } }),
      trace({ error: true }),
      trace({ error: true, metadata: { status: "cancelled" } })
    ])[0]!.events;
    expect(events.map(event => [event.kind, event.outcome])).toEqual([["cancel", "cancelled"], ["cancel", "cancelled"], ["error", "failure"], ["cancel", "cancelled"]]);
  });

  test("source time and duration are kept only when exactly representable", () => {
    const [profile] = project([
      trace({ timestamp: Date.parse("2026-09-08T01:02:03.004Z"), durationMs: 1.5 }),
      trace({ timestamp: 8.64e15 + 1, durationMs: Number.MAX_SAFE_INTEGER }),
      trace({ timestamp: null, durationMs: -1 })
    ]);
    expect(profile!.events.map(event => [event.sourceTime, event.durationNs])).toEqual([["2026-09-08T01:02:03.004Z", 1_500_000], [null, null], [null, null]]);
    const disclosed = (traces: ProductionTrace[]) => project(traces)[0]!.normalization.losses.some(loss => loss.includes("durations not exactly representable"));
    expect(disclosed([trace({ durationMs: Number.MAX_SAFE_INTEGER })])).toBe(true);
    expect(disclosed([trace({ timestamp: 8.64e15 + 1 })])).toBe(true);
    expect(disclosed([trace({ timestamp: 0, durationMs: 0 })])).toBe(false);
  });

  test("malformed Unicode is replaced and long strings bounded instead of refusing the import", () => {
    const [profile] = project([trace({ traceId: `bad\uD800x`, agentType: "y".repeat(2000) })]);
    expect(profile!.events[0]!.attributes).toMatchObject({ sourceTraceId: "bad�x", agentType: "y".repeat(1024) });
    expect(profile!.normalization.losses.some(loss => loss.includes("malformed Unicode replaced"))).toBe(true);
  });

  test("large sources split into bounded parts without cross-part ancestry and disclose redaction", () => {
    const parts = project(Array.from({ length: 1001 }, (_, index) => trace({ traceId: `t${index}` })), { redactionCount: 2 });
    expect(parts.map(part => part.events.length)).toEqual([1000, 1]);
    expect(parts[1]!.events[0]).toMatchObject({ id: "trace-1000", parentId: null, attributes: { sourceTraceId: "t1000" } });
    expect(parts.map(part => part.session.id)).toEqual([`import:${"d".repeat(64)}:0`, `import:${"d".repeat(64)}:1`]);
    for (const part of parts) {
      expect(part.normalization.losses).toContain("The source projection is split into 2 independently bounded parts without inferred cross-part ancestry.");
      expect(part.normalization.losses).toContain("Known sensitive source fields were redacted before normalization.");
    }
    expect(project([])).toHaveLength(1);
  });
});
