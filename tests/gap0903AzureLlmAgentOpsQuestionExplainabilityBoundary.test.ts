import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getQuestionSet } from "../src/diagnostic/questionSets.js";
import { buildQuestionExplainabilityReport } from "../src/diagnostic/questionScoreExplainability.js";
import type { DiagnosticQuestion, QuestionScore } from "../src/types.js";

const DOC = "docs/source-reviews/GAP-0903-azure-llm-agent-ops-question-explainability.md";
const REPO = "Azure-Samples/llm-agent-ops-toolkit-sk";
const URL = "https://github.com/Azure-Samples/llm-agent-ops-toolkit-sk";
const TITLE = "LLMAgentOps Toolkit";

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
    questionId: "AMC-2.1",
    claimedLevel: 3,
    supportedMaxLevel: 3,
    finalLevel: 3,
    confidence: 0.87,
    evidenceEventIds: [
      "ev-gap0903-accepted-question-proof",
      "ev-gap0903-accepted-rejected-reasons",
      "ev-gap0903-accepted-repair-hint",
    ],
    flags: [],
    narrative: "Azure LLMAgentOps source-review context is bounded to AMC-owned question-score proof.",
    ...overrides,
  };
}

describe("GAP-0903 Azure LLMAgentOps question-explainability boundary", () => {
  it("documents live GitHub metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0903");
    expect(doc).toContain(REPO);
    expect(doc).toContain(URL);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("live GitHub repository page");
    expect(doc).toContain("README.md");
    expect(doc).toContain("MIT license");
    expect(doc).toContain("Star 17");
    expect(doc).toContain("Fork 5");
    expect(doc).toContain("Issues 0");
    expect(doc).toContain("Pull requests 5");
    expect(doc).toContain("29 Commits");
    expect(doc).toContain("Python 66.8%");
    expect(doc).toContain("Jupyter Notebook 30.5%");
    expect(doc).toContain("PowerShell 2.2%");
    expect(doc).toContain("Other 0.5%");
    expect(doc).toContain(".devcontainer");
    expect(doc).toContain(".github");
    expect(doc).toContain(".vscode");
    expect(doc).toContain("evaluation");
    expect(doc).toContain("experimentation");
    expect(doc).toContain("security");
    expect(doc).toContain("src");
    expect(doc).toContain("tests");
    expect(doc).toContain(".pylintrc");
    expect(doc).toContain("CHANGELOG.md");
    expect(doc).toContain("CONTRIBUTING.md");
    expect(doc).toContain("Dockerfile");
    expect(doc).toContain("LICENSE.md");
    expect(doc).toContain("SECURITY.md");
    expect(doc).toContain("SUPPORT.md");
    expect(doc).toContain("app_rest_api.py");
    expect(doc).toContain("env_template");
    expect(doc).toContain("env_template_docker");
    expect(doc).toContain("requirements.txt");
    expect(doc).toContain("Semantic Kernel");
    expect(doc).toContain("MySql Copilot");
    expect(doc).toContain("StateFlow");
    expect(doc).toContain("Finite State Machine");
    expect(doc).toContain("AutoGen Selector Group Chat Pattern");
    expect(doc).toContain("Experimentation & Evaluation");
    expect(doc).toContain("LLM as Judge");
    expect(doc).toContain("Human Evaluation");
    expect(doc).toContain("Continuous Evaluation");
    expect(doc).toContain("Continuous Security");
    expect(doc).toContain("Monitoring");
    expect(doc).toContain("OpenTelemetry");
    expect(doc).toContain("Azure Web App Service");
    expect(doc).toContain("FastAPI");
    expect(doc).toContain("Azure AI Foundry Service");
    expect(doc).toContain("Azure OpenAI Chat Model");
    expect(doc).toContain("Azure Application Insights");
    expect(doc).toContain("question ID");
    expect(doc).toContain("accepted evidence IDs");
    expect(doc).toContain("rejected evidence reasons");
    expect(doc).toContain("repair hint");
    expect(doc).toContain("## Relevance decision");
    expect(doc).toContain("## AMC/8 surface check");
    expect(doc).toContain("## Product closure");
    expect(doc).toContain("## Fail-closed rule");
    expect(doc).toContain("## No-bloat boundary");
    expect(doc).toContain("## Verification");
  });

  it("accepts Azure LLMAgentOps context only through existing question-score explainability proof", () => {
    const report = buildQuestionExplainabilityReport({
      agentId: "gap-0903-azure-llm-agent-ops-reviewed-agent",
      runId: "run-gap-0903-question-explainability",
      generatedAt: "2026-06-22T21:30:00.000Z",
      sourceRefs: [URL],
      rows: [
        {
          question: question("AMC-2.1"),
          score: score(),
          acceptedEvidence: [
            { id: "ev-gap0903-accepted-question-proof", event_hash: hash("a"), writer_sig: "sig-gap0903-question-proof", event_type: "artifact", session_id: "session-gap0903-question", ts: 1, trustTier: "OBSERVED" },
            { id: "ev-gap0903-accepted-rejected-reasons", event_hash: hash("b"), writer_sig: "sig-gap0903-rejected", event_type: "review", session_id: "session-gap0903-reasons", ts: 2, trustTier: "OBSERVED_HARDENED" },
            { id: "ev-gap0903-accepted-repair-hint", event_hash: hash("c"), writer_sig: "sig-gap0903-repair", event_type: "audit", session_id: "session-gap0903-repair", ts: 3, trustTier: "OBSERVED_HARDENED" },
          ],
          rejectedEvidence: [
            {
              event: { id: "ev-gap0903-source-metadata-only", event_hash: hash("d"), writer_sig: "sig-gap0903-metadata", event_type: "review", session_id: "session-gap0903-source", ts: 4, trustTier: "ATTESTED" },
              reason: "Azure LLMAgentOps source metadata identifies relevant LLMOps evaluation context only; it lacks AMC-owned question IDs, accepted evidence IDs, rejected evidence reasons, repair hints, signed rows, thresholds, and row hashes.",
            },
          ],
          criteriaDiagnostics: [
            {
              criterionId: "gap-0903-question-score-proof",
              criterionType: "tool_use_trace",
              status: "satisfied",
              evidenceRefs: ["ev-gap0903-accepted-question-proof", "ev-gap0903-accepted-rejected-reasons", "ev-gap0903-accepted-repair-hint"],
              rejectedEvidenceRefs: ["ev-gap0903-source-metadata-only"],
              judgeRef: "judge://amc/question-score-explainability",
              repairHint: "Keep Azure/Semantic Kernel LLMOps metadata as source-review context and rely on AMC-owned accepted evidence, rejected reasons, repair hints, thresholds, and row hashes.",
            },
          ],
          missingGateReasons: [],
        },
      ],
    });

    expect(report.replayable).toBe(true);
    expect(report.failClosed).toBe(false);
    expect(report.rows[0]).toMatchObject({
      questionId: "AMC-2.1",
      status: "passed",
      acceptedEvidenceIds: [
        "ev-gap0903-accepted-question-proof",
        "ev-gap0903-accepted-rejected-reasons",
        "ev-gap0903-accepted-repair-hint",
      ],
    });
    expect(report.rows[0]?.rejectedEvidence[0]?.reason).toContain("source metadata identifies relevant LLMOps evaluation context only");
    expect(report.rows[0]?.rowHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("fails closed when Azure LLMAgentOps metadata replaces AMC-owned question evidence", () => {
    const report = buildQuestionExplainabilityReport({
      agentId: "gap-0903-metadata-only-agent",
      runId: "run-gap-0903-metadata-only",
      generatedAt: "2026-06-22T21:30:00.000Z",
      sourceRefs: [URL],
      rows: [
        {
          question: question("AMC-2.1"),
          score: score({
            supportedMaxLevel: 0,
            finalLevel: 0,
            evidenceEventIds: [],
            narrative: "Azure LLMAgentOps source metadata-only proof must fail closed.",
          }),
          acceptedEvidence: [],
          rejectedEvidence: [
            {
              event: { id: "ev-gap0903-missing-amc-question-proof", event_hash: hash("e"), writer_sig: "sig-gap0903-missing", event_type: "review", session_id: "session-gap0903-source", ts: 1, trustTier: "ATTESTED" },
              reason: "Missing AMC-owned question score evidence, accepted evidence IDs, rejected evidence reasons, repair hints, signed rows, thresholds, and row hash proof.",
            },
          ],
          missingGateReasons: ["GitHub/README/Azure/Semantic-Kernel metadata is not question-level score explainability proof."],
        },
      ],
    });

    expect(report.replayable).toBe(false);
    expect(report.failClosed).toBe(true);
    expect(report.rows[0]?.status).toBe("needs_evidence");
    expect(report.rows[0]?.missingGateReasons).toContain(
      "GitHub/README/Azure/Semantic-Kernel metadata is not question-level score explainability proof.",
    );
  });

  it("does not add Azure LLMAgentOps identifiers to diagnostic, guide, or passport modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(REPO);
      expect(source).not.toContain(URL);
      expect(source).not.toContain("azure_llm_agent_ops_question_explainability");
    }
  });
});
