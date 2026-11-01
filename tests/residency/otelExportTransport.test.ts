/** P2-01 internal observability export POST (src/observability/otelExportTransport.ts dispatchTelemetryRequest). */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { dispatchTelemetryRequest, type PreparedTelemetryRequest } from "../../src/observability/otelExportTransport.js";
import { blockResidency, closeFixtures, listen, newWorkspace, redirectTo, tempRoot } from "./egressFixture.js";

vi.setConfig({ testTimeout: 60_000 });
let root: string, blocked: string, open: string;
beforeEach(() => {
  root = tempRoot();
  blocked = newWorkspace(root, "blocked");
  open = newWorkspace(root, "open");
  blockResidency(blocked);
});
afterEach(async () => { vi.restoreAllMocks(); await closeFixtures(); });

const OPTIONS = { timeoutMs: 5_000, maxRetries: 2, retryBaseDelayMs: 1 };
const prepared = (endpoint: string, workspace: string): PreparedTelemetryRequest =>
  ({ endpoint, headers: { "content-type": "application/json" }, body: "{}", workspace, run: (callback) => callback() });

describe("observability export dispatch", () => {
  test("a denied POST calls no fetch, opens no socket and is not retried", async () => {
    const collector = await listen();
    const spy = vi.spyOn(globalThis, "fetch");
    const result = await dispatchTelemetryRequest(prepared(`${collector.url}/v1/traces`, blocked), OPTIONS);
    expect(result).toEqual({ ok: false, error: expect.stringMatching(/^Residency egress blocked/) });
    expect(spy).not.toHaveBeenCalled();
    expect(collector.connections).toBe(0);
  });

  test("the request's workspace and endpoint are captured once: changing them during a retry wait widens nothing", async () => {
    const other = await listen();
    let request: PreparedTelemetryRequest;
    const collector = await listen((_req, res) => {
      // After the first attempt: the captured workspace becomes blocked, while the request object is pointed at an open one.
      blockResidency(open);
      request.workspace = newWorkspace(root, "unregulated");
      request.endpoint = `${other.url}/v1/traces`;
      res.writeHead(503).end();
    });
    request = prepared(`${collector.url}/v1/traces`, open);
    const result = await dispatchTelemetryRequest(request, OPTIONS);
    expect(result).toEqual({ ok: false, error: expect.stringMatching(/^Residency egress blocked/) });
    expect(collector.requests).toHaveLength(1);
    expect(other.connections).toBe(0);
  });

  test("a 3xx from the collector is returned as a failure, not followed", async () => {
    const target = await listen();
    const redirector = await redirectTo(target);
    expect(await dispatchTelemetryRequest(prepared(`${redirector.url}/v1/traces`, open), OPTIONS)).toEqual({ ok: false, status: 302, error: "HTTP 302" });
    expect(target.connections).toBe(0);
  });
});
