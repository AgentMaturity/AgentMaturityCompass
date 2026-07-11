import type { AdapterDefinition } from "../adapterTypes.js";
import { builtInAdapterCapabilities } from "../adapterCapabilities.js";

export const langchainNodeAdapter: AdapterDefinition = {
  id: "langchain-node",
  displayName: "LangChain (Node)",
  kind: "LIBRARY_NODE",
  detection: {
    commandCandidates: ["node"],
    versionArgs: ["--version"],
    parseVersionRegex: "([0-9]+(?:\\.[0-9]+){0,2})"
  },
  providerFamily: "OPENAI_COMPAT",
  defaultRunMode: "SUPERVISE",
  envStrategy: {
    leaseCarrier: "ENV_API_KEY",
    baseUrlEnv: {
      keys: ["OPENAI_BASE_URL", "OPENAI_API_BASE", "AMC_LLM_BASE_URL"],
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
    executable: "node",
    args: [".amc/adapters-samples/langchain-node/run.mjs"],
    supportsStdin: false
  },
  capabilities: builtInAdapterCapabilities({
    versionSource: "host_runtime",
    evidenceRefs: ["docs/adapters/langchain-node.md"]
  })
};
