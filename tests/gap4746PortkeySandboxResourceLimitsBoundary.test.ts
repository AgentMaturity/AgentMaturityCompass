import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildToolSandboxResourceLimitReceipt,
  renderToolSandboxResourceLimitMarkdown,
  verifyToolSandboxResourceLimitReceipt,
  type ToolSandboxObservedUsage,
  type ToolSandboxResourceLimitPolicy,
  type ToolSandboxSourceCitation
} from "../src/enforce/toolSandboxLimits.js";

const DOC = "docs/source-reviews/GAP-4746-portkey-sandbox-resource-limits.md";
const GITHUB_REPO = "https://github.com/Portkey-AI/gateway";
const GITHUB_REPO_API = "https://api.github.com/repos/Portkey-AI/gateway";
const GITHUB_LANGUAGES_API = "https://api.github.com/repos/Portkey-AI/gateway/languages";
const GITHUB_LICENSE_API = "https://api.github.com/repos/Portkey-AI/gateway/license";
const README_RAW = "https://raw.githubusercontent.com/Portkey-AI/gateway/main/README.md";
const IDENTIFIER = "tool-sandbox-limits";
const IMPLEMENTATION_FILES = [
  "src/enforce/toolSandboxLimits.ts",
  "src/plugins/sandboxLimits.ts",
  "src/workspaces/workspaceContext.ts",
  "src/index.ts"
];

const sourceCitations: ToolSandboxSourceCitation[] = [
  {
    sourceId: "github-repo",
    title: "Portkey-AI/gateway GitHub repository metadata",
    url: GITHUB_REPO_API,
    retrievedAt: "2026-06-25T12:05:00.000Z"
  },
  {
    sourceId: "readme",
    title: "Portkey AI Gateway README",
    url: README_RAW,
    retrievedAt: "2026-06-25T12:05:00.000Z"
  }
];

function policy(overrides: Partial<ToolSandboxResourceLimitPolicy> = {}): ToolSandboxResourceLimitPolicy {
  return {
    policyId: "tool-sandbox-policy-support-agent",
    agentId: "support-agent",
    workspaceId: "customer-support-workspace",
    toolId: "knowledge-search-tool",
    enforcementMode: "block",
    policyEvidenceRef: "signed-tool-sandbox-policy",
    limits: {
      cpuTimeMs: 30_000,
      memoryLimitMb: 512,
      ioReadMb: 100,
      ioWriteMb: 50,
      network: {
        mode: "allowlist",
        allowedHosts: ["api.internal.example"]
      },
      filesystem: {
        readRoots: ["/workspace"],
        writeRoots: ["/workspace/tmp"]
      },
      maxProcesses: 2
    },
    ...overrides
  };
}

function usage(overrides: Partial<ToolSandboxObservedUsage> = {}): ToolSandboxObservedUsage {
  return {
    executionId: "tool-exec-001",
    commandRef: "signed-tool-command",
    observedAt: "2026-06-25T12:06:00.000Z",
    durationMs: 18_000,
    cpuTimeMs: 12_000,
    peakMemoryMb: 240,
    ioReadMb: 44,
    ioWriteMb: 9,
    networkEvents: [
      {
        host: "api.internal.example",
        port: 443,
        allowed: true,
        evidenceRef: "signed-network-event-internal"
      }
    ],
    filesystemEvents: [
      {
        path: "/workspace/tmp/result.json",
        operation: "write",
        allowed: true,
        evidenceRef: "signed-filesystem-write-result"
      }
    ],
    processCount: 1,
    exitCode: 0,
    observationEvidenceRef: "signed-resource-observation",
    enforcementReceiptRef: "signed-sandbox-enforcement-receipt",
    ...overrides
  };
}

describe("GAP-4746 Portkey sandbox resource limit enforcement boundary", () => {
  it("documents live Portkey metadata and no-bloat relevance decision", () => {
    expect(existsSync(DOC)).toBe(true);
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-4746");
    expect(doc).toContain("Portkey-AI/gateway");
    expect(doc).toContain(GITHUB_REPO);
    expect(doc).toContain(GITHUB_REPO_API);
    expect(doc).toContain(GITHUB_LANGUAGES_API);
    expect(doc).toContain(GITHUB_LICENSE_API);
    expect(doc).toContain(README_RAW);
    expect(doc).toContain("AI Gateway");
    expect(doc).toContain("routing");
    expect(doc).toContain("guardrails");
    expect(doc).toContain("MCP Gateway");
    expect(doc).toContain("usage analytics");
    expect(doc).toContain("Request Timeouts");
    expect(doc).toContain("TypeScript");
    expect(doc).toContain("MIT");
    expect(doc).toContain("Sandbox policy, observed usage, violation status, and enforcement receipt");
    expect(doc).toContain("metadata-only");
    expect(doc).toContain("No Portkey adapter");
  });

  it("passes only when CPU, memory, IO, network, filesystem, and process evidence is complete", () => {
    const receipt = buildToolSandboxResourceLimitReceipt({
      receiptId: "tool-sandbox-receipt-pass",
      policy: policy(),
      usage: usage(),
      sourceCitations,
      generatedAt: "2026-06-25T12:07:00.000Z"
    });

    expect(receipt.status).toBe("pass");
    expect(receipt.failClosed).toBe(false);
    expect(receipt.coveredLimits).toEqual(["cpu", "memory", "io", "network", "filesystem", "process"]);
    expect(receipt.violations).toEqual([]);
    expect(receipt.requiredEvidenceRefs).toEqual(expect.arrayContaining([
      "signed-tool-sandbox-policy",
      "signed-tool-command",
      "signed-resource-observation",
      "signed-sandbox-enforcement-receipt",
      "signed-network-event-internal",
      "signed-filesystem-write-result"
    ]));
    expect(verifyToolSandboxResourceLimitReceipt(receipt).valid).toBe(true);

    const markdown = renderToolSandboxResourceLimitMarkdown(receipt);
    expect(markdown).toContain("tool-sandbox-receipt-pass");
    expect(markdown).toContain("knowledge-search-tool");
    expect(markdown).toContain("pass");
    expect(markdown).toContain("Fleet");
    expect(markdown).toContain("Enforce");
  });

  it("records observed resource-limit violations without treating complete violation evidence as metadata-only failure", () => {
    const receipt = buildToolSandboxResourceLimitReceipt({
      receiptId: "tool-sandbox-receipt-violation",
      policy: policy({
        limits: {
          cpuTimeMs: 5_000,
          memoryLimitMb: 256,
          ioReadMb: 20,
          ioWriteMb: 5,
          network: {
            mode: "deny",
            allowedHosts: []
          },
          filesystem: {
            readRoots: ["/workspace"],
            writeRoots: ["/workspace/tmp"]
          },
          maxProcesses: 1
        }
      }),
      usage: usage({
        cpuTimeMs: 8_000,
        peakMemoryMb: 512,
        ioReadMb: 22,
        ioWriteMb: 7,
        networkEvents: [
          {
            host: "example.com",
            port: 443,
            allowed: false,
            evidenceRef: "signed-network-denial"
          }
        ],
        filesystemEvents: [
          {
            path: "/etc/passwd",
            operation: "read",
            allowed: false,
            evidenceRef: "signed-filesystem-denial"
          }
        ],
        processCount: 3
      }),
      sourceCitations,
      generatedAt: "2026-06-25T12:08:00.000Z"
    });

    expect(receipt.status).toBe("violation");
    expect(receipt.failClosed).toBe(false);
    expect(receipt.violations.map((violation) => violation.type)).toEqual(expect.arrayContaining([
      "CPU_LIMIT_EXCEEDED",
      "MEMORY_LIMIT_EXCEEDED",
      "IO_READ_LIMIT_EXCEEDED",
      "IO_WRITE_LIMIT_EXCEEDED",
      "NETWORK_DENIED",
      "FILESYSTEM_DENIED",
      "PROCESS_LIMIT_EXCEEDED"
    ]));
    expect(receipt.scorePenalty).toBeGreaterThan(0);
    expect(verifyToolSandboxResourceLimitReceipt(receipt).valid).toBe(true);
  });

  it("fails closed when source metadata exists but sandbox policy, observed usage, or enforcement receipt evidence is missing", () => {
    const receipt = buildToolSandboxResourceLimitReceipt({
      receiptId: "tool-sandbox-receipt-metadata-only",
      policy: policy({
        policyId: "",
        toolId: "",
        policyEvidenceRef: "",
        limits: {
          cpuTimeMs: 0,
          memoryLimitMb: 0,
          ioReadMb: -1,
          ioWriteMb: -1,
          network: {
            mode: "allowlist",
            allowedHosts: []
          },
          filesystem: {
            readRoots: [],
            writeRoots: []
          },
          maxProcesses: 0
        }
      }),
      usage: usage({
        executionId: "",
        commandRef: "",
        observedAt: "",
        observationEvidenceRef: "",
        enforcementReceiptRef: "",
        networkEvents: [
          {
            host: "metadata-only.example",
            port: 443,
            allowed: false,
            evidenceRef: ""
          }
        ],
        filesystemEvents: [
          {
            path: "/tmp/metadata-only",
            operation: "write",
            allowed: false,
            evidenceRef: ""
          }
        ]
      }),
      sourceCitations,
      generatedAt: "2026-06-25T12:09:00.000Z"
    });

    expect(receipt.status).toBe("fail_closed");
    expect(receipt.failClosed).toBe(true);
    expect(receipt.failClosedReasons).toEqual(expect.arrayContaining([
      "policyId:missing",
      "toolId:missing",
      "policyEvidenceRef:missing",
      "limit:cpuTimeMs:invalid",
      "limit:memoryLimitMb:invalid",
      "limit:ioReadMb:invalid",
      "limit:ioWriteMb:invalid",
      "limit:filesystem.readRoots:missing",
      "limit:filesystem.writeRoots:missing",
      "limit:maxProcesses:invalid",
      "executionId:missing",
      "commandRef:missing",
      "observedAt:missing",
      "observationEvidenceRef:missing",
      "enforcementReceiptRef:missing",
      "networkEvent:metadata-only.example:evidenceRef:missing",
      "filesystemEvent:/tmp/metadata-only:evidenceRef:missing"
    ]));
    expect(verifyToolSandboxResourceLimitReceipt(receipt).valid).toBe(false);
  });

  it("does not add Portkey-specific identifiers to generic sandbox implementation files", () => {
    const combined = IMPLEMENTATION_FILES.map((file) => existsSync(file) ? readFileSync(file, "utf8") : "").join("\n");
    expect(combined).not.toContain("Portkey-AI/gateway");
    expect(combined).not.toContain("Portkey");
    expect(combined).not.toContain("1600+");
    expect(combined).not.toContain("MCP Gateway");
    expect(combined).not.toContain(IDENTIFIER);
  });
});
