import type { AdapterDefinition } from "../adapterTypes.js";
import { builtInAdapterCapabilities } from "../adapterCapabilities.js";

export const claudeCliAdapter: AdapterDefinition = {
  id: "claude-cli",
  displayName: "Claude CLI",
  kind: "CLI",
  detection: {
    commandCandidates: ["claude", "claude-cli"],
    versionArgs: ["--version"],
    parseVersionRegex: "([0-9]+(?:\\.[0-9]+){0,2})"
  },
  providerFamily: "ANTHROPIC",
  defaultRunMode: "SUPERVISE",
  envStrategy: {
    leaseCarrier: "ENV_API_KEY",
    baseUrlEnv: {
      keys: ["ANTHROPIC_BASE_URL", "ANTHROPIC_API_URL", "AMC_LLM_BASE_URL"],
      valueTemplate: "{{gatewayBase}}{{providerRoute}}"
    },
    apiKeyEnv: {
      keys: ["ANTHROPIC_API_KEY", "X_API_KEY", "API_KEY"],
      valueTemplate: "{{lease}}"
    },
    proxyEnv: {
      setHttpProxy: true,
      setHttpsProxy: true,
      noProxy: "localhost,127.0.0.1,::1"
    }
  },
  commandTemplate: {
    executable: "claude",
    args: [],
    supportsStdin: true
  },
  capabilities: builtInAdapterCapabilities({
    definitionVersion: "1.1.0",
    versionSource: "adapter_binary",
    hookProvider: "claude-code",
    evidenceRefs: [
      "docs/adapters/claude-code.md",
      "https://code.claude.com/docs/en/hooks.md#sha256-e94e721874efc802248a7808e35ac917306088c5eaada2aa21e1def3fecc32e1"
    ]
  })
};
