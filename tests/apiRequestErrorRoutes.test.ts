import type { IncomingMessage, ServerResponse } from "node:http";
import { Readable } from "node:stream";
import { describe, expect, test } from "vitest";
import { handleProductRoute } from "../src/api/productRouter.js";
import { handleVaultRoute } from "../src/api/vaultRouter.js";
import { handleEnforceRoute } from "../src/api/enforceRouter.js";
import { handleShieldRoute } from "../src/api/shieldRouter.js";

type Handler = (pathname: string, method: string, req: IncomingMessage, res: ServerResponse) => Promise<boolean>;

const product: Handler = (pathname, method, req, res) => handleProductRoute(pathname, method, req, res, {
  workspace: process.cwd(),
  principal: "authenticated-contract-fixture"
});

const routes: [Handler, string, number, string][] = [
  [product, "/api/v1/product/batch/create", 500, "Internal error"],
  [product, "/api/v1/product/portal/submit", 500, "Internal error"],
  [handleVaultRoute, "/api/v1/vault/redact", 500, "Internal error"],
  [handleVaultRoute, "/api/v1/vault/classify", 500, "Internal error"],
  [handleEnforceRoute, "/api/v1/enforce/evaluate", 500, "Internal error"],
  [handleEnforceRoute, "/api/v1/enforce/formal/verify", 500, "Formal verification failed"],
  [handleEnforceRoute, "/api/v1/enforce/formal/certificate", 500, "Certificate verification failed"],
  [handleShieldRoute, "/api/v1/shield/scan/skill", 500, "Internal error"],
  [handleShieldRoute, "/api/v1/shield/detect/injection", 500, "Internal error"],
  [handleShieldRoute, "/api/v1/shield/sanitize", 500, "Internal error"],
  [handleShieldRoute, "/api/v1/shield/red-team/run", 500, "Red team run failed"],
  [handleShieldRoute, "/api/v1/shield/exploit-confirmation/scopes", 400, "Could not write exploit confirmation scope"],
  [handleShieldRoute, "/api/v1/shield/exploit-confirmation/run", 400, "Exploit confirmation failed"],
  [handleShieldRoute, "/api/v1/shield/exploit-confirmation/proofs/fixture/export", 400, "Could not export exploit confirmation proof"],
  [handleShieldRoute, "/api/v1/shield/trust-pipeline/run", 500, "Trust pipeline failed"],
  [handleShieldRoute, "/api/v1/shield/red-team/attack", 500, "Attack generation failed"]
];

async function requestError(handler: Handler, pathname: string, input: { body: string } | { error: unknown }) {
  const req = new Readable({
    read() {
      if ("body" in input) this.push(input.body);
      else this.emit("error", input.error);
      this.push(null);
    }
  }) as IncomingMessage;
  req.method = "POST";
  req.url = pathname;
  const statuses: number[] = [];
  const headers: unknown[] = [];
  const bodies: string[] = [];
  const res = {
    writeHead(status: number, value: unknown) {
      statuses.push(status);
      headers.push(value);
    },
    end(body: string) { bodies.push(body); }
  } as unknown as ServerResponse;
  expect(await handler(pathname, "POST", req, res)).toBe(true);
  expect(statuses).toHaveLength(1);
  expect(headers).toEqual([{ "Content-Type": "application/json" }]);
  expect(bodies).toHaveLength(1);
  return { status: statuses[0], body: JSON.parse(bodies[0]!) };
}

for (const [handler, pathname, fallbackStatus, fallback] of routes) {
  describe(`request-error response contract: ${pathname}`, () => {
    test("preserves the body limit's 413 status and exact message", async () => {
      expect(await requestError(handler, pathname, { body: "x".repeat(1_048_577) })).toEqual({
        status: 413,
        body: { ok: false, error: "JSON body exceeds 1048576 bytes" }
      });
    });

    test("preserves malformed JSON as a 400 body error", async () => {
      expect(await requestError(handler, pathname, { body: "{" })).toEqual({
        status: 400,
        body: { ok: false, error: "Invalid JSON body" }
      });
    });

    test("preserves the ordinary stream error's status and message", async () => {
      expect(await requestError(handler, pathname, { error: new Error("request stream failed") })).toEqual({
        status: fallbackStatus,
        body: { ok: false, error: "request stream failed" }
      });
    });

    test("preserves the route-specific non-Error fallback", async () => {
      expect(await requestError(handler, pathname, { error: "non-Error failure" })).toEqual({
        status: fallbackStatus,
        body: { ok: false, error: fallback }
      });
    });
  });
}
