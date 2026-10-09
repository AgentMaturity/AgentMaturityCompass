/**
 * The A4 release routes' dispatch seam (P1-57 stub; design §12.1, §14). Activate (P1-62) fills it: releases, deployment
 * plans, deployment receipts, the owner-only verify and rollback. Until then every `…/releases` path answers 404
 * A4_ROUTE_NOT_FOUND from the router; nothing here reads or writes.
 */
import type { A4Route } from "./a4Router.js";

export async function handleA4ReleaseRoute(_route: A4Route, _projectId: string, _tail: string): Promise<boolean> {
  return false;
}
