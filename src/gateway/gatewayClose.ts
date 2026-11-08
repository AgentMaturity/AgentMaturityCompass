/**
 * The gateway's close fence (the runtime order's D-R2, moved to the integrity lane by the coordinator). Once close()
 * starts, a new request is answered 503 before any ledger write; in-flight requests get up to `drainMs`, then their
 * upstream calls are aborted (`signal`) and every socket is destroyed; then the session seals (GatewaySession.close drops
 * any later append), and the ledger and credentials close. Bounded by about drainMs + settleMs.
 */
import type { Server, ServerResponse } from "node:http";

const DRAIN_MS = 3_000;
const SETTLE_MS = 1_000;

export interface CloseFence {
  /** Aborted when the drain window ends; every upstream request carries it. */
  readonly signal: AbortSignal;
  /** First call in a request handler: false once closing (503 sent, nothing else to do), else counts it until its response closes. */
  admit(res: ServerResponse): boolean;
  /** Idempotent: every caller gets the same bounded close. */
  close(parts: { servers: ReadonlyArray<Server | null>; session: { close(): void }; ledger: { close(): void };
    credentials: { close(): Promise<void> } }): Promise<void>;
}

function within(promise: Promise<unknown>, ms: number): Promise<void> {
  let timer: NodeJS.Timeout | undefined;
  return Promise.race([promise, new Promise<void>((resolve) => { timer = setTimeout(resolve, ms); })])
    .then(() => clearTimeout(timer));
}

export function createCloseFence(options: { drainMs?: number; settleMs?: number } = {}): CloseFence {
  const controller = new AbortController();
  let closing: Promise<void> | null = null;
  let inFlight = 0;
  let drained: () => void = () => {};
  return {
    signal: controller.signal,
    admit(res) {
      if (closing) {
        res.statusCode = 503;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ error: "gateway shutting down" }));
        return false;
      }
      inFlight += 1;
      res.once("close", () => { inFlight -= 1; if (inFlight === 0) drained(); });
      return true;
    },
    close({ servers, session, ledger, credentials }) {
      return closing ??= (async () => {
        const listening = servers.filter((server): server is Server => server !== null);
        const stopped = Promise.all(listening.map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
        if (inFlight > 0) await within(new Promise<void>((resolve) => { drained = resolve; }), options.drainMs ?? DRAIN_MS);
        controller.abort(new Error("gateway shutting down"));
        for (const server of listening) server.closeAllConnections();
        await within(stopped, options.settleMs ?? SETTLE_MS);
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
