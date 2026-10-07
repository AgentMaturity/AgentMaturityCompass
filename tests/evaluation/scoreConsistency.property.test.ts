import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import { openLedger } from "../../src/ledger/ledger.js";
import { evaluateGate, parseEvidenceEvent, type ParsedEvidenceEvent } from "../../src/diagnostic/gates.js";
import { computeQuickScore, getQuestionsForTier } from "../../src/diagnostic/quickScore.js";
import { runDiagnostic } from "../../src/diagnostic/runner.js";
import type { EvidenceEvent, Gate } from "../../src/types.js";
import { initWorkspace } from "../../src/workspace.js";

const roots: string[] = [];
const DAY_MS = 24 * 60 * 60 * 1000;

function newWorkspace(): string {
  const dir = mkdtempSync(join(tmpdir(), "amc-score-consistency-"));
  roots.push(dir);
  initWorkspace({ workspacePath: dir, trustBoundaryMode: "isolated" });
  return dir;
}

afterEach(() => {
  while (roots.length > 0) {
    const dir = roots.pop();
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

function makeRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function randomInt(rng: () => number, minInclusive: number, maxInclusive: number): number {
  const span = maxInclusive - minInclusive + 1;
  return minInclusive + Math.floor(rng() * span);
}

function shuffled<T>(input: T[], rng: () => number): T[] {
  const out = input.slice();
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const left = out[i];
    out[i] = out[j] as T;
    out[j] = left as T;
  }
  return out;
}

let eventSeq = 0;

function makeParsedEvent(params: {
  questionId: string;
  sessionId: string;
  ts: number;
  eventType?: EvidenceEvent["event_type"];
  trustTier?: "OBSERVED" | "OBSERVED_HARDENED" | "ATTESTED" | "SELF_REPORTED";
  auditType?: string;
  payload?: string;
}): ParsedEvidenceEvent {
  eventSeq += 1;
  return parseEvidenceEvent({
    id: `ev-${eventSeq}`,
    ts: params.ts,
    session_id: params.sessionId,
    runtime: "unknown",
    event_type: params.eventType ?? "audit",
    payload_path: null,
    payload_inline: params.payload ?? "evidence",
    payload_sha256: `sha-${eventSeq}`,
    meta_json: JSON.stringify({
      questionId: params.questionId,
      trustTier: params.trustTier ?? "OBSERVED",
      ...(params.auditType ? { auditType: params.auditType } : {})
    }),
    prev_event_hash: "prev",
    event_hash: "hash",
    writer_sig: "sig"
  });
}

function scoreSnapshot(report: Awaited<ReturnType<typeof runDiagnostic>>): {
  integrityIndex: number;
  finalLevels: Record<string, number>;
} {
  const finalLevels: Record<string, number> = {};
  for (const row of report.questionScores) {
    finalLevels[row.questionId] = row.finalLevel;
  }
  return {
    integrityIndex: report.integrityIndex,
    finalLevels
  };
}

function seedHighRiskGovernanceEvidence(workspace: string): void {
  const ledger = openLedger(workspace);
  const now = Date.now();

  for (let i = 0; i < 12; i += 1) {
    const sessionId = `seed-governance-${i}`;
    ledger.startSession({
      sessionId,
      runtime: "unknown",
      binaryPath: "seed-runtime",
      binarySha256: "seed-sha"
    });
    // The four types the old L4 gate named. Since P1-07 AMC-1.8 has no evidence
    // map, so these rows support L1 at most (L2 and above are not evaluated) and
    // the assurance cap, which only lowers levels above 3, has nothing to lower.
    // The integrity drift this test is about comes from the ASSURANCE_EVIDENCE_MISSING
    // audits each run writes, which still accumulate.
    for (const eventType of ["stdout", "audit", "metric", "artifact"] as const) {
      ledger.appendEvidence({
        sessionId,
        runtime: "unknown",
        eventType,
        payload: JSON.stringify({
          auditType: "ALIGNMENT_CHECK_PASS",
          note: "seed evidence"
        }),
        inline: true,
        ts: now - (i % 7) * DAY_MS,
        meta: {
          questionId: "AMC-1.8",
          auditType: "ALIGNMENT_CHECK_PASS",
          trustTier: "OBSERVED"
        }
      });
    }
    ledger.sealSession(sessionId);
  }

  ledger.close();
}

describe("score consistency properties", () => {
  test("computeQuickScore is deterministic over randomized valid answer maps", () => {
    const quickQuestions = getQuestionsForTier("quick");
    const questionIds = quickQuestions.map((row) => row.id);
    const rng = makeRng(4203);

    for (let trial = 0; trial < 250; trial += 1) {
      const answers: Record<string, number> = {};
      for (const questionId of questionIds) {
        answers[questionId] = randomInt(rng, 0, 5);
      }

      const first = computeQuickScore(answers, "quick");
      const second = computeQuickScore(answers, "quick");

      expect(second).toEqual(first);
      expect(first.totalScore).toBeGreaterThanOrEqual(0);
      expect(first.totalScore).toBeLessThanOrEqual(first.maxScore);
      expect(first.percentage).toBeGreaterThanOrEqual(0);
      expect(first.percentage).toBeLessThanOrEqual(100);
    }
  });

  test("evaluateGate is permutation-invariant for the same evidence set", () => {
    const now = Date.now();
    // All four evidence types the gate names. They used to be twelve `audit`
    // events against a gate declaring [stdout, audit, metric, artifact], which
    // passed only because the field was a filter rather than a requirement.
    // The property under test is permutation-invariance, not that this gate
    // passes on one type — so the fixture supplies what the gate asks for.
    const gateTypes = ["stdout", "audit", "metric", "artifact"] as const;
    const events: ParsedEvidenceEvent[] = [];
    for (let i = 0; i < 12; i += 1) {
      events.push(
        makeParsedEvent({
          questionId: "AMC-1.8",
          sessionId: `session-${i % 6}`,
          ts: now - (i % 7) * DAY_MS,
          eventType: gateTypes[i % gateTypes.length] as "audit",
          trustTier: "OBSERVED",
          auditType: "ALIGNMENT_CHECK_PASS"
        })
      );
    }

    const gate: Gate = {
      level: 4,
      requiredEvidenceTypes: ["stdout", "audit", "metric", "artifact"],
      minEvents: 12,
      minSessions: 5,
      minDistinctDays: 7,
      acceptedTrustTiers: ["OBSERVED", "ATTESTED"],
      mustInclude: {
        metaKeys: ["questionId"],
        auditTypes: ["ALIGNMENT_CHECK_PASS"]
      },
      mustNotInclude: {}
    };

    const baseline = evaluateGate(gate, events);
    expect(baseline.pass).toBe(true);

    const rng = makeRng(99);
    const baselineIds = baseline.matchedEventIds.slice().sort();

    for (let trial = 0; trial < 100; trial += 1) {
      const reordered = shuffled(events, rng);
      const current = evaluateGate(gate, reordered);
      expect(current.pass).toBe(baseline.pass);
      expect(current.distinctSessions).toBe(baseline.distinctSessions);
      expect(current.distinctDays).toBe(baseline.distinctDays);
      expect(current.matchedEventIds.slice().sort()).toEqual(baselineIds);
    }
  });

  test("repeat diagnostic runs are stable in a fixed baseline workspace", async () => {
    const workspace = newWorkspace();

    const runA = await runDiagnostic({
      workspace,
      window: "14d",
      targetName: "default",
      claimMode: "auto"
    });
    const runB = await runDiagnostic({
      workspace,
      window: "14d",
      targetName: "default",
      claimMode: "auto"
    });

    const snapshotA = scoreSnapshot(runA);
    const snapshotB = scoreSnapshot(runB);

    expect(snapshotB.finalLevels).toEqual(snapshotA.finalLevels);
    expect(snapshotB.integrityIndex).toBe(snapshotA.integrityIndex);
  });

  test("high-risk assurance-missing audits create repeat-run integrity drift", async () => {
    const workspace = newWorkspace();
    const contextPath = join(workspace, ".amc", "context-graph.json");
    const graph = JSON.parse(readFileSync(contextPath, "utf8")) as Record<string, unknown>;
    graph.riskTier = "high";
    writeFileSync(contextPath, JSON.stringify(graph, null, 2));
    seedHighRiskGovernanceEvidence(workspace);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const run1 = await runDiagnostic({
      workspace,
      window: "14d",
      targetName: "default",
      claimMode: "auto"
    });
    const run2 = await runDiagnostic({
      workspace,
      window: "14d",
      targetName: "default",
      claimMode: "auto"
    });
    const run3 = await runDiagnostic({
      workspace,
      window: "14d",
      targetName: "default",
      claimMode: "auto"
    });
    warn.mockRestore();

    const q1 = run1.questionScores.find((row) => row.questionId === "AMC-1.8");
    const q2 = run2.questionScores.find((row) => row.questionId === "AMC-1.8");
    const q3 = run3.questionScores.find((row) => row.questionId === "AMC-1.8");

    // P1-07: was 3 with FLAG_ASSURANCE_EVIDENCE_MISSING, reached top-down through
    // an L4 gate without L2's review. Levels are cumulative now and AMC-1.8 has no
    // evidence map, so the seed supports L1; the runner's own
    // ASSURANCE_EVIDENCE_MISSING rows come from no registered emitter and lift nothing.
    expect(q1?.finalLevel).toBe(1);
    expect(q2?.finalLevel).toBe(1);
    expect(q3?.finalLevel).toBe(1);

    expect(run2.integrityIndex).toBeLessThan(run1.integrityIndex);
    expect(run3.integrityIndex).toBeLessThanOrEqual(run2.integrityIndex);
    expect(new Set([run1.integrityIndex, run2.integrityIndex, run3.integrityIndex]).size).toBeGreaterThan(1);
  });
});
