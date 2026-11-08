import type { Server } from "node:http";

/**
 * Server timeouts for Studio, the host router, the gateway and the hosted API (LIVE-RUNTIME-12, D-R9). Node's 5 s
 * keep-alive is below a reverse proxy's upstream idle timeout, so the proxy reuses a socket Node just closed and a POST
 * comes back 502; keep-alive is 65 s and the header timeout must exceed it. Keep the proxy's idle timeout below 65 s.
 */
export function applyServerTimeouts(server: Server, options: { requestTimeout?: number } = {}): void {
  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 70_000;
  if (options.requestTimeout !== undefined) server.requestTimeout = options.requestTimeout;
}

/** Applies those timeouts and listens; resolves once bound, rejects on a listen error (a busy port). Studio and the host router. */
export function listenWithTimeouts(server: Server, port: number, host: string, options: { requestTimeout?: number } = {}): Promise<void> {
  applyServerTimeouts(server, options);
  return new Promise<void>((resolvePromise, rejectPromise) => {
    server.once("error", rejectPromise);
    server.listen(port, host, () => resolvePromise());
  });
}
