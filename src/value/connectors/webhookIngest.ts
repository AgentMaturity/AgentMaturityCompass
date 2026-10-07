import { ingestValueWebhookForApi } from "../valueApi.js";

export async function ingestValueWebhook(params: {
  workspace: string;
  payload: unknown;
}) {
  return ingestValueWebhookForApi({
    workspace: params.workspace,
    payload: params.payload
  });
}
