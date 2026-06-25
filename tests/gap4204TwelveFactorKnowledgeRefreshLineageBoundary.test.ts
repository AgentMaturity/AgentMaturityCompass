import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { verifyArtifactFileSignature } from "../src/lifecycle/artifactSignature.js";
import {
  buildKnowledgeRefreshLineageReceipt,
  renderKnowledgeRefreshLineageAuditExport,
  verifyKnowledgeRefreshLineageReceipt,
  writeKnowledgeRefreshLineageReceipt
} from "../src/vault/knowledgeRefreshLineage.js";

const DOC = "docs/source-reviews/GAP-4204-twelve-factor-knowledge-refresh-lineage.md";
const REPO = "https://github.com/humanlayer/12-factor-agents";
const API = "https://api.github.com/repos/humanlayer/12-factor-agents";
const README = "https://raw.githubusercontent.com/humanlayer/12-factor-agents/main/README.md";
const FACTOR_03 = "https://raw.githubusercontent.com/humanlayer/12-factor-agents/main/content/factor-03-own-your-context-window.md";
const FACTOR_12 = "https://raw.githubusercontent.com/humanlayer/12-factor-agents/main/content/factor-12-stateless-reducer.md";
const IMPLEMENTATION_FILES = [
  "src/vault/knowledgeRefreshLineage.ts",
  "src/vault/index.ts",
  "src/index.ts",
  "src/lifecycle/artifactSignature.ts"
];

const roots: string[] = [];

function workspace(): string {
  const dir = mkdtempSync(join(tmpdir(), "amc-gap4204-refresh-lineage-"));
  roots.push(dir);
  return dir;
}

afterEach(() => {
  while (roots.length > 0) {
    const dir = roots.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

describe("GAP-4204 12-factor agents knowledge refresh lineage boundary", () => {
  it("documents the live source review and no-bloat relevance decision", () => {
    expect(existsSync(DOC)).toBe(true);
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-4204");
    expect(doc).toContain("Knowledge refresh lineage");
    expect(doc).toContain(REPO);
    expect(doc).toContain(API);
    expect(doc).toContain(README);
    expect(doc).toContain(FACTOR_03);
    expect(doc).toContain(FACTOR_12);
    expect(doc).toContain("TypeScript");
    expect(doc).toContain("Apache 2.0 code license");
    expect(doc).toContain("CC BY-SA 4.0 content license");
    expect(doc).toContain("own your context window");
    expect(doc).toContain("stateless reducer");
    expect(doc).toContain("corpus version, ingestion receipt, source approvals, deletion requests, and score impact");
    expect(doc).toContain("metadata-only");
    expect(doc).toContain("No 12-factor adapter");
  });

  it("writes a signed refresh lineage receipt with corpus version, ingestion, approvals, deletions, and score impact", () => {
    const ws = workspace();
    const written = writeKnowledgeRefreshLineageReceipt({
      workspace: ws,
      agentId: "rag-refresh-agent",
      receiptId: "gap4204-refresh-lineage",
      corpusId: "support-policy-kb",
      previousCorpusVersion: "2026.06.25-r1",
      refreshedCorpusVersion: "2026.06.25-r2",
      ingestionJobId: "ingest-job-4204",
      ingestionReceiptId: "ingest-receipt-4204",
      sourceApprovals: [
        {
          approvalId: "approval-privacy-policy",
          sourceId: "policy-doc-privacy",
          decision: "approved",
          approvedBy: "data-owner",
          approvedAt: "2026-06-25T10:45:00.000Z",
          evidenceRef: "approval-ticket-4204"
        }
      ],
      deletionRequests: [
        {
          requestId: "delete-stale-faq",
          sourceId: "faq-legacy",
          status: "completed",
          requestedAt: "2026-06-25T10:40:00.000Z",
          completedAt: "2026-06-25T10:44:00.000Z",
          evidenceRef: "deletion-receipt-4204"
        }
      ],
      affectedScores: [
        {
          scoreId: "score-grounding",
          questionId: "AMC-RAG-3",
          previousScore0to100: 71,
          refreshedScore0to100: 84,
          reason: "Refreshed corpus removed stale FAQ chunk and improved provenance coverage."
        },
        {
          scoreId: "score-staleness",
          questionId: "AMC-RAG-5",
          previousScore0to100: 62,
          refreshedScore0to100: 78,
          reason: "New source version reduced stale retrieval findings."
        }
      ],
      sourceRefs: [REPO, README, FACTOR_03],
      evidenceRefs: ["rag-grounding-receipt-4204", "watch-alert-4204", "score-diff-4204"]
    });

    expect(existsSync(written.receiptPath)).toBe(true);
    expect(written.receipt.signaturePath).toBeTruthy();
    expect(written.receipt.failClosed).toBe(false);
    expect(written.receipt.surfaces).toEqual(["Score", "Watch", "Enforce"]);
    expect(written.receipt.corpus.corpusId).toBe("support-policy-kb");
    expect(written.receipt.corpus.previousVersion).toBe("2026.06.25-r1");
    expect(written.receipt.corpus.refreshedVersion).toBe("2026.06.25-r2");
    expect(written.receipt.ingestion).toMatchObject({
      jobId: "ingest-job-4204",
      receiptId: "ingest-receipt-4204"
    });
    expect(written.receipt.sourceApprovals).toHaveLength(1);
    expect(written.receipt.deletionRequests[0]!.status).toBe("completed");
    expect(written.receipt.scoreImpact.changedScoreCount).toBe(2);
    expect(written.receipt.scoreImpact.maxAbsDelta0to100).toBe(16);
    expect(written.receipt.receiptHash).toMatch(/^[a-f0-9]{64}$/);
    expect(verifyKnowledgeRefreshLineageReceipt(written.receipt).valid).toBe(true);
    expect(verifyArtifactFileSignature({ workspace: ws, path: written.receiptPath }).valid).toBe(true);

    const audit = renderKnowledgeRefreshLineageAuditExport(written.receipt);
    expect(audit).toContain("Knowledge Refresh Lineage");
    expect(audit).toContain("VALID");
    expect(audit).toContain("support-policy-kb");
    expect(audit).toContain("ingest-receipt-4204");
  });

  it("fails closed when source metadata replaces refresh lineage evidence", () => {
    const receipt = buildKnowledgeRefreshLineageReceipt({
      receiptId: "gap4204-metadata-only",
      agentId: "metadata-only-agent",
      corpusId: "metadata-only-corpus",
      previousCorpusVersion: "unknown",
      refreshedCorpusVersion: "unknown",
      ingestionJobId: "",
      ingestionReceiptId: "",
      sourceApprovals: [],
      deletionRequests: [],
      affectedScores: [],
      sourceRefs: [REPO, API, README],
      evidenceRefs: []
    });

    expect(receipt.failClosed).toBe(true);
    expect(receipt.failClosedReasons).toEqual(expect.arrayContaining([
      "knowledge-refresh-lineage:ingestion-job:missing",
      "knowledge-refresh-lineage:ingestion-receipt:missing",
      "knowledge-refresh-lineage:source-approvals:missing",
      "knowledge-refresh-lineage:affected-scores:missing",
      "knowledge-refresh-lineage:evidence:missing",
      "knowledge-refresh-lineage:corpus-version:unchanged"
    ]));
    expect(verifyKnowledgeRefreshLineageReceipt(receipt).valid).toBe(false);
  });

  it("does not add 12-factor-agent-specific product code or dependencies", () => {
    const combined = IMPLEMENTATION_FILES.map((file) => readFileSync(file, "utf8")).join("\n");
    expect(combined).not.toContain("humanlayer/12-factor-agents");
    expect(combined).not.toContain("12-factor-agents");
    expect(combined).not.toContain("humanlayer.dev");
    expect(combined).not.toContain("GAP-4204");
    expect(combined).not.toContain("twelveFactorImporter");
  });
});
