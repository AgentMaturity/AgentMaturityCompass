/** Calls one API route handler in process with a JSON body; returns the status and the parsed response body. */
import type { IncomingMessage, ServerResponse } from "node:http";
import { Readable } from "node:stream";

export type RouteHandler = (pathname: string, method: string, req: IncomingMessage, res: ServerResponse, workspace?: string) => Promise<boolean>;

export async function postRoute(handler: RouteHandler, pathname: string, body: unknown, workspace?: string):
  Promise<{ handled: boolean; status: number; body: { ok: boolean; error?: string; data?: Record<string, unknown> } }> {
  const req = Object.assign(Readable.from([Buffer.from(JSON.stringify(body))]), { method: "POST", url: pathname,
    headers: { "content-type": "application/json" } }) as unknown as IncomingMessage;
  let status = 0; let text = "";
  const res = { headersSent: false, writeHead(code: number) { status = code; this.headersSent = true; return this; }, setHeader() {},
    end(value?: unknown) { text = String(value ?? ""); } } as unknown as ServerResponse;
  const handled = await handler(pathname, "POST", req, res, workspace);
  return { handled, status, body: JSON.parse(text) };
}
