import { request as httpRequest } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, test } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { startStudioApiServer } from "../src/studio/studioServer.js";

const roots: string[] = [];

function newWorkspace(): string {
  const dir = mkdtempSync(join(tmpdir(), "amc-studio-ip-"));
  roots.push(dir);
  initWorkspace({ workspacePath: dir, trustBoundaryMode: "isolated" });
  return dir;
}

afterEach(() => {
  while (roots.length > 0) {
    const dir = roots.pop();
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

async function pickFreePort(): Promise<number> {
  const { createServer } = await import("node:http");
  const server = createServer();
  await new Promise<void>((resolvePromise) => server.listen(0, "127.0.0.1", () => resolvePromise()));
  const address = server.address();
  await new Promise<void>((resolvePromise) => server.close(() => resolvePromise()));
  if (!address || typeof address === "string") {
    throw new Error("failed to reserve random port");
  }
  return address.port;
}

async function rawGet(url: string, headers?: Record<string, string>): Promise<{ status: number; body: string }> {
  return new Promise((resolvePromise, rejectPromise) => {
    const req = httpRequest(url, { method: "GET", headers: { connection: "close", ...(headers ?? {}) } }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
      res.on("end", () => resolvePromise({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8") }));
    });
    req.on("error", rejectPromise);
    req.end();
  });
}

describe("studio API trusted proxy IP handling", () => {
  test("does not trust x-forwarded-for from a disallowed remote peer", async () => {
    const workspace = newWorkspace();
    const port = await pickFreePort();
    const api = await startStudioApiServer({
      workspace,
      host: "127.0.0.1",
      port,
      token: "test-token",
      allowedCidrs: ["10.0.0.0/8"],
      trustedProxyHops: 1
    });
    try {
      const res = await rawGet(`${api.url}/health`, {
        "x-forwarded-for": "10.1.2.3"
      });
      expect(res.status).toBe(403);
      expect(res.body).toContain("client IP not allowed");
      expect(res.body).toContain("127.0.0.1");
    } finally {
      await api.close();
    }
  });

  test("uses x-forwarded-for only when remote peer is in allowlist", async () => {
    const workspace = newWorkspace();
    const port = await pickFreePort();
    const api = await startStudioApiServer({
      workspace,
      host: "127.0.0.1",
      port,
      token: "test-token",
      allowedCidrs: ["127.0.0.1/32", "10.0.0.0/8"],
      trustedProxyHops: 1
    });
    try {
      const ok = await rawGet(`${api.url}/health`, {
        "x-forwarded-for": "10.9.8.7"
      });
      expect(ok.status).toBe(200);

      const denied = await rawGet(`${api.url}/health`, {
        "x-forwarded-for": "192.168.44.2"
      });
      expect(denied.status).toBe(403);
      expect(denied.body).toContain("192.168.44.2");
    } finally {
      await api.close();
    }
  });
});
