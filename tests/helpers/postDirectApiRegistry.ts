import { createServer } from "node:http";
import { handleApiRoute } from "../../src/api/index.js";

/** Actual internal registry caller: deliberately supplies no trusted authority callback. */
export async function postDirectApiRegistry(workspace: string, pathname: string, body: unknown) {
  let dispatch: Promise<void> | undefined;
  const server = createServer((req, res) => {
    const path = new URL(req.url ?? "/", "http://127.0.0.1").pathname;
    dispatch = handleApiRoute(path, req.method ?? "GET", req, res, workspace).then(handled => {
      if (!handled) { res.writeHead(404); res.end(); }
    });
    void dispatch.catch(error => res.destroy(error instanceof Error ? error : undefined));
  });
  try {
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => { server.off("error", reject); resolve(); });
    });
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("owned registry server did not bind TCP");
    const response = await fetch(`http://127.0.0.1:${address.port}${pathname}`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(10_000)
    });
    return { status: response.status, body: await response.text() };
  } finally {
    server.closeAllConnections();
    if (server.listening) await new Promise<void>(resolve => server.close(() => resolve()));
    await dispatch;
  }
}
