import { EventEmitter } from "node:events";
import type { IncomingMessage, ServerResponse } from "node:http";
import { afterEach, describe, expect, test } from "vitest";
import {
  ensureMetricsBaseline
} from "../../src/ops/metrics/metricsMiddleware.js";
import {
  renderPrometheusMetrics,
  resetMetricsRegistry
} from "../../src/ops/metrics/metricsRegistry.js";
import {
  createMetricsServerRequestHandler
} from "../../src/ops/metrics/metricsServer.js";

class FakeResponse extends EventEmitter {
  statusCode = 200;
  body = "";
  headers = new Map<string, string>();

  setHeader(name: string, value: string): void {
    this.headers.set(name.toLowerCase(), value);
  }

  end(chunk?: string | Buffer): this {
    if (typeof chunk === "string") {
      this.body += chunk;
    } else if (Buffer.isBuffer(chunk)) {
      this.body += chunk.toString("utf8");
    }
    this.emit("finish");
    return this;
  }
}

function invokeHandler(params: {
  handler: (req: IncomingMessage, res: ServerResponse) => void;
  url: string;
  method?: string;
  remoteAddress?: string;
}): FakeResponse {
  const req = {
    url: params.url,
    method: params.method ?? "GET",
    socket: {
      remoteAddress: params.remoteAddress ?? "127.0.0.1"
    }
  } as unknown as IncomingMessage;
  const res = new FakeResponse();
  params.handler(req, res as unknown as ServerResponse);
  return res;
}

afterEach(() => {
  resetMetricsRegistry();
});

describe("metrics server observability", () => {
  test("records request and duration metrics for health, metrics, and unknown endpoints", () => {
    ensureMetricsBaseline();
    const audits: Array<Record<string, unknown>> = [];
    const handler = createMetricsServerRequestHandler({
      workspace: ".",
      allowRemote: false,
      allowedCidrs: ["127.0.0.1/32"],
      appendAudit: (event) => audits.push(event as unknown as Record<string, unknown>)
    });

    const health = invokeHandler({ handler, url: "/health" });
    expect(health.statusCode).toBe(200);

    const metrics = invokeHandler({ handler, url: "/metrics" });
    expect(metrics.statusCode).toBe(200);
    expect(metrics.headers.get("content-type")).toContain("text/plain");

    const unknown = invokeHandler({ handler, url: "/does-not-exist" });
    expect(unknown.statusCode).toBe(404);

    const rendered = renderPrometheusMetrics();
    expect(rendered).toContain('amc_metrics_endpoint_requests_total{endpoint="/health",method="GET",status="200"} 1');
    expect(rendered).toContain('amc_metrics_endpoint_requests_total{endpoint="/metrics",method="GET",status="200"} 1');
    expect(rendered).toContain('amc_metrics_endpoint_requests_total{endpoint="/unknown",method="GET",status="404"} 1');
    expect(rendered).toContain('amc_metrics_endpoint_duration_seconds_count{endpoint="/health",method="GET"} 1');
    expect(rendered).toContain('amc_metrics_endpoint_duration_seconds_count{endpoint="/metrics",method="GET"} 2');
    expect(rendered).toContain('amc_metrics_endpoint_duration_seconds_count{endpoint="/unknown",method="GET"} 1');
    expect(audits).toHaveLength(0);
  });

  test("records denied metric and sanitized denied-access audit payload", () => {
    ensureMetricsBaseline();
    const audits: Array<Record<string, unknown>> = [];
    let nowTs = 50_000;
    const handler = createMetricsServerRequestHandler({
      workspace: ".",
      allowRemote: true,
      allowedCidrs: ["10.0.0.0/8"],
      now: () => nowTs,
      appendAudit: (event) => audits.push(event as unknown as Record<string, unknown>)
    });

    const denied = invokeHandler({
      handler,
      url: `/metrics?token=${"A".repeat(512)}`,
      remoteAddress: "127.0.0.1"
    });
    expect(denied.statusCode).toBe(403);

    const rendered = renderPrometheusMetrics();
    expect(rendered).toContain(
      'amc_metrics_endpoint_denied_total{endpoint="/metrics",method="GET",reason="ip_not_allowed"} 1'
    );

    expect(audits).toHaveLength(1);
    expect(audits[0]?.auditType).toBe("METRICS_ENDPOINT_DENIED");
    const path = String((audits[0]?.payload as Record<string, unknown>)?.path ?? "");
    expect(path.length).toBeLessThanOrEqual(259);
    expect(path).not.toMatch(/[\u0000-\u001f\u007f]/);
  });

  test("throttles repeated denied-access audit events", () => {
    ensureMetricsBaseline();
    const audits: Array<Record<string, unknown>> = [];
    let nowTs = 50_000;
    const handler = createMetricsServerRequestHandler({
      workspace: ".",
      allowRemote: true,
      allowedCidrs: ["10.0.0.0/8"],
      now: () => nowTs,
      appendAudit: (event) => audits.push(event as unknown as Record<string, unknown>)
    });

    invokeHandler({ handler, url: "/metrics", remoteAddress: "127.0.0.1" });
    invokeHandler({ handler, url: "/metrics", remoteAddress: "127.0.0.1" });
    expect(audits).toHaveLength(1);

    nowTs += 30_000;
    invokeHandler({ handler, url: "/metrics", remoteAddress: "127.0.0.1" });
    expect(audits).toHaveLength(2);
  });
});
