import type { AdapterDefinition } from "../adapterTypes.js";
import { builtInAdapterCapabilities } from "../adapterCapabilities.js";

export const genericCliAdapter: AdapterDefinition = {
  id: "generic-cli",
  displayName: "Generic CLI",
  kind: "CLI",
  detection: {
    commandCandidates: ["sh", "bash"],
    versionArgs: ["--version"],
    parseVersionRegex: "([0-9]+(?:\\.[0-9]+){0,2})"
  },
  providerFamily: "OPENAI_COMPAT",
  defaultRunMode: "SUPERVISE",
  envStrategy: {
    leaseCarrier: "ENV_API_KEY",
    baseUrlEnv: {
      keys: [
        "OPENAI_BASE_URL",
        "OPENAI_API_BASE",
        "OPENAI_API_HOST",
        "ANTHROPIC_BASE_URL",
        "ANTHROPIC_API_URL",
        "GEMINI_BASE_URL",
        "XAI_BASE_URL",
        "OPENROUTER_BASE_URL",
        "AMC_LLM_BASE_URL"
      ],
      valueTemplate: "{{gatewayBase}}{{providerRoute}}"
    },
    apiKeyEnv: {
      keys: ["OPENAI_API_KEY", "ANTHROPIC_API_KEY", "GEMINI_API_KEY", "GOOGLE_API_KEY", "XAI_API_KEY", "OPENROUTER_API_KEY"],
      valueTemplate: "{{lease}}"
    },
    proxyEnv: {
      setHttpProxy: true,
      setHttpsProxy: true,
      noProxy: "localhost,127.0.0.1,::1"
    }
  },
  commandTemplate: {
    executable: "sh",
    args: [],
    supportsStdin: true
  },
  capabilities: builtInAdapterCapabilities({
    versionSource: "shell_runtime",
    evidenceRefs: ["docs/adapters/generic-cli.md"]
  }),
  notes: "Wraps any command provided after `--`."
};
