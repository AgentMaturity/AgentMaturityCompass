import inquirer from "inquirer";
import { resolveAgentId } from "../fleet/paths.js";
import { loadAgentConfig } from "../fleet/registry.js";
import { loadGatewayConfig } from "../gateway/config.js";
import { latestActiveWorkOrder } from "../workorders/workorderEngine.js";
import { issueLeaseForCli } from "../leases/leaseCli.js";
import { workspaceIdFromDirectory } from "../workspaces/workspaceId.js";
import { readStudioState } from "./studioState.js";
import { loadAdaptersConfig } from "../adapters/adapterConfigStore.js";
import { getBuiltInAdapter } from "../adapters/registry.js";

export interface ConnectOutput {
  agentId: string;
  adapterId: string | null;
  routeUrl: string;
  envLines: string[];
  command: string;
  mode: "supervise" | "sandbox";
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

export async function buildConnectInstructions(params: {
  workspace: string;
  agentId?: string;
  mode?: "supervise" | "sandbox";
  adapterId?: string;
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

  const selectedMode = params.mode ?? (await inquirer.prompt<{ mode: "supervise" | "sandbox" }>([
    {
      type: "list",
      name: "mode",
      message: "How should this agent run?",
      choices: ["supervise", "sandbox"],
      default: "supervise"
    }
  ])).mode;

  const gatewayPort = state?.gatewayPort ?? gateway.listen.port;
  const proxyPort = state?.proxyPort ?? gateway.proxy.port;
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
    workOrderId: activeWorkOrder?.workOrderId
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
