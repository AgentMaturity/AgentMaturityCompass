import type { IncomingMessage, ServerResponse } from "node:http";
import { apiError, apiSuccess } from "./apiHelpers.js";
import { buildFleetHealthDashboard } from "../fleet/governance.js";

export async function handleFleetRoute(
  pathname: string,
  method: string,
  _req: IncomingMessage,
  res: ServerResponse,
  workspace = process.cwd()
): Promise<boolean> {
  if (pathname === "/api/v1/fleet/health") {
    if (method !== "GET") {
      apiError(res, 405, `Method ${method} not allowed, expected GET`);
      return true;
    }
    const health = buildFleetHealthDashboard({ workspace });
    apiSuccess(res, health);
    return true;
  }
  return false;
}

