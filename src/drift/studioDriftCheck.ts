/** Internal existing Studio endpoint handoff; no new route or root SDK authority channel. */
import { activeFreezeStatus } from "./freezeEngine.js";
import { driftCheckCliForAuthority } from "./driftCli.js";
import { driftPostPublicationError } from "./driftDetector.js";
import { refreshForecastForApi } from "../forecast/forecastApi.js";
export async function driftCheckForStudio(params: { workspace: string; agentId: string; against: "previous"; beforePublish(): void;
  recompute(type: "INCIDENT_CREATED" | "FREEZE_APPLIED" | "FREEZE_LIFTED"): void;
  forecast(value: ReturnType<typeof refreshForecastForApi>): void }) {
  const { workspace, agentId, against, beforePublish, recompute, forecast } = params;
  const before = activeFreezeStatus(workspace, agentId).active;
  const result = await driftCheckCliForAuthority({ workspace, agentId, against }, beforePublish);
  try {
    beforePublish();
    const after = activeFreezeStatus(workspace, agentId).active;
    if (result.triggered) recompute("INCIDENT_CREATED");
    if (!before && after) recompute("FREEZE_APPLIED"); else if (before && !after) recompute("FREEZE_LIFTED");
    forecast(refreshForecastForApi({ workspace, scope: "agent", targetId: agentId }));
    return result;
  } catch (error) { throw driftPostPublicationError(workspace, result, "studio-effects", error); }
}
