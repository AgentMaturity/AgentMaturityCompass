import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { URL } from "node:url";
import { checkScopedEgress, EgressBlocked } from "../../residency/checkEgress.js";
import { DefiniteFailureError } from "../../tools/toolTypes.js";

const HTTP_FETCH_IDLE_TIMEOUT_MS = 30_000;
const HTTP_FETCH_TOTAL_TIMEOUT_MS = 60_000;

function withIdempotencyKey(headers: Record<string, string> | undefined, idempotency?: { header: string; key: string }): Record<string, string> | undefined {
  if (idempotency === undefined) return headers;
  const name = idempotency.header.toLowerCase();
  return { ...Object.fromEntries(Object.entries(headers ?? {}).filter(([key]) => key.toLowerCase() !== name)), [idempotency.header]: idempotency.key };
}

export async function executeHttpFetch(params: {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  simulate: boolean;
  /** Trusted service/call workspace, never read from agent-supplied tool arguments. */
  workspace?: string;
  dataClasses?: readonly string[] | null;
  purpose?: string | null;
  /** AMC's idempotency key (P1-04) on the header the signed tool definition declares; it replaces any value passed. */
  idempotency?: { header: string; key: string };
}): Promise<{ status: number; headers: Record<string, string>; body: string }> {
  if (params.simulate) {
    return {
      status: 200,
      headers: {},
      body: `SIMULATE http.fetch ${params.method ?? "GET"} ${params.url}`
    };
  }

  try { checkScopedEgress(params.workspace, "network-tool", params.url, { dataClasses: params.dataClasses, purpose: params.purpose }); }
  catch (error) {
    if (error instanceof EgressBlocked) throw new DefiniteFailureError(error.message, { cause: error });
    throw error;
  }
  const url = new URL(params.url);
  const reqImpl = url.protocol === "https:" ? httpsRequest : httpRequest;
  const response = await new Promise<{ status: number; headers: Record<string, string>; body: string }>((resolvePromise, rejectPromise) => {
    let settled = false;
    let deadline: ReturnType<typeof setTimeout> | undefined;
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      rejectPromise(error);
      req.destroy();
    };
    const incomplete = () => fail(Object.assign(new Error("http.fetch response incomplete"), { code: "ECONNRESET" }));
    const timeout = () => fail(Object.assign(new Error("http.fetch timed out"), { code: "ETIMEDOUT" }));
    const req = reqImpl(
      url,
      {
        method: params.method ?? "GET",
        headers: withIdempotencyKey(params.headers, params.idempotency)
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("error", fail);
        res.on("aborted", incomplete);
        res.on("close", () => { if (!res.complete) incomplete(); });
        res.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
        res.on("end", () => {
          if (settled) return;
          if (!res.complete) { incomplete(); return; }
          const headers: Record<string, string> = {};
          for (const [key, value] of Object.entries(res.headers)) {
            if (typeof value === "undefined") {
              continue;
            }
            headers[key] = Array.isArray(value) ? value.join(",") : value;
          }
          settled = true;
          clearTimeout(deadline);
          req.setTimeout(0);
          resolvePromise({
            status: res.statusCode ?? 0,
            headers,
            body: Buffer.concat(chunks).toString("utf8")
          });
        });
      }
    );
    req.on("error", fail);
    req.setTimeout(HTTP_FETCH_IDLE_TIMEOUT_MS, timeout);
    deadline = setTimeout(timeout, HTTP_FETCH_TOTAL_TIMEOUT_MS);
    if (params.body) {
      req.write(params.body);
    }
    req.end();
  });

  return response;
}
