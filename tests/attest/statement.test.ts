import { createHash } from "node:crypto";
import { describe, expect, test } from "vitest";
import {
  AttestationRefused,
  buildControlResultsStatement,
  CONTROL_RESULTS_PREDICATE,
  INTOTO_STATEMENT_TYPE,
  inTotoStatementSchema,
  subjectMismatches,
  type ControlResultsInput
} from "../../src/attest/statement.js";

const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const aibom = Buffer.from('{"bomFormat":"CycloneDX","specVersion":"1.6"}\n', "utf8");
const run = Buffer.from('{"runId":"run-42"}', "utf8");

function input(overrides: Partial<ControlResultsInput> = {}): ControlResultsInput {
  return {
    subjects: [{ name: "attestations/aibom.cdx.json", bytes: aibom }, { name: "run.json", bytes: run }],
    claimKinds: ["observed"],
    signerPurpose: "artifact-seal",
    scope: { tenant: null, deployment: null, workspace: "ws-1", agent: "agent-1", snapshot: sha256(run), profile: "amc.diagnostic",
      profileVersion: "2.0.0", window: { start: "2026-12-01T00:00:00.000Z", end: "2026-12-31T23:59:59.999Z" }, exclusions: [] },
    controls: [{ controlId: "amc.diagnostic", dimensions: { applicability: { state: "applicable" }, evidence: "sufficient", result: "pass",
      enforcement: { state: "observed" }, review: "pending" } }],
    evidence: [{ sha256: "a".repeat(64), kind: "ledger-slice" }],
    verifierReport: null,
    issuedAt: new Date("2027-01-02T09:00:00.000Z"),
    ...overrides
  };
}

describe("in-toto Statement v1 with the control-results predicate", () => {
  test("subject digests are the sha256 of the AIBOM and run bytes, and the statement matches the schema", () => {
    const statement = buildControlResultsStatement(input());
    expect(statement._type).toBe(INTOTO_STATEMENT_TYPE);
    expect(statement.predicateType).toBe(CONTROL_RESULTS_PREDICATE);
    expect(statement.subject).toEqual([
      { name: "attestations/aibom.cdx.json", digest: { sha256: sha256(aibom) } },
      { name: "run.json", digest: { sha256: sha256(run) } }
    ]);
    expect(statement.predicate.claimKind).toBe("observed");
    expect(statement.predicate.issuedAt).toBe("2027-01-02T09:00:00.000Z");
    expect(statement.predicate.expiresAt).toBe("2027-04-02T09:00:00.000Z");
    expect(statement.predicate.notice).toMatch(/not that the statement is true or that the agent behaved well/);
    expect(inTotoStatementSchema.parse(statement)).toEqual(statement);
  });

  test("subjectMismatches names a changed AIBOM and a missing subject, and nothing for the signed bytes", () => {
    const statement = buildControlResultsStatement(input());
    const tampered = Buffer.from(aibom);
    tampered[2] ^= 1;
    expect(subjectMismatches(statement, new Map([["attestations/aibom.cdx.json", aibom], ["run.json", run]]))).toEqual([]);
    expect(subjectMismatches(statement, new Map([["attestations/aibom.cdx.json", tampered], ["run.json", run]])))
      .toEqual([expect.stringContaining("attestations/aibom.cdx.json")]);
    expect(subjectMismatches(statement, new Map([["run.json", run]]))).toEqual([expect.stringContaining("not supplied")]);
  });

  test("any synthetic evidence refuses the attestation with SYNTHETIC_NOT_ATTESTABLE", () => {
    const attempt = () => buildControlResultsStatement(input({ claimKinds: ["observed", "synthetic_example"] }));
    expect(attempt).toThrow(AttestationRefused);
    expect(attempt).toThrow(expect.objectContaining({ code: "SYNTHETIC_NOT_ATTESTABLE" }));
  });

  test("the claim kind is the weakest of the evidence it is built on", () => {
    expect(buildControlResultsStatement(input({ claimKinds: ["observed", "self_reported"] })).predicate.claimKind).toBe("self_reported");
  });

  test("independently_reviewed needs a key admitted for independent-attestation", () => {
    const attempt = () => buildControlResultsStatement(input({ claimKinds: ["independently_reviewed"] }));
    expect(attempt).toThrow(expect.objectContaining({ code: "INDEPENDENT_REVIEW_KEY_REQUIRED" }));
    const statement = buildControlResultsStatement(input({ claimKinds: ["independently_reviewed"], signerPurpose: "independent-attestation" }));
    expect(statement.predicate.claimKind).toBe("independently_reviewed");
  });

  test("a pass without applicable, sufficient evidence is refused, as in the control-result contract", () => {
    expect(() => buildControlResultsStatement(input({ controls: [{ controlId: "amc.diagnostic", dimensions: { applicability: { state: "applicable" },
      evidence: "incomplete", result: "pass", enforcement: { state: "observed" }, review: "pending" } as never }] }))).toThrow();
  });

  test("a statement without evidence claim kinds, subjects or controls is refused", () => {
    expect(() => buildControlResultsStatement(input({ claimKinds: [] }))).toThrow(/claim kind/);
    expect(() => buildControlResultsStatement(input({ subjects: [] }))).toThrow();
    expect(() => buildControlResultsStatement(input({ controls: [] }))).toThrow();
  });
});
