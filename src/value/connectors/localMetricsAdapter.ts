import { ingestValueWebhookForApi, ingestValueWebhookForApiAsync } from "../valueApi.js";

export function ingestLocalMetricPoints(params: {
  workspace: string;
  scopeType: "WORKSPACE" | "NODE" | "AGENT";
  scopeId: string;
  sourceId: string;
  points: Array<{ ts?: number; kpiId: string; value: number; unit?: string; labels?: Record<string, string> }>;
}) {
  return ingestValueWebhookForApi({
    workspace: params.workspace,
    payload: {
      v: 1,
      sourceId: params.sourceId,
      scope: {
        type: params.scopeType,
        id: params.scopeId
      },
      events: params.points
    }
  });
}

export async function ingestLocalMetricPointsAsync(params: {
  workspace: string;
  scopeType: "WORKSPACE" | "NODE" | "AGENT";
  scopeId: string;
  sourceId: string;
  points: Array<{ ts?: number; kpiId: string; value: number; unit?: string; labels?: Record<string, string> }>;
}) {
  return ingestValueWebhookForApiAsync({
    workspace: params.workspace,
    payload: {
      v: 1,
      sourceId: params.sourceId,
      scope: {
        type: params.scopeType,
        id: params.scopeId
      },
      events: params.points
    }
  });
}
