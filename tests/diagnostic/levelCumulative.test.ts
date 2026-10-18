import { describe, expect, test } from "vitest";
import { parseEvidenceEventWith, type ParsedEvidenceEvent } from "../../src/diagnostic/gates.js";
import { EVIDENCE_MAPS } from "../../src/diagnostic/evidenceMaps/index.js";
import { evaluateLevels, eventQuestionIds, levelGates } from "../../src/diagnostic/levelSemantics.js";
import { questionBank } from "../../src/diagnostic/questionBank.js";
import type { DiagnosticQuestion, EvidenceEvent, Gate } from "../../src/types.js";

const DAY = 24 * 60 * 60 * 1000;
function question(id = "AMC-5.29"): DiagnosticQuestion {
  const found = questionBank.find(row => row.id === id);
  if (!found) throw new Error(`Missing canonical question ${id}`);
  return found;
}
function gateAt(gates: readonly Gate[], level: Gate["level"]): Gate {
  const found = gates.find(row => row.level === level);
  if (!found) throw new Error(`Missing gate ${level}`);
  return found;
}
// Synthetic unverified parser input: dummy hashes/signatures establish no ledger or crypto validity.
function row(id: string, auditType: string, ts: number, session: string, meta: Record<string, unknown> = {}): ParsedEvidenceEvent {
  const raw: EvidenceEvent = { id, ts, session_id: session, runtime: "amc", event_type: "audit",
    payload_path: null, payload_inline: "synthetic P1-07 fixture", payload_sha256: "0".repeat(64),
    meta_json: JSON.stringify({ auditType, trustTier: "OBSERVED", ...meta }),
    prev_event_hash: "0".repeat(64), event_hash: "0".repeat(64), writer_sig: "unverified-unit-input" };
  return parseEvidenceEventWith(raw, () => ({ trustList: null }));
}
function auditRows(options: { allowedOnly?: boolean; oneSession?: boolean; oneDay?: boolean; meta?: Record<string, unknown> } = {}): ParsedEvidenceEvent[] {
  const now = Date.now();
  // Independent literals: removing the denied registry entry must not silently remove the denied fixture rows.
  const types = options.allowedOnly
    ? ["TOOL_CALL_ALLOWED", "TOOL_CALL_ALLOWED", "TOOL_CALL_ALLOWED", "TOOL_CALL_ALLOWED"]
    : ["TOOL_CALL_ALLOWED", "TOOL_CALL_DENIED", "TOOL_CALL_ALLOWED", "TOOL_CALL_DENIED"];
  return types.map((type, index) => row(`synthetic-audit-${index}`, type,
    now - (!options.oneDay && index < 2 ? DAY : 0),
    options.oneSession || index < 2 ? "synthetic-session-a" : "synthetic-session-b", options.meta));
}
function syntheticGraph(): Pick<DiagnosticQuestion, "id" | "gates"> {
  const canonical = question();
  // Only this artificial L3 gate passes with no rows. It proves graph traversal, not production L3 reachability.
  const artificialL3: Gate = { level: 3, requiredEvidenceTypes: [], minEvents: 0, minSessions: 0,
    minDistinctDays: 0, acceptedTrustTiers: ["OBSERVED"], mustInclude: {}, mustNotInclude: {} };
  return { id: canonical.id, gates: [gateAt(canonical.gates, 1), gateAt(canonical.gates, 2), artificialL3] };
}
const statuses = (result: ReturnType<typeof evaluateLevels>) => result.perLevel.map(row => [row.level, row.status]);

describe("P1-07 cumulative gate graphs (synthetic inputs)", () => {
  test("a later passing L3 cannot skip failed L2; the contiguous graph still has a positive", () => {
    const graph = syntheticGraph();
    const gap = evaluateLevels(graph, auditRows({ allowedOnly: true }));
    const contiguous = evaluateLevels(graph, auditRows());
    console.log("AMC_P107_SYNTHETIC_GRAPH " + JSON.stringify({ gap, contiguous }));
    expect(statuses(gap)).toEqual([[1, "pass"], [2, "fail"], [3, "pass"]]);
    expect(statuses(contiguous)).toEqual([[1, "pass"], [2, "pass"], [3, "pass"]]);
    expect(contiguous.level).toBe(3);
    expect(gap.level).toBe(1);
  });

  test("gate levels rather than array positions determine the contiguous result", () => {
    const graph = syntheticGraph(), rows = auditRows();
    const shuffled = { id: graph.id, gates: [gateAt(graph.gates, 3), gateAt(graph.gates, 1), gateAt(graph.gates, 2)] };
    expect(evaluateLevels(shuffled, rows)).toEqual(evaluateLevels(graph, rows));
    expect(evaluateLevels(shuffled, rows).level).toBe(3);
  });

  test("a missing lower gate stops advancement although later gates were evaluated", () => {
    const graph = syntheticGraph(), rows = auditRows();
    const noL1 = evaluateLevels({ id: graph.id, gates: graph.gates.filter(gate => gate.level !== 1) }, rows);
    const noL2 = evaluateLevels({ id: graph.id, gates: graph.gates.filter(gate => gate.level !== 2) }, rows);
    expect(statuses(noL1)).toEqual([[2, "pass"], [3, "pass"]]);
    expect(statuses(noL2)).toEqual([[1, "pass"], [3, "pass"]]);
    expect(noL1.level).toBe(0); expect(noL2.level).toBe(1);
  });

  test("duplicate level declarations are refused", () => {
    const graph = syntheticGraph();
    expect(() => evaluateLevels({ id: graph.id, gates: [...graph.gates, gateAt(graph.gates, 2)] }, auditRows()))
      .toThrow(`${graph.id} declares more than one gate for a level`);
  });

  test("not_evaluated below a passing later gate stops the contiguous level", () => {
    const graph = syntheticGraph();
    const result = evaluateLevels({ id: graph.id, gates: graph.gates.map(gate => gate.level === 2
      ? { ...gate, notEvaluated: "synthetic lower prerequisite unavailable" } : gate) }, auditRows());
    expect(statuses(result)).toEqual([[1, "pass"], [2, "not_evaluated"], [3, "pass"]]);
    expect(result.level).toBe(1);
    expect(result.perLevel.find(row => row.level === 2)?.reason).toContain("synthetic lower prerequisite unavailable");
  });
});

describe("P1-07 canonical map with synthetic unverified parser-built rows", () => {
  test("independent allowed and denied literals across two synthetic days and sessions reach only L2", () => {
    const rows = auditRows(), result = evaluateLevels(question(), rows);
    console.log("AMC_P107_CANONICAL_PARSER_INPUT " + JSON.stringify({ inputIds: rows.map(row => row.id), result }));
    // First denied-entry-removal witness. This is a synthetic parser fixture, not a governed-run maturity claim.
    expect(result.level).toBe(2);
    expect(statuses(result)).toEqual([[0, "pass"], [1, "pass"], [2, "pass"], [3, "not_evaluated"], [4, "not_evaluated"], [5, "not_evaluated"]]);
    expect(result.perLevel.find(row => row.level === 2)?.matchedEventIds).toEqual(rows.map(row => row.id));
    expect(rows.every(row => row.trustTier === "OBSERVED")).toBe(true);
  });

  test("missing denied evidence and independent session or day minima remain failures", () => {
    const candidates = [
      { label: "no denied", rows: auditRows({ allowedOnly: true }), reason: "auditType:TOOL_CALL_DENIED" },
      { label: "one session", rows: auditRows({ oneSession: true }), reason: "sessions=1/2" },
      { label: "one day", rows: auditRows({ oneDay: true }), reason: "days=1/2" }
    ].map(candidate => ({ ...candidate, result: evaluateLevels(question(), candidate.rows) }));
    for (const candidate of candidates) {
      expect(candidate.result.level, candidate.label).toBe(1);
      expect(candidate.result.perLevel.find(row => row.level === 2)?.status, candidate.label).toBe("fail");
      expect(candidate.result.perLevel.find(row => row.level === 2)?.reason, candidate.label).toContain(candidate.reason);
    }
  });

  test("map binding ignores writer-selected tags above L1 and preserves a valid taggedRows index", () => {
    const untagged = auditRows(), retagged = auditRows({ meta: { questionIds: ["AMC-1.1"] } });
    expect(evaluateLevels(question(), untagged).level).toBe(2);
    expect(evaluateLevels(question(), retagged).level).toBe(2);
    expect(evaluateLevels(question(), retagged, [])).toEqual(evaluateLevels(question(), retagged));
    const tagged = auditRows({ meta: { questionIds: ["AMC-5.29"] } });
    expect(evaluateLevels(question(), tagged, tagged)).toEqual(evaluateLevels(question(), tagged));
    const unmapped = evaluateLevels(question("AMC-1.1"), retagged);
    expect(unmapped.level).toBe(1);
    expect(unmapped.perLevel.find(row => row.level === 2)?.status).toBe("not_evaluated");
  });

  test("trimmed duplicate question tags bind one supplied event once", () => {
    const single = row("one-tagged-row", "TOOL_CALL_ALLOWED", Date.now(), "one-session",
      { questionIds: [" AMC-5.29 ", "AMC-5.29", "", 7] });
    const result = evaluateLevels(question(), [single]);
    expect(eventQuestionIds(single)).toEqual(["AMC-5.29"]);
    expect(result.perLevel.find(row => row.level === 1)?.matchedEventIds).toEqual([single.id]);
    expect(result.level).toBe(0); // One event does not satisfy the canonical L1 minimum of two.
  });

  test("canonical higher levels stay not_evaluated without inventing runtime emitters", () => {
    expect(EVIDENCE_MAPS.every(map => map.l3.length === 0)).toBe(true);
    for (const canonical of questionBank) {
      const rebuilt = levelGates(canonical.id, canonical.gates);
      for (const level of [3, 4, 5] as const) {
        expect(gateAt(rebuilt, level).notEvaluated, `${canonical.id} L${level}`).toBeTruthy();
      }
    }
  });

  test("self-reported import and keyword input can earn L1 but cannot create higher map evidence", () => {
    const now = Date.now();
    const imports = [0, 1].map(index => parseEvidenceEventWith({ id: `synthetic-import-${index}`, ts: now,
      session_id: "import-unit", runtime: "amc", event_type: "test", payload_path: null,
      payload_inline: "keyword ALIGNMENT_CHECK_PASS", payload_sha256: "0".repeat(64),
      meta_json: JSON.stringify({ source: "eval_import", trustTier: "OBSERVED", questionIds: ["AMC-5.29"] }),
      prev_event_hash: "0".repeat(64), event_hash: "0".repeat(64), writer_sig: "unverified-unit-input" }, () => ({ trustList: null })));
    const keywords = imports.map((imported, index) => parseEvidenceEventWith({ ...imported, id: `synthetic-keyword-${index}`,
      event_type: "stdout", meta_json: JSON.stringify({ trustTier: "OBSERVED", questionIds: ["AMC-5.29"] }) }, () => ({ trustList: null })));
    for (const input of [imports, keywords]) {
      const result = evaluateLevels(question(), input);
      expect(result.level).toBe(1);
      expect(result.perLevel.find(row => row.level === 2)?.status).toBe("fail");
      expect(result.perLevel.find(row => row.level === 3)?.status).toBe("not_evaluated");
    }
    expect(imports.every(row => row.trustTier === "SELF_REPORTED")).toBe(true);
  });

  test("manual and dogfood audit lookalikes never become registered runtime support", () => {
    const manual = evaluateLevels(question(), auditRows({ meta: { source: "manual", questionIds: ["AMC-5.29"] } }));
    const dogfood = evaluateLevels(question(), auditRows({ meta: { source: "dogfood-maturity", questionIds: ["AMC-5.29"] } }));
    expect(manual.level).toBe(0); expect(dogfood.level).toBe(0);
  });
});
