import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, test } from "vitest";
import { runDiagnostic } from "../../src/diagnostic/runner.js";
import { runQuickSetup } from "../../src/setup/quickSetup.js";
import { createAMCClient, instrumentOpenAIClient } from "../../src/index.js";

function makeWorkspace(): string {
  return mkdtempSync(join(tmpdir(), "amc-dx-quickstart-"));
}

describe("5-minute quickstart integration", () => {
  let workspace = "";
  const prevVaultPassphrase = process.env.AMC_VAULT_PASSPHRASE;

  beforeEach(() => {
    workspace = makeWorkspace();
    process.env.AMC_VAULT_PASSPHRASE = "dx-quickstart-passphrase";
  });

  test("quick setup, run diagnostic, and instrument OpenAI client", async () => {
    try {
      // setupCli was one of three overlapping onboarding paths and has been
      // removed; quickSetup is the flow the CLI actually ships.
      const setup = await runQuickSetup({
        cwd: workspace,
        provider: "openai",
        auto: true,
        logger: { log: () => {} }
      });

      expect(setup.workspace).toBe(workspace);
      expect(existsSync(join(workspace, ".amc"))).toBe(true);
      expect(existsSync(join(workspace, ".amc", "gateway.yaml"))).toBe(true);
      expect(existsSync(setup.gatewayConfigPath)).toBe(true);

      const report = await runDiagnostic({
        workspace,
        window: "14d",
        targetName: "default",
        claimMode: "auto",
        agentId: "default"
      });

      expect(report.runId).toMatch(/^[0-9a-f-]{36}$/);
      expect(report.layerScores.length).toBeGreaterThan(0);
      expect(typeof report.integrityIndex).toBe("number");

      const calls: Array<{ url: string; authHeader: string | null }> = [];
      const amc = createAMCClient({
        bridgeUrl: "http://127.0.0.1:3212",
        token: "dx-token",
        fetchImpl: (async (input: URL | RequestInfo, init?: RequestInit) => {
          const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
          const headers = new Headers(init?.headers ?? {});
          calls.push({ url, authHeader: headers.get("authorization") });
          return new Response(JSON.stringify({ id: "ok" }), {
            status: 200,
            headers: {
              "content-type": "application/json",
              "x-amc-bridge-request-id": "req_123",
              "x-amc-correlation-id": "corr_123",
              "x-amc-receipt": "receipt_123"
            }
          });
        }) as typeof fetch
      });

      const rawOpenAI = {
        chat: {
          completions: {
            create: async (_body: unknown) => ({ unreachable: true })
          }
        }
      };

      const wrapped = instrumentOpenAIClient(rawOpenAI, amc);
      const sdkResponse = await wrapped.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: "hello" }]
      });

      expect((sdkResponse as Record<string, unknown>).id).toBe("ok");
      expect(calls).toHaveLength(1);
      expect(calls[0]?.url).toContain("/bridge/openai/v1/chat/completions");
      expect(calls[0]?.authHeader).toBe("Bearer dx-token");
    } finally {
      process.env.AMC_VAULT_PASSPHRASE = prevVaultPassphrase;
      rmSync(workspace, { recursive: true, force: true });
    }
  });
});
