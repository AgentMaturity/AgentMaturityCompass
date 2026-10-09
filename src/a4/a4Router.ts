/**
 * The /api/v1/a4 router entry (P1-57; design §5.1, §12.1). The refusals run once, here, before any dispatch: 401
 * without native Studio admission, 403 DEMO_REFUSED for the demo session on every method, 404 A4_PREVIEW_DISABLED
 * unless the process runs with AMC_A4_PREVIEW=1 (D-20: no signed config carries a features section, so the v1 gate is
 * the variable alone), then the live principal (the admin token reads only; NATIVE_READ_ONLY on mutations; the route's
 * role class re-run on live roles). P1-57 slice B adds the routes behind this entry; until then an admitted request
 * answers 404 A4_ROUTE_NOT_FOUND.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import type { NativeTaskApiContext } from "../api/nativeTasksRouter.js";
import { resolveA4Principal } from "./a4Identity.js";

/** The A4 preview gate (D-20): every A4 route and page stays absent unless the operator set AMC_A4_PREVIEW=1. */
export function a4PreviewEnabled(): boolean {
  return process.env.AMC_A4_PREVIEW === "1";
}

function refuse(res: ServerResponse, status: number, code: string, message: string): true {
  res.writeHead(status, { "Content-Type": "application/json", "cache-control": "no-store" });
  res.end(JSON.stringify({ ok: false, error: message, code }));
  return true;
}

export async function handleA4Route(pathname: string, method: string, _req: IncomingMessage, res: ServerResponse,
  context: { workspace: string; nativeTasks?: NativeTaskApiContext }): Promise<boolean> {
  if (pathname !== "/api/v1/a4" && !pathname.startsWith("/api/v1/a4/")) return false;
  const nativeTasks = context.nativeTasks;
  if (!nativeTasks) return refuse(res, 401, "A4_AUTH_REQUIRED", "A4 routes are served only through authenticated Studio sessions.");
  if (nativeTasks.demo) return refuse(res, 403, "DEMO_REFUSED", "The demo session cannot reach A4 projects.");
  if (!a4PreviewEnabled()) return refuse(res, 404, "A4_PREVIEW_DISABLED", "A4 Forge is not enabled in this workspace.");
  const resolved = resolveA4Principal({ workspace: context.workspace, nativeTasks, pathname, method });
  if (!resolved.ok) return refuse(res, resolved.status, resolved.code, resolved.message);
  return refuse(res, 404, "A4_ROUTE_NOT_FOUND", "No A4 route matches this path.");
}
