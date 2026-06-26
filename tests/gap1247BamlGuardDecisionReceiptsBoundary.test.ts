import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readFileSync } from "node:fs";
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

const DOC = "docs/source-reviews/GAP-1247-baml-guard-decision-receipts.md";
const REPO = "https://github.com/BoundaryML/baml";
const RAW_README = "https://raw.githubusercontent.com/BoundaryML/baml/canary/README.md";
const DOCS = "https://docs.boundaryml.com/";
const RELEASE = "https://github.com/BoundaryML/baml/releases/tag/baml-language-0.12.2-nightly.20260625.d";
const DEFAULT_BRANCH_SHA = "af193bf04f339ba162b5cb7b632135d1ecd65ba6";
const TITLE = "BAML: Basically a Made-up Language";
const IDENTIFIER = "baml_guard_decision_receipts";

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
  tempDir = mkdtempSync(join(tmpdir(), "amc-gap-1247-"));
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

describe("GAP-1247 BAML guard decision receipts boundary", () => {
  it("documents live BAML metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-1247");
    expect(doc).toContain(TITLE);
    expect(doc).toContain(REPO);
    expect(doc).toContain(RAW_README);
    expect(doc).toContain(DOCS);
    expect(doc).toContain(RELEASE);
    expect(doc).toContain("The AI framework that adds the engineering to prompt engineering");
    expect(doc).toContain("default_branch `canary`");
    expect(doc).toContain("Apache-2.0");
    expect(doc).toContain("Rust");
    expect(doc).toContain("stargazers_count `8423`");
    expect(doc).toContain("forks_count `438`");
    expect(doc).toContain("open_issues_count `240`");
    expect(doc).toContain("pushed_at `2026-06-25T07:46:55Z`");
    expect(doc).toContain("updated_at `2026-06-25T07:28:20Z`");
    expect(doc).toContain(`default branch commit \`${DEFAULT_BRANCH_SHA}\``);
    expect(doc).toContain("release `baml-language-0.12.2-nightly.20260625.d`");
    expect(doc).toContain("simple prompting language");
    expect(doc).toContain("schema engineering");
    expect(doc).toContain("full typesafety");
    expect(doc).toContain("streaming");
    expect(doc).toContain("retries");
    expect(doc).toContain("wide model support");
    expect(doc).toContain("playground");
    expect(doc).toContain("structured outputs");
    expect(doc).toContain("guardrails");
    expect(doc).toContain("decision type");
    expect(doc).toContain("matched rule");
    expect(doc).toContain("input hash");
    expect(doc).toContain("output hash");
    expect(doc).toContain("signer");
    expect(doc).toContain("## Relevance decision");
    expect(doc).toContain("## AMC/8 surface check");
    expect(doc).toContain("## Product closure");
    expect(doc).toContain("## Fail-closed rule");
    expect(doc).toContain("## No-bloat boundary");
    expect(doc).toContain("## Verification");
  });

  it("emits signed compact guard receipts for allow, block, redact, step-up, and escalate decisions", () => {
    const decisions: GuardDecisionReceiptDecision[] = ["allow", "block", "redact", "step_up", "escalate"];
    const receipts: GuardDecisionReceipt[] = [];

    for (const decision of decisions) {
      const receipt = emitGuardDecisionReceipt({
        agentId: "agent-baml-boundary",
        moduleCode: `guard-${decision}`,
        decision,
        matchedRule: `rule:${decision}:structured-output-policy`,
        inputHash: hash({ decision, side: "input", sourceCopied: false }),
        outputHash: hash({ decision, side: "output", redacted: decision === "redact" }),
        reason: `Synthetic ${decision} decision for generic guard receipt coverage.`,
        severity: decision === "allow" ? "low" : "high",
        meta: {
          source: "BoundaryML/baml",
          copiedBamlArtifacts: false,
        },
      });

      expect(receipt).not.toBeNull();
      receipts.push(receipt);
    }

    const publicKeys = getPublicKeyHistory(tempDir!, "monitor");
    for (const receipt of receipts) {
      expect(receipt.payload.kind).toBe("guard_decision");
      expect(receipt.payload.decision).toEqual(expect.stringMatching(/allow|block|redact|step_up|escalate/));
      expect(receipt.payload.matchedRule).toContain("structured-output-policy");
      expect(receipt.payload.inputHash).toMatch(/^[a-f0-9]{64}$/);
      expect(receipt.payload.outputHash).toMatch(/^[a-f0-9]{64}$/);
      expect(receipt.payload.signer).toBe("monitor");
      expect(receipt.payloadHash).toMatch(/^[a-f0-9]{64}$/);
      expect(receipt.signature).toMatch(/^[A-Za-z0-9+/=]+$/);
      expect(receipt.receiptHash).toMatch(/^[a-f0-9]{64}$/);
      expect(verifyGuardDecisionReceipt(receipt, { publicKeys })).toMatchObject({ ok: true, reasons: [] });
    }

    const events = readGuardEvents("agent-baml-boundary");
    expect(events).toHaveLength(5);
    expect(events.map((event) => event.decision).sort()).toEqual(["allow", "deny", "stepup", "stepup", "warn"]);
    const eventMeta = JSON.parse(events[0]!.meta_json ?? "{}") as { guardDecisionReceipt?: GuardDecisionReceipt };
    expect(eventMeta.guardDecisionReceipt?.payload.kind).toBe("guard_decision");

    const persisted = readGuardDecisionReceipts("agent-baml-boundary");
    expect(persisted).toHaveLength(5);
    expect(persisted.every((receipt) => verifyGuardDecisionReceipt(receipt, { publicKeys }).ok)).toBe(true);
  });

  it("fails closed when BAML metadata replaces signed guard decision evidence", () => {
    const metadataOnly = {
      payload: {
        v: 1,
        kind: "guard_decision",
        receiptId: "metadata-only",
        ts: Date.now(),
        agentId: "agent-baml-boundary",
        moduleCode: "BoundaryML/baml",
        decision: "block",
        matchedRule: "",
        inputHash: "BoundaryML/baml",
        outputHash: "structured outputs",
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

  it("detects tampering with matched rule, hashes, signer, or signature", () => {
    const receipt = emitGuardDecisionReceipt({
      agentId: "agent-baml-boundary",
      moduleCode: "guard-block",
      decision: "block",
      matchedRule: "rule:prompt-injection:block",
      inputHash: hash({ input: "synthetic prompt injection fixture" }),
      outputHash: hash({ output: "blocked" }),
      reason: "Synthetic block decision for tamper verification.",
      severity: "critical",
    });
    expect(receipt).not.toBeNull();
    const publicKeys = getPublicKeyHistory(tempDir!, "monitor");

    const tamperedRule: GuardDecisionReceipt = {
      ...receipt,
      payload: {
        ...receipt.payload,
        matchedRule: "rule:changed-after-signing",
      },
    };
    expect(verifyGuardDecisionReceipt(tamperedRule, { publicKeys })).toMatchObject({
      ok: false,
      reasons: expect.arrayContaining(["payload hash mismatch"]),
    });

    const tamperedSignature: GuardDecisionReceipt = {
      ...receipt,
      signature: `${receipt.signature.slice(0, -2)}xx`,
    };
    expect(verifyGuardDecisionReceipt(tamperedSignature, { publicKeys })).toMatchObject({
      ok: false,
      reasons: expect.arrayContaining(["signature verification failed"]),
    });
  });

  it("keeps BAML-specific identifiers out of generic guard implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(REPO);
      expect(source).not.toContain(RAW_README);
      expect(source).not.toContain(DOCS);
      expect(source).not.toContain(RELEASE);
      expect(source).not.toContain(TITLE);
      expect(source).not.toContain(IDENTIFIER);
    }
  });
});
