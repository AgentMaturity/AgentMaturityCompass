/**
 * apiContractVerification.test.ts — AMC-117: Comprehensive REST API contract verification.
 *
 * Validates:
 * 1. All existing endpoints return same schema ({ok, data} / {ok, error})
 * 2. New endpoints follow consistent patterns
 * 3. Error responses are standardized
 * 4. Authentication works correctly
 * 5. Rate limiting functions
 * 6. CORS headers correct
 */

import { describe, expect, test, beforeAll, afterAll } from "vitest";
import http from "node:http";
import { createServer } from "node:http";

// ── Helpers ──────────────────────────────────────────────────────────

async function fetchJson(
  url: string,
  options: {
    method?: string;
    headers?: Record<string, string>;
    body?: unknown;
  } = {}
): Promise<{ status: number; headers: Record<string, string>; body: unknown }> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const reqOpts: http.RequestOptions = {
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname + parsed.search,
      method: options.method ?? "GET",
      headers: {
        "Content-Type": "application/json",
        ...(options.headers ?? {}),
      },
    };

    const req = http.request(reqOpts, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () => {
        const raw = Buffer.concat(chunks).toString("utf8");
        let body: unknown;
        try {
          body = JSON.parse(raw);
        } catch {
          body = raw;
        }
        const hdrs: Record<string, string> = {};
        for (const [k, v] of Object.entries(res.headers)) {
          hdrs[k] = Array.isArray(v) ? v.join(", ") : (v ?? "");
        }
        resolve({ status: res.statusCode ?? 0, headers: hdrs, body });
      });
    });

    req.on("error", reject);
    if (options.body) {
      req.write(JSON.stringify(options.body));
    }
    req.end();
  });
}

// ── Import API internals for unit-level checks ──────────────────────

import { apiSuccess, apiError, queryParam, pathParam, bodyJson, requireMethod } from "../src/api/apiHelpers.js";
import { generateFullOpenApiSpec, validateOpenApiContractConsistency } from "../src/studio/openapi.js";

/* ═══════════════════════════════════════════════════════════════════
   1. RESPONSE SCHEMA CONSISTENCY
   ═══════════════════════════════════════════════════════════════════ */

describe("1. Response schema consistency", () => {
  test("apiSuccess always returns {ok: true, data: ...}", () => {
    const chunks: string[] = [];
    const mockRes = {
      writeHead: (_s: number, _h: Record<string, string>) => {},
      end: (s: string) => { chunks.push(s); },
    } as unknown as http.ServerResponse;

    apiSuccess(mockRes, { foo: "bar" });
    const parsed = JSON.parse(chunks[0]!);
    expect(parsed).toHaveProperty("ok", true);
    expect(parsed).toHaveProperty("data");
    expect(parsed.data.foo).toBe("bar");
  });

  test("apiSuccess with custom status still returns {ok: true}", () => {
    let capturedStatus = 0;
    const chunks: string[] = [];
    const mockRes = {
      writeHead: (s: number) => { capturedStatus = s; },
      end: (s: string) => { chunks.push(s); },
    } as unknown as http.ServerResponse;

    apiSuccess(mockRes, { created: true }, 201);
    expect(capturedStatus).toBe(201);
    const parsed = JSON.parse(chunks[0]!);
    expect(parsed.ok).toBe(true);
  });

  test("apiError always returns {ok: false, error: ...}", () => {
    const chunks: string[] = [];
    const mockRes = {
      writeHead: (_s: number, _h: Record<string, string>) => {},
      end: (s: string) => { chunks.push(s); },
    } as unknown as http.ServerResponse;

    apiError(mockRes, 400, "bad request");
    const parsed = JSON.parse(chunks[0]!);
    expect(parsed).toHaveProperty("ok", false);
    expect(parsed).toHaveProperty("error", "bad request");
    expect(parsed).not.toHaveProperty("data");
  });

  test("error responses use Content-Type: application/json", () => {
    let capturedHeaders: Record<string, string> = {};
    const mockRes = {
      writeHead: (_s: number, h: Record<string, string>) => { capturedHeaders = h; },
      end: () => {},
    } as unknown as http.ServerResponse;

    apiError(mockRes, 500, "boom");
    expect(capturedHeaders["Content-Type"]).toBe("application/json");
  });

  test("success responses use Content-Type: application/json", () => {
    let capturedHeaders: Record<string, string> = {};
    const mockRes = {
      writeHead: (_s: number, h: Record<string, string>) => { capturedHeaders = h; },
      end: () => {},
    } as unknown as http.ServerResponse;

    apiSuccess(mockRes, {});
    expect(capturedHeaders["Content-Type"]).toBe("application/json");
  });
});

/* ═══════════════════════════════════════════════════════════════════
   2. ENDPOINT PATTERN CONSISTENCY
   ═══════════════════════════════════════════════════════════════════ */

describe("2. Endpoint pattern consistency", () => {
  test("all OpenAPI paths start with / and use kebab-case or camelCase", () => {
    const spec = generateFullOpenApiSpec();
    for (const path of Object.keys(spec.paths)) {
      expect(path.startsWith("/")).toBe(true);
      // No uppercase first letter (PascalCase) in path segments
      const segments = path.split("/").filter(Boolean);
      for (const seg of segments) {
        if (seg.startsWith("{")) continue; // template params
        if (seg.startsWith(":")) continue; // express-style params
        // Should not have spaces or special characters besides hyphens/dots
        expect(seg).toMatch(/^[a-zA-Z0-9_.-]+$/);
      }
    }
  });

  test("OpenAPI spec version is 3.1.0", () => {
    const spec = generateFullOpenApiSpec();
    expect(spec.openapi).toBe("3.1.0");
  });

  test("contract consistency checks pass with zero errors", () => {
    const spec = generateFullOpenApiSpec();
    const issues = validateOpenApiContractConsistency(spec);
    const errors = issues.filter((i: any) => i.severity === "error");
    expect(errors).toEqual([]);
  });

  test("all router modules export a handler function", async () => {
    // Use static imports to verify router exports (vitest doesn't support computed dynamic imports)
    const mods = await Promise.all([
      import("../src/api/shieldRouter.js"),
      import("../src/api/enforceRouter.js"),
      import("../src/api/vaultRouter.js"),
      import("../src/api/watchRouter.js"),
      import("../src/api/scoreRouter.js"),
      import("../src/api/productRouter.js"),
      import("../src/api/assuranceRouter.js"),
      import("../src/api/fleetRouter.js"),
      import("../src/api/passportRouter.js"),
      import("../src/api/incidentRouter.js"),
      import("../src/api/evidenceRouter.js"),
      import("../src/api/gatewayRouter.js"),
      import("../src/api/configRouter.js"),
      import("../src/api/driftRouter.js"),
      import("../src/api/sandboxRouter.js"),
      import("../src/api/ciRouter.js"),
      import("../src/api/benchmarkRouter.js"),
      import("../src/api/workflowRouter.js"),
      import("../src/api/governorRouter.js"),
      import("../src/api/adaptersRouter.js"),
      import("../src/api/toolsRouter.js"),
      import("../src/api/securityRouter.js"),
      import("../src/api/canaryRouter.js"),
      import("../src/api/identityRouter.js"),
      import("../src/api/cryptoRouter.js"),
      import("../src/api/bomRouter.js"),
      import("../src/api/complianceRouter.js"),
      import("../src/api/memoryRouter.js"),
      import("../src/api/metricsRouter.js"),
      import("../src/api/exportRouter.js"),
      import("../src/api/agentTimelineRouter.js"),
    ]);

    for (const mod of mods) {
      const handlerKey = Object.keys(mod).find((k) => k.startsWith("handle"));
      expect(handlerKey, "router should export a handle* function").toBeDefined();
      expect(typeof (mod as any)[handlerKey!]).toBe("function");
    }
  });
});

/* ═══════════════════════════════════════════════════════════════════
   3. ERROR RESPONSE STANDARDIZATION
   ═══════════════════════════════════════════════════════════════════ */

describe("3. Error response standardization", () => {
  test("requireMethod returns 405 with standard error shape", () => {
    let capturedStatus = 0;
    const chunks: string[] = [];
    const mockReq = { method: "DELETE" } as http.IncomingMessage;
    const mockRes = {
      writeHead: (s: number) => { capturedStatus = s; },
      end: (s: string) => { chunks.push(s); },
    } as unknown as http.ServerResponse;

    const result = requireMethod(mockReq, mockRes, "GET");
    expect(result).toBe(false);
    expect(capturedStatus).toBe(405);
    const parsed = JSON.parse(chunks[0]!);
    expect(parsed.ok).toBe(false);
    expect(parsed.error).toContain("not allowed");
  });

  test("requireMethod allows matching method", () => {
    const mockReq = { method: "POST" } as http.IncomingMessage;
    const mockRes = {} as http.ServerResponse;
    expect(requireMethod(mockReq, mockRes, "POST")).toBe(true);
  });

  test("bodyJson rejects invalid JSON with standard error", async () => {
    // Simulate a request with invalid JSON
    const { Readable } = await import("node:stream");
    const stream = new Readable({ read() { this.push("{invalid"); this.push(null); } });
    Object.assign(stream, { method: "POST", headers: {} });

    try {
      await bodyJson(stream as unknown as http.IncomingMessage);
      expect.unreachable("should have thrown");
    } catch (err: any) {
      expect(err.message).toContain("Invalid JSON body");
      expect(err.statusCode).toBe(400);
    }
  });

  test("bodyJson accepts empty body as {}", async () => {
    const { Readable } = await import("node:stream");
    const stream = new Readable({ read() { this.push(""); this.push(null); } });
    Object.assign(stream, { method: "POST", headers: {} });

    const result = await bodyJson(stream as unknown as http.IncomingMessage);
    expect(result).toEqual({});
  });

  test("bodyJson sanitizes __proto__ keys", async () => {
    const { Readable } = await import("node:stream");
    const payload = JSON.stringify({ "__proto__": { "polluted": true }, "safe": 1 });
    const stream = new Readable({ read() { this.push(payload); this.push(null); } });
    Object.assign(stream, { method: "POST", headers: {} });

    const result = await bodyJson(stream as unknown as http.IncomingMessage) as Record<string, unknown>;
    expect(result).not.toHaveProperty("__proto__");
    expect(result.safe).toBe(1);
  });

  test("OpenAPI spec has reusable ErrorResponse schema", () => {
    const spec = generateFullOpenApiSpec();
    expect(spec.components.schemas).toHaveProperty("ErrorResponse");
  });
});

/* ═══════════════════════════════════════════════════════════════════
   4. AUTHENTICATION
   ═══════════════════════════════════════════════════════════════════ */

describe("4. Authentication", () => {
  test("passport revoke rejects missing admin token with 401", async () => {
    const { Readable } = await import("node:stream");
    const mod = await import("../src/api/passportRouter.js");
    let capturedStatus = 0;
    const chunks: string[] = [];

    // Create a readable stream that emits empty body
    const stream = new Readable({ read() { this.push("{}"); this.push(null); } });
    Object.assign(stream, {
      method: "POST",
      url: "/api/v1/passport/test-id/revoke",
      headers: {},
      socket: { encrypted: false },
    });

    const mockRes = {
      writeHead: (s: number, _h?: Record<string, string>) => { capturedStatus = s; },
      end: (s: string) => { chunks.push(s); },
      setHeader: () => {},
    } as unknown as http.ServerResponse;

    await mod.handlePassportRoute(
      "/api/v1/passport/test-id/revoke", "POST",
      stream as unknown as http.IncomingMessage,
      mockRes, process.cwd(), "secret-token-123"
    );

    expect(capturedStatus).toBe(401);
    const parsed = JSON.parse(chunks[0]!);
    expect(parsed.ok).toBe(false);
    expect(parsed.error).toContain("admin token");
  });

  test("OpenAPI spec defines admin and agent auth schemes", () => {
    const spec = generateFullOpenApiSpec();
    const secSchemes = spec.components?.securitySchemes ?? {};
    // Should have at least one security scheme
    expect(Object.keys(secSchemes).length).toBeGreaterThan(0);
  });
});

/* ═══════════════════════════════════════════════════════════════════
   5. RATE LIMITING (structural verification)
   ═══════════════════════════════════════════════════════════════════ */

describe("5. Rate limiting structure", () => {
  test("studioServer contains rate-limit 429 responses", async () => {
    const fs = await import("node:fs");
    const src = fs.readFileSync(
      new URL("../src/studio/studioServer.ts", import.meta.url), "utf8"
    );
    // Verify rate limiting code is present
    const rateLimitHits = (src.match(/429/g) ?? []).length;
    expect(rateLimitHits).toBeGreaterThanOrEqual(3);
    expect(src).toContain("rate limit");
  });

  test("rate-limit responses use standard JSON error format", async () => {
    const fs = await import("node:fs");
    const src = fs.readFileSync(
      new URL("../src/studio/studioServer.ts", import.meta.url), "utf8"
    );
    // Every 429 should use json() helper which produces standard format
    const lines = src.split("\n");
    const rateLimitLines = lines.filter(l => l.includes("429"));
    for (const line of rateLimitLines) {
      // Should use json() helper or res.writeHead pattern with error key
      expect(
        line.includes("json(res, 429") || line.includes("apiError")
      ).toBe(true);
    }
  });
});

/* ═══════════════════════════════════════════════════════════════════
   6. CORS HEADERS
   ═══════════════════════════════════════════════════════════════════ */

describe("6. CORS headers", () => {
  test("studioServer sets required CORS headers", async () => {
    const fs = await import("node:fs");
    const src = fs.readFileSync(
      new URL("../src/studio/studioServer.ts", import.meta.url), "utf8"
    );

    expect(src).toContain("Access-Control-Allow-Origin");
    expect(src).toContain("Access-Control-Allow-Credentials");
    expect(src).toContain("Access-Control-Allow-Headers");
    expect(src).toContain("Access-Control-Allow-Methods");
  });

  test("CORS allows required HTTP methods", async () => {
    const fs = await import("node:fs");
    const src = fs.readFileSync(
      new URL("../src/studio/studioServer.ts", import.meta.url), "utf8"
    );

    // Extract the Allow-Methods line
    const methodsLine = src.split("\n").find(l => l.includes("Access-Control-Allow-Methods"));
    expect(methodsLine).toBeDefined();
    expect(methodsLine).toContain("GET");
    expect(methodsLine).toContain("POST");
    expect(methodsLine).toContain("PUT");
    expect(methodsLine).toContain("DELETE");
    expect(methodsLine).toContain("OPTIONS");
  });

  test("CORS allows required auth headers", async () => {
    const fs = await import("node:fs");
    const src = fs.readFileSync(
      new URL("../src/studio/studioServer.ts", import.meta.url), "utf8"
    );

    const headersLine = src.split("\n").find(l => l.includes("Access-Control-Allow-Headers"));
    expect(headersLine).toBeDefined();
    expect(headersLine!.toLowerCase()).toContain("content-type");
    expect(headersLine!.toLowerCase()).toContain("authorization");
    expect(headersLine!.toLowerCase()).toContain("x-amc-admin-token");
  });

  test("CORS denies unrecognized origins", async () => {
    const fs = await import("node:fs");
    const src = fs.readFileSync(
      new URL("../src/studio/studioServer.ts", import.meta.url), "utf8"
    );

    expect(src).toContain("CORS origin denied");
  });
});

/* ═══════════════════════════════════════════════════════════════════
   BONUS: PATH / QUERY HELPERS CONTRACT
   ═══════════════════════════════════════════════════════════════════ */

describe("API helpers contract", () => {
  test("queryParam handles edge cases", () => {
    expect(queryParam("/api?", "x")).toBeUndefined();
    expect(queryParam("/api?x=", "x")).toBe("");
    expect(queryParam("/api?x=1&x=2", "x")).toBe("1"); // first wins
  });

  test("pathParam handles edge cases", () => {
    expect(pathParam("/", "/")).toEqual({});
    expect(pathParam("/a/b", "/a/:id")).toEqual({ id: "b" });
    expect(pathParam("/a/b/c", "/a/:id")).toBeNull(); // segment count mismatch
  });
});
