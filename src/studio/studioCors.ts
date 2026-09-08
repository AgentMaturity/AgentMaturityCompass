import type { IncomingMessage, ServerResponse } from "node:http";

interface StudioCorsOptions {
  readonly host: string;
  readonly port: number;
  readonly corsAllowedOrigins?: readonly string[];
}

/** Existing Studio CORS transport behavior; native spending has a separate stricter admission gate. */
export function allowStudioCors(req: IncomingMessage, res: ServerResponse, options: StudioCorsOptions): boolean {
  const origin = req.headers.origin;
  if (!origin || typeof origin !== "string") {
    return true;
  }
  const allowed = new Set([`http://${options.host}:${options.port}`, ...(options.corsAllowedOrigins ?? [])]);
  let hostMatches = false;
  try {
    const originUrl = new URL(origin);
    hostMatches = originUrl.host === (req.headers.host ?? "");
  } catch {
    hostMatches = false;
  }
  if (!hostMatches && !allowed.has(origin)) {
    res.statusCode = 403;
    res.end("CORS origin denied");
    return false;
  }
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Headers", "content-type, x-amc-admin-token, x-amc-agent-token, authorization, x-amc-lease");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  if ((req.method ?? "GET").toUpperCase() === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return false;
  }
  return true;
}
