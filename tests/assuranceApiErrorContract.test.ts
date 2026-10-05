import type { IncomingMessage, ServerResponse } from "node:http";
import { Readable } from "node:stream";
import { describe, expect, test } from "vitest";
import { handleAssuranceRoute } from "../src/api/assuranceRouter.js";

const bodyRoutes = [
  ["/api/v1/assurance/policy", "policy apply failed"],
  ["/api/v1/assurance/verify", "verify failed"],
  ["/api/v1/assurance/patch", "patch failed"],
  ["/api/v1/assurance/cert", "cert issue failed"],
  ["/api/v1/assurance/cert/verify", "cert verify failed"],
  ["/api/v1/assurance/waiver", "waiver request failed"],
  ["/api/v1/assurance/waiver/revoke", "waiver revoke failed"],
  ["/api/v1/assurance/lab/toctou", "lab pack failed"],
  ["/api/v1/assurance/fp", "fp submit failed"],
  ["/api/v1/assurance/fp/resolve", "fp resolve failed"],
  ["/api/v1/assurance", "invalid request"]
] as const;

async function requestError(pathname: string, input: { body: string } | { error: unknown }) {
  // Exercise the actual body reader before any control-plane or provider operation.
  const req = new Readable({
    read() {
      if ("body" in input) {
        this.push(input.body);
      } else {
        this.emit("error", input.error);
      }
      this.push(null);
    }
  }) as IncomingMessage;
  const statuses: number[] = [];
  const headers: unknown[] = [];
  const bodies: string[] = [];
  const res = {
    writeHead(status: number, value: unknown) {
      statuses.push(status);
      headers.push(value);
    },
    end(body: string) {
      bodies.push(body);
    }
  } as unknown as ServerResponse;
  const handled = await handleAssuranceRoute(pathname, "POST", req, res);
  expect(handled).toBe(true);
  expect(statuses).toHaveLength(1);
  expect(headers).toEqual([{ "Content-Type": "application/json" }]);
  expect(bodies).toHaveLength(1);
  return { status: statuses[0], body: JSON.parse(bodies[0]!) };
}

describe.each(bodyRoutes)("assurance body-error contract: %s", (pathname, fallback) => {
  test("preserves the body limit's 413 status and exact message", async () => {
    expect(await requestError(pathname, { body: "x".repeat(1_048_577) })).toEqual({
      status: 413,
      body: { ok: false, error: "JSON body exceeds 1048576 bytes" }
    });
  });

  test("returns malformed JSON as a 400 body error", async () => {
    expect(await requestError(pathname, { body: "{" })).toEqual({
      status: 400,
      body: { ok: false, error: "Invalid JSON body" }
    });
  });

  test("preserves an ordinary stream error's message", async () => {
    expect(await requestError(pathname, { error: new Error("request stream failed") })).toEqual({
      status: 400,
      body: { ok: false, error: "request stream failed" }
    });
  });

  test("preserves the route's fallback for a non-Error rejection", async () => {
    expect(await requestError(pathname, { error: "non-Error failure" })).toEqual({
      status: 400,
      body: { ok: false, error: fallback }
    });
  });
});
