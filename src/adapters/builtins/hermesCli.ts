import type { AdapterDefinition } from "../adapterTypes.js";
import { builtInAdapterCapabilities } from "../adapterCapabilities.js";

export const hermesCliAdapter: AdapterDefinition = {
  id: "hermes-cli",
  displayName: "Hermes Agent CLI",
  kind: "CLI",
  detection: {
    commandCandidates: ["hermes"],
    versionArgs: ["--version"],
    parseVersionRegex: "([0-9]+(?:\\.[0-9]+){0,2})"
  },
  providerFamily: "OPENAI_COMPAT",
  defaultRunMode: "SUPERVISE",
  envStrategy: {
    leaseCarrier: "ENV_API_KEY",
    baseUrlEnv: {
      keys: ["OPENAI_BASE_URL", "OPENAI_API_BASE", "OPENAI_API_HOST", "AMC_LLM_BASE_URL"],
      valueTemplate: "{{gatewayBase}}{{providerRoute}}"
    },
    apiKeyEnv: {
      keys: ["OPENAI_API_KEY"],
      valueTemplate: "{{lease}}"
    },
    proxyEnv: {
      setHttpProxy: true,
      setHttpsProxy: true,
      noProxy: "localhost,127.0.0.1,::1"
    }
  },
  commandTemplate: {
    executable: "hermes",
    args: [],
    supportsStdin: true
  },
  capabilities: builtInAdapterCapabilities({
    versionSource: "adapter_binary",
    evidenceRefs: ["docs/adapters/hermes.md"]
  })
};
