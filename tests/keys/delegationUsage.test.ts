import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { delegationUsageDigest, delegationUsageKey, withDelegationUse } from "../../src/keys/delegationUsage.js";
import { readHighWater, recordHighWater } from "../../src/keys/highWater.js";

const homes: string[] = [];
afterEach(() => { for (const path of homes.splice(0)) rmSync(path, { recursive: true, force: true }); });
function home() { const path = mkdtempSync(join(tmpdir(), "amc-delegation-use-")); homes.push(path); return { amcHome: path }; }
const sha = "d".repeat(64);
const grant = (maxEvents: number, sha256 = sha) => ({ sha256, maxEvents, provider: "aws-kms" as const });

describe("delegation quota reservation in actual AMC-home high-water state", () => {
  it("shares a quota across writer calls, burns a failed append and survives reopen", () => {
    const opts = home();
    const ws = join(opts.amcHome, "workspace");
    const observed: number[] = [];
    const append = (write: (sequence: number) => void) => withDelegationUse(ws, grant(2), () => 0, write, opts);
    append(sequence => { observed.push(sequence); });
    expect(() => append(() => { throw new Error("durable append failed"); })).toThrow("durable append failed");
    expect(readHighWater(delegationUsageKey(ws, sha), opts)).toMatchObject({ sequence: 2, sha256: delegationUsageDigest(sha, 2) });
    expect(() => withDelegationUse(ws, grant(2), () => 0, sequence => observed.push(sequence), { ...opts })).toThrow(/maxEvents/);
    expect(observed).toEqual([1]);
  });

  it("starts a fresh machine above the actual verified durable prefix, never at zero", () => {
    const opts = home();
    const ws = join(opts.amcHome, "workspace");
    const observed = withDelegationUse(ws, grant(4), () => 3, sequence => sequence, opts);
    expect(observed).toBe(4);
    expect(() => withDelegationUse(ws, grant(4), () => 0, () => undefined, opts)).toThrow(/maxEvents/);
  });

  it("has independent counters for renewals but never silently accepts a forked mark", () => {
    const opts = home();
    const ws = join(opts.amcHome, "workspace");
    withDelegationUse(ws, grant(1), () => 0, () => undefined, opts);
    expect(withDelegationUse(ws, grant(1, "e".repeat(64)), () => 0, sequence => sequence, opts)).toBe(1);
    recordHighWater(delegationUsageKey(ws, "f".repeat(64)), 1, "a".repeat(64), opts);
    expect(() => withDelegationUse(ws, grant(2, "f".repeat(64)), () => 0, () => undefined, opts)).toThrow(/FORK_DETECTED/);
  });
});
