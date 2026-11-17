/**
 * What a person reads about a passport (status, evidence mix, who stands behind it) and the self-issuance block every
 * new passport carries: VERIFIED is never presented as an outside check, and a passport without an issuance block is
 * shown as not stated.
 */
import { describe, expect, test } from "vitest";
import {
  passportEvidenceMixWords,
  passportIssuanceLines,
  passportIssuanceSchema,
  passportStatusWords,
  selfIssuance,
  type PassportJson
} from "../src/passport/passportSchema.js";

const revocation = { revocationListId: "passports:ws-1:0123456789abcdef", revocationListKeyId: "a".repeat(64) };

describe("selfIssuance", () => {
  test("states self-issued, a claimed clock and the workspace's own gates, with the revocation list it names", () => {
    const issuance = selfIssuance(revocation);
    expect(issuance).toEqual({ issuerRelationship: "self", selfIssued: true, timeBasis: "claimed", statusBasis: "workspace-own-gates", ...revocation });
    expect(passportIssuanceSchema.parse(issuance)).toEqual(issuance);
  });

  test("the schema refuses a list id or key id of the wrong shape", () => {
    expect(passportIssuanceSchema.safeParse(selfIssuance({ ...revocation, revocationListId: "keys:ws-1" })).success).toBe(false);
    expect(passportIssuanceSchema.safeParse(selfIssuance({ ...revocation, revocationListKeyId: "abc" })).success).toBe(false);
  });
});

describe("passportStatusWords", () => {
  test("says VERIFIED is this workspace's own check, INFORMATIONAL is for information only, UNTRUSTED as is", () => {
    expect(passportStatusWords("VERIFIED")).toBe("VERIFIED by this workspace's own checks (self-issued: nobody outside checked it)");
    expect(passportStatusWords("INFORMATIONAL")).toBe("INFORMATIONAL (for information only: some checks were not met)");
    expect(passportStatusWords("UNTRUSTED")).toBe("UNTRUSTED");
  });
});

describe("passportEvidenceMixWords", () => {
  test("rounds each share to a whole percent", () => {
    const trust = { evidenceCoverage: { observedShare: 0.504, attestedShare: 0.25, selfReportedShare: 0.246 } } as PassportJson["trust"];
    expect(passportEvidenceMixWords({ trust })).toBe("50% observed by AMC, 25% attested by others, 25% self-reported");
  });

  test("says not measured when AMC had no evidence mix", () => {
    expect(passportEvidenceMixWords({ trust: { evidenceCoverage: null } as PassportJson["trust"] })).toBe("not measured");
  });
});

describe("passportIssuanceLines", () => {
  const base = { status: { label: "VERIFIED", reasons: [] }, trust: { evidenceCoverage: null } } as unknown as PassportJson;

  test("a self-issued passport says the signature is not a claim that its content is true", () => {
    const lines = passportIssuanceLines({ ...base, issuance: selfIssuance(revocation) });
    expect(lines[0]).toBe("status: VERIFIED by this workspace's own checks (self-issued: nobody outside checked it)");
    expect(lines[1]).toBe("evidence mix: not measured");
    expect(lines[2]).toMatch(/^self-issued: this workspace signed it about its own agent, with its own clock\..*not that it is true\.$/);
  });

  test("a passport made before issuance blocks existed is shown as issuer not stated", () => {
    expect(passportIssuanceLines({ ...base, status: { label: "UNTRUSTED", reasons: ["x"] } })).toEqual([
      "status: UNTRUSTED",
      "evidence mix: not measured",
      "issuer: not stated (a passport made before 2026-11-16); treat it as self-issued."
    ]);
  });
});
