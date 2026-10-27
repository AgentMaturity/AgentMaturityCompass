import { noCodeAdapterTypeSchema } from "./noCodeGovernanceSchema.js";
import { addNoCodeAdapter, addNoCodeAdapterAsync, type NoCodeGovernancePublicationOptions } from "./noCodeGovernanceStore.js";

export function noCodeAdapterAddCli(params: {
  workspace: string;
  type: string;
  webhookUrl: string;
}): ReturnType<typeof addNoCodeAdapter> {
  return addNoCodeAdapter({
    workspace: params.workspace,
    type: noCodeAdapterTypeSchema.parse(params.type),
    webhookUrl: params.webhookUrl
  });
}

export async function noCodeAdapterAddCliAsync(params: { workspace: string; type: string; webhookUrl: string },
  options: NoCodeGovernancePublicationOptions = {}) {
  return addNoCodeAdapterAsync({ workspace: params.workspace, type: noCodeAdapterTypeSchema.parse(params.type), webhookUrl: params.webhookUrl }, options);
}
