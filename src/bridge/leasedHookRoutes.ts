/**
 * Bridge routes that authenticate with a hook lease and answer on their own: the ACS guardian (P2-19), the Codex
 * observation route (P2-17) and the session observation route (Watch). bridgeServer.ts dispatches every path listed here.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import { ACS_GUARDIAN_PATH, handleAcsGuardianHttp } from "../standards/acs/acsGuardianHttp.js";
import { CODEX_OBSERVE_PATH, handleCodexObserveHttp } from "./codexObserveHttp.js";
import { handleSessionHookHttp, SESSION_HOOK_PATH } from "./sessionObservations.js";

type LeasedRoute = (options: { workspace: string; req: IncomingMessage; res: ServerResponse; url: URL }) => Promise<true>;

const LEASED_HOOK_ROUTES: ReadonlyMap<string, LeasedRoute> = new Map<string, LeasedRoute>([
  [ACS_GUARDIAN_PATH, handleAcsGuardianHttp],
  [CODEX_OBSERVE_PATH, handleCodexObserveHttp],
  [SESSION_HOOK_PATH, handleSessionHookHttp],
]);

/** The paths this module answers. */
export const isLeasedHookPath = (pathname: string): boolean => LEASED_HOOK_ROUTES.has(pathname);

/** Answer a request on one of those paths. */
export function handleLeasedHookRoute(options: Parameters<LeasedRoute>[0] & { pathname: string }): Promise<true> {
  return LEASED_HOOK_ROUTES.get(options.pathname)!(options);
}
