import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getQuestionSet } from "../src/diagnostic/questionSets.js";
import { buildQuestionExplainabilityReport } from "../src/diagnostic/questionScoreExplainability.js";
import type { DiagnosticQuestion, QuestionScore } from "../src/types.js";

const DOC = "docs/source-reviews/GAP-0797-mcp-postgresql-ops-question-explainability.md";
const SOURCE = "https://github.com/call518/MCP-PostgreSQL-Ops";
const REPO = "call518/MCP-PostgreSQL-Ops";
const PACKAGE = "mcp-postgresql-ops";

const implementationFiles = [
  "src/diagnostic/questionScoreExplainability.ts",
  "src/guide/guideGenerator.ts",
  "src/passport/passportArtifact.ts",
];

const hash = (seed: string): string => seed.repeat(64).slice(0, 64);

function question(id: string): DiagnosticQuestion {
  const found = getQuestionSet().questions.find((row) => row.id === id);
  if (!found) throw new Error(`missing test question ${id}`);
  return found;
}

function score(overrides: Partial<QuestionScore> = {}): QuestionScore {
  return {
    questionId: "AMC-4.1",
    claimedLevel: 3,
    supportedMaxLevel: 3,
    finalLevel: 3,
    confidence: 0.86,
    evidenceEventIds: [
      "ev-gap0797-accepted-question-proof",
      "ev-gap0797-accepted-rejected-reasons",
      "ev-gap0797-accepted-repair-hint",
    ],
    flags: [],
    narrative: "MCP-PostgreSQL-Ops source-review context is bounded to AMC-owned question-score proof.",
    ...overrides,
  };
}

describe("GAP-0797 MCP-PostgreSQL-Ops question-explainability boundary", () => {
  it("documents live GitHub metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0797");
    expect(doc).toContain(SOURCE);
    expect(doc).toContain(REPO);
    expect(doc).toContain(PACKAGE);
    expect(doc).toContain("PostgreSQL 12-18");
    expect(doc).toContain("natural language queries");
    expect(doc).toContain("read-only operations");
    expect(doc).toContain("pg_stat_statements");
    expect(doc).toContain("pg_stat_monitor");
    expect(doc).toContain("performance analysis");
    expect(doc).toContain("bloat detection");
    expect(doc).toContain("lock/deadlock monitoring");
    expect(doc).toContain("autovacuum");
    expect(doc).toContain("schema inspection");
    expect(doc).toContain("MIT");
    expect(doc).toContain("Python >=3.12");
    expect(doc).toContain("fastmcp");
    expect(doc).toContain("asyncpg");
    expect(doc).toContain("psycopg2-binary");
    expect(doc).toContain("requirements.txt returned 404");
    expect(doc).toContain("question ID");
    expect(doc).toContain("accepted evidence IDs");
    expect(doc).toContain("rejected evidence reasons");
    expect(doc).toContain("repair hints");
    expect(doc).toContain("## Relevance decision");
    expect(doc).toContain("## AMC/8 surface check");
    expect(doc).toContain("## Product closure");
    expect(doc).toContain("## Fail-closed rule");
    expect(doc).toContain("## No-bloat boundary");
    expect(doc).toContain("## Verification");
  });

  it("accepts PostgreSQL operations context only through existing question-score explainability proof", () => {
    const report = buildQuestionExplainabilityReport({
      agentId: "gap-0797-postgresql-ops-reviewed-agent",
      runId: "run-gap-0797-question-explainability",
      generatedAt: "2026-06-21T20:05:00.000Z",
      sourceRefs: [SOURCE],
      rows: [
        {
          question: question("AMC-4.1"),
          score: score(),
          acceptedEvidence: [
            {
              id: "ev-gap0797-accepted-question-proof",
              event_hash: hash("a"),
              writer_sig: "sig-gap0797-question-proof",
              event_type: "artifact",
              session_id: "session-gap0797-question",
              ts: 1,
              trustTier: "OBSERVED",
            },
            {
              id: "ev-gap0797-accepted-rejected-reasons",
              event_hash: hash("b"),
              writer_sig: "sig-gap0797-rejected",
              event_type: "review",
              session_id: "session-gap0797-reasons",
              ts: 2,
              trustTier: "OBSERVED_HARDENED",
            },
            {
              id: "ev-gap0797-accepted-repair-hint",
              event_hash: hash("c"),
              writer_sig: "sig-gap0797-repair",
              event_type: "audit",
              session_id: "session-gap0797-repair",
              ts: 3,
              trustTier: "OBSERVED_HARDENED",
            },
          ],
          rejectedEvidence: [
            {
              event: {
                id: "ev-gap0797-repo-metadata-only",
                event_hash: hash("d"),
                writer_sig: "sig-gap0797-metadata",
                event_type: "review",
                session_id: "session-gap0797-source",
                ts: 4,
                trustTier: "ATTESTED",
              },
              reason: "MCP-PostgreSQL-Ops repository metadata identifies relevant PostgreSQL operations context only; it lacks AMC-owned question IDs, accepted evidence IDs, rejected evidence reasons, repair hints, signed rows, thresholds, and row hashes.",
            },
          ],
          criteriaDiagnostics: [
            {
              criterionId: "gap-0797-question-score-proof",
              criterionType: "tool_use_trace",
              status: "satisfied",
              evidenceRefs: [
                "ev-gap0797-accepted-question-proof",
                "ev-gap0797-accepted-rejected-reasons",
                "ev-gap0797-accepted-repair-hint",
              ],
              rejectedEvidenceRefs: ["ev-gap0797-repo-metadata-only"],
              judgeRef: "judge://amc/question-score-explainability",
              repairHint: "Keep MCP-PostgreSQL-Ops as source-review context and rely on AMC-owned accepted evidence, rejected evidence reasons, repair hints, thresholds, and row hashes.",
            },
          ],
          missingGateReasons: [],
        },
      ],
    });

    expect(report.replayable).toBe(true);
    expect(report.failClosed).toBe(false);
    expect(report.rows[0]).toMatchObject({
      questionId: "AMC-4.1",
      status: "passed",
      acceptedEvidenceIds: [
        "ev-gap0797-accepted-question-proof",
        "ev-gap0797-accepted-rejected-reasons",
        "ev-gap0797-accepted-repair-hint",
      ],
    });
    expect(report.rows[0]?.rejectedEvidence[0]?.reason).toContain(
      "repository metadata identifies relevant PostgreSQL operations context only",
    );
    expect(report.rows[0]?.rowHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("fails closed when repo metadata replaces AMC-owned question evidence", () => {
    const report = buildQuestionExplainabilityReport({
      agentId: "gap-0797-metadata-only-agent",
      runId: "run-gap-0797-metadata-only",
      generatedAt: "2026-06-21T20:05:00.000Z",
      sourceRefs: [SOURCE],
      rows: [
        {
          question: question("AMC-4.1"),
          score: score({
            supportedMaxLevel: 0,
            finalLevel: 0,
            evidenceEventIds: [],
            narrative: "MCP-PostgreSQL-Ops repository metadata-only source-review proof must fail closed.",
          }),
          acceptedEvidence: [],
          rejectedEvidence: [
            {
              event: {
                id: "ev-gap0797-missing-amc-question-proof",
                event_hash: hash("e"),
                writer_sig: "sig-gap0797-missing",
                event_type: "review",
                session_id: "session-gap0797-source",
                ts: 1,
                trustTier: "ATTESTED",
              },
              reason: "Missing AMC-owned question score evidence, accepted evidence IDs, rejected evidence reasons, repair hints, signed rows, thresholds, and row hash proof.",
            },
          ],
          missingGateReasons: ["GitHub README/package/source metadata is not question-level score explainability proof."],
        },
      ],
    });

    expect(report.replayable).toBe(false);
    expect(report.failClosed).toBe(true);
    expect(report.rows[0]?.status).toBe("needs_evidence");
    expect(report.rows[0]?.missingGateReasons).toContain(
      "GitHub README/package/source metadata is not question-level score explainability proof.",
    );
  });

  it("does not add MCP-PostgreSQL-Ops identifiers to diagnostic, guide, or passport modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(SOURCE);
      expect(source).not.toContain(REPO);
      expect(source).not.toContain("mcp_postgresql_ops_question_explainability");
    }
  });
});
