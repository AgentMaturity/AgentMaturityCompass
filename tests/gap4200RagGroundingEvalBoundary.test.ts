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

const DOC = "docs/source-reviews/GAP-4200-rag-grounding-eval.md";
const OPENALEX = "https://openalex.org/W3027879771";
const OPENALEX_API = "https://api.openalex.org/works/W3027879771";
const DOI = "https://doi.org/10.5281/zenodo.18717227";
const ZENODO_RECORD = "https://zenodo.org/records/18717228";
const ZENODO_API = "https://zenodo.org/api/records/18717228";
const BACKLOG_TITLE = "Affordance-Compiled Intelligence: Observable-Only Cognitive Impedance Matching for No-Meta LLM-Integrated Systems";
const RESOLVED_ZENODO_TITLE = "When Systems Turn Inward (II): Windows in the Room";
const IDENTIFIER = "affordance_compiled_intelligence_rag_grounding";
const IMPLEMENTATION_FILES = [
  "src/score/ragGroundingEval.ts",
  "src/score/index.ts",
  "src/lifecycle/artifactSignature.ts"
];

const sourceCitations: RagGroundingEvalSourceCitation[] = [
  {
    sourceId: "openalex-w3027879771",
    title: BACKLOG_TITLE,
    url: OPENALEX,
    retrievedAt: "2026-06-25T09:50:00.000Z"
  },
  {
    sourceId: "doi-10-5281-zenodo-18717227",
    title: "Zenodo DOI redirect",
    url: DOI,
    retrievedAt: "2026-06-25T09:50:00.000Z"
  }
];

const roots: string[] = [];

function workspace(): string {
  const dir = mkdtempSync(join(tmpdir(), "amc-gap4200-rag-grounding-"));
  roots.push(dir);
  return dir;
}

afterEach(() => {
  while (roots.length > 0) {
    const dir = roots.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

describe("GAP-4200 RAG grounding evaluation boundary", () => {
  it("documents live source metadata mismatch and no-bloat relevance decision", () => {
    expect(existsSync(DOC)).toBe(true);
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-4200");
    expect(doc).toContain(BACKLOG_TITLE);
    expect(doc).toContain(OPENALEX);
    expect(doc).toContain(OPENALEX_API);
    expect(doc).toContain(DOI);
    expect(doc).toContain(ZENODO_RECORD);
    expect(doc).toContain(ZENODO_API);
    expect(doc).toContain(RESOLVED_ZENODO_TITLE);
    expect(doc).toContain("metadata mismatch");
    expect(doc).toContain("Patrick Lewis");
    expect(doc).toContain("arXiv");
    expect(doc).toContain("query set, retrieved chunks, claim labels, and faithfulness score");
    expect(doc).toContain("metadata-only");
    expect(doc).toContain("No Affordance-Compiled Intelligence subsystem");
  });

  it("writes a signed grounding receipt with faithfulness, retrieved support quality, findings, and enforcement action", () => {
    const ws = workspace();

    const written = writeRagGroundingEvalReceipt({
      workspace: ws,
      evaluationId: "gap4200-grounding-eval",
      agentId: "rag-memory-agent",
      runId: "run-gap4200-grounding-eval",
      sourceCitations,
      cases: [
        {
          queryId: "q1",
          query: "How does AMC verify RAG answers?",
          answer: "AMC verifies RAG answers with signed evidence receipts. AMC ignores unsupported claims. AMC operates a Mars office.",
          retrievedChunks: [
            {
              chunkId: "chunk-receipts",
              text: "AMC verifies RAG answers by binding claims to signed evidence receipts and retrieved support chunks.",
              sourceId: "amc-docs",
              sourceUri: "amc://docs/rag-grounding",
              sourceTitle: "AMC RAG grounding guide",
              documentVersion: "2026.06.25",
              ingestedAt: "2026-06-25T09:50:00.000Z",
              retrievedRank: 1,
              retrievalScore: 0.97
            },
            {
              chunkId: "chunk-blocking",
              text: "Unsupported high-confidence claims should be blocked or routed for review.",
              sourceId: "amc-docs",
              sourceUri: "amc://docs/claim-safety",
              sourceTitle: "AMC claim safety guide",
              documentVersion: "2026.06.25",
              ingestedAt: "2026-06-25T09:50:00.000Z",
              retrievedRank: 2,
              retrievalScore: 0.88
            }
          ],
          claims: [
            {
              claimId: "claim-supported",
              text: "AMC verifies RAG answers with signed evidence receipts.",
              label: "supported",
              evidenceChunkIds: ["chunk-receipts"],
              confidence: 0.96,
              citationIds: ["chunk-receipts"]
            },
            {
              claimId: "claim-contradicted",
              text: "AMC ignores unsupported claims.",
              label: "contradicted",
              evidenceChunkIds: ["chunk-blocking"],
              confidence: 0.91,
              citationIds: ["chunk-blocking"]
            },
            {
              claimId: "claim-unsupported",
              text: "AMC operates a Mars office.",
              label: "unsupported",
              evidenceChunkIds: [],
              confidence: 0.94,
              citationIds: []
            }
          ]
        }
      ]
    });

    expect(existsSync(written.receiptPath)).toBe(true);
    expect(written.signaturePath).toBeTruthy();
    expect(written.receipt.surfaceBinding).toEqual(["Score", "Watch", "Enforce"]);
    expect(written.receipt.metrics.queryCount).toBe(1);
    expect(written.receipt.metrics.retrievedChunkCount).toBe(2);
    expect(written.receipt.metrics.claimCount).toBe(3);
    expect(written.receipt.metrics.supportedClaimCount).toBe(1);
    expect(written.receipt.metrics.unsupportedClaimCount).toBe(1);
    expect(written.receipt.metrics.contradictedClaimCount).toBe(1);
    expect(written.receipt.metrics.faithfulnessScore).toBeCloseTo(1 / 3, 5);
    expect(written.receipt.metrics.retrievedSupportQuality).toBeCloseTo(2 / 3, 5);
    expect(written.receipt.metrics.unsupportedClaimRate).toBeCloseTo(1 / 3, 5);
    expect(written.receipt.metrics.contradictionRate).toBeCloseTo(1 / 3, 5);
    expect(written.receipt.metrics.provenanceCoverage).toBe(1);
    expect(written.receipt.enforcementAction).toBe("block");
    expect(written.receipt.findings.map((finding) => finding.kind)).toEqual(expect.arrayContaining([
      "unsupported_claim",
      "contradiction"
    ]));
    expect(written.receipt.failClosed).toBe(false);

    const verification = verifyRagGroundingEvalReceipt(written.receipt);
    expect(verification).toEqual({ valid: true, failClosedReasons: [] });
    expect(verifyArtifactFileSignature({ workspace: ws, path: written.receiptPath }).valid).toBe(true);

    const audit = renderRagGroundingEvalAuditExport(written.receipt);
    expect(audit).toContain("AMC RAG Grounding Evaluation Receipt");
    expect(audit).toContain("BLOCK");
    expect(audit).toContain("Faithfulness score");
    expect(audit).toContain("Unsupported claim rate");
    expect(audit).toContain("claim-unsupported");
  });

  it("fails closed when source metadata replaces query, retrieved chunk, and claim-label evidence", () => {
    const receipt = buildRagGroundingEvalReceipt({
      evaluationId: "gap4200-metadata-only",
      agentId: "metadata-only-rag-agent",
      runId: "run-gap4200-metadata-only",
      sourceCitations,
      cases: [
        {
          queryId: "metadata-only",
          query: BACKLOG_TITLE,
          answer: "The paper metadata proves RAG grounding.",
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

  it("fails closed when supported claims cite chunks that were not retrieved", () => {
    const receipt = buildRagGroundingEvalReceipt({
      evaluationId: "gap4200-missing-support",
      agentId: "rag-memory-agent",
      runId: "run-gap4200-missing-support",
      sourceCitations,
      cases: [
        {
          queryId: "q-missing-support",
          query: "What evidence supports the answer?",
          answer: "The answer is supported.",
          retrievedChunks: [
            {
              chunkId: "retrieved-1",
              text: "A retrieved chunk that does not support the cited claim.",
              sourceId: "amc-docs",
              sourceUri: "amc://docs/one",
              documentVersion: "2026.06.25",
              ingestedAt: "2026-06-25T09:50:00.000Z",
              retrievedRank: 1
            }
          ],
          claims: [
            {
              claimId: "claim-missing-evidence",
              text: "The answer is supported.",
              label: "supported",
              evidenceChunkIds: ["not-retrieved"],
              confidence: 0.9,
              citationIds: ["not-retrieved"]
            }
          ]
        }
      ]
    });

    expect(receipt.failClosed).toBe(true);
    expect(verifyRagGroundingEvalReceipt(receipt).failClosedReasons).toEqual(expect.arrayContaining([
      "rag-grounding-eval:claim:claim-missing-evidence:evidence-not-retrieved",
      "rag-grounding-eval:receipt-path:missing",
      "rag-grounding-eval:signature:missing"
    ]));
  });

  it("does not add paper-specific identifiers to generic RAG grounding implementation files", () => {
    const combined = IMPLEMENTATION_FILES.map((file) => readFileSync(file, "utf8")).join("\n");
    expect(combined).not.toContain(BACKLOG_TITLE);
    expect(combined).not.toContain("Cognitive Impedance");
    expect(combined).not.toContain("No-Meta");
    expect(combined).not.toContain("W3027879771");
    expect(combined).not.toContain("10.5281/zenodo.18717227");
    expect(combined).not.toContain(IDENTIFIER);
  });
});
