/** Fail-closed behaviour outside the corpus: inputs a caller got wrong, unknown shapes, and lists that do not verify. */
import { createHash } from "node:crypto";
import { describe, expect, test } from "vitest";
import { exitCode, verifyArtifact, type VerifyOptions } from "../../packages/verifier/src/index.js";
import { loadCase } from "./fixtures.js";

const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const run = (bytes: Uint8Array | string, options: VerifyOptions) => verifyArtifact(typeof bytes === "string" ? Buffer.from(bytes) : bytes, options);
const base = loadCase("valid-attestation");

describe("artifacts that are not v1 records", () => {
  test.each([
    ["not JSON", "{\"type\":", "MALFORMED"],
    ["a repeated key", "{\"type\":\"amc.scoped-attestation\",\"type\":\"amc.scoped-attestation\"}", "MALFORMED"],
    ["a __proto__ key", "{\"__proto__\":{}}", "MALFORMED"],
    ["not UTF-8", Buffer.from([0x22, 0xff, 0x22]), "MALFORMED"],
    ["a number", "42", "MALFORMED"],
    ["an unknown record type", "{\"type\":\"amc.certificate\",\"version\":1}", "UNSUPPORTED_VERSION"],
    ["a receipt token that is not two base64url parts", "\"abc\"", "MALFORMED"],
    ["a receipt token whose signature is short", `"${Buffer.from("{}").toString("base64url")}.AAAA"`, "MALFORMED"]
  ])("%s fails integrity and nothing else is read", (_name, bytes, code) => {
    const report = run(bytes as string, base.options);
    expect(report.integrity.status).toBe("fail");
    expect(report.reasonCodes.integrity).toEqual([code]);
    for (const dimension of ["issuerAdmission", "scope", "freshness", "completeness", "satisfaction"] as const) expect(report[dimension].status).toBe("not-evaluated");
    expect(report.trusted).toBe(false);
    expect(exitCode(report)).toBe(1);
  });

  test("a P1-08 record is accepted only in its canonical encoding", () => {
    const { bytes, options } = loadCase("valid-revocation-list");
    expect(exitCode(run(bytes, options))).toBe(3);
    const pretty = Buffer.from(JSON.stringify(JSON.parse(bytes.toString("utf8")), null, 2));
    expect(run(pretty, options).reasonCodes.integrity).toEqual(["MALFORMED"]);
  });
});

describe("trust the caller supplies", () => {
  test("an unpinned issuer never passes, whatever the artifact carries", () => {
    const report = run(base.bytes, { ...base.options, trustLists: [], trustRoots: [] });
    expect(report.issuerAdmission.status).toBe("fail");
    expect(report.reasonCodes.issuerAdmission).toEqual(["ISSUER_NOT_PINNED"]);
  });

  test("a trust list with one bad signature row admits nobody, even beside a good list", () => {
    const list = structuredClone(base.options.trustLists[0]) as { signatures: Array<{ signature: string }> };
    list.signatures.push({ ...list.signatures[0]!, signature: Buffer.alloc(64).toString("base64") });
    const report = run(base.bytes, { ...base.options, trustLists: [base.options.trustLists[0], list] });
    expect(report.reasonCodes.issuerAdmission).toContain("TRUST_LIST_SIGNATURE_INVALID");
    expect(report.issuerAdmission.status).toBe("fail");
  });

  test("a trust list that does not parse admits nobody", () => {
    const report = run(base.bytes, { ...base.options, trustLists: [{ list: {}, signatures: [] }] });
    expect(report.reasonCodes.issuerAdmission).toContain("TRUST_LIST_SIGNATURE_INVALID");
  });

  test("a trust-list artifact changed after signing fails integrity", () => {
    const { bytes, options } = loadCase("valid-trust-list");
    const list = JSON.parse(bytes.toString("utf8")) as { list: { sequence: number } };
    list.list.sequence += 1;
    expect(run(JSON.stringify(list), options).reasonCodes.integrity).toEqual(["SIGNATURE_INVALID"]);
  });

  test("a trust-list artifact is refused when expired, rolled back or signed by no pinned root", () => {
    const { bytes, options } = loadCase("valid-trust-list");
    expect(run(bytes, { ...options, asOf: new Date("2027-09-02T00:00:00.000Z") }).reasonCodes.issuerAdmission).toContain("TRUST_LIST_EXPIRED");
    expect(run(bytes, { ...options, knownSequences: { "fixtures-v1": 9 } }).reasonCodes.issuerAdmission).toContain("ROLLBACK_DETECTED");
    expect(run(bytes, { ...options, trustRoots: ["0".repeat(64)] }).reasonCodes.issuerAdmission).toContain("ISSUER_NOT_PINNED");
  });

  test("a root rotation of a root set the verifier did not pin is not authorized", () => {
    const { bytes, options } = loadCase("valid-root-rotation");
    const report = run(bytes, { ...options, trustRoots: [options.trustRoots[0]!] });
    expect(report.issuerAdmission.status).toBe("fail");
    expect(report.reasonCodes.issuerAdmission).toContain("ISSUER_NOT_PINNED");
  });

  test("a key rotation signed by a root the verifier did not pin is not authorized", () => {
    const { bytes, options } = loadCase("valid-key-rotation");
    const signed = JSON.parse(bytes.toString("utf8")) as { signatures: Array<{ by: string; keyId: string; signature: string }> };
    signed.signatures.push({ by: "root", keyId: "f".repeat(64), signature: signed.signatures[0]!.signature });
    const report = run(JSON.stringify(signed), options);
    expect(report.reasonCodes.issuerAdmission).toContain("ISSUER_NOT_PINNED");
  });
});

describe("evidence and options", () => {
  test("evidence supplied under a digest it does not hash to fails integrity", () => {
    const evidence = new Map(base.options.evidence);
    const [digest, bytes] = [...evidence][0]!;
    evidence.set("0".repeat(64), bytes);
    expect(sha256(bytes)).toBe(digest);
    expect(run(base.bytes, { ...base.options, evidence }).reasonCodes.integrity).toEqual(["DIGEST_MISMATCH"]);
  });

  test("without an expected scope, scope and satisfaction are not evaluated (exit 3, never success)", () => {
    const report = run(base.bytes, { ...base.options, expectScope: undefined });
    expect(report.scope.status).toBe("not-evaluated");
    expect(report.satisfaction.status).toBe("not-evaluated");
    expect(exitCode(report)).toBe(3);
  });

  test.each([
    ["a trust root that is not 64 hex", { trustRoots: ["ABC"] }],
    ["an invalid asOf", { asOf: new Date("nope") }],
    ["a negative known sequence", { knownSequences: { subject: -1 } }],
    ["an empty expected tenant", { expectScope: { tenant: "" } }],
    ["an unknown scope key", { expectScope: { region: "eu" } as never }]
  ])("refuses %s as a usage error", (_name, override) => {
    expect(() => run(base.bytes, { ...base.options, ...override })).toThrow(TypeError);
  });
});

describe("external evidence authorities", () => {
  test("an authority two supplied lists name matches neither", () => {
    const { bytes, options } = loadCase("valid-external-evidence-attested");
    const report = run(bytes, { ...options, trustLists: [options.trustLists[0], options.trustLists[0]] });
    expect(report.reasonCodes.issuerAdmission).toEqual(["ISSUER_WRONG_PURPOSE"]);
  });
});
