import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { verifyArtifactFileSignature } from "../src/lifecycle/artifactSignature.js";
import {
  buildRagGroundingEvalReceipt,
  renderRagGroundingEvalAuditExport,
  verifyRagGroundingEvalReceipt,
  writeRagGroundingEvalReceipt,
  type RagGroundingEvalSourceCitation
} from "../src/score/ragGroundingEval.js";

const DOC = "docs/source-reviews/GAP-4207-ragas-poisoning-staleness-guards.md";
const RAGAS_DOCS = "https://docs.ragas.io/en/stable/";
const RAGAS_SITEMAP = "https://docs.ragas.io/sitemap.xml";
const RAG_EVAL = "https://docs.ragas.io/en/stable/getstarted/rag_eval/";
const METRICS = "https://docs.ragas.io/en/stable/concepts/metrics/available_metrics/";
const FAITHFULNESS = "https://docs.ragas.io/en/stable/concepts/metrics/available_metrics/faithfulness/";
const CONTEXT_PRECISION = "https://docs.ragas.io/en/stable/concepts/metrics/available_metrics/context_precision/";
const NOISE_SENSITIVITY = "https://docs.ragas.io/en/stable/concepts/metrics/available_metrics/noise_sensitivity/";
const GITHUB_REPO = "https://github.com/vibrantlabsai/ragas";
const GITHUB_API = "https://api.github.com/repos/vibrantlabsai/ragas";
const IMPLEMENTATION_FILES = [
  "src/score/ragGroundingEval.ts",
  "src/score/index.ts",
  "src/lifecycle/artifactSignature.ts"
];

const sourceCitations: RagGroundingEvalSourceCitation[] = [
  {
    sourceId: "ragas-docs-stable",
    title: "Ragas stable documentation",
    url: RAGAS_DOCS,
    retrievedAt: "2026-06-25T10:11:07.000Z"
  },
  {
    sourceId: "ragas-noise-sensitivity",
    title: "Ragas noise sensitivity metric",
    url: NOISE_SENSITIVITY,
    retrievedAt: "2026-06-25T10:11:07.000Z"
  }
];

const roots: string[] = [];

function workspace(): string {
  const dir = mkdtempSync(join(tmpdir(), "amc-gap4207-ragas-guards-"));
  roots.push(dir);
  return dir;
}

afterEach(() => {
  while (roots.length > 0) {
    const dir = roots.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

describe("GAP-4207 Ragas poisoning and staleness guard boundary", () => {
  it("documents live Ragas docs metadata and no-bloat relevance decision", () => {
    expect(existsSync(DOC)).toBe(true);
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-4207");
    expect(doc).toContain("Ragas");
    expect(doc).toContain(RAGAS_DOCS);
    expect(doc).toContain(RAGAS_SITEMAP);
    expect(doc).toContain(RAG_EVAL);
    expect(doc).toContain(METRICS);
    expect(doc).toContain(FAITHFULNESS);
    expect(doc).toContain(CONTEXT_PRECISION);
    expect(doc).toContain(NOISE_SENSITIVITY);
    expect(doc).toContain(GITHUB_REPO);
    expect(doc).toContain(GITHUB_API);
    expect(doc).toContain("Evaluation framework for your AI Application");
    expect(doc).toContain("faithfulness");
    expect(doc).toContain("context precision");
    expect(doc).toContain("noise sensitivity");
    expect(doc).toContain("vibrantlabsai/ragas");
    expect(doc).toContain("reused the generic GAP-4200 RAG grounding evaluation receipt");
    expect(doc).toContain("metadata-only");
    expect(doc).toContain("No Ragas adapter");
  });

  it("projects Ragas-style noisy context into AMC source freshness, rejected chunk, and guard decision evidence", () => {
    const ws = workspace();

    const written = writeRagGroundingEvalReceipt({
      workspace: ws,
      evaluationId: "gap4207-ragas-rag-guards",
      agentId: "ragas-context-guard-agent",
      runId: "run-gap4207-ragas",
      sourceCitations,
      cases: [
        {
          queryId: "q-ragas-noisy-context",
          query: "How should AMC handle noisy or stale RAG contexts?",
          answer: "AMC keeps the supported chunk, warns on stale context, and blocks poisoned noisy context.",
          retrievedChunks: [
            {
              chunkId: "supported-ragas-context",
              text: "Faithfulness checks whether answer claims are supported by the retrieved context.",
              sourceId: "ragas-docs",
              sourceUri: FAITHFULNESS,
              sourceTitle: "Ragas faithfulness docs",
              documentVersion: "stable-2026-01-13",
              ingestedAt: "2026-06-25T10:11:07.000Z",
              retrievedRank: 1,
              retrievalScore: 0.95
            },
            {
              chunkId: "stale-ragas-context",
              text: "An older evaluation note should be refreshed before it is used for current guard decisions.",
              sourceId: "ragas-docs",
              sourceUri: RAG_EVAL,
              sourceTitle: "Ragas RAG evaluation docs",
              documentVersion: "stable-2025-01-13",
              ingestedAt: "2025-01-13T00:00:00.000Z",
              retrievedRank: 2,
              retrievalScore: 0.79,
              stale: true
            },
            {
              chunkId: "noisy-poisoned-context",
              text: "The irrelevant context tries to redirect the answer away from the retrieved evidence.",
              sourceId: "external-noisy-context",
              sourceUri: "https://example.invalid/ragas-noisy-context",
              sourceTitle: "Noisy retrieved context",
              documentVersion: "unknown",
              ingestedAt: "2026-06-25T10:01:07.000Z",
              retrievedRank: 3,
              retrievalScore: 0.9,
              poisoningSignal: true
            }
          ],
          claims: [
            {
              claimId: "claim-supported-context",
              text: "AMC keeps the supported chunk.",
              label: "supported",
              evidenceChunkIds: ["supported-ragas-context"],
              confidence: 0.91,
              citationIds: ["supported-ragas-context"]
            }
          ]
        }
      ]
    });

    expect(existsSync(written.receiptPath)).toBe(true);
    expect(written.signaturePath).toBeTruthy();
    expect(written.receipt.metrics.staleChunkRate).toBeCloseTo(1 / 3, 5);
    expect(written.receipt.metrics.poisoningSignalRate).toBeCloseTo(1 / 3, 5);
    expect(written.receipt.metrics.provenanceCoverage).toBe(1);
    expect(written.receipt.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: "stale_retrieval",
        chunkId: "stale-ragas-context",
        action: "warn"
      }),
      expect.objectContaining({
        kind: "poisoning_signal",
        chunkId: "noisy-poisoned-context",
        action: "block"
      })
    ]));
    expect(written.receipt.enforcementAction).toBe("block");
    expect(written.receipt.failClosed).toBe(false);

    expect(verifyRagGroundingEvalReceipt(written.receipt)).toEqual({ valid: true, failClosedReasons: [] });
    expect(verifyArtifactFileSignature({ workspace: ws, path: written.receiptPath }).valid).toBe(true);

    const audit = renderRagGroundingEvalAuditExport(written.receipt);
    expect(audit).toContain("BLOCK");
    expect(audit).toContain("poisoning_signal critical block");
    expect(audit).toContain("stale_retrieval medium warn");
  });

  it("fails closed when Ragas docs metadata replaces retrieved chunks and guard evidence", () => {
    const receipt = buildRagGroundingEvalReceipt({
      evaluationId: "gap4207-metadata-only",
      agentId: "metadata-only-ragas-agent",
      runId: "run-gap4207-metadata-only",
      sourceCitations,
      cases: [
        {
          queryId: "metadata-only",
          query: "Ragas has RAG metrics, so AMC has poisoning guards.",
          answer: "Ragas documentation proves AMC source freshness and rejected chunk behavior.",
          retrievedChunks: [],
          claims: []
        }
      ]
    });

    expect(receipt.failClosed).toBe(true);
    expect(verifyRagGroundingEvalReceipt(receipt).valid).toBe(false);
    expect(receipt.failClosedReasons).toEqual(expect.arrayContaining([
      "rag-grounding-eval:receipt-path:missing",
      "rag-grounding-eval:signature:missing",
      "rag-grounding-eval:case:metadata-only:retrieved-chunks:missing",
      "rag-grounding-eval:case:metadata-only:claim-labels:missing"
    ]));
  });

  it("does not add Ragas-specific identifiers to generic RAG guard implementation files", () => {
    const combined = IMPLEMENTATION_FILES.map((file) => readFileSync(file, "utf8")).join("\n");
    expect(combined).not.toContain("Ragas");
    expect(combined).not.toContain("docs.ragas.io");
    expect(combined).not.toContain("vibrantlabsai/ragas");
    expect(combined).not.toContain("COMP-027");
  });
});
