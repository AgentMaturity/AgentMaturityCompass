import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getQuestionSet } from "../src/diagnostic/questionSets.js";
import {
  buildEvalScoreExplainabilityPack,
  buildQuestionExplainabilityReport,
} from "../src/diagnostic/questionScoreExplainability.js";
import type { DiagnosticQuestion, QuestionScore } from "../src/types.js";

const DOC = "docs/source-reviews/GAP-1022-anticannet-question-explainability.md";
const OPENALEX = "https://openalex.org/W7160512984";
const OPENALEX_API = "https://api.openalex.org/works/W7160512984";
const DOI = "https://doi.org/10.2174/0115748936434191260212112236";
const DOI_VALUE = "10.2174/0115748936434191260212112236";
const CROSSREF = "https://api.crossref.org/works/10.2174/0115748936434191260212112236";
const PUBLISHER = "https://www.eurekaselect.com/253362/article";
const PDF = "https://www.eurekaselect.com/article/download?doi=10.2174/0115748936434191260212112236";
const TITLE = "AntiCanNet: A Graph Convolution and Chemical LLM Framework forPredicting Anti-Cancer Small Molecules";
const IDENTIFIER = "anticannet_question_explainability";

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
    questionId: "AMC-1.2",
    claimedLevel: 4,
    supportedMaxLevel: 4,
    finalLevel: 4,
    confidence: 0.89,
    evidenceEventIds: ["ev-gap1022-question-row", "ev-gap1022-repair-hint"],
    flags: [],
    narrative: "AntiCanNet paper context is bounded to AMC-owned question-score explainability proof.",
    ...overrides,
  };
}

describe("GAP-1022 AntiCanNet question-explainability boundary", () => {
  it("documents live AntiCanNet metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-1022");
    expect(doc).toContain(TITLE);
    expect(doc).toContain(OPENALEX);
    expect(doc).toContain(OPENALEX_API);
    expect(doc).toContain(DOI);
    expect(doc).toContain(DOI_VALUE);
    expect(doc).toContain(CROSSREF);
    expect(doc).toContain(PUBLISHER);
    expect(doc).toContain(PDF);
    expect(doc).toContain("Current Bioinformatics");
    expect(doc).toContain("publication_date `2026-05-05`");
    expect(doc).toContain("OpenAlex type `article`");
    expect(doc).toContain("Crossref type `journal-article`");
    expect(doc).toContain("oa_status `closed`");
    expect(doc).toContain("volume `21`");
    expect(doc).toContain("cited_by_count `1`");
    expect(doc).toContain("Lei Chen");
    expect(doc).toContain("Liuqi Xu");
    expect(doc).toContain("Bo Zhou");
    expect(doc).toContain("Yuanlin Chen");
    expect(doc).toContain("Shanghai Maritime University");
    expect(doc).toContain("Shanghai University of Medicine and Health Sciences");
    expect(doc).toContain("Computer science");
    expect(doc).toContain("Artificial neural network");
    expect(doc).toContain("Drug discovery");
    expect(doc).toContain("Small molecule");
    expect(doc).toContain("ChemGPT");
    expect(doc).toContain("PaDEL");
    expect(doc).toContain("AUC");
    expect(doc).toContain("0.971");
    expect(doc).toContain("0.9");
    expect(doc).toContain("HTTP/2 302");
    expect(doc).toContain("HTTP/2 403");
    expect(doc).toContain("Cloudflare challenge");
    expect(doc).toContain("question ID");
    expect(doc).toContain("accepted evidence IDs");
    expect(doc).toContain("rejected evidence reasons");
    expect(doc).toContain("repair hint");
    expect(doc).toContain("reproducible eval pack");
    expect(doc).toContain("fail-closed thresholds");
    expect(doc).toContain("## Relevance decision");
    expect(doc).toContain("## AMC/8 surface check");
    expect(doc).toContain("## Product closure");
    expect(doc).toContain("## Fail-closed rule");
    expect(doc).toContain("## No-bloat boundary");
    expect(doc).toContain("## Verification");
  });

  it("accepts AntiCanNet context only through existing eval-score explainability proof", () => {
    const report = buildQuestionExplainabilityReport({
      agentId: "gap-1022-anticannet-reviewed-agent",
      runId: "run-gap-1022-question-explainability",
      generatedAt: "2026-06-24T18:30:00.000Z",
      sourceRefs: [OPENALEX, DOI, CROSSREF, PUBLISHER, PDF, "amc:no-anticannet-paper-importer"],
      rows: [
        {
          question: question("AMC-1.2"),
          score: score(),
          acceptedEvidence: [
            {
              id: "ev-gap1022-question-row",
              event_hash: hash("a"),
              writer_sig: "sig-gap1022-question-row",
              event_type: "test",
              session_id: "session-gap1022-eval",
              ts: 1,
              trustTier: "OBSERVED",
            },
            {
              id: "ev-gap1022-repair-hint",
              event_hash: hash("b"),
              writer_sig: "sig-gap1022-repair",
              event_type: "audit",
              session_id: "session-gap1022-eval",
              ts: 2,
              trustTier: "OBSERVED_HARDENED",
            },
          ],
          rejectedEvidence: [
            {
              event: {
                id: "ev-gap1022-paper-metadata-only",
                event_hash: hash("c"),
                writer_sig: "sig-gap1022-paper",
                event_type: "review",
                session_id: "session-gap1022-source",
                ts: 3,
                trustTier: "ATTESTED",
              },
              reason:
                "OpenAlex, DOI, Crossref, publisher, closed-OA, ChemGPT, PaDEL, AUC, graph-neural-network, drug-discovery, and small-molecule labels are context only; they are not AMC-owned question IDs, accepted evidence IDs, rejected evidence reasons, repair hints, signed rows, thresholds, or row hashes.",
            },
          ],
          criteriaDiagnostics: [
            {
              criterionId: "gap-1022-question-score-proof",
              criterionType: "tool_use_trace",
              status: "satisfied",
              evidenceRefs: ["ev-gap1022-question-row", "ev-gap1022-repair-hint"],
              rejectedEvidenceRefs: ["ev-gap1022-paper-metadata-only"],
              judgeRef: "judge://amc/eval-score-explainability",
              repairHint:
                "Keep AntiCanNet as source-review context and rely on AMC-owned question IDs, accepted evidence IDs, rejected evidence reasons, repair hints, thresholds, and row hashes.",
            },
          ],
          testSuiteEvaluationLens: [
            {
              suiteId: "gap1022-anticannet-pack",
              sourceRef: DOI,
              language: "typescript",
              testFramework: "custom",
              adapter: "custom",
              datasetRef: "dataset://amc/gap1022/anticannet-question-explainability",
              datasetHash: hash("d"),
              testCaseId: "gap1022-anticannet-eval-row",
              testCaseHash: hash("e"),
              evaluatorIds: ["judge://amc/question-score-explainability"],
              evaluatorConfigHash: hash("f"),
              judgeModelRef: "amc-deterministic-question-judge",
              experimentRunId: "exp-gap1022-anticannet",
              experimentResultHash: hash("1"),
              exportArtifactHash: hash("2"),
              ciRunId: "ci-gap1022-anticannet",
              ciConfigHash: hash("3"),
              traceArtifactHash: hash("4"),
              toolCallValidationHash: hash("5"),
              agentBehaviorEvaluation: true,
              passRate0to1: 0.91,
              minPassRate0to1: 0.9,
              averageScore0to1: 0.9,
              threshold0to1: 0.88,
              status: "satisfied",
              evidenceRefs: ["ev-gap1022-question-row", "ev-gap1022-repair-hint"],
              rejectedEvidenceRefs: ["ev-gap1022-paper-metadata-only"],
              repairHint:
                "Preserve question-tagged eval rows, signed evidence IDs, rejected reasons, repair hints, thresholds, and row hashes.",
            },
          ],
          missingGateReasons: [],
        },
      ],
    });
    const pack = buildEvalScoreExplainabilityPack(report);

    expect(report.replayable).toBe(true);
    expect(report.failClosed).toBe(false);
    expect(pack.failClosed).toBe(false);
    expect(pack.rows[0]).toMatchObject({
      questionId: "AMC-1.2",
      status: "ready",
      acceptedEvidenceIds: ["ev-gap1022-question-row", "ev-gap1022-repair-hint"],
      reproducibleEvalPacks: [
        expect.objectContaining({
          packId: "gap1022-anticannet-pack",
          sourceRef: DOI,
          kind: "test_suite_evaluation",
          ciRunId: "ci-gap1022-anticannet",
        }),
      ],
      failClosedThresholds: [
        expect.objectContaining({ id: "gap1022-anticannet-pack:pass_rate", passed: true }),
        expect.objectContaining({ id: "gap1022-anticannet-pack:average_score", passed: true }),
      ],
    });
    expect(pack.rows[0]?.rejectedEvidenceReasons[0]?.reason).toContain("context only");
    expect(pack.rows[0]?.repairHint).toContain("Target L5");
    expect(pack.packHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("fails closed when AntiCanNet paper metadata replaces AMC-owned question evidence", () => {
    const report = buildQuestionExplainabilityReport({
      agentId: "gap-1022-anticannet-metadata-agent",
      runId: "run-gap-1022-metadata-only",
      generatedAt: "2026-06-24T18:30:00.000Z",
      sourceRefs: [OPENALEX_API, DOI, CROSSREF, PUBLISHER],
      rows: [
        {
          question: question("AMC-1.2"),
          score: score({
            supportedMaxLevel: 0,
            finalLevel: 0,
            evidenceEventIds: [],
            narrative: "AntiCanNet paper metadata-only source-review proof must fail closed.",
          }),
          acceptedEvidence: [],
          rejectedEvidence: [
            {
              event: {
                id: "ev-gap1022-missing-question-proof",
                event_hash: hash("6"),
                writer_sig: "sig-gap1022-missing",
                event_type: "review",
                session_id: "session-gap1022-source",
                ts: 1,
                trustTier: "ATTESTED",
              },
              reason:
                "Missing AMC-owned question score evidence, accepted evidence IDs, rejected evidence reasons, repair hints, signed rows, thresholds, and row hash proof.",
            },
          ],
          missingGateReasons: ["AntiCanNet paper metadata is not question-level score explainability proof."],
        },
      ],
    });
    const pack = buildEvalScoreExplainabilityPack(report);

    expect(report.replayable).toBe(false);
    expect(report.failClosed).toBe(true);
    expect(report.rows[0]?.status).toBe("needs_evidence");
    expect(report.rows[0]?.missingGateReasons).toContain(
      "AntiCanNet paper metadata is not question-level score explainability proof.",
    );
    expect(pack.failClosed).toBe(true);
    expect(pack.rows[0]).toMatchObject({ status: "fail_closed", reproducibleEvalPacks: [] });
  });

  it("does not add AntiCanNet identifiers to diagnostic, guide, or passport modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(OPENALEX);
      expect(source).not.toContain(OPENALEX_API);
      expect(source).not.toContain(DOI_VALUE);
      expect(source).not.toContain(PDF);
      expect(source).not.toContain(IDENTIFIER);
      expect(source).not.toContain("AntiCanNet");
      expect(source).not.toContain("ChemGPT");
      expect(source).not.toContain("Anti-Cancer Small Molecules");
    }
  });
});
