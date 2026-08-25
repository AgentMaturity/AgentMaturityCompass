import { stripProviderKeys, PROVIDER_KEY_ENV_NAMES } from "../utils/providerKeys.js";
import type { AdapterDefinition } from "./adapterTypes.js";

export interface AdapterEnvAssembleInput {
  adapter: AdapterDefinition;
  lease: string;
  agentId: string;
  gatewayBase: string;
  proxyBase: string;
  providerRoute: string;
  model: string;
  workOrderId?: string | null;
  includeProxyEnv: boolean;
}

function replaceTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (_all, key: string) => vars[key] ?? "");
}

export function redactSecretsInText(input: string, secrets: string[]): string {
  let out = input;
  for (const secret of secrets) {
    if (!secret) {
      continue;
    }
    out = out.split(secret).join("<AMC_LEASE_REDACTED>");
  }
  return out;
}

export function assembleAdapterEnv(input: AdapterEnvAssembleInput): NodeJS.ProcessEnv {
  const base = stripProviderKeys(process.env);
  const vars = {
    agentId: input.agentId,
    workOrderId: input.workOrderId ?? "",
    lease: input.lease,
    gatewayBase: input.gatewayBase,
    proxyBase: input.proxyBase,
    model: input.model,
    providerRoute: input.providerRoute
  };
  const env: NodeJS.ProcessEnv = {
    ...base,
    // The ledger's trusted-writer fence (ledger.ts assertTrustedWriter,
    // jsonlSessionEventStore). The wrap and supervise paths have always set
    // it; this one never did, so an adapter-launched agent was the one
    // observed child that could still write to the log observing it. AMC
    // itself records from the PARENT process, so fencing the child costs
    // nothing it legitimately needed.
    AMC_EVALUATED_AGENT: "1",
    AMC_AGENT_ID: input.agentId,
    AMC_LEASE: input.lease,
    AMC_GATEWAY_URL: `${input.gatewayBase}${input.providerRoute}`,
    AMC_LLM_BASE_URL: `${input.gatewayBase}${input.providerRoute}`,
    AMC_ADAPTER_ID: input.adapter.id,
    AMC_MODEL: input.model
  };
  if (input.workOrderId) {
    env.AMC_WORKORDER_ID = input.workOrderId;
  }
  const baseUrlValue = replaceTemplate(input.adapter.envStrategy.baseUrlEnv.valueTemplate, vars);
  for (const key of input.adapter.envStrategy.baseUrlEnv.keys) {
    env[key] = baseUrlValue;
  }
  const apiKeyValue = replaceTemplate(input.adapter.envStrategy.apiKeyEnv.valueTemplate, vars);
  for (const key of input.adapter.envStrategy.apiKeyEnv.keys) {
    env[key] = apiKeyValue;
  }
  if (input.adapter.envStrategy.leaseCarrier === "ENV_API_KEY") {
    for (const key of PROVIDER_KEY_ENV_NAMES) {
      env[key] = input.lease;
    }
  }
  if (input.includeProxyEnv) {
    if (input.adapter.envStrategy.proxyEnv.setHttpProxy) {
      env.HTTP_PROXY = input.proxyBase;
    }
    if (input.adapter.envStrategy.proxyEnv.setHttpsProxy) {
      env.HTTPS_PROXY = input.proxyBase;
    }
    env.NO_PROXY = input.adapter.envStrategy.proxyEnv.noProxy;
  }
  return env;
}

