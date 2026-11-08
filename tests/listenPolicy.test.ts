import { describe, expect, test } from "vitest";
import { PROXY_TRUST_REFUSAL, PUBLIC_BIND_REFUSAL, assertProxyTrustNamed, assertPublicBindAcknowledged, resolveListenPolicy, standaloneGatewayAllowList, weakCidrs }
  from "../src/studio/listenPolicy.js";

// LIVE-RUNTIME-03 (D-R4): flag, else a SET variable, else the signed LAN value, else the default; loopback always admitted.
const lan = { enabled: true, valid: true, bind: "0.0.0.0", port: 3300, allowedCIDRs: ["10.9.0.0/16"] };

describe("listen policy", () => {
  test("unset variables fall through to the signed LAN bind, port and allow list, with loopback added", () => {
    expect(resolveListenPolicy({ env: {}, hostMode: false, lan })).toMatchObject({
      apiHost: "0.0.0.0", apiPort: 3300, apiPortConfigured: true, apiPortSource: "the signed LAN config",
      allowedCidrs: ["10.9.0.0/16", "127.0.0.1/32", "::1/128"], publicBind: true, lanEnabled: true
    });
  });

  test("a set AMC_ALLOWED_CIDRS wins over the LAN list; an explicitly empty one is loopback only", () => {
    expect(resolveListenPolicy({ env: { AMC_ALLOWED_CIDRS: "192.0.2.0/24" }, hostMode: false, lan }).allowedCidrs)
      .toEqual(["192.0.2.0/24", "127.0.0.1/32", "::1/128"]);
    expect(resolveListenPolicy({ env: { AMC_ALLOWED_CIDRS: "" }, hostMode: false, lan }).allowedCidrs).toEqual(["127.0.0.1/32", "::1/128"]);
  });

  test("AMC_LAN_MODE never acknowledges a public bind to every address; only AMC_ALLOW_PUBLIC_BIND does", () => {
    const env = { AMC_BIND: "0.0.0.0", AMC_ALLOWED_CIDRS: "0.0.0.0/0", AMC_LAN_MODE: "true" };
    const policy = resolveListenPolicy({ env, hostMode: false });
    expect(policy).toMatchObject({ publicBind: true, publicBindAcknowledged: false });
    expect(() => assertPublicBindAcknowledged(policy)).toThrow(PUBLIC_BIND_REFUSAL);
    const acknowledged = resolveListenPolicy({ env: { ...env, AMC_ALLOW_PUBLIC_BIND: "1" }, hostMode: false });
    expect(acknowledged.publicBindAcknowledged).toBe(true);
    expect(() => assertPublicBindAcknowledged(acknowledged)).not.toThrow();
    expect(() => assertPublicBindAcknowledged(resolveListenPolicy({ env: { AMC_BIND: "0.0.0.0", AMC_ALLOWED_CIDRS: "10.0.0.0/8" }, hostMode: false })))
      .not.toThrow();
  });

  // Skeptic D6: the refusal matched the literal strings 0.0.0.0/0 and ::/0 only, while the matcher admits everyone for
  // any IPv4 prefix 0 and for entries that together cover the whole space.
  test("an allow list that admits every address is refused however it is spelled", () => {
    for (const list of ["10.0.0.0/0", "0.0.0.0/00", "192.168.0.0/16,1.1.1.1/0", "0.0.0.0/1,128.0.0.0/1", "::/0", "2001:db8::/00",
      "0.0.0.0/2,64.0.0.0/2,128.0.0.0/2,192.0.0.0/3,224.0.0.0/3"]) {
      const policy = resolveListenPolicy({ env: { AMC_BIND: "0.0.0.0", AMC_ALLOWED_CIDRS: list }, hostMode: false });
      expect(() => assertPublicBindAcknowledged(policy), list).toThrow(PUBLIC_BIND_REFUSAL);
    }
    // The shipped lists, one half of the space, and a set with a gap between its ranges are not "every address".
    for (const list of [["10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16", "127.0.0.1/32", "::1/128"], ["0.0.0.0/1"],
      ["0.0.0.0/1", "128.0.0.0/2", "192.0.0.0/3", "224.0.0.0/4", "240.0.0.0/5", "248.0.0.0/6", "252.0.0.0/7", "254.0.0.0/8"], ["2001:db8::/32"]]) {
      expect(weakCidrs(list), list.join(",")).toBe(false);
    }
  });

  // SR-1: forwarded headers count only from AMC_TRUSTED_PROXY_CIDRS, never from the client allow list; declared hops with
  // no named proxy would let the allow list judge the proxy instead of its clients, so the start is refused.
  test("AMC_TRUSTED_PROXY_CIDRS names the trusted proxies; proxy hops without one are refused", () => {
    expect(resolveListenPolicy({ env: { AMC_ALLOWED_CIDRS: "10.0.0.0/8" }, hostMode: false }).trustedProxyCidrs, "the allow list is no proxy list").toEqual([]);
    const named = resolveListenPolicy({ env: { AMC_TRUSTED_PROXY_CIDRS: " 172.16.0.0/12, ,10.1.2.3/32 " }, hostMode: false });
    expect(named.trustedProxyCidrs).toEqual(["172.16.0.0/12", "10.1.2.3/32"]);
    expect(() => resolveListenPolicy({ env: { AMC_TRUSTED_PROXY_CIDRS: "caddy" }, hostMode: false })).toThrow("Invalid CIDR in AMC_TRUSTED_PROXY_CIDRS: caddy");
    expect(() => assertProxyTrustNamed(1, resolveListenPolicy({ env: {}, hostMode: false }))).toThrow(PROXY_TRUST_REFUSAL);
    expect(() => assertProxyTrustNamed(1, named)).not.toThrow();
    expect(() => assertProxyTrustNamed(0, resolveListenPolicy({ env: {}, hostMode: false })), "no hops: nothing to name").not.toThrow();
  });

  test("host mode ignores the LAN values and reads the host variables", () => {
    expect(resolveListenPolicy({ env: {}, hostMode: true, lan })).toMatchObject({
      apiHost: "127.0.0.1", apiPort: 3212, apiPortConfigured: false, allowedCidrs: ["127.0.0.1/32", "::1/128"], lanEnabled: false
    });
    expect(resolveListenPolicy({ env: { AMC_HOST_BIND: "0.0.0.0", AMC_HOST_PORT: "47311", AMC_STUDIO_PORT: "47312" }, hostMode: true }))
      .toMatchObject({ apiHost: "0.0.0.0", apiPort: 47311, apiPortSource: "AMC_HOST_PORT" });
  });

  test("an unsigned or disabled LAN config counts for nothing", () => {
    expect(resolveListenPolicy({ env: {}, hostMode: false, lan: { ...lan, valid: false } })).toMatchObject({ apiHost: "127.0.0.1", apiPort: 3212, lanEnabled: false });
    expect(resolveListenPolicy({ env: {}, hostMode: false, lan: { ...lan, enabled: false } }).allowedCidrs).toEqual(["127.0.0.1/32", "::1/128"]);
  });

  test("a flag beats a set variable, which beats the LAN value; the default port is not configured", () => {
    const env = { AMC_BIND: "127.0.0.2", AMC_STUDIO_PORT: "47313", AMC_METRICS_PORT: "47314" };
    expect(resolveListenPolicy({ env, hostMode: false, lan, flags: { bind: "127.0.0.3", port: 47315 } }))
      .toMatchObject({ apiHost: "127.0.0.3", apiPort: 47315, apiPortSource: "--port", metricsPort: 47314, metricsPortSource: "AMC_METRICS_PORT" });
    expect(resolveListenPolicy({ env, hostMode: false, lan })).toMatchObject({ apiHost: "127.0.0.2", apiPort: 47313, apiPortSource: "AMC_STUDIO_PORT" });
    expect(resolveListenPolicy({ env: {}, hostMode: false })).toMatchObject({ apiPort: 3212, apiPortConfigured: false, apiPortSource: null,
      metricsPort: 9464, metricsPortConfigured: false });
  });

  test("an allow-list entry that is not a CIDR is refused with its source", () => {
    expect(() => resolveListenPolicy({ env: { AMC_ALLOWED_CIDRS: "10.0.0.0/8,not-a-cidr" }, hostMode: false }))
      .toThrow("Invalid CIDR in AMC_ALLOWED_CIDRS: not-a-cidr");
    expect(resolveListenPolicy({ env: { AMC_ALLOWED_CIDRS: "::1,fd00::/8" }, hostMode: false }).allowedCidrs).toEqual(["::1", "fd00::/8", "127.0.0.1/32", "::1/128"]);
  });

  test("the standalone gateway reads the environment only and is refused like Studio", () => {
    expect(standaloneGatewayAllowList({}, "127.0.0.1")).toEqual(["127.0.0.1/32", "::1/128"]);
    expect(standaloneGatewayAllowList({ AMC_ALLOWED_CIDRS: "172.17.0.0/16" }, "0.0.0.0")).toEqual(["172.17.0.0/16", "127.0.0.1/32", "::1/128"]);
    expect(() => standaloneGatewayAllowList({ AMC_ALLOWED_CIDRS: "0.0.0.0/0" }, "0.0.0.0")).toThrow(PUBLIC_BIND_REFUSAL);
  });
});
