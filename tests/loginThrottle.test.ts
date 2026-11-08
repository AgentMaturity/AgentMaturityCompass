import { describe, expect, test } from "vitest";
import { createLoginThrottle } from "../src/studio/loginThrottle.js";

// LIVE-RUNTIME-04 (D-R5): the hard refusal is per (username, address); per username only a delay, never a refusal.
function clock(start = 1_000_000): { now: () => number; advance: (ms: number) => void } {
  let at = start;
  return { now: () => at, advance: (ms) => { at += ms; } };
}

describe("login throttle", () => {
  test("10 failures from one address refuse that pair with a Retry-After that counts down the window", () => {
    const time = clock();
    const throttle = createLoginThrottle({ now: time.now });
    for (let i = 0; i < 9; i += 1) throttle.fail("owner", "10.0.0.1", true);
    expect(throttle.check("owner", "10.0.0.1")).toEqual({ allowed: true, delayMs: 0 });
    throttle.fail("owner", "10.0.0.1", true);
    const error = "too many failed logins for this account from this address";
    expect(throttle.check("owner", "10.0.0.1")).toEqual({ allowed: false, retryAfterSeconds: 900, firstRefusal: true, error });
    time.advance(60_000);
    expect(throttle.check("owner", "10.0.0.1")).toEqual({ allowed: false, retryAfterSeconds: 840, firstRefusal: false, error });
  });

  test("the same username from another address is allowed", () => {
    const throttle = createLoginThrottle({ now: clock().now });
    for (let i = 0; i < 10; i += 1) throttle.fail("owner", "10.0.0.1", true);
    expect(throttle.check("owner", "10.0.0.2")).toEqual({ allowed: true, delayMs: 0 });
  });

  test("30 failures across addresses delay every address by 2 s and never refuse one", () => {
    const throttle = createLoginThrottle({ now: clock().now });
    for (let i = 0; i < 30; i += 1) throttle.fail("owner", `10.0.${i}.1`, true);
    expect(throttle.check("owner", "192.0.2.50")).toEqual({ allowed: true, delayMs: 2_000 });
    expect(throttle.check("owner", "10.0.0.1")).toEqual({ allowed: true, delayMs: 2_000 });
    expect(throttle.check("someone-else", "10.0.0.1")).toEqual({ allowed: true, delayMs: 0 });
  });

  test("a success resets its pair", () => {
    const throttle = createLoginThrottle({ now: clock().now });
    for (let i = 0; i < 9; i += 1) throttle.fail("owner", "10.0.0.1", true);
    throttle.succeed("owner", "10.0.0.1");
    for (let i = 0; i < 9; i += 1) throttle.fail("owner", "10.0.0.1", true);
    expect(throttle.check("owner", "10.0.0.1").allowed).toBe(true);
    throttle.fail("owner", "10.0.0.1", true);
    expect(throttle.check("owner", "10.0.0.1").allowed).toBe(false);
  });

  test("the window expires", () => {
    const time = clock();
    const throttle = createLoginThrottle({ now: time.now });
    for (let i = 0; i < 30; i += 1) throttle.fail("owner", "10.0.0.1", true);
    expect(throttle.check("owner", "10.0.0.1").allowed).toBe(false);
    time.advance(15 * 60_000);
    expect(throttle.check("owner", "10.0.0.1")).toEqual({ allowed: true, delayMs: 0 });
  });

  // SR-2: on an address that may be a proxy's own (shared by everyone behind it), a pair refusal would lock every client
  // out, so it only delays. SR-1: there failures from such addresses refuse at 30, so rotating them buys no extra
  // guesses; an attempt from an address that stands for one client is never refused by them.
  test("on a shared (untrusted) address the pair only delays and untrusted failures refuse", () => {
    const throttle = createLoginThrottle({ now: clock().now });
    for (let i = 0; i < 10; i += 1) throttle.fail("owner", "10.0.0.1", false);
    expect(throttle.check("owner", "10.0.0.1", false)).toEqual({ allowed: true, delayMs: 2_000 });
    expect(throttle.check("owner", "10.0.0.1", true), "the same pair on a trusted address refuses").toMatchObject({ allowed: false });
    for (let i = 0; i < 20; i += 1) throttle.fail("owner", `10.1.${i}.1`, false);
    expect(throttle.check("owner", "192.0.2.50", false)).toEqual({ allowed: false, retryAfterSeconds: 900, firstRefusal: true, error: "too many failed logins for this account" });
    expect(throttle.check("owner", "192.0.2.50", true), "an untrusted flood does not lock out a trusted-address user").toEqual({ allowed: true, delayMs: 2_000 });
  });

  // SR-11: the untrusted refusal counted failures from every source, so failures from trusted addresses (an attacker
  // behind the named proxy, or a user's own typos) locked the account for everyone on an untrusted address.
  test("failures from trusted addresses never trip the untrusted refusal; the username cap only delays there", () => {
    const throttle = createLoginThrottle({ now: clock().now });
    for (let i = 0; i < 40; i += 1) throttle.fail("owner", `10.2.${i}.1`, true);
    expect(throttle.check("owner", "192.0.2.60", false)).toEqual({ allowed: true, delayMs: 2_000 });
    for (let i = 0; i < 29; i += 1) throttle.fail("owner", `10.3.${i}.1`, false);
    expect(throttle.check("owner", "192.0.2.60", false).allowed, "29 untrusted failures do not refuse").toBe(true);
    throttle.fail("owner", "10.3.99.1", false);
    expect(throttle.check("owner", "192.0.2.60", false).allowed, "the 30th does").toBe(false);
  });

  // SR-11, coordinator correction: behind a same-host proxy AMC does not trust, every outside client arrives from loopback,
  // so exempting loopback gave unlimited guesses. Loopback keeps a refusing window of its own in both modes (127.0.0.1
  // and ::1 share it), and failures from other untrusted addresses neither feed nor trip it, nor it theirs.
  test("loopback keeps a finite refusing window of its own, in both modes", () => {
    const throttle = createLoginThrottle({ now: clock().now });
    for (let i = 0; i < 9; i += 1) throttle.fail("owner", i % 2 === 0 ? "127.0.0.1" : "::1", false);
    expect(throttle.check("owner", "127.0.0.1", false)).toEqual({ allowed: true, delayMs: 0 });
    throttle.fail("owner", "::1", false);
    expect(throttle.check("owner", "127.0.0.1", false)).toEqual({ allowed: false, retryAfterSeconds: 900, firstRefusal: true,
      error: "too many failed logins for this account from this address" });
    expect(throttle.check("owner", "::1", true), "the same window when no proxy is involved").toMatchObject({ allowed: false });
    expect(throttle.check("owner", "192.0.2.80", true), "a trusted address elsewhere is not locked").toEqual({ allowed: true, delayMs: 0 });
    for (let i = 0; i < 30; i += 1) throttle.fail("owner", "127.0.0.1", false);
    expect(throttle.check("owner", "192.0.2.81", false), "loopback failures never feed the untrusted count").toEqual({ allowed: true, delayMs: 2_000 });
    const flooded = createLoginThrottle({ now: clock().now });
    for (let i = 0; i < 30; i += 1) flooded.fail("owner", `10.4.${i}.1`, false);
    expect(flooded.check("owner", "192.0.2.70", false).allowed, "the untrusted flood refuses other untrusted addresses").toBe(false);
    expect(flooded.check("owner", "127.0.0.1", false), "but not loopback, whose window is its own").toEqual({ allowed: true, delayMs: 2_000 });
  });

  test("usernames are compared trimmed and case-insensitively", () => {
    const throttle = createLoginThrottle({ now: clock().now });
    for (let i = 0; i < 10; i += 1) throttle.fail(i % 2 === 0 ? "Owner" : " owner ", "10.0.0.1", true);
    expect(throttle.check("OWNER", "10.0.0.1").allowed).toBe(false);
  });
});
