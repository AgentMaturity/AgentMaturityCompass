import { chmodSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, test } from "vitest";
import { adaptersConfigureCli, adaptersInitCli } from "../src/adapters/adapterCli.js";
import { adapterDefinitionSchema } from "../src/adapters/adapterTypes.js";
import { ADAPTER_PROFILES, getAdapterProfile } from "../src/adapters/adapterStandardization.js";
import { listBuiltInAdapters } from "../src/adapters/registry.js";
import {
  ADAPTER_CAPABILITY_RECEIPT_VERSION,
  buildAdapterCapabilityReceipt,
  issueAdapterCapabilityReceipt,
  trustedAdapterCapabilityReceiptKeys,
  verifyAdapterCapabilityReceipt,
  type AdapterCapabilityInspection
} from "../src/passport/adapterCapabilityReceipt.js";
import { initWorkspace } from "../src/workspace.js";

const roots: string[] = [];
const previousPassphrase = process.env.AMC_VAULT_PASSPHRASE;
const previousPath = process.env.PATH;

function newWorkspace(): string {
  const workspace = mkdtempSync(join(tmpdir(), "amc-adapter-capability-"));
  roots.push(workspace);
  initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
  return workspace;
}

function inspection(overrides: Partial<AdapterCapabilityInspection> = {}): AdapterCapabilityInspection {
  return {
    runtime: {
      status: "detected",
      command: "claude",
      version: "2.1.50"
    },
    configuration: {
      status: "signed_selected"
    },
    hook: {
      status: "not_applicable",
      provider: null,
      mode: null
    },
    ...overrides
  };
}

beforeAll(() => {
  process.env.AMC_VAULT_PASSPHRASE = "adapter-capability-test-passphrase";
});

afterEach(() => {
  process.env.PATH = previousPath;
  while (roots.length > 0) {
    const root = roots.pop();
    if (root) rmSync(root, { recursive: true, force: true });
  }
});

afterAll(() => {
  if (previousPassphrase === undefined) delete process.env.AMC_VAULT_PASSPHRASE;
  else process.env.AMC_VAULT_PASSPHRASE = previousPassphrase;
  process.env.PATH = previousPath;
});

describe("adapter capability declarations", () => {
  test("all built-ins declare exact events, controls, lossiness, version semantics, and fixture evidence", () => {
    const adapters = listBuiltInAdapters();
    expect(adapters).toHaveLength(15);

    for (const adapter of adapters) {
      const declaration = adapter.capabilities;
      expect(declaration.declarationVersion).toBe("1");
      expect(declaration.definitionVersion).toMatch(/^\d+\.\d+\.\d+$/);
      expect(declaration.events.length).toBeGreaterThan(0);
      expect(declaration.controls.length).toBeGreaterThan(0);
      expect(new Set(declaration.events.map((row) => row.id)).size).toBe(declaration.events.length);
      expect(new Set(declaration.controls.map((row) => row.id)).size).toBe(declaration.controls.length);
      expect(declaration.lossiness.level).not.toBe("unknown");
      expect(declaration.lossiness.omitted.length).toBeGreaterThan(0);
      expect(declaration.verification.status).toBe("fixture_verified");
      expect(declaration.verification.authority).toBe("amc");
      expect(declaration.verification.evidenceRefs.length).toBeGreaterThan(0);
    }

    const claude = adapters.find((row) => row.id === "claude-cli")!;
    const gemini = adapters.find((row) => row.id === "gemini-cli")!;
    expect(claude.capabilities.controls.map((row) => row.id)).toContain("provider.ask");
    expect(gemini.capabilities.controls.map((row) => row.id)).not.toContain("provider.ask");
    expect(gemini.capabilities.lossiness.omitted.join(" ")).toMatch(/ask.*deny/i);
  });

  test("legacy plugin metadata receives an explicit unverified declaration with no advertised capability", () => {
    const legacyPlugin = adapterDefinitionSchema.parse({
      id: "legacy-plugin",
      displayName: "Legacy Plugin",
      kind: "CLI",
      detection: {
        commandCandidates: ["legacy"],
        versionArgs: ["--version"],
        parseVersionRegex: "([0-9.]+)"
      },
      providerFamily: "CUSTOM_HTTP",
      defaultRunMode: "SUPERVISE",
      envStrategy: {
        leaseCarrier: "ENV_API_KEY",
        baseUrlEnv: { keys: [], valueTemplate: "{{gatewayBase}}{{providerRoute}}" },
        apiKeyEnv: { keys: [], valueTemplate: "{{lease}}" },
        proxyEnv: { setHttpProxy: false, setHttpsProxy: false, noProxy: "localhost" }
      },
      commandTemplate: { executable: "legacy", args: [], supportsStdin: true }
    });

    expect(legacyPlugin.capabilities).toMatchObject({
      definitionVersion: "unverified",
      events: [],
      controls: [],
      lossiness: { level: "unknown" },
      verification: { status: "unverified", evidenceRefs: [] }
    });
    legacyPlugin.capabilities.lossiness.omitted.push("mutated by caller");
    const reparsed = adapterDefinitionSchema.parse({ ...legacyPlugin, capabilities: undefined });
    expect(reparsed.capabilities.lossiness.omitted).toEqual(["capability declaration missing"]);
  });

  test("the legacy standardization API is a conservative projection of canonical registry IDs", () => {
    const registryIds = listBuiltInAdapters().map((row) => row.id).sort();
    expect(ADAPTER_PROFILES.map((row) => row.adapterId).sort()).toEqual(registryIds);
    expect(ADAPTER_PROFILES.every((row) => row.capabilities.nativeRedTeam === false)).toBe(true);
    expect(getAdapterProfile("langchainNode")?.adapterId).toBe("langchain-node");
  });
});

describe("signed adapter capability receipts", () => {
  test("separates declared capabilities from effective capabilities and exposes weak version probes", () => {
    const workspace = newWorkspace();
    const generic = listBuiltInAdapters().find((row) => row.id === "generic-cli")!;
    const receipt = buildAdapterCapabilityReceipt({
      workspace,
      agentId: "generic-agent",
      definition: generic,
      source: "builtin",
      issuedAt: "2026-07-11T06:00:00.000Z",
      inspection: inspection({
        runtime: { status: "detected", command: "sh", version: "3.2.57" }
      })
    });

    expect(receipt.receiptVersion).toBe(ADAPTER_CAPABILITY_RECEIPT_VERSION);
    expect(receipt.verification.status).toBe("partial");
    expect(receipt.verification.reasons).toContain("version:shell-runtime-only");
    expect(receipt.effective.events).toEqual(expect.arrayContaining(["process.started", "model.request"]));
    expect(receipt.effective.controls).toEqual(expect.arrayContaining(["gateway.route", "gateway.freeze"]));
    expect(verifyAdapterCapabilityReceipt(receipt, { workspace })).toEqual({ valid: true, reasons: [] });
    expect(verifyAdapterCapabilityReceipt(receipt, {
      trustedPublicKeys: trustedAdapterCapabilityReceiptKeys(workspace)
    })).toEqual({ valid: true, reasons: [] });
  });

  test("verifies provider-native Claude control coverage only when the signed control hook is effective", () => {
    const workspace = newWorkspace();
    const claude = listBuiltInAdapters().find((row) => row.id === "claude-cli")!;
    const receipt = buildAdapterCapabilityReceipt({
      workspace,
      agentId: "claude-agent",
      definition: claude,
      source: "builtin",
      issuedAt: "2026-07-11T06:01:00.000Z",
      inspection: inspection({
        hook: { status: "control", provider: "claude-code", mode: "control" }
      })
    });

    expect(receipt.verification).toEqual({ status: "verified", reasons: [] });
    expect(receipt.effective.events).toEqual(expect.arrayContaining([
      "action.requested",
      "action.completed",
      "action.failed",
      "action.decision",
    ]));
    expect(receipt.effective.controls).toEqual(expect.arrayContaining([
      "provider.allow",
      "provider.deny",
      "provider.ask"
    ]));
    expect(verifyAdapterCapabilityReceipt(receipt, { workspace }).valid).toBe(true);
  });

  test("fails closed on invalid signed configuration and on undeclared plugin metadata", () => {
    const workspace = newWorkspace();
    const generic = listBuiltInAdapters().find((row) => row.id === "generic-cli")!;
    const invalidConfig = buildAdapterCapabilityReceipt({
      workspace,
      agentId: "generic-agent",
      definition: generic,
      source: "builtin",
      issuedAt: "2026-07-11T06:02:00.000Z",
      inspection: inspection({ configuration: { status: "invalid" } })
    });
    expect(invalidConfig.verification.status).toBe("fail_closed");
    expect(invalidConfig.verification.reasons).toContain("configuration:invalid");
    expect(invalidConfig.effective.controls).toEqual([]);

    const plugin = adapterDefinitionSchema.parse({
      ...generic,
      id: "metadata-only-plugin",
      capabilities: undefined
    });
    const metadataOnly = buildAdapterCapabilityReceipt({
      workspace,
      agentId: "plugin-agent",
      definition: plugin,
      source: "plugin",
      issuedAt: "2026-07-11T06:03:00.000Z",
      inspection: inspection()
    });
    expect(metadataOnly.verification.status).toBe("fail_closed");
    expect(metadataOnly.effective).toEqual({ events: [], controls: [] });
    expect(metadataOnly.verification.reasons).toContain("declaration:unverified");
    expect(metadataOnly.verification.reasons).toContain("declaration:plugin-not-certified");

    const selfCertifiedPlugin = adapterDefinitionSchema.parse({
      ...generic,
      id: "self-certified-plugin",
      capabilities: {
        ...generic.capabilities,
        verification: {
          status: "fixture_verified",
          authority: "amc",
          evidenceRefs: ["publisher-claimed-test.md"]
        }
      }
    });
    const selfCertified = buildAdapterCapabilityReceipt({
      workspace,
      agentId: "plugin-agent",
      definition: selfCertifiedPlugin,
      source: "plugin",
      issuedAt: "2026-07-11T06:03:30.000Z",
      inspection: inspection()
    });
    expect(selfCertified.verification.status).toBe("fail_closed");
    expect(selfCertified.effective).toEqual({ events: [], controls: [] });
    expect(selfCertified.verification.reasons).toContain("declaration:plugin-not-certified");
  });

  test("rejects receipt tamper, schema smuggling, and an untrusted signer", () => {
    const workspace = newWorkspace();
    const otherWorkspace = newWorkspace();
    const claude = listBuiltInAdapters().find((row) => row.id === "claude-cli")!;
    const receipt = buildAdapterCapabilityReceipt({
      workspace,
      agentId: "claude-agent",
      definition: claude,
      source: "builtin",
      issuedAt: "2026-07-11T06:04:00.000Z",
      inspection: inspection({
        hook: { status: "control", provider: "claude-code", mode: "control" }
      })
    });
    const tampered = structuredClone(receipt);
    tampered.effective.controls = tampered.effective.controls.filter((row) => row !== "provider.deny");
    expect(verifyAdapterCapabilityReceipt(tampered, { workspace }).valid).toBe(false);
    expect(verifyAdapterCapabilityReceipt(receipt, { workspace: otherWorkspace }).reasons).toContain("signature:untrusted");
    expect(verifyAdapterCapabilityReceipt({ ...receipt, rawInput: "SECRET" }, { workspace }).reasons).toContain("schema:invalid");
  });

  test("live issuance binds runtime detection, signed adapter selection, and absent hook state", () => {
    const workspace = newWorkspace();
    const binDir = join(workspace, "bin");
    mkdirSync(binDir, { recursive: true });
    const claudePath = join(binDir, "claude");
    writeFileSync(claudePath, "#!/bin/sh\necho 'claude 2.1.50'\n", { mode: 0o755 });
    chmodSync(claudePath, 0o755);
    process.env.PATH = `${binDir}:${previousPath ?? ""}`;

    adaptersInitCli(workspace);
    adaptersConfigureCli({
      workspace,
      agentId: "live-agent",
      adapterId: "claude-cli",
      route: "/anthropic",
      model: "claude-test",
      mode: "SUPERVISE"
    });
    const receipt = issueAdapterCapabilityReceipt({
      workspace,
      agentId: "live-agent",
      adapterId: "claude-cli",
      issuedAt: "2026-07-11T06:05:00.000Z"
    });

    expect(receipt.inspection.runtime).toMatchObject({ status: "detected", command: "claude", version: "2.1.50" });
    expect(receipt.inspection.configuration.status).toBe("signed_selected");
    expect(receipt.inspection.hook.status).toBe("not_installed");
    expect(receipt.verification.status).toBe("partial");
    expect(receipt.effective.controls).not.toContain("provider.allow");
    expect(verifyAdapterCapabilityReceipt(receipt, { workspace }).valid).toBe(true);
    expect(JSON.stringify(receipt)).not.toMatch(/rawInput|tool_input|transcript_path|"cwd"|AMC_VAULT_PASSPHRASE|SECRET/);
  });
});
