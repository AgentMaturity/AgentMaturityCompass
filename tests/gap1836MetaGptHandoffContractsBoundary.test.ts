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

const DOC = "docs/source-reviews/GAP-1836-metagpt-runtime-handoff-contracts.md";
const REPO = "https://github.com/FoundationAgents/MetaGPT";
const API = "https://api.github.com/repos/FoundationAgents/MetaGPT";
const README = "https://raw.githubusercontent.com/FoundationAgents/MetaGPT/main/README.md";
const RELEASE = "https://github.com/FoundationAgents/MetaGPT/releases/tag/v0.8.1";
const TITLE = "MetaGPT: The Multi-Agent Framework";
const IDENTIFIER = "metagpt_runtime_handoff_contracts";
const IMPLEMENTATION_FILES = [
  "src/fleet/handoffPacket.ts",
  "src/fleet/typedGraph.ts",
  "src/runtime/lifecycleGraph.ts",
  "src/passport/passportSchema.ts",
  "src/cli.ts"
];

const roots: string[] = [];

function workspace(): string {
  const dir = mkdtempSync(join(tmpdir(), "amc-gap1836-handoff-contracts-"));
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

describe("GAP-1836 MetaGPT handoff contracts boundary", () => {
  it("documents the live MetaGPT source review and no-bloat relevance decision", () => {
    expect(existsSync(DOC)).toBe(true);
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-1836");
    expect(doc).toContain("Multi-agent handoff contracts");
    expect(doc).toContain(REPO);
    expect(doc).toContain(API);
    expect(doc).toContain(README);
    expect(doc).toContain(RELEASE);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("FoundationAgents/MetaGPT");
    expect(doc).toContain("Python");
    expect(doc).toContain("MIT License");
    expect(doc).toContain("software company");
    expect(doc).toContain("product managers");
    expect(doc).toContain("architects");
    expect(doc).toContain("project managers");
    expect(doc).toContain("engineers");
    expect(doc).toContain("SOP");
    expect(doc).toContain("sender receipt");
    expect(doc).toContain("receiver receipt");
    expect(doc).toContain("unresolved-dependency log");
    expect(doc).toContain("metadata-only");
    expect(doc).toContain("No MetaGPT adapter");
  });

  it("reuses generic signed handoff contracts for software-company role transfers", () => {
    const ws = workspace();
    const packet = createHandoffPacket(ws, {
      fromAgentId: "product-manager",
      toAgentId: "architect-agent",
      goal: "Transfer accepted requirements into architecture design.",
      currentState: "Requirement and user story package approved.",
      nextAction: "Architect drafts interface and module contracts.",
      delegationScope: ["architecture-design", "module-contracts"],
      dependencyStatuses: [
        {
          dependencyId: "requirements-package",
          ownerAgentId: "product-manager",
          status: "satisfied",
          required: true,
          evidenceRefs: ["receipt-requirements-package"]
        },
        {
          dependencyId: "acceptance-criteria",
          ownerAgentId: "project-manager",
          status: "pending",
          required: true,
          evidenceRefs: ["criteria-draft"]
        }
      ],
      ownershipTransfer: {
        fromOwnerAgentId: "product-manager",
        toOwnerAgentId: "architect-agent",
        scope: ["architecture-design", "module-contracts"]
      }
    });

    expect(verifyHandoffPacket(ws, packet.packetId).senderReceiptValid).toBe(true);

    acceptHandoffPacket(ws, packet.packetId, {
      receiverAgentId: "architect-agent",
      accepted: true,
      dependencyStatuses: [
        {
          dependencyId: "acceptance-criteria",
          ownerAgentId: "project-manager",
          status: "satisfied",
          required: true,
          evidenceRefs: ["receipt-acceptance-criteria"]
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
    expect(markdown).toContain("product-manager");
    expect(markdown).toContain("architect-agent");
    expect(markdown).toContain("## Dependency Status");
    expect(markdown).toContain("requirements-package");
  });

  it("fails closed for refused engineering handoffs and writes unresolved dependency evidence", () => {
    const ws = workspace();
    const packet = createHandoffPacket(ws, {
      fromAgentId: "architect-agent",
      toAgentId: "engineer-agent",
      goal: "Transfer architecture plan into implementation.",
      dependencyStatuses: [
        {
          dependencyId: "api-contract",
          ownerAgentId: "architect-agent",
          status: "refused",
          required: true,
          evidenceRefs: ["api-contract-review"],
          refusalReason: "API contract lacks security boundary review."
        }
      ],
      ownershipTransfer: {
        fromOwnerAgentId: "architect-agent",
        toOwnerAgentId: "engineer-agent",
        scope: ["implementation"]
      }
    });

    acceptHandoffPacket(ws, packet.packetId, {
      receiverAgentId: "engineer-agent",
      accepted: false,
      refusalReason: "Engineer refused implementation handoff until API contract review is complete."
    });

    const contract = verifyHandoffContract(ws, packet.packetId);
    expect(contract.valid).toBe(false);
    expect(contract.errors).toEqual(expect.arrayContaining([
      "handoff-contract:receiver-refusal:present",
      "handoff-contract:ownership-transfer:not-accepted",
      "handoff-contract:dependency:api-contract:unresolved"
    ]));

    const unresolved = loadHandoffUnresolvedDependencyLog(ws, packet.packetId);
    expect(unresolved?.dependencies.map((dependency) => dependency.dependencyId)).toContain("api-contract");
    expect(unresolved?.refusalReasons.map((reason) => reason.reason)).toContain("Engineer refused implementation handoff until API contract review is complete.");
  });

  it("does not add MetaGPT identifiers to generic fleet, runtime, passport, or CLI implementation files", () => {
    const combined = IMPLEMENTATION_FILES.map((file) => readFileSync(file, "utf8")).join("\n");
    expect(combined).not.toContain("FoundationAgents");
    expect(combined).not.toContain("MetaGPT");
    expect(combined).not.toContain("metagpt");
    expect(combined).not.toContain("First AI Software Company");
    expect(combined).not.toContain(IDENTIFIER);
  });
});
