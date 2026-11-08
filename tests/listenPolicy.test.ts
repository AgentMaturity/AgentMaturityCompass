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

  // SR-10: the shipped configs trusted every private range, so any container or pod could forge X-Forwarded-For. At start,
  // a trusted range of /12 or wider, or a trusted range (not a single address) overlapping the allow list, is warned about.
  test("a wide trusted proxy range, or one overlapping the client allow list, is warned about at start", () => {
    const warnings = (env: NodeJS.ProcessEnv, hops = 1): string[] => {
      const lines: string[] = [];
      assertProxyTrustNamed(hops, resolveListenPolicy({ env, hostMode: false }), (line) => lines.push(line));
      return lines;
    };
    expect(warnings({ AMC_TRUSTED_PROXY_CIDRS: "10.0.0.0/8,172.16.0.0/12,192.168.0.0/16" })).toEqual([
      expect.stringContaining("AMC_TRUSTED_PROXY_CIDRS entry 10.0.0.0/8 spans a /12 or wider range"),
      expect.stringContaining("AMC_TRUSTED_PROXY_CIDRS entry 172.16.0.0/12 spans a /12 or wider range")
    ]);
    expect(warnings({ AMC_TRUSTED_PROXY_CIDRS: "10.0.0.0/08" }), "decided on the parsed range").toEqual([expect.stringContaining("10.0.0.0/08 spans")]);
    expect(warnings({ AMC_ALLOWED_CIDRS: "192.168.0.0/16", AMC_TRUSTED_PROXY_CIDRS: "192.168.1.0/24" })).toEqual([
      expect.stringContaining("AMC_TRUSTED_PROXY_CIDRS entry 192.168.1.0/24 overlaps the client allow list (192.168.0.0/16)")
    ]);
    expect(warnings({ AMC_ALLOWED_CIDRS: "192.168.0.0/16", AMC_TRUSTED_PROXY_CIDRS: "192.168.1.5/32,127.0.0.1/32,172.16.250.2/32" }),
      "a single proxy address inside the allow list is how a proxy is named").toEqual([]);
    expect(warnings({ AMC_TRUSTED_PROXY_CIDRS: "10.0.0.0/8" }, 0), "no hops: the list is not used").toEqual([]);
  });

  // SR-10, coordinator correction: a documentation range passes CIDR validation but matches no real proxy, so a copied
  // placeholder left the real proxy untrusted. It is refused. With the allow list admitting private ranges that no named
  // proxy can be in (nor loopback, a same-host proxy), a proxy there would be untrusted and everyone it forwards would
  // share its admitted address, which is warned about.
  test("documentation ranges are refused; a proxy list that misses every private range the allow list admits is warned about", () => {
    const named = (env: NodeJS.ProcessEnv) => resolveListenPolicy({ env, hostMode: false });
    for (const cidr of ["198.51.100.0/24", "192.0.2.7/32", "203.0.113.0/24", "2001:db8::/32", "2001:DB8::1/128", "10.244.1.17/32,198.51.100.9/32"]) {
      expect(() => assertProxyTrustNamed(1, named({ AMC_TRUSTED_PROXY_CIDRS: cidr }), () => undefined), cidr).toThrow(/is a documentation range \(RFC 5737\/3849\)/);
    }
    expect(() => assertProxyTrustNamed(0, named({ AMC_TRUSTED_PROXY_CIDRS: "198.51.100.0/24" })), "no hops: the list is not used").not.toThrow();
    const warnings = (env: NodeJS.ProcessEnv): string[] => {
      const lines: string[] = [];
      assertProxyTrustNamed(1, named(env), (line) => lines.push(line));
      return lines;
    };
    expect(warnings({ AMC_ALLOWED_CIDRS: "10.0.0.0/8,192.168.0.0/16", AMC_TRUSTED_PROXY_CIDRS: "203.0.114.5/32" })).toEqual([
      expect.stringContaining("AMC_TRUSTED_PROXY_CIDRS matches no address in the private ranges AMC_ALLOWED_CIDRS admits (10.0.0.0/8, 192.168.0.0/16)")
    ]);
    expect(warnings({ AMC_ALLOWED_CIDRS: "0.0.0.0/1", AMC_TRUSTED_PROXY_CIDRS: "100.64.0.5/32" }), "only the private part of a broad entry counts").toEqual([
      expect.stringContaining("the private ranges AMC_ALLOWED_CIDRS admits (0.0.0.0/1)")
    ]);
    expect(warnings({ AMC_ALLOWED_CIDRS: "10.0.0.0/8", AMC_TRUSTED_PROXY_CIDRS: "10.244.1.17/32" }), "the proxy can be in the private range").toEqual([]);
    expect(warnings({ AMC_ALLOWED_CIDRS: "192.168.0.0/16", AMC_TRUSTED_PROXY_CIDRS: "127.0.0.1/32" }), "a same-host proxy").toEqual([]);
    expect(warnings({ AMC_ALLOWED_CIDRS: "203.0.114.0/24", AMC_TRUSTED_PROXY_CIDRS: "203.0.114.5/32" }), "no private range admitted").toEqual([]);
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
