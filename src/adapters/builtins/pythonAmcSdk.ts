/**
 * Python AMC SDK adapter.
 * Wraps Python agents using the AMC Python SDK.
 *
 * The library lives at platform/python/ (200 modules: product 82, enforce 36,
 * shield 17, vault 15, watch 12, score 8, plus core/api/agents). The previous
 * "1130 modules" here was roughly 5x the real count.
 */
import type { AdapterDefinition } from "../adapterTypes.js";
import { builtInAdapterCapabilities } from "../adapterCapabilities.js";

export const pythonAmcSdkAdapter: AdapterDefinition = {
  id: "python-amc-sdk",
  displayName: "Python AMC SDK",
  kind: "CLI",
  detection: {
    commandCandidates: ["python3", "python"],
    versionArgs: ["-c", "import amc; print(amc.__version__)"],
    parseVersionRegex: "([0-9]+(?:\\.[0-9]+){0,2})"
  },
  providerFamily: "OPENAI_COMPAT",
  defaultRunMode: "SUPERVISE",
  envStrategy: {
    leaseCarrier: "ENV_API_KEY",
    baseUrlEnv: {
      keys: ["OPENAI_BASE_URL", "AMC_LLM_BASE_URL"],
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
    executable: "python3",
    args: ["run_full_validation.py"],
    supportsStdin: false
  },
  capabilities: builtInAdapterCapabilities({
    versionSource: "package_probe",
    evidenceRefs: ["docs/adapters/python-amc-sdk.md"]
  })
};
