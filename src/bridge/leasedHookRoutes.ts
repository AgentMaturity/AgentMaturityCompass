/**
 * Bridge routes that authenticate with a hook lease and answer on their own: the ACS guardian (P2-19) and the Codex
 * observation route (P2-17). bridgeServer.ts dispatches every path listed here.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import { ACS_GUARDIAN_PATH, handleAcsGuardianHttp } from "../standards/acs/acsGuardianHttp.js";
import { CODEX_OBSERVE_PATH, handleCodexObserveHttp } from "./codexObserveHttp.js";

type LeasedRoute = (options: { workspace: string; req: IncomingMessage; res: ServerResponse; url: URL }) => Promise<true>;

const LEASED_HOOK_ROUTES: ReadonlyMap<string, LeasedRoute> = new Map<string, LeasedRoute>([
  [ACS_GUARDIAN_PATH, handleAcsGuardianHttp],
  [CODEX_OBSERVE_PATH, handleCodexObserveHttp],
]);

/** The paths this module answers. */
export const isLeasedHookPath = (pathname: string): boolean => LEASED_HOOK_ROUTES.has(pathname);

/** Answer a request on one of those paths. */
export function handleLeasedHookRoute(options: Parameters<LeasedRoute>[0] & { pathname: string }): Promise<true> {
  return LEASED_HOOK_ROUTES.get(options.pathname)!(options);
}
