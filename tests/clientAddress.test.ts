import type { IncomingMessage } from "node:http";
import { describe, expect, test } from "vitest";
import { forwardedClientIp, requestUsesHttps, resolveClientAddress, withLoopbackCidrs } from "../src/studio/clientAddress.js";

function request(headers: Record<string, string>, remoteAddress = "127.0.0.1", encrypted = false): IncomingMessage {
  return { headers, socket: { remoteAddress, encrypted } } as unknown as IncomingMessage;
}

describe("forwarded client address (LIVE-RUNTIME-18, D-R11)", () => {
  test("with one appending proxy the client is the last entry, whatever the client prepended", () => {
    expect(forwardedClientIp(request({ "x-forwarded-for": "198.51.100.9, 10.9.8.7" }), 1)).toBe("10.9.8.7");
    expect(forwardedClientIp(request({ "x-forwarded-for": "10.9.8.7, 198.51.100.9" }), 1)).toBe("198.51.100.9");
  });

  test("with two proxies the client is two entries from the end, clamped to the first", () => {
    expect(forwardedClientIp(request({ "x-forwarded-for": "10.9.8.7, 203.0.113.1" }), 2)).toBe("10.9.8.7");
    expect(forwardedClientIp(request({ "x-forwarded-for": "10.9.8.7" }), 3)).toBe("10.9.8.7");
  });

  test("a peer outside the allow list is never a trusted hop", () => {
    const req = request({ "x-forwarded-for": "10.9.8.7" }, "192.0.2.1");
    expect(resolveClientAddress(req, { trustedProxyHops: 1, allowedCidrs: ["127.0.0.1/32"] })).toEqual({ clientIp: "192.0.2.1", trustForwarded: false });
    expect(resolveClientAddress(req, { trustedProxyHops: 1, allowedCidrs: ["192.0.2.0/24"] })).toEqual({ clientIp: "10.9.8.7", trustForwarded: true });
    expect(resolveClientAddress(req, { trustedProxyHops: 0, allowedCidrs: ["192.0.2.0/24"] })).toEqual({ clientIp: "192.0.2.1", trustForwarded: false });
  });

  test("loopback is always in the effective list, once", () => {
    expect(withLoopbackCidrs(["10.9.0.0/16", "127.0.0.1/32"])).toEqual(["10.9.0.0/16", "127.0.0.1/32", "::1/128"]);
    expect(withLoopbackCidrs([])).toEqual(["127.0.0.1/32", "::1/128"]);
  });
});

describe("requestUsesHttps believes x-forwarded-proto only from a trusted hop (Secure cookie, formerly LIVE-VAULT-10)", () => {
  test("the header counts only when the hop is trusted; a TLS socket always counts", () => {
    expect(requestUsesHttps(request({ "x-forwarded-proto": "https" }), false)).toBe(false);
    expect(requestUsesHttps(request({ "x-forwarded-proto": "https" }), true)).toBe(true);
    expect(requestUsesHttps(request({ "x-forwarded-proto": "http, https" }), true)).toBe(false);
    expect(requestUsesHttps(request({}, "127.0.0.1", true), false)).toBe(true);
  });
});
