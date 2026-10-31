import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { ResultSchema, type ClientRequest } from "@modelcontextprotocol/sdk/types.js";

/**
 * Resource update subscriptions on a pinned stdio mount, each with an
 * AMC-chosen lifetime `ttlMs` (bounded below). 2026-07-28 opens one
 * `subscriptions/listen` stream per subscription (basic/patterns/subscriptions)
 * and correlates by its request id; the legacy era uses `resources/subscribe`
 * and `resources/unsubscribe` per URI. At expiry or close the stream is
 * cancelled (or every URI unsubscribed), its timer cleared and its handler
 * dropped. After a stdio restart every live subscription is re-opened for its
 * remaining lifetime, because the server holds no subscription state across a
 * reconnection (basic/transports/stdio §Unexpected Termination).
 */
const NATIVE_MCP_SUBSCRIPTION_LIMITS = Object.freeze({ minTtlMs: 1_000, maxTtlMs: 3_600_000, uris: 32, active: 8 });

export interface NativeMcpSubscriptionOptions {
  /** Each must be a resource or template match of the pinned catalog. */
  readonly uris: readonly string[];
  readonly ttlMs: number;
  /** Called with a subscribed URI the server reports changed; never with server text. */
  readonly onUpdated: (uri: string) => void;
}

export interface NativeMcpSubscription {
  /** The URIs the server acknowledged (2026-07-28) or accepted (legacy). */
  readonly uris: readonly string[];
  readonly expiresAt: number;
  readonly active: boolean;
  close(): Promise<void>;
}

export interface NativeMcpSubscriptionConnection {
  readonly client: Client;
  readonly mode: "stateless" | "legacy";
  readonly timeout: number;
  readonly params: (params: Record<string, unknown>) => Record<string, unknown>;
}

const SUBSCRIPTION_ID = "io.modelcontextprotocol/subscriptionId";
const rpc = (method: string, params: Record<string, unknown>) => ({ method, params }) as unknown as ClientRequest;

interface Live {
  readonly requested: readonly string[];
  readonly expiresAt: number;
  readonly onUpdated: (uri: string) => void;
  uris: readonly string[];
  /** The JSON-RPC id of the open subscriptions/listen request; null for legacy or while reopening. */
  listenId: number | null;
  stop?: () => void;
  acknowledged?: (uris: readonly string[]) => void;
  timer?: NodeJS.Timeout;
  active: boolean;
}

/** The SDK assigns request ids from this counter; the listen id is the subscription id the server echoes. */
function nextRequestId(client: Client): number {
  const id = (client as unknown as { _requestMessageId?: unknown })._requestMessageId;
  if (typeof id !== "number" || !Number.isSafeInteger(id)) throw new Error("MCP subscription id cannot be determined; no subscription was opened");
  return id;
}

export class NativeMcpSubscriptions {
  private readonly live = new Set<Live>();
  constructor(private readonly connection: () => NativeMcpSubscriptionConnection) {}

  get size(): number { return this.live.size; }

  async subscribe(options: NativeMcpSubscriptionOptions, admit: (uri: string) => boolean): Promise<NativeMcpSubscription> {
    const { ttlMs } = options;
    if (!Number.isSafeInteger(ttlMs) || ttlMs < NATIVE_MCP_SUBSCRIPTION_LIMITS.minTtlMs || ttlMs > NATIVE_MCP_SUBSCRIPTION_LIMITS.maxTtlMs) {
      throw new Error("MCP subscription ttlMs must be an integer from 1000 through 3600000");
    }
    const uris = [...new Set(options.uris)];
    if (!uris.length || uris.length > NATIVE_MCP_SUBSCRIPTION_LIMITS.uris || !uris.every(uri => typeof uri === "string" && admit(uri))) {
      throw new Error("MCP subscription names no, too many or unreviewed resource URIs");
    }
    if (this.live.size >= NATIVE_MCP_SUBSCRIPTION_LIMITS.active) throw new Error("MCP subscription limit reached for this mount");
    const entry: Live = { requested: uris, uris, expiresAt: Date.now() + ttlMs, onUpdated: options.onUpdated, listenId: null, active: true };
    this.live.add(entry);
    try { await this.open(entry); }
    catch (error) { this.end(entry); throw error; }
    return { get uris() { return entry.uris; }, expiresAt: entry.expiresAt, get active() { return entry.active; }, close: () => this.close(entry) };
  }

  /** Re-opens every live subscription on a fresh connection; one that cannot be re-opened ends. */
  async reopenAll(): Promise<void> {
    for (const entry of [...this.live]) {
      entry.stop = undefined; entry.listenId = null;
      if (entry.timer) clearTimeout(entry.timer);
      try { await this.open(entry); } catch { this.end(entry); }
    }
  }

  /** The connection died and a restart follows: keep every subscription, detached from its dead stream. */
  suspend(): void { for (const entry of this.live) { entry.listenId = null; entry.stop = undefined; } }

  /** Ends every subscription locally; the connection is going away. */
  closeAll(): void { for (const entry of [...this.live]) { entry.stop?.(); this.end(entry); } }

  /** Routes one server notification; returns whether it belonged to a subscription. */
  notify(notification: { readonly method: string; readonly params?: Record<string, unknown> }): boolean {
    const params = (notification.params ?? {}) as Record<string, unknown>;
    const meta = params._meta as Record<string, unknown> | undefined;
    const id = meta?.[SUBSCRIPTION_ID];
    if (notification.method === "notifications/subscriptions/acknowledged") {
      const entry = [...this.live].find(item => item.listenId !== null && item.listenId === id);
      const acked = (params.notifications as Record<string, unknown> | undefined)?.resourceSubscriptions;
      entry?.acknowledged?.(Array.isArray(acked) ? acked.filter((uri): uri is string => typeof uri === "string") : []);
      return entry !== undefined;
    }
    if (notification.method !== "notifications/resources/updated" || typeof params.uri !== "string") return false;
    const uri = params.uri;
    const targets = [...this.live].filter(entry => entry.active && entry.acknowledged === undefined && entry.uris.includes(uri)
      && (this.connection().mode === "legacy" || (entry.listenId !== null && entry.listenId === id)));
    for (const entry of targets) { try { entry.onUpdated(uri); } catch { /* A consumer failure does not end the subscription. */ } }
    return targets.length > 0;
  }

  private async open(entry: Live): Promise<void> {
    const remaining = entry.expiresAt - Date.now();
    if (remaining <= 0) { this.end(entry); return; }
    const { client, mode, timeout, params } = this.connection();
    if (mode === "legacy") {
      const accepted: string[] = [];
      try {
        for (const uri of entry.requested) { await client.request(rpc("resources/subscribe", { uri }), ResultSchema, { timeout }); accepted.push(uri); }
      } catch (error) { await this.unsubscribe(accepted); throw error; }
      entry.uris = accepted;
      entry.stop = () => { void this.unsubscribe(accepted); };
    } else {
      const controller = new AbortController();
      const listenId = nextRequestId(client);
      const acknowledged = new Promise<readonly string[]>((resolve, reject) => {
        entry.acknowledged = resolve;
        // Expiry aborts the request (one notifications/cancelled); the SDK timeout is only a backstop past it.
        client.request(rpc("subscriptions/listen", params({ notifications: { resourceSubscriptions: [...entry.requested] } })), ResultSchema,
          { timeout: remaining + 1_000, signal: controller.signal })
          .then(() => reject(new Error("MCP subscription ended before it was acknowledged")),
            () => reject(new Error("MCP subscription was refused, cancelled or expired")))
          .finally(() => { if (entry.listenId === listenId) this.end(entry); });
      });
      entry.listenId = listenId;
      entry.stop = () => controller.abort();
      const ackTimer = setTimeout(() => controller.abort(), Math.min(timeout, remaining));
      try { entry.uris = (await acknowledged).filter(uri => entry.requested.includes(uri)); }
      catch (error) { controller.abort(); throw error; }
      finally { clearTimeout(ackTimer); entry.acknowledged = undefined; }
      if (!entry.uris.length) { controller.abort(); throw new Error("MCP server acknowledged none of the requested resource subscriptions"); }
    }
    entry.timer = setTimeout(() => { void this.close(entry); }, remaining);
    entry.timer.unref();
  }

  private async unsubscribe(uris: readonly string[]): Promise<void> {
    const { client, timeout } = this.connection();
    await Promise.allSettled(uris.map(uri => client.request(rpc("resources/unsubscribe", { uri }), ResultSchema, { timeout })));
  }

  private async close(entry: Live): Promise<void> {
    if (!entry.active) return;
    entry.stop?.();
    this.end(entry);
  }

  private end(entry: Live): void {
    entry.active = false;
    entry.listenId = null;
    if (entry.timer) clearTimeout(entry.timer);
    entry.timer = undefined; entry.stop = undefined; entry.acknowledged = undefined;
    this.live.delete(entry);
  }
}
