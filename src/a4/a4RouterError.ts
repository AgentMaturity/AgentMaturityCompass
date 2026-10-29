/**
 * How every A4 route error is answered (split from a4Router.ts for the line cap). An integrity failure never carries the
 * store's problem list: that list reaches only `GET …/verify`.
 */
import type { ServerResponse } from "node:http";
import { ZodError } from "zod";
import { apiError, isRequestBodyError } from "../api/apiHelpers.js";
import { EgressBlocked, isEgressRefusal } from "../residency/checkEgress.js";
import { A4BlobError } from "./a4Blobs.js";
import { A4TransitionPublicationError } from "./a4TransitionSigning.js";
import { A4StoreError } from "./a4Store.js";

export const A4_API_PREFIX = "/api/v1/a4";

/**
 * Every A4 integrity failure's detail (design §17: the project reads BLOCKED). The problems name failed rows, member
 * principal keys included, and are answered before membership is decided, so they reach only `GET …/verify`.
 */
const A4_INTEGRITY_VERDICT = { status: "BLOCKED", reasonCodes: ["A4_INTEGRITY_FAILED"] } as const;
/** A stored row or record that does not parse; its parse issue can quote the stored value, so it is never answered. */
export const A4_UNPARSED_RECORD = "A stored A4 record does not parse.";

/** Every A4 route error as the API answers it; an egress refusal (nothing was sent) is a definite 403 by name, never A4_INTERNAL. */
export function sendA4Error(res: ServerResponse, error: unknown, projectId: string | null): void {
  if (isRequestBodyError(error)) return apiError(res, error.statusCode, error.message);
  const send = (status: number, code: string, message: string, extra: Record<string, unknown> = {}): void => {
    if (res.headersSent) return;
    const detail = code === "A4_INTEGRITY_FAILED" ? { detail: A4_INTEGRITY_VERDICT } : extra;
    res.writeHead(status, { "Content-Type": "application/json", "cache-control": "no-store" });
    res.end(JSON.stringify({ ok: false, error: message, code, ...detail }));
  };
  // Client input is parsed through parseInput (400); a ZodError here is a stored row or record that does not parse.
  if (error instanceof ZodError) return send(409, "A4_INTEGRITY_FAILED", A4_UNPARSED_RECORD);
  if (isEgressRefusal(error)) return send(403, error instanceof EgressBlocked ? "AMC_RESIDENCY_EGRESS_BLOCKED" : error.code, error.message);
  if (error instanceof A4TransitionPublicationError) return send(error.status, error.code, error.message, { detail: error.detail });
  if (error instanceof A4StoreError) {
    const stale = error.code === "A4_STALE_HEAD" && projectId !== null
      ? { head: error.detail ?? null, diff: `${A4_API_PREFIX}/projects/${projectId}/transitions` } : {};
    return send(error.status, error.code, error.message, { ...(error.detail === undefined ? {} : { detail: error.detail }), ...stale });
  }
  if (error instanceof A4BlobError) {
    return send(error.code === "VAULT_LOCKED" ? 423 : error.code === "SECRET_SCAN_REFUSED" ? 400 : 409, error.code, error.message);
  }
  const text = error instanceof Error ? error.message : String(error);
  const tagged = error as { status?: unknown; code?: unknown };
  if (typeof tagged.status === "number" && typeof tagged.code === "string") return send(tagged.status, tagged.code, text);
  if (/blocked in agent mode/.test(text)) return send(403, "AGENT_MODE", text);
  if (/vault locked/i.test(text)) return send(423, "A4_VAULT_LOCKED", "Unlock the vault to record this.");
  send(500, "A4_INTERNAL", "The A4 request could not be completed; reload the project before retrying.");
}
