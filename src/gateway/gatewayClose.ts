/**
 * The gateway's close fence (the runtime order's D-R2, moved to the integrity lane by the coordinator). Once close()
 * starts, a new request or proxy CONNECT is answered 503 before any ledger write; in-flight requests and open CONNECT
 * tunnels get up to `drainMs`, then upstream calls are aborted (`signal`), every tunnel and every HTTP connection is
 * destroyed (a tunnel's own close handler writes its row then), and the session seals (GatewaySession.close drops any
 * later append); then the ledger and credentials close. Bounded by about drainMs + settleMs.
 */
import type { Server, ServerResponse } from "node:http";
import type { Duplex } from "node:stream";

const DRAIN_MS = 3_000;
const SETTLE_MS = 1_000;

export interface CloseFence {
  /** Aborted when the drain window ends; every upstream request carries it. */
  readonly signal: AbortSignal;
  /** First call in a request handler: false once closing (503 sent, nothing else to do), else counts it until its response closes. */
  admit(res: ServerResponse): boolean;
  /** First call in the proxy's CONNECT handler, the same for a tunnel: counted until its client socket closes, destroyed when the drain ends. */
  admitTunnel(socket: Duplex): boolean;
  /** Idempotent: every caller gets the same bounded close. */
  close(parts: { servers: ReadonlyArray<Server | null>; session: { close(): void }; ledger: { close(): void };
    credentials: { close(): Promise<void> } }): Promise<void>;
}

function within(promise: Promise<unknown>, ms: number): Promise<void> {
  let timer: NodeJS.Timeout | undefined;
  return Promise.race([promise, new Promise<void>((resolve) => { timer = setTimeout(resolve, ms); })])
    .then(() => clearTimeout(timer));
}

const SHUTTING_DOWN = JSON.stringify({ error: "gateway shutting down" });

export function createCloseFence(options: { drainMs?: number; settleMs?: number } = {}): CloseFence {
  const controller = new AbortController();
  let closing: Promise<void> | null = null;
  let inFlight = 0;
  let drained: () => void = () => {};
  const tunnels = new Set<Duplex>();
  const hold = (until: ServerResponse | Duplex): void => {
    inFlight += 1;
    until.once("close", () => { inFlight -= 1; if (inFlight === 0) drained(); });
  };
  return {
    signal: controller.signal,
    admit(res) {
      if (closing) {
        res.statusCode = 503;
        res.setHeader("content-type", "application/json");
        res.end(SHUTTING_DOWN);
        return false;
      }
      hold(res);
      return true;
    },
    admitTunnel(socket) {
      if (closing) {
        socket.end(`HTTP/1.1 503 Service Unavailable\r\nContent-Type: application/json\r\nConnection: close\r\nContent-Length: ${Buffer.byteLength(SHUTTING_DOWN)}\r\n\r\n${SHUTTING_DOWN}`,
          () => socket.destroy());
        return false;
      }
      tunnels.add(socket);
      socket.once("close", () => tunnels.delete(socket));
      hold(socket);
      return true;
    },
    close({ servers, session, ledger, credentials }) {
      return closing ??= (async () => {
        const listening = servers.filter((server): server is Server => server !== null);
        const stopped = Promise.all(listening.map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
        const settled = () => inFlight === 0 ? Promise.resolve() : new Promise<void>((resolve) => { drained = resolve; });
        if (inFlight > 0) await within(settled(), options.drainMs ?? DRAIN_MS);
        controller.abort(new Error("gateway shutting down"));
        for (const tunnel of tunnels) tunnel.destroy(); // a CONNECT socket left the HTTP server: closeAllConnections() skips it
        for (const server of listening) server.closeAllConnections();
        // A destroyed socket leaves its server's count before its own "close", where a tunnel writes its row: await both.
        await within(Promise.all([stopped, settled()]), options.settleMs ?? SETTLE_MS);
        try {
          session.close();
        } finally {
          ledger.close();
          await credentials.close();
        }
      })();
    }
  };
}
