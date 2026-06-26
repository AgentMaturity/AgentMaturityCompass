import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import {
  demoMaturityLevel,
  demoMaturityScore,
  noVaultDemoGatewayConfig,
  prepareNoVaultDemoWorkspace,
  shouldRunNoVaultDemo
} from "../src/demo/demoRun.js";
import { verifyGatewayConfigSignature } from "../src/gateway/config.js";
import { verifyLeaseForCli } from "../src/leases/leaseCli.js";

const roots: string[] = [];
const originalPassphrase = process.env.AMC_VAULT_PASSPHRASE;

function tempWorkspace(): string {
  const dir = mkdtempSync(join(tmpdir(), "amc-demo-no-vault-test-"));
  roots.push(dir);
  return dir;
}

afterEach(() => {
  while (roots.length > 0) {
    const root = roots.pop();
    if (root) rmSync(root, { recursive: true, force: true });
  }
  if (typeof originalPassphrase === "string") {
    process.env.AMC_VAULT_PASSPHRASE = originalPassphrase;
  } else {
    delete process.env.AMC_VAULT_PASSPHRASE;
  }
});

describe("demo run no-vault mode", () => {
  test("builds a signed ephemeral demo workspace and lease without using caller vault state", () => {
    process.env.AMC_VAULT_PASSPHRASE = "caller-passphrase-123";
    const workspace = tempWorkspace();
    const prepared = prepareNoVaultDemoWorkspace({
      workspace,
      upstreamBaseUrl: "http://127.0.0.1:8800",
      passphrase: "ephemeral-demo-passphrase",
      agentId: "sales-demo-agent"
    });

    expect(process.env.AMC_VAULT_PASSPHRASE).toBe("caller-passphrase-123");
    expect(prepared.workspace).toBe(workspace);
    expect(prepared.agentId).toBe("sales-demo-agent");
    expect(existsSync(join(workspace, ".amc", "vault.amcvault"))).toBe(true);
    expect(existsSync(prepared.gatewayConfigPath)).toBe(true);
    expect(existsSync(prepared.gatewayConfigSignaturePath)).toBe(true);

    const signature = verifyGatewayConfigSignature(workspace);
    expect(signature.valid).toBe(true);

    const lease = verifyLeaseForCli({ workspace, token: prepared.leaseToken });
    expect(lease.ok).toBe(true);
    expect(lease.payload).toMatchObject({
      agentId: "sales-demo-agent",
      scopes: ["gateway:llm", "receipt:verify"],
      routeAllowlist: ["/local"],
      modelAllowlist: ["*"],
      workOrderId: "demo-no-vault"
    });
  });

  test("demo gateway config is local-only, lease-gated, and proxy-disabled", () => {
    const config = noVaultDemoGatewayConfig("http://127.0.0.1:8801");

    expect(config.upstreams.demo_local).toMatchObject({
      baseUrl: "http://127.0.0.1:8801",
      auth: { type: "none" },
      allowLocalhost: true,
      providerId: "demo_local"
    });
    expect(config.routes).toEqual([
      {
        prefix: "/local",
        upstream: "demo_local",
        stripPrefix: true,
        openaiCompatible: true,
        agentId: "demo-agent"
      }
    ]);
    expect(config.lease.allowQueryCarrier).toBe(false);
    expect(config.proxy.enabled).toBe(false);
  });

  test("demo maturity sample is deterministic and visibly bounded", () => {
    expect(demoMaturityLevel(0)).toBe("L0");
    expect(demoMaturityLevel(75)).toBe("L4");

    expect(demoMaturityScore(10, 20)).toEqual({
      maturityScore: 82,
      maturityLevel: "L4"
    });
    expect(demoMaturityScore(100, 100)).toEqual({
      maturityScore: 86,
      maturityLevel: "L4"
    });
  });

  test("recognizes Commander --no-vault parsing shape", () => {
    expect(shouldRunNoVaultDemo({ vault: false })).toBe(true);
    expect(shouldRunNoVaultDemo({ demo: true })).toBe(true);
    expect(shouldRunNoVaultDemo({ noVault: true })).toBe(true);
    expect(shouldRunNoVaultDemo({ vault: true })).toBe(false);
    expect(shouldRunNoVaultDemo({})).toBe(false);
  });
});
