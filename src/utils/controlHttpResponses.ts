import type { ServerResponse } from "node:http";

/** Shared wire contract for bridge and workspace control responses. */
export function writeControlJson(res: ServerResponse, status: number, payload: unknown): void {
  res.statusCode = status;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(payload));
}

/** Keep the existing single-field envelope; policy and fallback selection stay with callers. */
export function writeControlError(res: ServerResponse, status: number, error: unknown): void {
  writeControlJson(res, status, { error });
}
