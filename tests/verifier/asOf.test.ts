import { describe, expect, test } from "vitest";
import { verifyArtifact } from "../../packages/verifier/src/index.js";
import { loadCase } from "./fixtures.js";

const { bytes, options } = loadCase("valid-attestation");
const attestation = JSON.parse(bytes.toString("utf8")) as { issuedAt: string; expiresAt: string };
const at = (ms: number) => verifyArtifact(bytes, { ...options, asOf: new Date(ms) });

describe("valid as of T", () => {
  test("passes as of its issue date", () => {
    const report = at(Date.parse(attestation.issuedAt));
    expect(report.asOf).toBe(attestation.issuedAt);
    expect(report.freshness).toEqual({ status: "pass", reasons: [] });
    expect(report.satisfaction.status).toBe("pass");
    expect(report.time).toEqual({ claimedAt: attestation.issuedAt, attested: null, basis: "claimed" });
  });

  test("passes one millisecond before expiresAt and fails at it and one millisecond after", () => {
    const expires = Date.parse(attestation.expiresAt);
    expect(at(expires - 1).freshness.status).toBe("pass");
    for (const ms of [expires, expires + 1]) {
      const report = at(ms);
      expect(report.freshness.status).toBe("fail");
      expect(report.reasonCodes.freshness).toEqual(["ATTESTATION_EXPIRED"]);
      expect(report.satisfaction.status).toBe("not-evaluated");
    }
  });

  test("one millisecond before issuance it is not yet valid", () => {
    const report = at(Date.parse(attestation.issuedAt) - 1);
    expect(report.reasonCodes.freshness).toEqual(["NOT_YET_VALID"]);
  });

  test("verifiedAt is this machine's clock, asOf is the caller's", () => {
    const before = Date.now();
    const report = at(Date.parse(attestation.issuedAt));
    expect(Date.parse(report.verifiedAt)).toBeGreaterThanOrEqual(before);
    expect(report.asOf).not.toBe(report.verifiedAt);
  });

  test("the default as-of time is now", () => {
    const before = Date.now();
    const report = verifyArtifact(bytes, { ...options, asOf: undefined });
    expect(Date.parse(report.asOf)).toBeGreaterThanOrEqual(before);
    expect(Date.parse(report.asOf)).toBeLessThanOrEqual(Date.now());
  });
});
