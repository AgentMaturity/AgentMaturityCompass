import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  closeGuardDb,
  emitGuardDecisionReceipt,
  verifyGuardDecisionReceipt,
} from "../src/enforce/evidenceEmitter.js";
import { getPublicKeyHistory } from "../src/crypto/keys.js";
import {
  buildSupplyChainGuardDecisionReceiptInput,
  buildSupplyChainPostureReport,
  computeSupplyChainVersionHash,
  verifySupplyChainPostureReportIntegrity,
  type SupplyChainComponentInput,
} from "../src/security/supplyChainPosture.js";

const DOC = "docs/source-reviews/GAP-1300-safeplug-supply-chain-posture.md";
const OPENALEX = "https://openalex.org/W4416176980";
const OPENALEX_API = "https://api.openalex.org/works/W4416176980";
const DOI = "https://doi.org/10.23919/chain.2026.000005";
const CROSSREF = "https://api.crossref.org/works/10.23919/chain.2026.000005";
const IEEE = "https://ieeexplore.ieee.org/document/11457862/";
const TITLE = "SafePLUG: Empowering Multimodal LLMs with Pixel-Level Insight and Temporal Grounding for Traffic Accident Understanding";

const implementationFiles = [
  "src/security/supplyChainPosture.ts",
  "src/plugins/pluginVerifier.ts",
  "src/plugins/pluginApi.ts",
  "src/release/releaseSbom.ts",
  "src/api/securityRouter.ts",
];

const previousGuardDbPath = process.env.AMC_GUARD_EVENTS_DB_PATH;
const previousGuardReceiptWorkspace = process.env.AMC_GUARD_RECEIPTS_WORKSPACE;
let tempDir: string | null = null;

beforeEach(() => {
  closeGuardDb();
  tempDir = mkdtempSync(join(tmpdir(), "amc-gap-1300-"));
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

function component(input: Omit<SupplyChainComponentInput, "versionHash">): SupplyChainComponentInput {
  return {
    ...input,
    versionHash: computeSupplyChainVersionHash(input),
  };
}

describe("GAP-1300 SafePLUG supply-chain posture boundary", () => {
  it("documents live SafePLUG metadata, relevance, and no-bloat supply-chain posture closure", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-1300");
    expect(doc).toContain(TITLE);
    expect(doc).toContain(OPENALEX);
    expect(doc).toContain(OPENALEX_API);
    expect(doc).toContain(DOI);
    expect(doc).toContain(CROSSREF);
    expect(doc).toContain(IEEE);
    expect(doc).toContain("publication_year `2026`");
    expect(doc).toContain("publication_date `2026-01-01`");
    expect(doc).toContain("CHAIN");
    expect(doc).toContain("IEEE");
    expect(doc).toContain("not retracted");
    expect(doc).toContain("component inventory");
    expect(doc).toContain("version hash");
    expect(doc).toContain("vulnerability state");
    expect(doc).toContain("allowed-source policy");
    expect(doc).toContain("metadata-only");
    expect(doc).toContain("No SafePLUG adapter");
  });

  it("builds a passing supply-chain posture report and binds it to a signed guard receipt", () => {
    const report = buildSupplyChainPostureReport({
      generatedTs: 1782397200000,
      policy: {
        policyId: "policy:model-tool-source-allowlist",
        allowedSources: ["openai", "amc-tool-registry", "amc-dataset-registry", "amc-mcp-registry", "amc-plugin-registry"],
      },
      components: [
        component({ kind: "provider", id: "openai", version: "2026-06-25", source: "openai", vulnerabilityState: "clean" }),
        component({ kind: "model", id: "gpt-4.1", version: "2026-06-25", source: "openai", vulnerabilityState: "clean" }),
        component({ kind: "tool", id: "browser.search", version: "1.4.2", source: "amc-tool-registry", vulnerabilityState: "clean" }),
        component({ kind: "dataset", id: "rag-grounding-fixtures", version: "2026-06-20", source: "amc-dataset-registry", vulnerabilityState: "clean" }),
        component({ kind: "mcp_server", id: "linear", version: "2026-06-25", source: "amc-mcp-registry", vulnerabilityState: "clean" }),
        component({ kind: "plugin", id: "amc.plugin.fixture.install", version: "2.0.0", source: "amc-plugin-registry", vulnerabilityState: "clean" }),
      ],
    });

    expect(report.ok).toBe(true);
    expect(report.reportHash).toMatch(/^[a-f0-9]{64}$/);
    expect(report.summary).toMatchObject({
      totalComponents: 6,
      allowedComponents: 6,
      blockedComponents: 0,
      knownVulnerableComponents: 0,
      unknownVulnerabilityComponents: 0,
    });
    expect(report.components.every((row) => row.allowedSource)).toBe(true);
    expect(report.components.every((row) => row.versionHash.match(/^[a-f0-9]{64}$/))).toBe(true);
    expect(verifySupplyChainPostureReportIntegrity(report)).toMatchObject({ ok: true, reasons: [] });

    const receiptInput = buildSupplyChainGuardDecisionReceiptInput({
      report,
      agentId: "agent-gap-1300",
      moduleCode: "supply-chain-posture",
    });
    expect(receiptInput.decision).toBe("allow");
    expect(receiptInput.matchedRule).toBe("supply-chain:policy:model-tool-source-allowlist:allow");
    expect(receiptInput.inputHash).toBe(report.reportHash);
    expect(receiptInput.outputHash).toMatch(/^[a-f0-9]{64}$/);

    const receipt = emitGuardDecisionReceipt(receiptInput);
    const publicKeys = getPublicKeyHistory(tempDir!, "monitor");
    expect(verifyGuardDecisionReceipt(receipt!, { publicKeys })).toMatchObject({ ok: true, reasons: [] });
  });

  it("fails closed when source metadata replaces component inventory, version hashes, vulnerability state, or source policy", () => {
    const report = buildSupplyChainPostureReport({
      generatedTs: 1782397200000,
      policy: {
        policyId: "policy:model-tool-source-allowlist",
        allowedSources: ["amc-approved-source"],
      },
      components: [
        {
          kind: "model",
          id: "safeplug-paper-metadata",
          version: "2026 metadata",
          source: "OpenAlex",
          versionHash: "SafePLUG",
          vulnerabilityState: "unknown",
          evidenceRefs: [OPENALEX],
        },
      ],
    });

    expect(report.ok).toBe(false);
    expect(report.summary).toMatchObject({
      totalComponents: 1,
      allowedComponents: 0,
      blockedComponents: 1,
      unknownVulnerabilityComponents: 1,
    });
    expect(report.reasons).toEqual(expect.arrayContaining([
      "component safeplug-paper-metadata source not allowed by policy",
      "component safeplug-paper-metadata version hash invalid",
      "component safeplug-paper-metadata vulnerability state unknown fails closed",
    ]));

    const receiptInput = buildSupplyChainGuardDecisionReceiptInput({
      report,
      agentId: "agent-gap-1300",
      moduleCode: "supply-chain-posture",
    });
    expect(receiptInput.decision).toBe("block");
    expect(receiptInput.matchedRule).toBe("supply-chain:policy:model-tool-source-allowlist:block");
  });

  it("fails closed when a clean vulnerability state hides listed vulnerabilities", () => {
    const vulnerable = component({
      kind: "tool",
      id: "unsafe-tool",
      version: "1.0.0",
      source: "amc-tool-registry",
      vulnerabilityState: "clean",
      vulnerabilities: ["CVE-2099-0001"],
    });
    const report = buildSupplyChainPostureReport({
      generatedTs: 1782397200000,
      policy: {
        policyId: "policy:model-tool-source-allowlist",
        allowedSources: ["amc-tool-registry"],
      },
      components: [vulnerable],
    });

    expect(report.ok).toBe(false);
    expect(report.summary.knownVulnerableComponents).toBe(1);
    expect(report.reasons).toContain("component unsafe-tool lists vulnerabilities but claims clean state");
  });

  it("keeps SafePLUG-specific identifiers out of generic supply-chain implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain("SafePLUG");
      expect(source).not.toContain("10.23919/chain.2026.000005");
      expect(source).not.toContain("W4416176980");
      expect(source).not.toContain("Traffic Accident Understanding");
    }
  });
});
