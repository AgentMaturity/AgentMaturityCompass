import { request as httpRequest, type IncomingMessage, type ServerResponse } from "node:http";
import { isNativeProtectedPath } from "../studio/nativeAdmission.js";

/** Native callers must first pass the router's browser proof and current membership checks. */
export async function proxyStudioWorkspaceRequest(
  req: IncomingMessage,
  res: ServerResponse,
  runtime: { readonly host: string; readonly port: number },
  targetPath: string
): Promise<void> {
  const method = (req.method ?? "GET").toUpperCase();
  const { origin, host, "x-amc-admin-token": _clientAdminToken, ...forwardHeaders } = req.headers;
  const targetPathname = new URL(targetPath, "http://workspace.internal").pathname;
  const nativeRequest = isNativeProtectedPath(targetPathname, method);
  let upstreamResponse: IncomingMessage | undefined;
  const fail = (): void => {
    if (res.destroyed || res.writableEnded) return;
    if (res.headersSent) { res.destroy(); return; }
    res.statusCode = 502;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ error: "workspace proxy failure" }));
  };
  const upstream = httpRequest({
    host: runtime.host,
    port: runtime.port,
    method,
    path: targetPath,
    headers: {
      ...forwardHeaders,
      // Preserve validated actual browser headers, never a caller-supplied proxy assertion.
      host: nativeRequest ? host : `${runtime.host}:${runtime.port}`,
      ...(nativeRequest && origin !== undefined ? { origin } : {})
    }
  }, upstreamRes => {
    upstreamResponse = upstreamRes;
    upstreamRes.on("error", fail);
    if (nativeRequest && res.destroyed) { upstreamRes.destroy(); return; }
    res.statusCode = upstreamRes.statusCode ?? 500;
    for (const [key, value] of Object.entries(upstreamRes.headers)) {
      if (value === undefined) continue;
      if (key.toLowerCase() === "service-worker-allowed" && targetPath === "/console/assets/sw.js") {
        const originalPath = new URL(req.url ?? "/", "http://localhost").pathname;
        const suffix = "/assets/sw.js";
        res.setHeader(key, originalPath.endsWith(suffix) ? `${originalPath.slice(0, -suffix.length)}/` : value);
      } else res.setHeader(key, value);
    }
    upstreamRes.pipe(res);
  });
  if (nativeRequest) {
    const onClose = (): void => {
      if (!res.writableFinished) {
        upstream.destroy();
        upstreamResponse?.destroy();
      }
    };
    res.once("close", onClose);
    res.once("finish", () => res.removeListener("close", onClose));
  }
  upstream.on("error", fail);
  req.pipe(upstream);
}
