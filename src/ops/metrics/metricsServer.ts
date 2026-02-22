import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { renderPrometheusMetrics } from "./metricsRegistry.js";
import { appendOpsAuditEvent } from "../audit.js";
import { recordMetricsEndpointDeniedMetric, recordMetricsEndpointRequestMetric } from "./metricsMiddleware.js";

export interface MetricsServerOptions {
  workspace: string;
  host: string;
  port: number;
  allowRemote?: boolean;
  allowedCidrs?: string[];
}

export interface MetricsServerHandle {
  host: string;
  port: number;
  close: () => Promise<void>;
}

interface MetricsAuditEvent {
  auditType: string;
  severity?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  payload?: Record<string, unknown>;
}

interface MetricsRequestHandlerOptions {
  workspace: string;
  allowRemote: boolean;
  allowedCidrs: string[];
  now?: () => number;
  appendAudit?: (event: MetricsAuditEvent) => void;
}

const CONTROL_CHARS_RE = /[\u0000-\u001f\u007f]/g;
const DENIED_AUDIT_MIN_INTERVAL_MS = 30_000;

function sanitizeLogField(value: string | undefined, maxLength = 180): string {
  const normalized = (value ?? "").replace(CONTROL_CHARS_RE, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength)}...`;
}

function endpointFromUrl(rawUrl: string | undefined): "/metrics" | "/health" | "/unknown" {
  const path = (rawUrl ?? "/").split("?")[0] ?? "/";
  if (path === "/metrics") return "/metrics";
  if (path === "/health") return "/health";
  return "/unknown";
}

function normalizeIp(remote: string | undefined): string {
  if (!remote || remote.length === 0) {
    return "127.0.0.1";
  }
  if (remote.startsWith("::ffff:")) {
    return remote.slice("::ffff:".length);
  }
  return remote;
}

function isLocal(ip: string): boolean {
  return ip === "127.0.0.1" || ip === "::1";
}

function ipToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) {
    return null;
  }
  const nums = parts.map((part) => Number(part));
  if (nums.some((row) => !Number.isInteger(row) || row < 0 || row > 255)) {
    return null;
  }
  return ((nums[0] ?? 0) << 24) + ((nums[1] ?? 0) << 16) + ((nums[2] ?? 0) << 8) + (nums[3] ?? 0);
}

function parseCidr(cidr: string): { base: number; mask: number } | null {
  const [ip, bitsRaw] = cidr.split("/");
  if (!ip || !bitsRaw) {
    return null;
  }
  const base = ipToInt(ip.trim());
  const bits = Number(bitsRaw);
  if (base === null || !Number.isInteger(bits) || bits < 0 || bits > 32) {
    return null;
  }
  const mask = bits === 0 ? 0 : Number((0xffffffff << (32 - bits)) >>> 0);
  return {
    base: Number(base >>> 0),
    mask
  };
}

function ipAllowedByCidrs(ip: string, cidrs: string[]): boolean {
  if (ip === "::1") {
    return true;
  }
  const value = ipToInt(ip);
  if (value === null) {
    return false;
  }
  for (const cidr of cidrs) {
    const parsed = parseCidr(cidr);
    if (!parsed) {
      continue;
    }
    if (((value >>> 0) & parsed.mask) === (parsed.base & parsed.mask)) {
      return true;
    }
  }
  return false;
}

function createDefaultAuditAppender(workspace: string): (event: MetricsAuditEvent) => void {
  return (event: MetricsAuditEvent): void => {
    try {
      appendOpsAuditEvent({
        workspace,
        auditType: event.auditType,
        severity: event.severity,
        payload: event.payload
      });
    } catch {
      // Observability logging must remain best-effort.
    }
  };
}

export function createMetricsServerRequestHandler(
  options: MetricsRequestHandlerOptions
): (req: IncomingMessage, res: ServerResponse) => void {
  let lastDeniedAuditTs = 0;
  const now = options.now ?? (() => Date.now());
  const appendAudit = options.appendAudit ?? createDefaultAuditAppender(options.workspace);

  return (req: IncomingMessage, res: ServerResponse): void => {
    const requestStartedAt = now();
    const method = (req.method ?? "GET").toUpperCase();
    const endpoint = endpointFromUrl(req.url);
    const requestPath = sanitizeLogField(req.url ?? "/", 256);
    res.once("finish", () => {
      recordMetricsEndpointRequestMetric(endpoint, method, res.statusCode || 0, now() - requestStartedAt);
    });

    const ip = normalizeIp(req.socket.remoteAddress);
    const allowed = options.allowRemote ? ipAllowedByCidrs(ip, options.allowedCidrs) : isLocal(ip);
    if (!allowed) {
      recordMetricsEndpointDeniedMetric(endpoint, method, "ip_not_allowed");
      const currentTs = now();
      if (currentTs - lastDeniedAuditTs >= DENIED_AUDIT_MIN_INTERVAL_MS) {
        lastDeniedAuditTs = currentTs;
        appendAudit({
          auditType: "METRICS_ENDPOINT_DENIED",
          severity: "MEDIUM",
          payload: {
            reason: "ip_not_allowed",
            method: sanitizeLogField(method, 32),
            endpoint,
            path: requestPath,
            clientIp: sanitizeLogField(ip, 64)
          }
        });
      }
      res.statusCode = 403;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ error: "metrics endpoint is localhost-only by default" }));
      return;
    }

    if (endpoint === "/health") {
      res.statusCode = 200;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    if (endpoint !== "/metrics") {
      res.statusCode = 404;
      res.end("not found");
      return;
    }

    try {
      res.statusCode = 200;
      res.setHeader("content-type", "text/plain; version=0.0.4; charset=utf-8");
      res.end(renderPrometheusMetrics());
    } catch (error) {
      res.statusCode = 500;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ error: "metrics render failed" }));
      appendAudit({
        auditType: "METRICS_ENDPOINT_RENDER_FAILED",
        severity: "HIGH",
        payload: {
          method: sanitizeLogField(method, 32),
          endpoint,
          path: requestPath,
          error: sanitizeLogField(error instanceof Error ? error.message : String(error), 256)
        }
      });
    }
  };
}

export async function startMetricsServer(options: MetricsServerOptions): Promise<MetricsServerHandle> {
  const allowRemote = options.allowRemote === true;
  const allowedCidrs = options.allowedCidrs && options.allowedCidrs.length > 0 ? options.allowedCidrs : ["127.0.0.1/32"];
  const appendAudit = createDefaultAuditAppender(options.workspace);
  const handler = createMetricsServerRequestHandler({
    workspace: options.workspace,
    allowRemote,
    allowedCidrs,
    appendAudit
  });
  const server: Server = createServer((req, res) => handler(req, res));

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port, options.host, () => resolve());
  });
  const bound = server.address();
  const boundPort =
    bound && typeof bound === "object" && typeof bound.port === "number" && Number.isFinite(bound.port)
      ? bound.port
      : options.port;
  appendAudit({
    auditType: "METRICS_SERVER_STARTED",
    payload: {
      host: options.host,
      port: boundPort
    }
  });
  return {
    host: options.host,
    port: boundPort,
    close: async () => {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
      appendAudit({
        auditType: "METRICS_SERVER_STOPPED",
        payload: {
          host: options.host,
          port: boundPort
        }
      });
    }
  };
}
