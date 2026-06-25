import { existsSync, readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildRagGroundingEvalReceipt,
  verifyRagGroundingEvalReceipt,
  writeRagGroundingEvalReceipt,
  type RagGroundingEvalSourceCitation
} from "../src/score/ragGroundingEval.js";

const DOC = "docs/source-reviews/GAP-4205-fact-checking-rag-grounding-eval.md";
const OPENALEX = "https://openalex.org/W7118132038";
const OPENALEX_API = "https://api.openalex.org/works/W7118132038";
const DOI = "https://doi.org/10.1007/s10462-025-11454-w";
const CROSSREF = "https://api.crossref.org/works/10.1007/s10462-025-11454-w";
const SPRINGER = "https://link.springer.com/article/10.1007/s10462-025-11454-w";
const TITLE = "Hallucination to truth: a review of fact-checking and factuality evaluation in large language models";
const IDENTIFIER = "hallucination_to_truth_grounding_eval";
const IMPLEMENTATION_FILES = [
  "src/score/ragGroundingEval.ts",
  "src/score/index.ts",
  "src/lifecycle/artifactSignature.ts"
];

const sourceCitations: RagGroundingEvalSourceCitation[] = [
  {
    sourceId: "openalex-w7118132038",
    title: TITLE,
    url: OPENALEX,
    retrievedAt: "2026-06-25T09:56:00.000Z"
  },
  {
    sourceId: "doi-10-1007-s10462-025-11454-w",
    title: "Springer DOI landing page",
    url: DOI,
    retrievedAt: "2026-06-25T09:56:00.000Z"
  }
];

const roots: string[] = [];

function workspace(): string {
  const dir = mkdtempSync(join(tmpdir(), "amc-gap4205-grounding-"));
  roots.push(dir);
  return dir;
}

afterEach(() => {
  while (roots.length > 0) {
    const dir = roots.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

describe("GAP-4205 fact-checking grounding eval boundary", () => {
  it("documents live source metadata and no-bloat relevance decision", () => {
    expect(existsSync(DOC)).toBe(true);
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-4205");
    expect(doc).toContain(TITLE);
    expect(doc).toContain(OPENALEX);
    expect(doc).toContain(OPENALEX_API);
    expect(doc).toContain(DOI);
    expect(doc).toContain(CROSSREF);
    expect(doc).toContain(SPRINGER);
    expect(doc).toContain("Artificial Intelligence Review");
    expect(doc).toContain("Springer Science and Business Media LLC");
    expect(doc).toContain("2026-01-03");
    expect(doc).toContain("S M Asif Ur Rahman");
    expect(doc).toContain("fact-checking frameworks");
    expect(doc).toContain("retrieval-augmented generation");
    expect(doc).toContain("validated external evidence");
    expect(doc).toContain("reused the generic GAP-4200 RAG grounding evaluation receipt");
    expect(doc).toContain("metadata-only");
    expect(doc).toContain("No fact-checking review importer");
  });

  it("accepts fact-checking context through the generic signed RAG grounding receipt", () => {
    const ws = workspace();

    const written = writeRagGroundingEvalReceipt({
      workspace: ws,
      evaluationId: "gap4205-fact-checking-grounding",
      agentId: "fact-checking-rag-agent",
      runId: "run-gap4205-fact-checking",
      sourceCitations,
      cases: [
        {
          queryId: "q-factuality",
          query: "Which evidence supports the answer?",
          answer: "AMC uses retrieved evidence and claim labels for fact-checking. The claim that unsupported evidence is safe is unresolved.",
          retrievedChunks: [
            {
              chunkId: "chunk-fact-checking",
              text: "AMC fact-checking requires retrieved evidence, claim labels, and explicit unsupported or unknown outcomes.",
              sourceId: "amc-factuality",
              sourceUri: "amc://score/rag-grounding",
              sourceTitle: "AMC RAG grounding receipt",
              documentVersion: "2026.06.25",
              ingestedAt: "2026-06-25T09:56:00.000Z",
              retrievedAt: "2026-06-25T09:57:00.000Z",
              permissionStatus: "allowed",
              retrievedRank: 1,
              retrievalScore: 0.93
            }
          ],
          claims: [
            {
              claimId: "claim-fact-checking-supported",
              text: "AMC uses retrieved evidence and claim labels for fact-checking.",
              label: "supported",
              evidenceChunkIds: ["chunk-fact-checking"],
              confidence: 0.94,
              citationIds: ["chunk-fact-checking"]
            },
            {
              claimId: "claim-fact-checking-unknown",
              text: "The claim that unsupported evidence is safe is unresolved.",
              label: "unknown",
              evidenceChunkIds: [],
              confidence: 0.82,
              citationIds: []
            }
          ]
        }
      ]
    });

    expect(written.receipt.failClosed).toBe(false);
    expect(written.receipt.metrics.faithfulnessScore).toBe(0.5);
    expect(written.receipt.metrics.retrievedSupportQuality).toBe(0.5);
    expect(written.receipt.metrics.unknownClaimCount).toBe(1);
    expect(written.receipt.findings.map((finding) => finding.kind)).toContain("unknown_claim");
    expect(written.receipt.enforcementAction).toBe("warn");
    expect(verifyRagGroundingEvalReceipt(written.receipt).valid).toBe(true);
  });

  it("fails closed when fact-checking paper metadata replaces grounded query evidence", () => {
    const receipt = buildRagGroundingEvalReceipt({
      evaluationId: "gap4205-metadata-only",
      agentId: "metadata-only-agent",
      runId: "run-gap4205-metadata-only",
      sourceCitations,
      cases: [
        {
          queryId: "metadata-only",
          query: TITLE,
          answer: "Fact-checking review metadata proves factuality.",
          retrievedChunks: [],
          claims: []
        }
      ]
    });

    expect(receipt.failClosed).toBe(true);
    expect(verifyRagGroundingEvalReceipt(receipt).failClosedReasons).toEqual(expect.arrayContaining([
      "rag-grounding-eval:case:metadata-only:retrieved-chunks:missing",
      "rag-grounding-eval:case:metadata-only:claim-labels:missing",
      "rag-grounding-eval:receipt-path:missing",
      "rag-grounding-eval:signature:missing"
    ]));
  });

  it("does not add fact-checking review identifiers to generic grounding implementation files", () => {
    const combined = IMPLEMENTATION_FILES.map((file) => readFileSync(file, "utf8")).join("\n");
    expect(combined).not.toContain(TITLE);
    expect(combined).not.toContain("W7118132038");
    expect(combined).not.toContain("10.1007/s10462-025-11454-w");
    expect(combined).not.toContain("Artificial Intelligence Review");
    expect(combined).not.toContain(IDENTIFIER);
  });
});
