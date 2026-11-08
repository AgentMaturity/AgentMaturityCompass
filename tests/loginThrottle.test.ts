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
    for (let i = 0; i < 9; i += 1) throttle.fail("owner", "10.0.0.1");
    expect(throttle.check("owner", "10.0.0.1")).toEqual({ allowed: true, delayMs: 0 });
    throttle.fail("owner", "10.0.0.1");
    expect(throttle.check("owner", "10.0.0.1")).toEqual({ allowed: false, retryAfterSeconds: 900, firstRefusal: true });
    time.advance(60_000);
    expect(throttle.check("owner", "10.0.0.1")).toEqual({ allowed: false, retryAfterSeconds: 840, firstRefusal: false });
  });

  test("the same username from another address is allowed", () => {
    const throttle = createLoginThrottle({ now: clock().now });
    for (let i = 0; i < 10; i += 1) throttle.fail("owner", "10.0.0.1");
    expect(throttle.check("owner", "10.0.0.2")).toEqual({ allowed: true, delayMs: 0 });
  });

  test("30 failures across addresses delay every address by 2 s and never refuse one", () => {
    const throttle = createLoginThrottle({ now: clock().now });
    for (let i = 0; i < 30; i += 1) throttle.fail("owner", `10.0.${i}.1`);
    expect(throttle.check("owner", "192.0.2.50")).toEqual({ allowed: true, delayMs: 2_000 });
    expect(throttle.check("owner", "10.0.0.1")).toEqual({ allowed: true, delayMs: 2_000 });
    expect(throttle.check("someone-else", "10.0.0.1")).toEqual({ allowed: true, delayMs: 0 });
  });

  test("a success resets its pair", () => {
    const throttle = createLoginThrottle({ now: clock().now });
    for (let i = 0; i < 9; i += 1) throttle.fail("owner", "10.0.0.1");
    throttle.succeed("owner", "10.0.0.1");
    for (let i = 0; i < 9; i += 1) throttle.fail("owner", "10.0.0.1");
    expect(throttle.check("owner", "10.0.0.1").allowed).toBe(true);
    throttle.fail("owner", "10.0.0.1");
    expect(throttle.check("owner", "10.0.0.1").allowed).toBe(false);
  });

  test("the window expires", () => {
    const time = clock();
    const throttle = createLoginThrottle({ now: time.now });
    for (let i = 0; i < 30; i += 1) throttle.fail("owner", "10.0.0.1");
    expect(throttle.check("owner", "10.0.0.1").allowed).toBe(false);
    time.advance(15 * 60_000);
    expect(throttle.check("owner", "10.0.0.1")).toEqual({ allowed: true, delayMs: 0 });
  });

  test("usernames are compared trimmed and case-insensitively", () => {
    const throttle = createLoginThrottle({ now: clock().now });
    for (let i = 0; i < 10; i += 1) throttle.fail(i % 2 === 0 ? "Owner" : " owner ", "10.0.0.1");
    expect(throttle.check("OWNER", "10.0.0.1").allowed).toBe(false);
  });
});
