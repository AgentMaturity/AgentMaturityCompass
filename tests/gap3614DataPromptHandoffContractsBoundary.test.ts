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

const DOC = "docs/source-reviews/GAP-3614-data-prompt-handoff-contracts.md";
const OPENALEX = "https://openalex.org/W7128480797";
const OPENALEX_API = "https://api.openalex.org/works/W7128480797";
const DOI = "https://doi.org/10.1145/3772318.3791222";
const CROSSREF = "https://api.crossref.org/works/10.1145/3772318.3791222";
const ACM = "https://dl.acm.org/doi/10.1145/3772318.3791222";
const TITLE = "Data-Prompt Co-Evolution: Growing Test Sets to Refine LLM Behavior";
const IDENTIFIER = "data_prompt_coevolution_handoff_contracts";
const IMPLEMENTATION_FILES = [
  "src/fleet/handoffPacket.ts",
  "src/runtime/lifecycleGraph.ts",
  "src/passport/passportSchema.ts",
  "src/cli.ts"
];

const roots: string[] = [];

function workspace(): string {
  const dir = mkdtempSync(join(tmpdir(), "amc-gap3614-handoff-contracts-"));
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

describe("GAP-3614 Data-Prompt handoff contracts boundary", () => {
  it("documents live paper metadata and no-bloat relevance decision", () => {
    expect(existsSync(DOC)).toBe(true);
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-3614");
    expect(doc).toContain(TITLE);
    expect(doc).toContain(OPENALEX);
    expect(doc).toContain(OPENALEX_API);
    expect(doc).toContain(DOI);
    expect(doc).toContain(CROSSREF);
    expect(doc).toContain(ACM);
    expect(doc).toContain("Proceedings of the 2026 CHI Conference on Human Factors in Computing Systems");
    expect(doc).toContain("ACM");
    expect(doc).toContain("Minjae Lee");
    expect(doc).toContain("Minsuk Kahng");
    expect(doc).toContain("Workflow");
    expect(doc).toContain("Iterative and incremental development");
    expect(doc).toContain("Handoff schema, sender receipt, receiver receipt, and unresolved-dependency log");
    expect(doc).toContain("metadata-only");
    expect(doc).toContain("No Data-Prompt adapter");
  });

  it("reuses generic signed handoff contracts for iterative test-set to prompt-refinement transfers", () => {
    const ws = workspace();
    const packet = createHandoffPacket(ws, {
      fromAgentId: "test-set-generator",
      toAgentId: "prompt-refiner",
      goal: "Transfer newly grown regression test set into prompt refinement.",
      currentState: "New failure cases have been triaged and attached.",
      nextAction: "Prompt refiner updates candidate prompt and preserves failing cases.",
      delegationScope: ["test-set-growth", "prompt-refinement"],
      dependencyStatuses: [
        {
          dependencyId: "test-set-manifest",
          ownerAgentId: "test-set-generator",
          status: "satisfied",
          required: true,
          evidenceRefs: ["receipt-test-set-manifest"]
        },
        {
          dependencyId: "prompt-change-review",
          ownerAgentId: "reviewer-agent",
          status: "pending",
          required: true,
          evidenceRefs: ["review-request"]
        }
      ],
      ownershipTransfer: {
        fromOwnerAgentId: "test-set-generator",
        toOwnerAgentId: "prompt-refiner",
        scope: ["test-set-growth", "prompt-refinement"]
      }
    });

    expect(verifyHandoffPacket(ws, packet.packetId).senderReceiptValid).toBe(true);

    acceptHandoffPacket(ws, packet.packetId, {
      receiverAgentId: "prompt-refiner",
      accepted: true,
      dependencyStatuses: [
        {
          dependencyId: "prompt-change-review",
          ownerAgentId: "reviewer-agent",
          status: "satisfied",
          required: true,
          evidenceRefs: ["receipt-prompt-change-review"]
        }
      ]
    });

    const contract = verifyHandoffContract(ws, packet.packetId);
    expect(contract.valid).toBe(true);
    expect(contract.senderReceiptValid).toBe(true);
    expect(contract.receiverReceiptValid).toBe(true);
    expect(contract.ownershipAccepted).toBe(true);
    expect(contract.unresolvedDependencies).toEqual([]);

    const markdown = renderHandoffPacketMarkdown(packet);
    expect(markdown).toContain("## Ownership Transfer");
    expect(markdown).toContain("test-set-generator");
    expect(markdown).toContain("prompt-refiner");
    expect(markdown).toContain("## Sender Receipt");
  });

  it("fails closed when a receiver refuses unresolved prompt-refinement dependencies", () => {
    const ws = workspace();
    const packet = createHandoffPacket(ws, {
      fromAgentId: "prompt-refiner",
      toAgentId: "release-agent",
      goal: "Transfer prompt candidate for release review.",
      dependencyStatuses: [
        {
          dependencyId: "new-test-set-regression-run",
          ownerAgentId: "eval-agent",
          status: "blocked",
          required: true,
          evidenceRefs: ["regression-run-request"],
          refusalReason: "Regression run has not completed."
        }
      ],
      ownershipTransfer: {
        fromOwnerAgentId: "prompt-refiner",
        toOwnerAgentId: "release-agent",
        scope: ["prompt-release"]
      }
    });

    acceptHandoffPacket(ws, packet.packetId, {
      receiverAgentId: "release-agent",
      accepted: false,
      refusalReason: "Release agent refused handoff until regression run is complete."
    });

    const contract = verifyHandoffContract(ws, packet.packetId);
    expect(contract.valid).toBe(false);
    expect(contract.errors).toEqual(expect.arrayContaining([
      "handoff-contract:receiver-refusal:present",
      "handoff-contract:ownership-transfer:not-accepted",
      "handoff-contract:dependency:new-test-set-regression-run:unresolved"
    ]));

    const unresolved = loadHandoffUnresolvedDependencyLog(ws, packet.packetId);
    expect(unresolved?.dependencies.map((dependency) => dependency.dependencyId)).toContain("new-test-set-regression-run");
    expect(unresolved?.refusalReasons.map((reason) => reason.reason)).toContain("Release agent refused handoff until regression run is complete.");
  });

  it("does not add Data-Prompt-specific identifiers to generic handoff implementation files", () => {
    const combined = IMPLEMENTATION_FILES.map((file) => readFileSync(file, "utf8")).join("\n");
    expect(combined).not.toContain("3772318.3791222");
    expect(combined).not.toContain("W7128480797");
    expect(combined).not.toContain("Data-Prompt Co-Evolution");
    expect(combined).not.toContain("Growing Test Sets to Refine LLM Behavior");
    expect(combined).not.toContain(IDENTIFIER);
  });
});
