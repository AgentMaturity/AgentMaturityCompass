import { adapterDefinitionSchema, type AdapterDefinition } from "./adapterTypes.js";
import { genericCliAdapter } from "./builtins/genericCli.js";
import { claudeCliAdapter } from "./builtins/claudeCli.js";
import { geminiCliAdapter } from "./builtins/geminiCli.js";
import { openclawCliAdapter } from "./builtins/openclawCli.js";
import { openhandsCliAdapter } from "./builtins/openhandsCli.js";
import { autogenCliAdapter } from "./builtins/autogenCli.js";
import { crewaiCliAdapter } from "./builtins/crewaiCli.js";
import { langchainNodeAdapter } from "./builtins/langchainNode.js";
import { langchainPythonAdapter } from "./builtins/langchainPython.js";
import { langgraphPythonAdapter } from "./builtins/langgraphPython.js";
import { llamaindexPythonAdapter } from "./builtins/llamaindexPython.js";
import { semanticKernelAdapter } from "./builtins/semanticKernel.js";
import { openaiAgentsSdkAdapter } from "./builtins/openaiAgentsSdk.js";
import { pythonAmcSdkAdapter } from "./builtins/pythonAmcSdk.js";

const BUILTINS = [
  genericCliAdapter,
  claudeCliAdapter,
  geminiCliAdapter,
  openclawCliAdapter,
  openhandsCliAdapter,
  autogenCliAdapter,
  crewaiCliAdapter,
  langchainNodeAdapter,
  langchainPythonAdapter,
  langgraphPythonAdapter,
  llamaindexPythonAdapter,
  semanticKernelAdapter,
  openaiAgentsSdkAdapter,
  pythonAmcSdkAdapter
].map((row) => adapterDefinitionSchema.parse(row));

export function listBuiltInAdapters(): AdapterDefinition[] {
  return BUILTINS.map((row) => ({ ...row, envStrategy: { ...row.envStrategy, baseUrlEnv: { ...row.envStrategy.baseUrlEnv }, apiKeyEnv: { ...row.envStrategy.apiKeyEnv }, proxyEnv: { ...row.envStrategy.proxyEnv } }, commandTemplate: { ...row.commandTemplate }, detection: { ...row.detection } }));
}

export function getBuiltInAdapter(adapterId: string): AdapterDefinition {
  const found = BUILTINS.find((row) => row.id === adapterId);
  if (!found) {
    throw new Error(`Unknown adapter: ${adapterId}`);
  }
  return {
    ...found,
    envStrategy: {
      ...found.envStrategy,
      baseUrlEnv: { ...found.envStrategy.baseUrlEnv },
      apiKeyEnv: { ...found.envStrategy.apiKeyEnv },
      proxyEnv: { ...found.envStrategy.proxyEnv }
    },
    commandTemplate: { ...found.commandTemplate },
    detection: { ...found.detection }
  };
}

export function hasBuiltInAdapter(adapterId: string): boolean {
  return BUILTINS.some((row) => row.id === adapterId);
}

