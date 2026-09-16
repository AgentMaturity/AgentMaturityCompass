/**
 * productPortalSubmitAttribution.test.ts — POST /api/v1/product/portal/submit
 * must attribute a job to the authenticated caller, never to a body field.
 *
 * PortalManager writes to the product database with no receipt, hash chain, or
 * signature, so `submitted_by` is the only record of who requested the work.
 * These tests drive the real stack — auth delegation, route registry, router,
 * and SQLite — and assert on the row that was actually persisted.
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import { Readable } from "node:stream";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { handleStudioApiDelegation } from "../src/studio/apiDelegation.js";
import { closeProductDb } from "../src/product/productDb.js";
import { PortalManager } from "../src/product/portal.js";

const SUBMIT_PATH = "/api/v1/product/portal/submit";

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "amc-portal-attribution-"));
  process.env["AMC_PRODUCT_DB_PATH"] = join(tmpDir, "product.db");
});

afterEach(() => {
  closeProductDb();
  delete process.env["AMC_PRODUCT_DB_PATH"];
  try { rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
});

function mockReq(method: string, url: string, body?: unknown): IncomingMessage {
  const payload = body === undefined ? "" : JSON.stringify(body);
  const req = Readable.from(payload.length > 0 ? [Buffer.from(payload, "utf8")] : []) as unknown as IncomingMessage;
  (req as any).method = method;
  (req as any).url = url;
  (req as any).headers = {};
  return req;
}

function mockRes(): { res: ServerResponse; state: { statusCode: number; body: string } } {
  const state = { statusCode: 0, body: "" };
  const res = {
    writeHead: (statusCode: number) => { state.statusCode = statusCode; return res; },
    setHeader: () => undefined,
    end: (chunk?: string | Buffer) => { if (chunk !== undefined) state.body += chunk.toString(); }
  } as unknown as ServerResponse;
  return { res, state };
}

const NO_LIMIT = () => ({ allowed: true, limit: 600, remaining: 599, resetTs: Date.now() + 60_000, retryAfterSeconds: 0 });

/** Submit through the full authenticated path, as `username`. */
async function submitAs(username: string, body: unknown): Promise<{ status: number; json: any }> {
  const { res, state } = mockRes();
  const handled = await handleStudioApiDelegation({
    pathname: SUBMIT_PATH,
    method: "POST",
    clientIp: "127.0.0.1",
    workspace: tmpDir,
    token: "admin-token",
    req: mockReq("POST", SUBMIT_PATH, body),
    res,
    authenticate: () => ({
      isAdmin: true,
      agentId: null,
      username,
      roles: new Set(["OWNER", "OPERATOR", "APPROVER", "AUDITOR", "VIEWER"])
    }),
    requireRoles: () => true,
    json: (response, status, payload) => {
      response.writeHead(status, { "Content-Type": "application/json" });
      response.end(JSON.stringify(payload));
    },
    apiLimiter: NO_LIMIT,
    privilegedApiLimiter: NO_LIMIT,
    setRateLimitHeaders: () => undefined
  });

  expect(handled).toBe(true);
  let json: any;
  try { json = state.body ? JSON.parse(state.body) : undefined; } catch { json = undefined; }
  return { status: state.statusCode, json };
}

describe("POST /api/v1/product/portal/submit attribution", () => {
  test("records the authenticated caller as the submitter", async () => {
    const result = await submitAs("alice", { name: "nightly scan", type: "scan", payload: { depth: 2 } });

    expect(result.status).toBe(201);
    expect(result.json?.ok).toBe(true);
    expect(result.json.data.submittedBy).toBe("alice");

    const persisted = new PortalManager().getJob(result.json.data.id);
    expect(persisted?.submittedBy).toBe("alice");
  });

  test("refuses a body that claims a different submittedBy instead of silently ignoring it", async () => {
    const result = await submitAs("alice", { name: "nightly scan", type: "scan", submittedBy: "root" });

    expect(result.status).toBe(400);
    expect(result.json?.ok).toBe(false);

    // Nothing was written at all — in particular, nothing attributed to the
    // identity the caller asked for, nor quietly re-attributed to the caller.
    const pm = new PortalManager();
    expect(pm.listJobs({ submittedBy: "root" })).toEqual([]);
    expect(pm.listJobs()).toEqual([]);
  });

  test("refuses submission when no authenticated principal reached the route", async () => {
    const { res, state } = mockRes();
    const { handleApiRoute } = await import("../src/api/index.js");

    // handleApiRoute called without a principal — attribution would be unknowable.
    const handled = await handleApiRoute(
      SUBMIT_PATH,
      "POST",
      mockReq("POST", SUBMIT_PATH, { name: "nightly scan", type: "scan" }),
      res,
      tmpDir
    );

    expect(handled).toBe(true);
    expect(state.statusCode).toBe(401);
    expect(new PortalManager().listJobs()).toEqual([]);
  });
});
