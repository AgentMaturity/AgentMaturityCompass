import type { IncomingMessage, ServerResponse } from "node:http";
import { Readable } from "node:stream";

type RouteHandler = (pathname: string, method: string, req: IncomingMessage, res: ServerResponse, workspace: string) => Promise<boolean>;

/** One request through an API router as the dispatcher calls it, with the response captured (status, headers, body, JSON). */
export async function callRoute(handler: RouteHandler, workspace: string, method: string, url: string, body?: unknown) {
  const payload = body === undefined ? "" : JSON.stringify(body);
  const req = Readable.from(payload ? [Buffer.from(payload)] : []) as unknown as IncomingMessage;
  Object.assign(req, { method, url, headers: {} });
  const state = { status: 0, headers: {} as Record<string, string>, body: "" };
  const res = { headersSent: false, setHeader: (name: string, value: string) => { state.headers[name] = value; },
    writeHead(status: number, headers?: Record<string, string>) { state.status = status; Object.assign(state.headers, headers ?? {}); return res; },
    end(chunk?: string | Buffer) { if (chunk !== undefined) state.body += chunk.toString(); } } as unknown as ServerResponse;
  const handled = await handler(url.split("?")[0]!, method, req, res, workspace);
  let json: { ok: boolean; data?: any; error?: string } | undefined;
  try { json = JSON.parse(state.body); } catch { json = undefined; }
  return { handled, ...state, json };
}
