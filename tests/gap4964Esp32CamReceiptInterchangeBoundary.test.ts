import { generateKeyPairSync } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  INTEROPERABLE_RECEIPT_SCHEMA_VERSION,
  buildInteroperableReceipt,
  interoperableReceiptJsonSchema,
  parseInteroperableReceipt,
  serializeInteroperableReceipt,
  verifyInteroperableReceipt,
  type InteroperableReceiptKind,
  type InteroperableReceiptSourceCitation
} from "../src/passport/receiptInterchange.js";

const DOC = "docs/source-reviews/GAP-4964-esp32-cam-receipt-interchange.md";
const PUBLIC_DOC = "docs/RECEIPT_INTERCHANGE.md";
const GITHUB_REPO = "https://github.com/rzeldent/esp32-cam-ai";
const GITHUB_REPO_API = "https://api.github.com/repos/rzeldent/esp32-cam-ai";
const GITHUB_LANGUAGES_API = "https://api.github.com/repos/rzeldent/esp32-cam-ai/languages";
const GITHUB_LICENSE_API = "https://api.github.com/repos/rzeldent/esp32-cam-ai/license";
const README_RAW = "https://raw.githubusercontent.com/rzeldent/esp32-cam-ai/main/README.md";
const IDENTIFIER = "std-receipt-interchange";
const IMPLEMENTATION_FILES = [
  "src/passport/receiptInterchange.ts",
  "src/passport/trustInterchange.ts",
  "src/ledger/ledger.ts",
  "src/index.ts"
];

const sourceCitations: InteroperableReceiptSourceCitation[] = [
  {
    sourceId: "github-repo",
    title: "rzeldent/esp32-cam-ai GitHub repository metadata",
    url: GITHUB_REPO_API,
    retrievedAt: "2026-06-25T12:35:00.000Z"
  },
  {
    sourceId: "readme",
    title: "ESP32-CAM MCP Server README",
    url: README_RAW,
    retrievedAt: "2026-06-25T12:35:00.000Z"
  }
];

const keys = generateKeyPairSync("ed25519", {
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" }
});

function payloadFor(kind: InteroperableReceiptKind): Record<string, unknown> {
  switch (kind) {
    case "score":
      return { claimId: "score-amc-1-1", questionId: "AMC-1.1", score: 4.2, level: "L4" };
    case "policy":
      return { policyId: "policy-tool-approval", decision: "allow", ruleId: "rule-approval-1" };
    case "tool":
      return { toolId: "camera-capture", callId: "tool-call-1", resultRef: "tool-result-receipt-1" };
    case "audit":
      return { auditId: "audit-release-1", severity: "LOW", findingCount: 0 };
    case "lifecycle":
      return { lifecycleId: "run-lifecycle-1", stage: "release.gate", transitionId: "release-gate-1" };
  }
}

describe("GAP-4964 ESP32-CAM signed receipt interchange boundary", () => {
  it("documents live ESP32-CAM MCP metadata and no-bloat relevance decision", () => {
    expect(existsSync(DOC)).toBe(true);
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-4964");
    expect(doc).toContain("rzeldent/esp32-cam-ai");
    expect(doc).toContain(GITHUB_REPO);
    expect(doc).toContain(GITHUB_REPO_API);
    expect(doc).toContain(GITHUB_LANGUAGES_API);
    expect(doc).toContain(GITHUB_LICENSE_API);
    expect(doc).toContain(README_RAW);
    expect(doc).toContain("Model Context Protocol");
    expect(doc).toContain("ESP32-CAM");
    expect(doc).toContain("standardized MCP tools");
    expect(doc).toContain("remote camera control");
    expect(doc).toContain("system diagnostics");
    expect(doc).toContain("C++");
    expect(doc).toContain("MIT");
    expect(doc).toContain("Receipt schema, example receipts, signature verification, and external consumer test");
    expect(doc).toContain("metadata-only");
    expect(doc).toContain("No ESP32 adapter");
  });

  it("publishes public receipt-interchange docs that match the schema version and kind set", () => {
    expect(existsSync(PUBLIC_DOC)).toBe(true);
    const doc = readFileSync(PUBLIC_DOC, "utf8");

    expect(doc).toContain(INTEROPERABLE_RECEIPT_SCHEMA_VERSION);
    expect(doc).toContain("score");
    expect(doc).toContain("policy");
    expect(doc).toContain("tool");
    expect(doc).toContain("audit");
    expect(doc).toContain("lifecycle");
    expect(doc).toContain("external verifier");
  });

  it("exports a versioned interoperable receipt schema for score, policy, tool, audit, and lifecycle events", () => {
    expect(interoperableReceiptJsonSchema.$id).toContain(INTEROPERABLE_RECEIPT_SCHEMA_VERSION);
    expect(interoperableReceiptJsonSchema.properties.kind.enum).toEqual(["score", "policy", "tool", "audit", "lifecycle"]);
    expect(interoperableReceiptJsonSchema.required).toContain("sourceCitations");

    const kinds: InteroperableReceiptKind[] = ["score", "policy", "tool", "audit", "lifecycle"];
    for (const kind of kinds) {
      const receipt = buildInteroperableReceipt({
        kind,
        receiptId: `receipt-${kind}-1`,
        issuer: {
          platform: "amc",
          workspaceId: "workspace-1",
          keyFingerprint: "key-fingerprint-1"
        },
        subject: {
          agentId: "agent-1",
          passportId: "pass_agent_1"
        },
        eventRef: {
          eventId: `event-${kind}-1`,
          eventHash: "a".repeat(64),
          sourceReceiptRef: `ledger-${kind}-receipt`
        },
        payload: payloadFor(kind),
        evidenceRefs: [`ledger-${kind}-evidence`],
        sourceCitations,
        privateKeyPem: keys.privateKey,
        publicKeyPem: keys.publicKey,
        issuedAt: "2026-06-25T12:36:00.000Z"
      });

      expect(receipt.schemaVersion).toBe(INTEROPERABLE_RECEIPT_SCHEMA_VERSION);
      expect(receipt.kind).toBe(kind);
      expect(receipt.payloadHash).toMatch(/^[a-f0-9]{64}$/);
      expect(receipt.signature.algorithm).toBe("ed25519");
      expect(verifyInteroperableReceipt(receipt, [keys.publicKey])).toEqual({ valid: true, reasons: [] });
    }
  });

  it("round-trips through JSON for an external consumer verifier", () => {
    const receipt = buildInteroperableReceipt({
      kind: "tool",
      receiptId: "receipt-external-tool-1",
      issuer: {
        platform: "amc",
        workspaceId: "workspace-1",
        keyFingerprint: "key-fingerprint-1"
      },
      subject: {
        agentId: "agent-1",
        passportId: "pass_agent_1"
      },
      eventRef: {
        eventId: "event-tool-1",
        eventHash: "b".repeat(64),
        sourceReceiptRef: "ledger-tool-receipt"
      },
      payload: payloadFor("tool"),
      evidenceRefs: ["ledger-tool-evidence"],
      sourceCitations,
      privateKeyPem: keys.privateKey,
      publicKeyPem: keys.publicKey,
      issuedAt: "2026-06-25T12:37:00.000Z"
    });

    const serialized = serializeInteroperableReceipt(receipt);
    const parsed = parseInteroperableReceipt(serialized);

    expect(parsed).toEqual(receipt);
    expect(verifyInteroperableReceipt(parsed, [keys.publicKey])).toEqual({ valid: true, reasons: [] });
  });

  it("fails closed when source metadata replaces payload, evidence, or signature proof", () => {
    const receipt = buildInteroperableReceipt({
      kind: "tool",
      receiptId: "metadata-only-receipt",
      issuer: {
        platform: "amc",
        workspaceId: "workspace-1",
        keyFingerprint: "key-fingerprint-1"
      },
      subject: {
        agentId: "agent-1"
      },
      eventRef: {
        eventId: "",
        eventHash: "",
        sourceReceiptRef: ""
      },
      payload: {},
      evidenceRefs: [],
      sourceCitations,
      privateKeyPem: keys.privateKey,
      publicKeyPem: keys.publicKey,
      issuedAt: "2026-06-25T12:38:00.000Z"
    });

    const tampered = {
      ...receipt,
      payload: { repo: "rzeldent/esp32-cam-ai" },
      signature: {
        ...receipt.signature,
        value: ""
      }
    };

    expect(verifyInteroperableReceipt(tampered, [keys.publicKey]).valid).toBe(false);
    expect(verifyInteroperableReceipt(tampered, [keys.publicKey]).reasons).toEqual(expect.arrayContaining([
      "eventRef.eventId:missing",
      "eventRef.eventHash:invalid",
      "eventRef.sourceReceiptRef:missing",
      "evidenceRefs:missing",
      "payload:tool:missing",
      "signature:missing"
    ]));
  });

  it("does not add ESP32-specific identifiers to generic receipt-interchange implementation files", () => {
    const combined = IMPLEMENTATION_FILES.map((file) => existsSync(file) ? readFileSync(file, "utf8") : "").join("\n");
    expect(combined).not.toContain("rzeldent/esp32-cam-ai");
    expect(combined).not.toContain("ESP32-CAM");
    expect(combined).not.toContain("camera-capture");
    expect(combined).not.toContain("OV2640");
    expect(combined).not.toContain(IDENTIFIER);
  });
});
