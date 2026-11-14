import inquirer from "inquirer";
import { resolveAgentId } from "../fleet/paths.js";
import { loadAgentConfig } from "../fleet/registry.js";
import { loadGatewayConfig } from "../gateway/config.js";
import { latestActiveWorkOrder } from "../workorders/workorderEngine.js";
import { issueLeaseForCli } from "../leases/leaseCli.js";
import { workspaceIdFromDirectory } from "../workspaces/workspaceId.js";
import { processRunning, readStudioState } from "./studioState.js";
import { loadAdaptersConfig } from "../adapters/adapterConfigStore.js";
import { getBuiltInAdapter } from "../adapters/registry.js";

export interface ConnectOutput {
  agentId: string;
  adapterId: string | null;
  routeUrl: string;
  envLines: string[];
  command: string;
  mode: "supervise" | "sandbox";
  /** CLI-12: false when no AMC runs in this folder, so nothing listens on routeUrl until `amc up`. */
  amcRunning: boolean;
  leaseToken: string;
  workOrderId: string | null;
  leaseCarrierHint: string;
  nodeSnippet: string;
  pythonSnippet: string;
  hookObservation: {
    supportedProviders: ["claude-code", "gemini-cli"];
    recommendedProvider: "claude-code" | "gemini-cli" | null;
    installCommand: string | null;
    statusCommand: string | null;
    controlDecision: false;
  };
}

/** CLI-13: the two modes, said the same way in the refusal, the prompt and the help. */
const CONNECT_MODES = {
  supervise: "AMC starts your agent's command with its model calls routed through AMC's gateway, which records them",
  sandbox: "the same, inside a hardened Docker container (amc sandbox run; needs Docker)"
} as const;
export const CONNECT_MODE_HELP = `supervise: ${CONNECT_MODES.supervise}; sandbox: ${CONNECT_MODES.sandbox}`;

/** The port a later `amc up` here would listen on: the env override (AMC_GATEWAY_PORT, AMC_PROXY_PORT) when valid, else the config. */
function plannedPort(configured: number, override: string | undefined): number {
  const fromEnv = Number(override ?? "");
  return Number.isInteger(fromEnv) && fromEnv >= 1 && fromEnv <= 65535 ? fromEnv : configured;
}

export async function buildConnectInstructions(params: {
  workspace: string;
  agentId?: string;
  mode?: "supervise" | "sandbox";
  adapterId?: string;
  /** The authenticated session's principal the lease names (P1-78; A4 Assemble connect); absent for the CLI, whose lease names no one. */
  principalKey?: string | null;
}): Promise<ConnectOutput> {
  const agentId = resolveAgentId(params.workspace, params.agentId);
  const gateway = loadGatewayConfig(params.workspace);
  const state = readStudioState(params.workspace);
  const adapters = loadAdaptersConfig(params.workspace);
  const adapterProfile = adapters.adapters.perAgent[agentId];
  const selectedAdapterId = params.adapterId ?? adapterProfile?.preferredAdapter ?? null;

  let routePrefix = "/openai";
  try {
    const config = loadAgentConfig(params.workspace, agentId);
    routePrefix = config.provider.routePrefix;
  } catch {
    // fallback route
    routePrefix = gateway.routes[0]?.prefix ?? "/openai";
  }
  if (adapterProfile?.preferredProviderRoute) {
    routePrefix = adapterProfile.preferredProviderRoute;
  }

  if (params.mode !== undefined && !Object.hasOwn(CONNECT_MODES, params.mode)) {
    throw new Error(`Unknown --mode ${JSON.stringify(params.mode)}. Use --mode supervise (${CONNECT_MODES.supervise}) or --mode sandbox (${CONNECT_MODES.sandbox}).`);
  }
  // Without a terminal the mode prompt can only abort; say which flag answers it.
  if (params.mode === undefined && !process.stdin.isTTY) {
    throw new Error(`amc connect needs a mode and there is no terminal to ask in. Add --mode supervise (${CONNECT_MODES.supervise}) or --mode sandbox (${CONNECT_MODES.sandbox}).`);
  }
  // CLI-13: a fixed choice; "list" fell back to free text and took any answer.
  const selectedMode = params.mode ?? (await inquirer.prompt<{ mode: "supervise" | "sandbox" }>([
    {
      type: "select",
      name: "mode",
      message: "How should this agent run?",
      choices: (["supervise", "sandbox"] as const).map((value) => ({ name: `${value}: ${CONNECT_MODES[value]}`, value })),
      default: "supervise"
    }
  ])).mode;

  // CLI-12: a stale state file or the gateway config alone named port 3210 whatever AMC_GATEWAY_PORT said.
  const running = state !== null && processRunning(state.pid);
  const gatewayPort = running ? state.gatewayPort : plannedPort(gateway.listen.port, process.env.AMC_GATEWAY_PORT);
  const proxyPort = running ? state.proxyPort : plannedPort(gateway.proxy.port, process.env.AMC_PROXY_PORT);
  const routeUrl = `http://127.0.0.1:${gatewayPort}${routePrefix}`;
  const activeWorkOrder = latestActiveWorkOrder(params.workspace, agentId);
  const lease = issueLeaseForCli({
    workspace: params.workspace,
    workspaceId: workspaceIdFromDirectory(params.workspace),
    agentId,
    ttl: "60m",
    scopes: "gateway:llm,proxy:connect,toolhub:intent,toolhub:execute,governor:check,receipt:verify",
    routes: routePrefix,
    models: "*",
    rpm: 60,
    tpm: 200000,
    maxCostUsdPerDay: null,
    workOrderId: activeWorkOrder?.workOrderId,
    ...(params.principalKey === undefined ? {} : { principalKey: params.principalKey })
  });

  const envLines = [
    `export AMC_AGENT_ID=${agentId}`,
    `export AMC_LEASE=${lease.token}`,
    `export AMC_GATEWAY_URL=${routeUrl}`,
    `export AMC_LLM_BASE_URL=${routeUrl}`,
    `export OPENAI_BASE_URL=${routeUrl}`,
    `export OPENAI_API_BASE=${routeUrl}`,
    `export OPENAI_API_HOST=${routeUrl}`,
    "export OPENAI_API_KEY=amc_dummy",
    "export ANTHROPIC_API_KEY=amc_dummy",
    "export GEMINI_API_KEY=amc_dummy",
    "export XAI_API_KEY=amc_dummy",
    "export OPENROUTER_API_KEY=amc_dummy",
    `export X_AMC_AGENT_ID=${agentId}`,
    activeWorkOrder ? `export AMC_WORKORDER_ID=${activeWorkOrder.workOrderId}` : "# Optional: export AMC_WORKORDER_ID=<workOrderId>",
    `export HTTP_PROXY=http://127.0.0.1:${proxyPort}`,
    `export HTTPS_PROXY=http://127.0.0.1:${proxyPort}`,
    "export NO_PROXY=localhost,127.0.0.1,::1"
  ];

  const command = selectedMode === "sandbox"
    ? `amc sandbox run --agent ${agentId} -- <cmd...>`
    : selectedAdapterId
      ? `amc adapters run --agent ${agentId} --adapter ${selectedAdapterId} -- <cmd...>`
      : `amc supervise --agent ${agentId} --route ${routeUrl} -- <cmd...>`;

  const leaseCarrierHint = selectedAdapterId
    ? (() => {
      try {
        const adapter = getBuiltInAdapter(selectedAdapterId);
        if (adapter.envStrategy.leaseCarrier === "ENV_API_KEY") {
          return "Lease is carried via API key env vars (Authorization/x-api-key compatible).";
        }
      } catch {
        // ignore
      }
      return "Lease is carried via x-amc-lease header.";
    })()
    : "Lease can be carried via x-amc-lease, Authorization Bearer, or x-api-key headers.";

  const nodeSnippet = [
    "import { wrapFetch } from 'agent-maturity-compass';",
    "const fetchWithAmc = wrapFetch(fetch, {",
    `  agentId: '${agentId}',`,
    `  gatewayBaseUrl: '${routeUrl}',`,
    "  forceBaseUrl: true",
    "});",
    "const headers = { 'x-amc-agent-id': process.env.AMC_AGENT_ID || 'agent', ...(process.env.AMC_LEASE ? { 'x-amc-lease': process.env.AMC_LEASE } : {}), ...(process.env.AMC_WORKORDER_ID ? { 'x-amc-workorder-id': process.env.AMC_WORKORDER_ID } : {}) };",
    "// Use fetchWithAmc for LLM HTTP calls"
  ].join("\n");

  const pythonSnippet = [
    "import json, os, requests, time",
    `BASE = os.getenv('OPENAI_BASE_URL', '${routeUrl}')`,
    "headers = {'x-amc-agent-id': os.getenv('AMC_AGENT_ID', 'agent'), 'x-amc-lease': os.getenv('AMC_LEASE', '')}",
    "if os.getenv('AMC_WORKORDER_ID'): headers['x-amc-workorder-id'] = os.getenv('AMC_WORKORDER_ID')",
    "resp = requests.post(f'{BASE}/v1/chat/completions', json={'model':'gpt-4o-mini','messages':[{'role':'user','content':'hi'}]}, headers=headers)",
    "trace = {'amc_trace_v':1,'ts':int(time.time()*1000),'agentId':os.getenv('AMC_AGENT_ID','agent'),'event':'llm_result','request_id':resp.headers.get('x-amc-request-id'),'receipt':resp.headers.get('x-amc-receipt')}",
    "print(json.dumps(trace, separators=(',',':')))"
  ].join("\n");

  const recommendedHookProvider = selectedAdapterId === "claude-cli"
    ? "claude-code"
    : selectedAdapterId === "gemini-cli"
      ? "gemini-cli"
      : null;

  return {
    agentId,
    adapterId: selectedAdapterId,
    routeUrl,
    envLines,
    command,
    mode: selectedMode,
    amcRunning: running,
    leaseToken: lease.token,
    workOrderId: activeWorkOrder?.workOrderId ?? null,
    leaseCarrierHint,
    nodeSnippet,
    pythonSnippet,
    hookObservation: {
      supportedProviders: ["claude-code", "gemini-cli"],
      recommendedProvider: recommendedHookProvider,
      installCommand: recommendedHookProvider
        ? `amc connect hooks install --provider ${recommendedHookProvider} --agent ${agentId}`
        : null,
      statusCommand: recommendedHookProvider
        ? `amc connect hooks status --provider ${recommendedHookProvider}`
        : null,
      controlDecision: false
    }
  };
}
