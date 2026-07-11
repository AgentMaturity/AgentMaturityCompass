import type { AdapterDefinition } from "../adapterTypes.js";
import { builtInAdapterCapabilities } from "../adapterCapabilities.js";

export const crewaiCliAdapter: AdapterDefinition = {
  id: "crewai-cli",
  displayName: "CrewAI CLI",
  kind: "CLI",
  detection: {
    commandCandidates: ["crewai", "python3", "python"],
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
    executable: "crewai",
    args: [],
    supportsStdin: true
  },
  capabilities: builtInAdapterCapabilities({
    versionSource: "mixed_runtime",
    evidenceRefs: ["docs/adapters/crewai.md"]
  })
};
