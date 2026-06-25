import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  closeGuardDb,
  emitGuardDecisionReceipt,
  readGuardDecisionReceipts,
  readGuardEvents,
  verifyGuardDecisionReceipt,
  type GuardDecisionReceipt,
  type GuardDecisionReceiptDecision,
} from "../src/enforce/evidenceEmitter.js";
import { getPublicKeyHistory } from "../src/crypto/keys.js";
import { canonicalize } from "../src/utils/json.js";
import { sha256Hex } from "../src/utils/hash.js";

const DOC = "docs/source-reviews/GAP-1305-clawshield-guard-decision-receipts.md";
const REPO = "https://github.com/SleuthCo/clawshield-public";
const API = "https://api.github.com/repos/SleuthCo/clawshield-public";
const RAW_README = "https://raw.githubusercontent.com/SleuthCo/clawshield-public/master/README.md";
const MAIN_README = "https://raw.githubusercontent.com/SleuthCo/clawshield-public/main/README.md";
const CONTENTS = "https://api.github.com/repos/SleuthCo/clawshield-public/contents?ref=master";
const TITLE = "ClawShield";

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
  tempDir = mkdtempSync(join(tmpdir(), "amc-gap-1305-"));
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

describe("GAP-1305 ClawShield guard decision receipts boundary", () => {
  it("documents live ClawShield metadata and no-bloat guard receipt relevance", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-1305");
    expect(doc).toContain(TITLE);
    expect(doc).toContain(REPO);
    expect(doc).toContain(API);
    expect(doc).toContain(RAW_README);
    expect(doc).toContain(MAIN_README);
    expect(doc).toContain(CONTENTS);
    expect(doc).toContain("SleuthCo/clawshield-public");
    expect(doc).toContain("default_branch `master`");
    expect(doc).toContain("Apache-2.0");
    expect(doc).toContain("Go");
    expect(doc).toContain("Security proxy for AI agents");
    expect(doc).toContain("prompt injection");
    expect(doc).toContain("PII");
    expect(doc).toContain("secrets");
    expect(doc).toContain("iptables");
    expect(doc).toContain("eBPF");
    expect(doc).toContain("YAML policy");
    expect(doc).toContain("Audit logging");
    expect(doc).toContain("metadata-only");
    expect(doc).toContain("decision type");
    expect(doc).toContain("matched rule");
    expect(doc).toContain("input hash");
    expect(doc).toContain("output hash");
    expect(doc).toContain("signer");
    expect(doc).toContain("No ClawShield adapter");
  });

  it("emits signed guard receipts for ClawShield-style allow, block, redact, step-up, and escalate decisions", () => {
    const decisions: GuardDecisionReceiptDecision[] = ["allow", "block", "redact", "step_up", "escalate"];
    const receipts: GuardDecisionReceipt[] = [];

    for (const decision of decisions) {
      const receipt = emitGuardDecisionReceipt({
        agentId: "agent-clawshield-boundary",
        moduleCode: `clawshield-guard-${decision}`,
        decision,
        matchedRule: `rule:clawshield:${decision}:security-proxy`,
        inputHash: hash({ decision, side: "input", sourceCopied: false }),
        outputHash: hash({ decision, side: "output", redacted: decision === "redact" }),
        reason: `Synthetic ${decision} decision for generic ClawShield guard receipt coverage.`,
        severity: decision === "allow" ? "low" : "high",
        meta: {
          source: "SleuthCo/clawshield-public",
          copiedClawshieldArtifacts: false,
        },
      });

      expect(receipt).not.toBeNull();
      receipts.push(receipt);
    }

    const publicKeys = getPublicKeyHistory(tempDir!, "monitor");
    for (const receipt of receipts) {
      expect(receipt.payload.kind).toBe("guard_decision");
      expect(receipt.payload.decision).toEqual(expect.stringMatching(/allow|block|redact|step_up|escalate/));
      expect(receipt.payload.matchedRule).toContain("security-proxy");
      expect(receipt.payload.inputHash).toMatch(/^[a-f0-9]{64}$/);
      expect(receipt.payload.outputHash).toMatch(/^[a-f0-9]{64}$/);
      expect(receipt.payload.signer).toBe("monitor");
      expect(receipt.payloadHash).toMatch(/^[a-f0-9]{64}$/);
      expect(receipt.signature).toMatch(/^[A-Za-z0-9+/=]+$/);
      expect(receipt.receiptHash).toMatch(/^[a-f0-9]{64}$/);
      expect(verifyGuardDecisionReceipt(receipt, { publicKeys })).toMatchObject({ ok: true, reasons: [] });
    }

    const events = readGuardEvents("agent-clawshield-boundary");
    expect(events).toHaveLength(5);
    expect(events.map((event) => event.decision).sort()).toEqual(["allow", "deny", "stepup", "stepup", "warn"]);
    const eventMeta = JSON.parse(events[0]!.meta_json ?? "{}") as { guardDecisionReceipt?: GuardDecisionReceipt };
    expect(eventMeta.guardDecisionReceipt?.payload.kind).toBe("guard_decision");

    const persisted = readGuardDecisionReceipts("agent-clawshield-boundary");
    expect(persisted).toHaveLength(5);
    expect(persisted.every((receipt) => verifyGuardDecisionReceipt(receipt, { publicKeys }).ok)).toBe(true);
  });

  it("fails closed when ClawShield metadata replaces signed guard decision evidence", () => {
    const metadataOnly = {
      payload: {
        v: 1,
        kind: "guard_decision",
        receiptId: "metadata-only-clawshield",
        ts: Date.now(),
        agentId: "agent-clawshield-boundary",
        moduleCode: "SleuthCo/clawshield-public",
        decision: "block",
        matchedRule: "",
        inputHash: "SleuthCo/clawshield-public",
        outputHash: "Security proxy for AI agents",
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

  it("keeps ClawShield-specific identifiers out of generic guard implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(REPO);
      expect(source).not.toContain(RAW_README);
      expect(source).not.toContain(TITLE);
      expect(source).not.toContain("SleuthCo/clawshield-public");
    }
  });
});
