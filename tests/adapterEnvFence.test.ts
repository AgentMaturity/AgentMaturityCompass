import { describe, expect, it } from "vitest";
import { assembleAdapterEnv } from "../src/adapters/envAssembler.js";
import type { AdapterDefinition } from "../src/adapters/adapterTypes.js";

/**
 * An adapter-launched agent is an observed child and must be fenced out of the
 * log observing it.
 *
 * `AMC_EVALUATED_AGENT=1` is the ledger's trusted-writer fence
 * (`assertTrustedWriter` in ledger.ts, and the same check in the JSONL store).
 * The wrap and supervise paths have always set it. This one never did, so of
 * the three ways AMC launches an agent, exactly one left the agent able to
 * write to the evidence about itself.
 */
const adapter: AdapterDefinition = {
  id: "test-adapter",
  label: "Test",
  command: "echo",
  args: [],
  envStrategy: {
    baseUrlEnv: { keys: ["TEST_BASE_URL"], valueTemplate: "{{gatewayBase}}{{providerRoute}}" },
    apiKeyEnv: { keys: ["TEST_API_KEY"], valueTemplate: "{{lease}}" },
    leaseCarrier: "ENV_API_KEY",
    proxyEnv: { setHttpProxy: false, setHttpsProxy: false, noProxy: "" }
  }
} as unknown as AdapterDefinition;

describe("the adapter environment", () => {
  it("fences the child out of the ledger", () => {
    const env = assembleAdapterEnv({
      adapter,
      lease: "lease-token-abcdefgh",
      agentId: "default",
      gatewayBase: "http://127.0.0.1:3210",
      proxyBase: "http://127.0.0.1:3210",
      providerRoute: "/openai",
      model: "gpt-4",
      includeProxyEnv: false
    });

    expect(
      env["AMC_EVALUATED_AGENT"],
      "an adapter child was the one observed agent that could write to its own evidence"
    ).toBe("1");
  });
});
