import type { AdapterDefinition } from "../adapterTypes.js";
import { builtInAdapterCapabilities } from "../adapterCapabilities.js";

const capabilities = builtInAdapterCapabilities({
  versionSource: "adapter_binary",
  additionalOmissions: [
    "DSH capture requires a signed, hash-pinned launcher; PATH detection alone does not approve execution",
    "stderr reasoning is omitted; bounded stdout is process output, not internal tool evidence",
    "a private settings overlay requests gateway/model routing but only actual gateway receipts establish observed model traffic",
    "DSH native tool, sandbox, approval and session events are unavailable without a separately installed native hook",
    "launcher hashes do not pin every transitive plugin, profile or dependency"
  ]
});

export const deepseekHarnessAdapter: AdapterDefinition = {
  id: "deepseek-harness",
  displayName: "DeepSeek Harness (headless capture)",
  kind: "CLI",
  detection: {
    commandCandidates: ["dsh"], versionArgs: ["--version"],
    parseVersionRegex: "^\\s*(\\d+\\.\\d+\\.\\d+(?:-[0-9A-Za-z.-]+)?(?:\\+[0-9A-Za-z.-]+)?)\\s*$",
    requireVersionMatch: true
  },
  providerFamily: "OPENAI_COMPAT",
  defaultRunMode: "SUPERVISE",
  envStrategy: {
    leaseCarrier: "ENV_API_KEY",
    baseUrlEnv: { keys: ["DEEPSEEK_BASE_URL"], valueTemplate: "{{gatewayBase}}{{providerRoute}}" },
    apiKeyEnv: { keys: ["DEEPSEEK_API_KEY"], valueTemplate: "{{lease}}" },
    proxyEnv: { setHttpProxy: true, setHttpsProxy: true, noProxy: "localhost,127.0.0.1,::1" }
  },
  commandTemplate: { executable: "dsh", args: ["--profile", "headless"], supportsStdin: false },
  capabilities: {
    ...capabilities,
    verification: { status: "unverified", authority: "amc", evidenceRefs: ["docs/adapters/deepseek-harness.md"] }
  },
  notes: "Configure --launch-config with reviewed local executable/entrypoint hashes. SUPERVISE only; process capture does not govern or prove DSH internal tools."
};
