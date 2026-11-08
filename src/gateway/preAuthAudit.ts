/**
 * Bounded audit rows for unauthenticated gateway refusals (LIVE-RUNTIME-21, D-R13): a client outside the allow list, a
 * request with no valid lease, and the carrier audits of a request no lease vouches for (SR-3). Each used to append a
 * signed row with no limit, so anyone who reached the port could grow the ledger and pollute audit counts.
 *
 * Per client address and audit type, at most `perMinute` such rows per minute (SR-9: one budget per type, so a flood of
 * one type never silences another). Past that the refusal is still answered and counted, and the counts are written as
 * one summary row per audit type (`suppressed: n`) when that client's window rolls over (on its next refusal) or when
 * the gateway closes. Every other audit type is never limited, the kill-switch refusal among them: it comes only after
 * a lease verified, and a verified request's rows are always written.
 */
const WINDOW_MS = 60_000;
const MAX_CLIENTS = 10_000;
const OVERFLOW = "*"; // refusals from clients past MAX_CLIENTS share one window, so the map stays bounded
const LIMITED = new Map<string, PreAuthAuditSummary["severity"]>([["NETWORK_EGRESS_BLOCKED", "HIGH"], ["LEASE_INVALID_OR_MISSING", "HIGH"],
  ["AGENT_PROVIDED_KEY_IGNORED", "MED"], ["LEASE_QUERY_CARRIER_USED", "LOW"]]);

export interface PreAuthAuditSummary {
  auditType: string;
  severity: "HIGH" | "MED" | "LOW"; // the severity of the rows it stands for
  clientIp: string;
  suppressed: number;
  windowStartTs: number;
}

export interface PreAuthAuditLimiter {
  /** True when this refusal gets its own audit row. */
  shouldAudit(clientIp: string, auditType: string): boolean;
  /** Write every pending summary (the gateway calls this before it seals its session). */
  flushAll(): void;
}

interface Window {
  start: number;
  audited: Map<string, number>; // per audit type (SR-9)
  suppressed: Map<string, number>;
}

export function createPreAuthAuditLimiter(options: {
  appendSummary: (row: PreAuthAuditSummary) => void;
  perMinute?: number;
  now?: () => number;
}): PreAuthAuditLimiter {
  const { appendSummary, perMinute = 10, now = Date.now } = options;
  const windows = new Map<string, Window>();
  const flush = (clientIp: string, window: Window): void => {
    for (const [auditType, suppressed] of window.suppressed) {
      appendSummary({ auditType, severity: LIMITED.get(auditType) ?? "HIGH", clientIp, suppressed, windowStartTs: window.start });
    }
  };
  const live = (clientIp: string, at: number): Window | undefined => {
    const window = windows.get(clientIp);
    if (window && at - window.start >= WINDOW_MS) {
      windows.delete(clientIp);
      flush(clientIp, window);
      return undefined;
    }
    return window;
  };
  return {
    shouldAudit(clientIp, auditType) {
      if (!LIMITED.has(auditType)) return true;
      const at = now();
      let key = clientIp;
      let window = live(key, at);
      if (!window && windows.size >= MAX_CLIENTS) {
        for (const ip of [...windows.keys()]) live(ip, at);
        if (windows.size >= MAX_CLIENTS) {
          key = OVERFLOW;
          window = live(key, at);
        }
      }
      if (!window) {
        window = { start: at, audited: new Map(), suppressed: new Map() };
        windows.set(key, window);
      }
      const audited = window.audited.get(auditType) ?? 0;
      if (audited < perMinute) {
        window.audited.set(auditType, audited + 1);
        return true;
      }
      window.suppressed.set(auditType, (window.suppressed.get(auditType) ?? 0) + 1);
      return false;
    },
    flushAll() {
      for (const [clientIp, window] of windows) flush(clientIp, window);
      windows.clear();
    }
  };
}
