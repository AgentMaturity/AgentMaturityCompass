/** Internal existing Studio endpoint handoff; no new route or root SDK authority channel. */
import { activeFreezeStatus } from "./freezeEngine.js";
import { driftCheckCliForAuthority } from "./driftCli.js";
import { driftPostPublicationError } from "./driftDetector.js";
import { refreshForecastForAuthority } from "../forecast/forecastApi.js";
export async function driftCheckForStudio(params: { workspace: string; agentId: string; against: "previous"; beforePublish(): void;
  recompute(type: "INCIDENT_CREATED" | "FREEZE_APPLIED" | "FREEZE_LIFTED"): void | Promise<void>;
  forecast(value: Awaited<ReturnType<typeof refreshForecastForAuthority>>): void }) {
  const { workspace, agentId, against, beforePublish, recompute, forecast } = params;
  const before = activeFreezeStatus(workspace, agentId).active;
  const result = await driftCheckCliForAuthority({ workspace, agentId, against }, beforePublish);
  try {
    beforePublish();
    const after = activeFreezeStatus(workspace, agentId).active;
    if (result.triggered) {
      const incidentWork = recompute("INCIDENT_CREATED");
      if (incidentWork !== undefined) await incidentWork;
    }
    const freezeWork = !before && after ? recompute("FREEZE_APPLIED")
      : before && !after ? recompute("FREEZE_LIFTED") : undefined;
    if (freezeWork !== undefined) await freezeWork;
    forecast(await refreshForecastForAuthority({ workspace, scope: "agent", targetId: agentId }, beforePublish));
    return result;
  } catch (error) { throw driftPostPublicationError(workspace, result, "studio-effects", error); }
}
