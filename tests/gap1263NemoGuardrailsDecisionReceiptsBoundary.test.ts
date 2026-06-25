import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  closeGuardDb,
  emitGuardDecisionReceipt,
  readGuardDecisionReceipts,
  verifyGuardDecisionReceipt,
  type GuardDecisionReceipt,
  type GuardDecisionReceiptDecision,
} from "../src/enforce/evidenceEmitter.js";
import { getPublicKeyHistory } from "../src/crypto/keys.js";
import { canonicalize } from "../src/utils/json.js";
import { sha256Hex } from "../src/utils/hash.js";

const DOC = "docs/source-reviews/GAP-1263-nemo-guardrails-decision-receipts.md";
const BACKLOG_REPO = "https://github.com/NVIDIA/NeMo-Guardrails";
const CANONICAL_REPO = "https://github.com/NVIDIA-NeMo/Guardrails";
const API = "https://api.github.com/repos/NVIDIA/NeMo-Guardrails";
const RAW_README = "https://raw.githubusercontent.com/NVIDIA/NeMo-Guardrails/main/README.md";
const CONTENTS = "https://api.github.com/repos/NVIDIA/NeMo-Guardrails/contents?ref=main";
const DOCS = "https://docs.nvidia.com/nemo/guardrails/latest/index.html";
const TITLE = "NeMo Guardrails";

const implementationFiles = [
  "src/enforce/evidenceEmitter.ts",
  "src/enforce/index.ts",
  "src/shield/guardEngine.ts",
  "src/shield/shieldGuardOrchestrator.ts",
];

const previousGuardDbPath = process.env.AMC_GUARD_EVENTS_DB_PATH;
const previousGuardReceiptWorkspace = process.env.AMC_GUARD_RECEIPTS_WORKSPACE;
let tempDir: string | null = null;

const hash = (value: unknown): string => sha256Hex(canonicalize(value));

beforeEach(() => {
  closeGuardDb();
  tempDir = mkdtempSync(join(tmpdir(), "amc-gap-1263-"));
  process.env.AMC_GUARD_EVENTS_DB_PATH = join(tempDir, "guard_events.sqlite");
  process.env.AMC_GUARD_RECEIPTS_WORKSPACE = tempDir;
});

afterEach(() => {
  closeGuardDb();
  if (tempDir) {
    rmSync(tempDir, { recursive: true, force: true });
    tempDir = null;
  }
  if (previousGuardDbPath === undefined) {
    delete process.env.AMC_GUARD_EVENTS_DB_PATH;
  } else {
    process.env.AMC_GUARD_EVENTS_DB_PATH = previousGuardDbPath;
  }
  if (previousGuardReceiptWorkspace === undefined) {
    delete process.env.AMC_GUARD_RECEIPTS_WORKSPACE;
  } else {
    process.env.AMC_GUARD_RECEIPTS_WORKSPACE = previousGuardReceiptWorkspace;
  }
});

afterAll(() => {
  closeGuardDb();
});

describe("GAP-1263 NeMo Guardrails decision receipts boundary", () => {
  it("documents live NeMo Guardrails metadata and no-bloat guard receipt relevance", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-1263");
    expect(doc).toContain(TITLE);
    expect(doc).toContain(BACKLOG_REPO);
    expect(doc).toContain(CANONICAL_REPO);
    expect(doc).toContain(API);
    expect(doc).toContain(RAW_README);
    expect(doc).toContain(CONTENTS);
    expect(doc).toContain(DOCS);
    expect(doc).toContain("NVIDIA-NeMo/Guardrails");
    expect(doc).toContain("default_branch `develop`");
    expect(doc).toContain("programmable guardrails");
    expect(doc).toContain("LLM Vulnerability Scanning");
    expect(doc).toContain("jailbreaks");
    expect(doc).toContain("prompt injections");
    expect(doc).toContain("decision type");
    expect(doc).toContain("matched rule");
    expect(doc).toContain("input hash");
    expect(doc).toContain("output hash");
    expect(doc).toContain("signer");
    expect(doc).toContain("metadata-only");
    expect(doc).toContain("No NeMo Guardrails adapter");
  });

  it("emits signed guard receipts for NeMo-style allow, block, redact, step-up, and escalate decisions", () => {
    const decisions: GuardDecisionReceiptDecision[] = ["allow", "block", "redact", "step_up", "escalate"];
    const receipts: GuardDecisionReceipt[] = [];

    for (const decision of decisions) {
      const receipt = emitGuardDecisionReceipt({
        agentId: "agent-nemo-guardrails-boundary",
        moduleCode: `nemo-guard-${decision}`,
        decision,
        matchedRule: `rule:nemo:${decision}:programmable-guardrail`,
        inputHash: hash({ decision, side: "input", sourceCopied: false }),
        outputHash: hash({ decision, side: "output", redacted: decision === "redact" }),
        reason: `Synthetic ${decision} decision for generic NeMo guard receipt coverage.`,
        severity: decision === "allow" ? "low" : "high",
        meta: {
          source: "NVIDIA-NeMo/Guardrails",
          copiedNemoArtifacts: false,
        },
      });

      expect(receipt).not.toBeNull();
      receipts.push(receipt);
    }

    const publicKeys = getPublicKeyHistory(tempDir!, "monitor");
    for (const receipt of receipts) {
      expect(receipt.payload.kind).toBe("guard_decision");
      expect(receipt.payload.decision).toEqual(expect.stringMatching(/allow|block|redact|step_up|escalate/));
      expect(receipt.payload.matchedRule).toContain("programmable-guardrail");
      expect(receipt.payload.inputHash).toMatch(/^[a-f0-9]{64}$/);
      expect(receipt.payload.outputHash).toMatch(/^[a-f0-9]{64}$/);
      expect(receipt.payload.signer).toBe("monitor");
      expect(receipt.payloadHash).toMatch(/^[a-f0-9]{64}$/);
      expect(receipt.signature).toMatch(/^[A-Za-z0-9+/=]+$/);
      expect(receipt.receiptHash).toMatch(/^[a-f0-9]{64}$/);
      expect(verifyGuardDecisionReceipt(receipt, { publicKeys })).toMatchObject({ ok: true, reasons: [] });
    }

    const persisted = readGuardDecisionReceipts("agent-nemo-guardrails-boundary");
    expect(persisted).toHaveLength(5);
    expect(persisted.every((receipt) => verifyGuardDecisionReceipt(receipt, { publicKeys }).ok)).toBe(true);
  });

  it("fails closed when NeMo metadata replaces signed guard decision evidence", () => {
    const metadataOnly = {
      payload: {
        v: 1,
        kind: "guard_decision",
        receiptId: "metadata-only-nemo",
        ts: Date.now(),
        agentId: "agent-nemo-guardrails-boundary",
        moduleCode: "NVIDIA-NeMo/Guardrails",
        decision: "block",
        matchedRule: "",
        inputHash: "NVIDIA-NeMo/Guardrails",
        outputHash: "programmable guardrails",
        signer: "monitor",
      },
      payloadHash: "not-a-sha",
      signature: "",
      receiptHash: "not-a-sha",
    } as GuardDecisionReceipt;

    const verified = verifyGuardDecisionReceipt(metadataOnly, { publicKeys: [] });

    expect(verified.ok).toBe(false);
    expect(verified.reasons).toEqual(expect.arrayContaining([
      "matched rule missing",
      "input hash invalid",
      "output hash invalid",
      "payload hash invalid",
      "signature missing",
      "receipt hash invalid",
    ]));
  });

  it("keeps NeMo-specific identifiers out of generic guard implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain("NVIDIA/NeMo-Guardrails");
      expect(source).not.toContain("NVIDIA-NeMo/Guardrails");
      expect(source).not.toContain("NeMo Guardrails");
      expect(source).not.toContain(DOCS);
    }
  });
});
