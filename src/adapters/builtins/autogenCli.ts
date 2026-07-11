import type { AdapterDefinition } from "../adapterTypes.js";
import { builtInAdapterCapabilities } from "../adapterCapabilities.js";

export const autogenCliAdapter: AdapterDefinition = {
  id: "autogen-cli",
  displayName: "AutoGen (Python module)",
  kind: "CLI",
  detection: {
    commandCandidates: ["python3", "python"],
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
      keys: ["OPENAI_API_KEY", "AZURE_OPENAI_API_KEY"],
      valueTemplate: "{{lease}}"
    },
    proxyEnv: {
      setHttpProxy: true,
      setHttpsProxy: true,
      noProxy: "localhost,127.0.0.1,::1"
    }
  },
  commandTemplate: {
    executable: "python",
    args: ["-m", "autogen"],
    supportsStdin: true
  },
  capabilities: builtInAdapterCapabilities({
    versionSource: "mixed_runtime",
    evidenceRefs: ["docs/adapters/autogen.md"]
  }),
  notes: "If `python -m autogen` is unavailable, provide a custom command with `--`."
};
