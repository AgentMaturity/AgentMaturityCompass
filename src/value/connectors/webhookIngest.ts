import { ingestValueWebhookForApiAsync } from "../valueApi.js";

export async function ingestValueWebhook(params: {
  workspace: string;
  payload: unknown;
}) {
  return ingestValueWebhookForApiAsync({
    workspace: params.workspace,
    payload: params.payload
  });
}
