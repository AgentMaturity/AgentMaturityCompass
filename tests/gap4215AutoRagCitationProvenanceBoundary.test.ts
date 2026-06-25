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

const DOC = "docs/source-reviews/GAP-4215-autorag-citation-provenance.md";
const GITHUB_REPO = "https://github.com/Marker-Inc-Korea/AutoRAG";
const GITHUB_API = "https://api.github.com/repos/Marker-Inc-Korea/AutoRAG";
const README = "https://raw.githubusercontent.com/Marker-Inc-Korea/AutoRAG/main/README.md";
const DOCS = "https://marker-inc-korea.github.io/AutoRAG/";
const TITLE = "AutoRAG: An Open-Source Framework for Retrieval-Augmented Generation (RAG) Evaluation & Optimization with AutoML-Style Automation";
const IDENTIFIER = "autorag_citation_provenance";
const IMPLEMENTATION_FILES = [
  "src/score/ragGroundingEval.ts",
  "src/score/index.ts",
  "src/lifecycle/artifactSignature.ts"
];

const sourceCitations: RagGroundingEvalSourceCitation[] = [
  {
    sourceId: "github-marker-inc-korea-autorag",
    title: TITLE,
    url: GITHUB_REPO,
    retrievedAt: "2026-06-25T16:02:00.000Z"
  },
  {
    sourceId: "autorag-docs",
    title: "AutoRAG documentation",
    url: DOCS,
    retrievedAt: "2026-06-25T16:02:00.000Z"
  }
];

const roots: string[] = [];

function workspace(): string {
  const dir = mkdtempSync(join(tmpdir(), "amc-gap4215-citation-provenance-"));
  roots.push(dir);
  return dir;
}

afterEach(() => {
  while (roots.length > 0) {
    const dir = roots.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

describe("GAP-4215 AutoRAG citation provenance boundary", () => {
  it("documents live AutoRAG metadata and no-bloat relevance decision", () => {
    expect(existsSync(DOC)).toBe(true);
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-4215");
    expect(doc).toContain(TITLE);
    expect(doc).toContain(GITHUB_REPO);
    expect(doc).toContain(GITHUB_API);
    expect(doc).toContain(README);
    expect(doc).toContain(DOCS);
    expect(doc).toContain("Apache-2.0");
    expect(doc).toContain("Python");
    expect(doc).toContain("QA dataset");
    expect(doc).toContain("Corpus dataset");
    expect(doc).toContain("retrieval_f1");
    expect(doc).toContain("Claim ID, source chunk ID, retrieval time, confidence, and permission status");
    expect(doc).toContain("metadata-only");
    expect(doc).toContain("No AutoRAG importer");
  });

  it("writes claim-level citation provenance for every grounded claim evidence edge", () => {
    const ws = workspace();

    const written = writeRagGroundingEvalReceipt({
      workspace: ws,
      evaluationId: "gap4215-citation-provenance",
      agentId: "rag-citation-agent",
      runId: "run-gap4215-citation-provenance",
      sourceCitations,
      cases: [
        {
          queryId: "q-citation-provenance",
          query: "Which source backs the RAG answer?",
          answer: "AMC binds factual claims to retrieved chunks with retrieval time, confidence, and permission status.",
          retrievedChunks: [
            {
              chunkId: "source-chunk-1",
              text: "Claim provenance requires the claim identifier, source chunk identifier, retrieval timestamp, confidence, and permission status.",
              sourceId: "amc-rag-provenance",
              sourceUri: "amc://rag/provenance/source-chunk-1",
              sourceTitle: "AMC RAG provenance guide",
              documentVersion: "2026.06.25",
              ingestedAt: "2026-06-25T16:02:00.000Z",
              retrievedAt: "2026-06-25T16:03:00.000Z",
              permissionStatus: "allowed",
              retrievedRank: 1,
              retrievalScore: 0.98
            }
          ],
          claims: [
            {
              claimId: "claim-citation-provenance",
              text: "AMC binds factual claims to retrieved chunks with retrieval time, confidence, and permission status.",
              label: "supported",
              evidenceChunkIds: ["source-chunk-1"],
              confidence: 0.97,
              citationIds: ["source-chunk-1"]
            }
          ]
        }
      ]
    });

    expect(existsSync(written.receiptPath)).toBe(true);
    expect(written.signaturePath).toBeTruthy();
    expect(written.receipt.failClosed).toBe(false);
    expect(written.receipt.metrics.provenanceCoverage).toBe(1);
    expect(written.receipt.metrics.citationProvenanceCoverage).toBe(1);
    expect(written.receipt.cases[0]?.citationProvenance).toEqual([
      expect.objectContaining({
        claimId: "claim-citation-provenance",
        sourceChunkId: "source-chunk-1",
        retrievedAt: "2026-06-25T16:03:00.000Z",
        confidence: 0.97,
        permissionStatus: "allowed",
        sourceId: "amc-rag-provenance",
        sourceUri: "amc://rag/provenance/source-chunk-1",
        documentVersion: "2026.06.25"
      })
    ]);
    expect(verifyRagGroundingEvalReceipt(written.receipt)).toEqual({ valid: true, failClosedReasons: [] });
    expect(verifyArtifactFileSignature({ workspace: ws, path: written.receiptPath }).valid).toBe(true);

    const audit = renderRagGroundingEvalAuditExport(written.receipt);
    expect(audit).toContain("Citation provenance coverage");
    expect(audit).toContain("claim-citation-provenance -> source-chunk-1");
  });

  it("fails closed when cited evidence lacks retrieval time or allowed source permission", () => {
    const receipt = buildRagGroundingEvalReceipt({
      evaluationId: "gap4215-missing-citation-provenance",
      agentId: "rag-citation-agent",
      runId: "run-gap4215-missing-citation-provenance",
      sourceCitations,
      cases: [
        {
          queryId: "q-missing-provenance",
          query: "Which source backs the answer?",
          answer: "This answer cites a chunk without permission proof.",
          retrievedChunks: [
            {
              chunkId: "source-chunk-missing-provenance",
              text: "A retrieved chunk without retrieval time and with unresolved source permission.",
              sourceId: "external-rag-corpus",
              sourceUri: "https://example.invalid/rag/source",
              sourceTitle: "External RAG corpus",
              documentVersion: "2026.06.25",
              ingestedAt: "2026-06-25T16:02:00.000Z",
              permissionStatus: "unknown",
              retrievedRank: 1,
              retrievalScore: 0.91
            }
          ],
          claims: [
            {
              claimId: "claim-missing-provenance",
              text: "This answer cites a chunk without permission proof.",
              label: "supported",
              evidenceChunkIds: ["source-chunk-missing-provenance"],
              confidence: 0.93,
              citationIds: ["source-chunk-missing-provenance"]
            }
          ]
        }
      ]
    });

    expect(receipt.failClosed).toBe(true);
    expect(verifyRagGroundingEvalReceipt(receipt).valid).toBe(false);
    expect(receipt.metrics.citationProvenanceCoverage).toBe(0);
    expect(receipt.failClosedReasons).toEqual(expect.arrayContaining([
      "rag-grounding-eval:claim:claim-missing-provenance:citation:source-chunk-missing-provenance:retrieved-at:missing",
      "rag-grounding-eval:claim:claim-missing-provenance:citation:source-chunk-missing-provenance:permission:not-allowed",
      "rag-grounding-eval:receipt-path:missing",
      "rag-grounding-eval:signature:missing"
    ]));
  });

  it("does not add AutoRAG-specific identifiers or adapters to generic implementation files", () => {
    const combined = IMPLEMENTATION_FILES.map((file) => readFileSync(file, "utf8")).join("\n");
    expect(combined).not.toContain("Marker-Inc-Korea/AutoRAG");
    expect(combined).not.toContain("AutoRAG");
    expect(combined).not.toContain("autorag");
    expect(combined).not.toContain(IDENTIFIER);
  });
});
