import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import {
  acceptHandoffPacket,
  createHandoffPacket,
  loadHandoffUnresolvedDependencyLog,
  renderHandoffPacketMarkdown,
  verifyHandoffContract,
  verifyHandoffPacket
} from "../src/fleet/handoffPacket.js";

const DOC = "docs/source-reviews/GAP-1837-llamaindex-runtime-handoff-contracts.md";
const REPO = "https://github.com/run-llama/llama_index";
const API = "https://api.github.com/repos/run-llama/llama_index";
const README = "https://raw.githubusercontent.com/run-llama/llama_index/main/README.md";
const RELEASE = "https://github.com/run-llama/llama_index/releases/tag/v0.14.23";
const TITLE = "LlamaIndex";
const IDENTIFIER = "llamaindex_runtime_handoff_contracts";
const IMPLEMENTATION_FILES = [
  "src/fleet/handoffPacket.ts",
  "src/fleet/typedGraph.ts",
  "src/runtime/lifecycleGraph.ts",
  "src/passport/passportSchema.ts",
  "src/cli.ts"
];

const roots: string[] = [];

function workspace(): string {
  const dir = mkdtempSync(join(tmpdir(), "amc-gap1837-handoff-contracts-"));
  roots.push(dir);
  initWorkspace({ workspacePath: dir, trustBoundaryMode: "isolated" });
  return dir;
}

afterEach(() => {
  while (roots.length > 0) {
    const dir = roots.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

describe("GAP-1837 LlamaIndex handoff contracts boundary", () => {
  it("documents the live LlamaIndex source review and no-bloat relevance decision", () => {
    expect(existsSync(DOC)).toBe(true);
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-1837");
    expect(doc).toContain("Multi-agent handoff contracts");
    expect(doc).toContain(REPO);
    expect(doc).toContain(API);
    expect(doc).toContain(README);
    expect(doc).toContain(RELEASE);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("run-llama/llama_index");
    expect(doc).toContain("Python");
    expect(doc).toContain("MIT License");
    expect(doc).toContain("document agent");
    expect(doc).toContain("agentic OCR");
    expect(doc).toContain("RAG");
    expect(doc).toContain("data connectors");
    expect(doc).toContain("Workflows");
    expect(doc).toContain("sender receipt");
    expect(doc).toContain("receiver receipt");
    expect(doc).toContain("unresolved-dependency log");
    expect(doc).toContain("metadata-only");
    expect(doc).toContain("No LlamaIndex adapter");
  });

  it("reuses generic signed handoff contracts for document-agent pipeline transfers", () => {
    const ws = workspace();
    const packet = createHandoffPacket(ws, {
      fromAgentId: "parse-agent",
      toAgentId: "retrieval-agent",
      goal: "Transfer parsed document blocks into indexed retrieval workflow.",
      currentState: "Document parsing and OCR extraction completed.",
      nextAction: "Retrieval agent indexes evidence and prepares grounded answer context.",
      delegationScope: ["document-indexing", "rag-grounding"],
      dependencyStatuses: [
        {
          dependencyId: "document-parse-output",
          ownerAgentId: "parse-agent",
          status: "satisfied",
          required: true,
          evidenceRefs: ["receipt-document-parse-output"]
        },
        {
          dependencyId: "source-node-lineage",
          ownerAgentId: "retrieval-agent",
          status: "pending",
          required: true,
          evidenceRefs: ["source-node-lineage-draft"]
        }
      ],
      ownershipTransfer: {
        fromOwnerAgentId: "parse-agent",
        toOwnerAgentId: "retrieval-agent",
        scope: ["document-indexing", "rag-grounding"]
      }
    });

    expect(verifyHandoffPacket(ws, packet.packetId).senderReceiptValid).toBe(true);

    acceptHandoffPacket(ws, packet.packetId, {
      receiverAgentId: "retrieval-agent",
      accepted: true,
      dependencyStatuses: [
        {
          dependencyId: "source-node-lineage",
          ownerAgentId: "retrieval-agent",
          status: "satisfied",
          required: true,
          evidenceRefs: ["receipt-source-node-lineage"]
        }
      ]
    });

    const contract = verifyHandoffContract(ws, packet.packetId);
    expect(contract.valid).toBe(true);
    expect(contract.senderReceiptValid).toBe(true);
    expect(contract.receiverReceiptValid).toBe(true);
    expect(contract.ownershipAccepted).toBe(true);
    expect(contract.unresolvedDependencies).toHaveLength(0);

    const markdown = renderHandoffPacketMarkdown(packet);
    expect(markdown).toContain("## Ownership Transfer");
    expect(markdown).toContain("parse-agent");
    expect(markdown).toContain("retrieval-agent");
    expect(markdown).toContain("## Dependency Status");
    expect(markdown).toContain("document-parse-output");
  });

  it("fails closed for refused RAG handoffs and writes unresolved dependency evidence", () => {
    const ws = workspace();
    const packet = createHandoffPacket(ws, {
      fromAgentId: "retrieval-agent",
      toAgentId: "answer-agent",
      goal: "Transfer retrieved context into answer generation.",
      dependencyStatuses: [
        {
          dependencyId: "grounding-citations",
          ownerAgentId: "retrieval-agent",
          status: "blocked",
          required: true,
          evidenceRefs: ["citation-audit"],
          refusalReason: "Retrieved context lacks source citation coverage."
        }
      ],
      ownershipTransfer: {
        fromOwnerAgentId: "retrieval-agent",
        toOwnerAgentId: "answer-agent",
        scope: ["answer-generation"]
      }
    });

    acceptHandoffPacket(ws, packet.packetId, {
      receiverAgentId: "answer-agent",
      accepted: false,
      refusalReason: "Answer agent refused handoff until citation coverage is complete."
    });

    const contract = verifyHandoffContract(ws, packet.packetId);
    expect(contract.valid).toBe(false);
    expect(contract.errors).toEqual(expect.arrayContaining([
      "handoff-contract:receiver-refusal:present",
      "handoff-contract:ownership-transfer:not-accepted",
      "handoff-contract:dependency:grounding-citations:unresolved"
    ]));

    const unresolved = loadHandoffUnresolvedDependencyLog(ws, packet.packetId);
    expect(unresolved?.dependencies.map((dependency) => dependency.dependencyId)).toContain("grounding-citations");
    expect(unresolved?.refusalReasons.map((reason) => reason.reason)).toContain("Answer agent refused handoff until citation coverage is complete.");
  });

  it("does not add LlamaIndex identifiers to generic fleet, runtime, passport, or CLI implementation files", () => {
    const combined = IMPLEMENTATION_FILES.map((file) => readFileSync(file, "utf8")).join("\n");
    expect(combined).not.toContain("run-llama");
    expect(combined).not.toContain("llama_index");
    expect(combined).not.toContain("LlamaIndex");
    expect(combined).not.toContain("LlamaAgents");
    expect(combined).not.toContain(IDENTIFIER);
  });
});
