/**
 * Python AMC SDK adapter.
 * Wraps Python agents using the AMC Python SDK (158 modules at platform/python/).
 * Modules: shield/ (16), enforce/ (35), vault/ (14), watch/ (10), score/ (7), product/ (81).
 */
import type { AdapterDefinition } from "../adapterTypes.js";

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
  }
};
