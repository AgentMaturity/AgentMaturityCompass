import { noCodeAdapterTypeSchema } from "./noCodeGovernanceSchema.js";
import { addNoCodeAdapter } from "./noCodeGovernanceStore.js";

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
