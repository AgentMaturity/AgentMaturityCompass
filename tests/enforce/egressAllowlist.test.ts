import { describe, expect, it, vi } from "vitest";
import {
  canonicalAddress,
  canonicalHost,
  decideEgress,
  isNonPublicAddress,
  resolveAndCheck
} from "../../src/enforce/egressAllowlist.js";

// These are address-policy unit witnesses. They open no sockets and perform no DNS lookup.
// The name-only decideEgress precheck is not the completed DNS decision; resolveAndCheck is.
const PUBLIC = "8.8.8.8";
const NAME = "api.example.com";
const named = { allowHosts: [NAME] };
const nonPublic = [
  "0.0.0.0", "0.1.2.3", "10.0.0.1", "10.255.255.254",
  "100.64.0.1", "100.127.255.254", "127.0.0.1", "127.255.255.254",
  "169.254.169.254", "169.254.1.1", "172.16.0.1", "172.31.255.254",
  "192.0.0.1", "192.0.2.1", "192.168.0.1", "198.18.0.1",
  "198.19.255.254", "198.51.100.1", "203.0.113.1", "224.0.0.1",
  "239.255.255.254", "240.0.0.1", "255.255.255.255",
  "::", "::1", "fc00::1", "fdff:ffff:ffff:ffff:ffff:ffff:ffff:fffe",
  "fe80::1", "febf:ffff:ffff:ffff:ffff:ffff:ffff:fffe", "ff02::1",
  "2001:db8::1", "100::1", "2002:7f00:1::1", "2001::1", "64:ff9b:1::a00:1",
  "::ffff:127.0.0.1", "::ffff:10.0.0.1", "::ffff:169.254.169.254",
  "::192.168.1.1", "64:ff9b::a9fe:a9fe", "64:ff9b::a00:1", "fe80::1%lo0"
] as const;
const publicAddresses = [
  "1.1.1.1", "8.8.8.8", "9.9.9.9", "100.63.255.254", "100.128.0.1",
  "172.15.255.254", "172.32.0.1", "2001:4860:4860::8888",
  "2606:4700:4700::1111", "::ffff:8.8.8.8", "64:ff9b::808:808"
] as const;
const malformedAddresses = ["", "not-an-address", "8.8.8.8:443", "256.0.0.1", "1.2.3", "2001:db8:::1"] as const;

describe("P1-05 shared egress allowlist", () => {
  it.each([NAME, "deep.api.example.com", "1.1.1.1", "127.0.0.1", "169.254.169.254", "::1", "fc00::1", ""])(
    "denies %s with an empty policy", (host) => {
      expect(decideEgress(host, [PUBLIC], { allowHosts: [] }).allowed).toBe(false);
    }
  );

  it.each([
    ["exact host", NAME, [NAME], true],
    ["case-insensitive exact host", "API.EXAMPLE.COM", [NAME], true],
    ["exact entry does not include children", "deep.api.example.com", [NAME], false],
    ["exact entry does not include parent", "example.com", [NAME], false],
    ["suffix includes one child", NAME, [".example.com"], true],
    ["suffix includes nested child", "deep.api.example.com", [".example.com"], true],
    ["suffix excludes apex", "example.com", [".example.com"], false],
    ["suffix excludes hyphen lookalike", "evil-example.com", [".example.com"], false],
    ["suffix excludes appended domain", "api.example.com.evil.invalid", [".example.com"], false],
    ["suffix excludes prefix lookalike", "notexample.com", [".example.com"], false],
    ["suffix does not match IPv4", "1.1.1.1", [".1.1.1"], false],
    ["IPv4 requires its own entry", "1.1.1.1", [NAME], false],
    ["public IPv4 exact entry", "1.1.1.1", ["1.1.1.1"], true],
    ["IPv6 requires its own entry", "2606:4700:4700::1111", [NAME], false],
    ["case-insensitive suffix", "API.EXAMPLE.COM", [".EXAMPLE.COM"], true]
  ] as const)("matches only declared exact or suffix scope: %s", (_label, host, allowHosts, allowed) => {
    expect(decideEgress(host, [PUBLIC], { allowHosts }).allowed).toBe(allowed);
  });

  it.each(nonPublic)("classifies %s as non-public", (address) => {
    expect(isNonPublicAddress(address)).toBe(true);
  });

  it.each(nonPublic)("refuses an allowlisted name resolving to %s", (address) => {
    expect(decideEgress(NAME, [address], named).allowed).toBe(false);
  });

  it.each(publicAddresses)("permits the listed name resolving only to public address %s", (address) => {
    expect(decideEgress(NAME, [address], named).allowed).toBe(true);
    expect(isNonPublicAddress(address)).toBe(false);
  });

  it.each([
    "127.0.0.1", "169.254.169.254", "10.0.0.1", "172.16.0.1", "192.168.0.1",
    "::1", "fc00::1", "fe80::1", "::ffff:127.0.0.1", "64:ff9b::a9fe:a9fe"
  ])("allows a non-public destination only through its exact IP entry: %s", (address) => {
    expect(decideEgress(address, [address], { allowHosts: [address] }).allowed).toBe(true);
  });

  it("allows an inward DNS result only when that exact IP is also explicitly listed", () => {
    expect(decideEgress(NAME, ["169.254.169.254"], { allowHosts: [NAME, "169.254.169.254"] }).allowed).toBe(true);
    expect(decideEgress(NAME, ["169.254.169.253"], { allowHosts: [NAME, "169.254.169.254"] }).allowed).toBe(false);
  });

  it("does not treat an IPv4 entry as authority for a different mapped IPv6 literal", () => {
    expect(decideEgress("::ffff:127.0.0.1", [], { allowHosts: ["127.0.0.1"] }).allowed).toBe(false);
  });

  it("matches alternate canonical spellings of the same explicit IPv6 literal", () => {
    expect(decideEgress("[0:0:0:0:0:0:0:1]", [], { allowHosts: ["::1"] }).allowed).toBe(true);
    expect(decideEgress(NAME, ["0:0:0:0:0:0:0:1"], { allowHosts: [NAME, "::1"] }).allowed).toBe(true);
  });

  it.each([
    ["IPv4 public then inward", [PUBLIC, "127.0.0.1"]],
    ["IPv4 inward then public", ["127.0.0.1", PUBLIC]],
    ["IPv6 loopback", [PUBLIC, "::1"]],
    ["mapped metadata", [PUBLIC, "::ffff:169.254.169.254"]],
    ["mixed families and unique-local", [PUBLIC, "fc00::1", "2606:4700:4700::1111"]]
  ] as const)("refuses the complete mixed DNS answer: %s", (_label, addresses) => {
    expect(decideEgress(NAME, addresses, named).allowed).toBe(false);
  });

  it("requires every inward result to have its own exemption", () => {
    expect(decideEgress(NAME, ["127.0.0.1", "::1"], { allowHosts: [NAME, "127.0.0.1"] }).allowed).toBe(false);
    expect(decideEgress(NAME, ["127.0.0.1", "::1"], { allowHosts: [NAME, "127.0.0.1", "::1"] }).allowed).toBe(true);
  });

  it("names the refused address in a policy refusal", () => {
    const result = decideEgress(NAME, [PUBLIC, "169.254.169.254"], named);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("169.254.169.254");
  });

  it.each(malformedAddresses)("classifies malformed resolved address %j as non-public", (address) => {
    expect(isNonPublicAddress(address)).toBe(true);
  });


});

describe("shared address identity", () => {
  it.each([
    ["API.EXAMPLE.COM", "api.example.com"],
    ["[0:0:0:0:0:0:0:1]", "::1"],
    ["[2001:4860:4860:0:0:0:0:8888]", "2001:4860:4860::8888"]
  ])("canonicalizes host %s without granting authority", (input, expected) => {
    expect(canonicalHost(input)).toBe(expected);
  });

  it.each([
    ["API.EXAMPLE.COM.", "api.example.com"],
    ["[::ffff:127.0.0.1]", "127.0.0.1"],
    ["::192.168.1.1", "192.168.1.1"],
    ["64:ff9b::a9fe:a9fe", "169.254.169.254"],
    ["fe80::1%lo0", "fe80::1"]
  ])("canonicalizes address identity %s without changing exact-entry policy", (input, expected) => {
    expect(canonicalAddress(input)).toBe(expected);
  });
});

describe("P1-66 checked DNS resolution contract", () => {
  it("refuses an unlisted name before consulting DNS", async () => {
    const resolve = vi.fn(async (_host: string) => [PUBLIC]);
    const result = await resolveAndCheck(NAME, { allowHosts: [] }, resolve);
    expect(result.decision.allowed).toBe(false);
    expect(resolve).not.toHaveBeenCalled();
    expect(result.addresses).toEqual([]);
    expect(result.unresolved).not.toBe(true);
  });

  it("returns the actual checked public answers in resolver order", async () => {
    const answers = ["2606:4700:4700::1111", PUBLIC];
    const resolve = vi.fn(async (_host: string) => answers);
    const result = await resolveAndCheck("API.EXAMPLE.COM", named, resolve);
    expect(result.decision.allowed).toBe(true);
    expect(result.addresses).toEqual(answers);
    expect(resolve).toHaveBeenCalledTimes(1);
    expect(resolve).toHaveBeenCalledWith(NAME);
    expect(result.unresolved).not.toBe(true);
  });

  it("refuses an empty DNS answer as unresolved", async () => {
    const resolve = vi.fn(async (_host: string): Promise<string[]> => []);
    const result = await resolveAndCheck(NAME, named, resolve);
    expect(result.decision.allowed).toBe(false);
    expect(result.unresolved).toBe(true);
    expect(result.decision.reason).toContain("EGRESS_UNRESOLVED");
    expect(result.addresses).toEqual([]);
    expect(resolve).toHaveBeenCalledTimes(1);
    expect(resolve).toHaveBeenCalledWith(NAME);
  });

  it("refuses a resolver exception as unresolved", async () => {
    const resolve = vi.fn(async (_host: string): Promise<string[]> => { throw new Error("owned resolver refusal"); });
    const result = await resolveAndCheck(NAME, named, resolve);
    expect(result.decision.allowed).toBe(false);
    expect(result.unresolved).toBe(true);
    expect(result.decision.reason).toContain("EGRESS_UNRESOLVED");
    expect(resolve).toHaveBeenCalledTimes(1);
    expect(resolve).toHaveBeenCalledWith(NAME);
  });

  it("refuses mixed public/private DNS as policy denial rather than resolver failure", async () => {
    const answers = [PUBLIC, "::ffff:127.0.0.1"];
    const result = await resolveAndCheck(NAME, named, async () => answers);
    expect(result.decision.allowed).toBe(false);
    expect(result.addresses).toEqual(answers);
    expect(result.unresolved).not.toBe(true);
  });

  it("rechecks every new connection instead of caching an earlier public result", async () => {
    const resolve = vi.fn<(host: string) => Promise<readonly string[]>>()
      .mockResolvedValueOnce([PUBLIC]).mockResolvedValueOnce(["127.0.0.1"]);
    const first = await resolveAndCheck(NAME, named, resolve);
    const rebound = await resolveAndCheck(NAME, named, resolve);
    expect(first.decision.allowed).toBe(true);
    expect(rebound.decision.allowed).toBe(false);
    expect(resolve).toHaveBeenCalledTimes(2);
    expect(rebound.addresses).toEqual(["127.0.0.1"]);
  });

  it("does not use DNS for an explicitly listed literal", async () => {
    const resolve = vi.fn(async (_host: string) => [PUBLIC]);
    const result = await resolveAndCheck("[0:0:0:0:0:0:0:1]", { allowHosts: ["::1"] }, resolve);
    expect(result.decision.allowed).toBe(true);
    expect(result.addresses).toEqual(["::1"]);
    expect(resolve).not.toHaveBeenCalled();
  });

  it("does not use DNS to rescue an unlisted literal", async () => {
    const resolve = vi.fn(async (_host: string) => [PUBLIC]);
    const result = await resolveAndCheck("127.0.0.1", named, resolve);
    expect(result.decision.allowed).toBe(false);
    expect(result.addresses).toEqual(["127.0.0.1"]);
    expect(resolve).not.toHaveBeenCalled();
  });
});
