import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import {
  acceptHandoffPacket,
  createHandoffPacket,
  loadHandoffReceiverReceipt,
  loadHandoffUnresolvedDependencyLog,
  renderHandoffPacketMarkdown,
  verifyHandoffContract,
  verifyHandoffPacket
} from "../src/fleet/handoffPacket.js";

const DOC = "docs/source-reviews/GAP-1835-tradingagents-runtime-handoff-contracts.md";
const REPO = "https://github.com/TauricResearch/TradingAgents";
const API = "https://api.github.com/repos/TauricResearch/TradingAgents";
const README = "https://raw.githubusercontent.com/TauricResearch/TradingAgents/main/README.md";
const RELEASE = "https://github.com/TauricResearch/TradingAgents/releases/tag/v0.3.0";
const TITLE = "TradingAgents: Multi-Agents LLM Financial Trading Framework";
const IDENTIFIER = "tradingagents_runtime_handoff_contracts";
const IMPLEMENTATION_FILES = [
  "src/fleet/handoffPacket.ts",
  "src/fleet/typedGraph.ts",
  "src/runtime/lifecycleGraph.ts",
  "src/passport/passportSchema.ts",
  "src/cli.ts"
];

const roots: string[] = [];

function workspace(): string {
  const dir = mkdtempSync(join(tmpdir(), "amc-gap1835-handoff-contracts-"));
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

describe("GAP-1835 TradingAgents handoff contracts boundary", () => {
  it("documents the live TradingAgents source review and no-bloat relevance decision", () => {
    expect(existsSync(DOC)).toBe(true);
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-1835");
    expect(doc).toContain("Multi-agent handoff contracts");
    expect(doc).toContain(REPO);
    expect(doc).toContain(API);
    expect(doc).toContain(README);
    expect(doc).toContain(RELEASE);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("TauricResearch/TradingAgents");
    expect(doc).toContain("Python");
    expect(doc).toContain("Apache License 2.0");
    expect(doc).toContain("multi-agent trading framework");
    expect(doc).toContain("analyst");
    expect(doc).toContain("researcher");
    expect(doc).toContain("trader");
    expect(doc).toContain("risk management");
    expect(doc).toContain("sender receipt");
    expect(doc).toContain("receiver receipt");
    expect(doc).toContain("unresolved-dependency log");
    expect(doc).toContain("metadata-only");
    expect(doc).toContain("No TradingAgents adapter");
  });

  it("creates a signed handoff contract with ownership transfer and sender/receiver receipts", () => {
    const ws = workspace();
    const packet = createHandoffPacket(ws, {
      fromAgentId: "market-analyst",
      toAgentId: "risk-manager",
      goal: "Transfer market evidence for portfolio risk review.",
      currentState: "Market evidence collected and normalized.",
      nextAction: "Risk manager evaluates exposure and approval gates.",
      delegationScope: ["risk-review", "portfolio-exposure"],
      dependencyStatuses: [
        {
          dependencyId: "market-data-snapshot",
          ownerAgentId: "market-analyst",
          status: "satisfied",
          required: true,
          evidenceRefs: ["receipt-market-data"]
        },
        {
          dependencyId: "portfolio-policy",
          ownerAgentId: "portfolio-manager",
          status: "pending",
          required: true,
          evidenceRefs: ["policy-ref"]
        }
      ],
      ownershipTransfer: {
        fromOwnerAgentId: "market-analyst",
        toOwnerAgentId: "risk-manager",
        scope: ["risk-review", "portfolio-exposure"]
      }
    });

    const packetVerification = verifyHandoffPacket(ws, packet.packetId);
    expect(packetVerification.valid).toBe(true);
    expect(packetVerification.senderReceiptValid).toBe(true);
    expect(packet.senderReceipt?.receiptId).toMatch(/^handoff_sender_/);

    const receiverReceipt = acceptHandoffPacket(ws, packet.packetId, {
      receiverAgentId: "risk-manager",
      accepted: true,
      dependencyStatuses: [
        {
          dependencyId: "portfolio-policy",
          ownerAgentId: "portfolio-manager",
          status: "satisfied",
          required: true,
          evidenceRefs: ["receipt-portfolio-policy"]
        }
      ]
    });

    expect(receiverReceipt.receiptId).toMatch(/^handoff_receiver_/);
    expect(receiverReceipt.ownershipAccepted).toBe(true);
    expect(receiverReceipt.unresolvedDependencies).toHaveLength(0);
    expect(loadHandoffReceiverReceipt(ws, packet.packetId)?.receiptId).toBe(receiverReceipt.receiptId);

    const contract = verifyHandoffContract(ws, packet.packetId);
    expect(contract.valid).toBe(true);
    expect(contract.packetValid).toBe(true);
    expect(contract.senderReceiptValid).toBe(true);
    expect(contract.receiverReceiptValid).toBe(true);
    expect(contract.ownershipAccepted).toBe(true);
    expect(contract.unresolvedDependencies).toHaveLength(0);
    expect(contract.errors).toHaveLength(0);

    const markdown = renderHandoffPacketMarkdown(packet);
    expect(markdown).toContain("## Ownership Transfer");
    expect(markdown).toContain("risk-manager");
    expect(markdown).toContain("## Dependency Status");
    expect(markdown).toContain("market-data-snapshot");
    expect(markdown).toContain("## Sender Receipt");
  });

  it("fails closed and writes unresolved-dependency evidence when receiver proof is missing or refused", () => {
    const ws = workspace();
    const packet = createHandoffPacket(ws, {
      fromAgentId: "trader-agent",
      toAgentId: "portfolio-manager",
      goal: "Request approval for proposed position.",
      dependencyStatuses: [
        {
          dependencyId: "risk-limit-check",
          ownerAgentId: "risk-manager",
          status: "blocked",
          required: true,
          evidenceRefs: ["risk-limit-policy"],
          refusalReason: "Exposure exceeds policy limit."
        }
      ],
      ownershipTransfer: {
        fromOwnerAgentId: "trader-agent",
        toOwnerAgentId: "portfolio-manager",
        scope: ["trade-approval"]
      }
    });

    const beforeReceiver = verifyHandoffContract(ws, packet.packetId);
    expect(beforeReceiver.valid).toBe(false);
    expect(beforeReceiver.errors).toEqual(expect.arrayContaining([
      "handoff-contract:receiver-receipt:missing",
      "handoff-contract:ownership-transfer:not-accepted",
      "handoff-contract:dependency:risk-limit-check:unresolved"
    ]));

    acceptHandoffPacket(ws, packet.packetId, {
      receiverAgentId: "portfolio-manager",
      accepted: false,
      refusalReason: "Portfolio manager refused unresolved risk-limit dependency."
    });

    const afterRefusal = verifyHandoffContract(ws, packet.packetId);
    expect(afterRefusal.valid).toBe(false);
    expect(afterRefusal.receiverReceiptValid).toBe(true);
    expect(afterRefusal.errors).toEqual(expect.arrayContaining([
      "handoff-contract:receiver-refusal:present",
      "handoff-contract:ownership-transfer:not-accepted",
      "handoff-contract:dependency:risk-limit-check:unresolved"
    ]));

    const unresolved = loadHandoffUnresolvedDependencyLog(ws, packet.packetId);
    expect(unresolved?.packetId).toBe(packet.packetId);
    expect(unresolved?.dependencies.map((dependency) => dependency.dependencyId)).toContain("risk-limit-check");
    expect(unresolved?.refusalReasons.map((reason) => reason.reason)).toContain("Portfolio manager refused unresolved risk-limit dependency.");
  });

  it("does not add TradingAgents identifiers to generic fleet, runtime, passport, or CLI implementation files", () => {
    const combined = IMPLEMENTATION_FILES.map((file) => readFileSync(file, "utf8")).join("\n");
    expect(combined).not.toContain("TauricResearch");
    expect(combined).not.toContain("TradingAgents");
    expect(combined).not.toContain("tradingagents");
    expect(combined).not.toContain("Multi-Agents LLM Financial Trading Framework");
    expect(combined).not.toContain(IDENTIFIER);
  });
});
