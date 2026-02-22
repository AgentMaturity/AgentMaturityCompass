import { createHmac, sign } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import { ensureSigningKeys, getPrivateKeyPem } from "../src/crypto/keys.js";
import { issueSessionToken, parseCookieHeader, verifySessionToken } from "../src/auth/sessionTokens.js";
import {
  hashHostPassword,
  issueHostSessionToken,
  verifyHostPassword,
  verifyHostSessionToken
} from "../src/workspaces/hostAuth.js";
import { computeMaturityScore, evidenceDecay, improvementVelocity, type EvidenceArtifact } from "../src/score/formalSpec.js";
import { detectTrustBoundaryViolation } from "../src/ledger/ledger.js";
import { type VerifyAllReport, verifyAllTopReasons } from "../src/verify/verifyAll.js";
import { canonicalize } from "../src/utils/json.js";

const tempRoots: string[] = [];

function makeWorkspace(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempRoots.push(dir);
  return dir;
}

function toBase64Url(bytes: Buffer): string {
  return bytes.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(value: string): Buffer {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const pad = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  return Buffer.from(`${normalized}${pad}`, "base64");
}

afterEach(() => {
  vi.restoreAllMocks();
  while (tempRoots.length > 0) {
    const root = tempRoots.pop();
    if (root) {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

describe("wave4 critical auth paths", () => {
  test("session tokens enforce a minimum 5 minute TTL", () => {
    const workspace = makeWorkspace("amc-wave4-auth-");
    ensureSigningKeys(workspace);

    const issued = issueSessionToken({
      workspace,
      userId: "user-1",
      username: "alice",
      roles: ["OWNER"],
      ttlMs: 1
    });

    expect(issued.payload.expiresTs - issued.payload.issuedTs).toBeGreaterThanOrEqual(5 * 60_000);
  });

  test("session token verification rejects malformed token format", () => {
    const workspace = makeWorkspace("amc-wave4-auth-");
    ensureSigningKeys(workspace);

    const issued = issueSessionToken({
      workspace,
      userId: "user-2",
      username: "bob",
      roles: ["OWNER"]
    });
    const invalid = `${issued.token}.extra`;
    const verified = verifySessionToken({ workspace, token: invalid });

    expect(verified.ok).toBe(false);
    expect(verified.error).toContain("format");
  });

  test("session token verification fails when signature is tampered", () => {
    const workspace = makeWorkspace("amc-wave4-auth-");
    ensureSigningKeys(workspace);

    const issued = issueSessionToken({
      workspace,
      userId: "user-3",
      username: "carol",
      roles: ["OWNER"]
    });
    const [payloadPart, sigPart] = issued.token.split(".");
    const last = sigPart!.at(-1);
    const replacement = last === "A" ? "B" : "A";
    const tampered = `${payloadPart}.${sigPart!.slice(0, -1)}${replacement}`;
    const verified = verifySessionToken({ workspace, token: tampered });

    expect(verified.ok).toBe(false);
    expect(verified.error).toContain("signature verification failed");
  });

  test("session token verification returns expired payload when token is expired", () => {
    const workspace = makeWorkspace("amc-wave4-auth-");
    ensureSigningKeys(workspace);

    const issued = issueSessionToken({
      workspace,
      userId: "user-4",
      username: "dana",
      roles: ["OWNER"]
    });
    const [payloadPart] = issued.token.split(".");
    const payload = JSON.parse(fromBase64Url(payloadPart!).toString("utf8")) as Record<string, unknown>;
    payload.expiresTs = Date.now() - 1;
    const payloadBytes = Buffer.from(canonicalize(payload), "utf8");
    const sig = sign(null, payloadBytes, getPrivateKeyPem(workspace, "session"));
    const expiredToken = `${toBase64Url(payloadBytes)}.${toBase64Url(sig)}`;

    const verified = verifySessionToken({ workspace, token: expiredToken });

    expect(verified.ok).toBe(false);
    expect(verified.error).toContain("expired");
    expect(verified.payload?.userId).toBe("user-4");
  });

  test("cookie parser decodes encoded values and keeps '=' payload", () => {
    const cookie = "x=1; amc_session=abc%3D123%3D%3D; y=2";
    expect(parseCookieHeader(cookie, "amc_session")).toBe("abc=123==");
  });

  test("host password hashing rejects short passwords and verifies valid hash", () => {
    expect(() => hashHostPassword("short")).toThrow("at least 8");

    const hash = hashHostPassword("long-enough-password");
    expect(verifyHostPassword("long-enough-password", hash)).toBe(true);
    expect(verifyHostPassword("wrong-password", hash)).toBe(false);
    expect(verifyHostPassword("long-enough-password", "{\"v\":2}")).toBe(false);
  });

  test("host session verification fails when signature is tampered", () => {
    const hostDir = makeWorkspace("amc-wave4-host-");
    const issued = issueHostSessionToken({
      hostDir,
      userId: "host-1",
      username: "owner",
      isHostAdmin: true
    });
    const [payloadPart, sigPart] = issued.token.split(".");
    const tampered = `${payloadPart}.${sigPart!.slice(0, -1)}A`;
    const verified = verifyHostSessionToken({ hostDir, token: tampered });

    expect(verified.ok).toBe(false);
    expect(verified.error).toContain("signature verification failed");
  });

  test("host session verification returns expired payload for expired token", () => {
    const hostDir = makeWorkspace("amc-wave4-host-");
    const issued = issueHostSessionToken({
      hostDir,
      userId: "host-2",
      username: "operator",
      isHostAdmin: false
    });

    const [payloadPart] = issued.token.split(".");
    const payload = JSON.parse(fromBase64Url(payloadPart!).toString("utf8")) as Record<string, unknown>;
    payload.expiresTs = Date.now() - 1;
    const payloadBytes = Buffer.from(canonicalize(payload), "utf8");
    const secret = readFileSync(join(hostDir, ".host-session.secret"));
    const sig = createHmac("sha256", secret).update(payloadBytes).digest();
    const expiredToken = `${toBase64Url(payloadBytes)}.${toBase64Url(sig)}`;

    const verified = verifyHostSessionToken({ hostDir, token: expiredToken });

    expect(verified.ok).toBe(false);
    expect(verified.error).toContain("expired");
    expect(verified.payload?.userId).toBe("host-2");
  });
});

describe("wave4 critical scoring + verification paths", () => {
  test("maturity scoring keeps weighted-decay math stable (regression guard)", () => {
    const now = Date.UTC(2026, 0, 1);
    vi.spyOn(Date, "now").mockReturnValue(now);
    const halfLifeMs = 90 * 24 * 60 * 60 * 1000;

    const evidence: EvidenceArtifact[] = [
      { qid: "AMC-1.1", kind: "observed", trust: 1, payload: {}, timestamp: new Date(now) },
      { qid: "AMC-1.2", kind: "self_reported", trust: 0.2, payload: {}, timestamp: new Date(now - halfLifeMs) },
      { qid: "AMC-2.1", kind: "attested", trust: 0.5, payload: {}, timestamp: new Date(now) }
    ];

    const result = computeMaturityScore(evidence, { "AMC-1": 2, "AMC-2": 1 });
    const halfDecay = evidenceDecay(halfLifeMs);

    const dim1Expected = (1 * 1 * 1 + 0.2 * 0.4 * halfDecay) / (1 * 1 + 0.4 * halfDecay);
    const dim2Expected = (0.5 * 0.8 * 1) / 0.8;
    const overallExpected = (dim1Expected * 2 + dim2Expected) / 3;

    expect(result.dimensionScores["AMC-1"]?.score).toBeCloseTo(dim1Expected, 6);
    expect(result.dimensionScores["AMC-2"]?.score).toBeCloseTo(dim2Expected, 6);
    expect(result.overallScore).toBeCloseTo(overallExpected, 6);
    expect(result.overallLevel).toBe("L3");
  });

  test("maturity scoring handles empty input and keeps L0 baseline", () => {
    const result = computeMaturityScore([]);
    expect(result.overallScore).toBe(0);
    expect(result.overallLevel).toBe("L0");
    expect(Object.keys(result.dimensionScores)).toEqual([]);
  });

  test("improvementVelocity returns zero for zero-day deltas", () => {
    const before = computeMaturityScore([
      { qid: "AMC-1.1", kind: "observed", trust: 0.2, payload: {}, timestamp: new Date() }
    ]);
    const after = computeMaturityScore([
      { qid: "AMC-1.1", kind: "observed", trust: 0.9, payload: {}, timestamp: new Date() }
    ]);
    expect(improvementVelocity(before, after, 0)).toBe(0);
  });

  test("trust boundary detector fails closed when mode is not isolated", () => {
    const violated = detectTrustBoundaryViolation("/tmp/unused", {
      security: {
        trustBoundaryMode: "shared"
      }
    } as never);
    const ok = detectTrustBoundaryViolation("/tmp/unused", {
      security: {
        trustBoundaryMode: "isolated"
      }
    } as never);

    expect(violated.violated).toBe(true);
    expect(violated.message).toContain("trust boundary violated");
    expect(ok).toEqual({ violated: false, message: null });
  });

  test("verifyAllTopReasons returns only top 5 critical failures", () => {
    const report: VerifyAllReport = {
      status: "FAIL",
      criticalFail: true,
      generatedTs: 1,
      checks: [
        { id: "a", status: "FAIL", critical: true, details: ["a-1", "a-2"] },
        { id: "b", status: "FAIL", critical: false, details: ["b-1"] },
        { id: "c", status: "PASS", critical: true, details: ["c-1"] },
        { id: "d", status: "FAIL", critical: true, details: ["d-1"] },
        { id: "e", status: "FAIL", critical: true, details: ["e-1"] },
        { id: "f", status: "FAIL", critical: true, details: ["f-1"] },
        { id: "g", status: "FAIL", critical: true, details: ["g-1"] }
      ]
    };

    expect(verifyAllTopReasons(report)).toEqual([
      "a: a-1",
      "a: a-2",
      "d: d-1",
      "e: e-1",
      "f: f-1",
      "g: g-1"
    ]);
  });
});
