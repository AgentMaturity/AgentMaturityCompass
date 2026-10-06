import { createHash, generateKeyPairSync } from "node:crypto";
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  readSignedTrustListFile, signTrustList, trustListSchema, verifySignedTrustList, type TrustListErrorCode
} from "../../src/trust/index.js";
import { listEntry, rawSignature, testKey, trustList } from "./trustFixtures.js";

const sha256 = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
const NOW = new Date("2026-10-06T00:00:00.000Z");
const root = testKey();
const auditor = testKey();
const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });

function codeOf(run: () => unknown): TrustListErrorCode | string {
  try {
    run();
  } catch (error) {
    return (error as { code?: string }).code ?? String(error);
  }
  return "no error";
}
const verify = (signed: unknown, roots = [root.keyId], now = NOW) =>
  verifySignedTrustList(signed, { pinnedRootKeyIds: roots, now });

describe("signed trust lists", () => {
  it("a list signed by a pinned root parses, with the spec's signed bytes", () => {
    const list = trustList([listEntry(auditor)]);
    const signed = signTrustList(list, root.privateKeyPem);
    expect(signed.signatures).toEqual([rawSignature(list, root)]);
    expect(verify(signed)).toEqual(list);
  });

  it("a list signed by an unpinned root gives TRUST_LIST_SIGNATURE_INVALID", () => {
    const signed = signTrustList(trustList([listEntry(auditor)]), testKey().privateKeyPem);
    expect(codeOf(() => verify(signed))).toBe("TRUST_LIST_SIGNATURE_INVALID");
    expect(codeOf(() => verify(signed, []))).toBe("TRUST_LIST_SIGNATURE_INVALID");
  });

  it("a purpose added after signing invalidates the list", () => {
    const signed = signTrustList(trustList([listEntry(auditor)]), root.privateKeyPem);
    signed.list.entries[0]!.purposes.push("release");
    expect(codeOf(() => verify(signed))).toBe("TRUST_LIST_SIGNATURE_INVALID");
  });

  it("a signature whose public key does not hash to its key id is refused", () => {
    const list = trustList([listEntry(auditor)]);
    const forged = { ...rawSignature(list, testKey()), keyId: root.keyId };
    expect(codeOf(() => verify({ list, signatures: [forged] }))).toBe("TRUST_LIST_SIGNATURE_INVALID");
  });

  it("an expired list gives TRUST_LIST_EXPIRED", () => {
    const signed = signTrustList(trustList([listEntry(auditor)]), root.privateKeyPem);
    expect(codeOf(() => verify(signed, [root.keyId], new Date("2027-06-01T00:00:00.000Z")))).toBe("TRUST_LIST_EXPIRED");
  });

  const rsa = generateKeyPairSync("rsa", { modulusLength: 2048 }).publicKey.export({ type: "spki", format: "pem" }).toString();
  const refused: Array<[string, () => unknown]> = [
    ["duplicate key id", () => trustList([listEntry(auditor), listEntry(auditor, { purposes: ["release"] })])],
    ["empty purposes", () => trustList([listEntry(auditor, { purposes: [] })])],
    ["duplicate purposes", () => trustList([listEntry(auditor, { purposes: ["release", "release"] })])],
    ["revokedAt without a reason", () => trustList([listEntry(auditor, { revokedAt: "2026-05-01T00:00:00.000Z" })])],
    ["validTo not after validFrom", () => trustList([listEntry(auditor, { validTo: "2026-01-01T00:00:00.000Z" })])],
    ["a PEM whose sha256 is not the key id", () => trustList([listEntry(auditor, { publicKeyPem: testKey().publicKeyPem })])],
    ["an RSA key", () => trustList([listEntry(auditor, { keyId: sha256(rsa), publicKeyPem: rsa })])],
    ["an unknown entry field", () => trustList([{ ...listEntry(auditor), trusted: true } as never])],
    ["an unknown list field", () => ({ ...trustList([listEntry(auditor)]), note: "x" })],
    ["a non-UTC time", () => trustList([listEntry(auditor, { validFrom: "2026-01-01T00:00:00+02:00" })])],
    ["an evidence-authority key without authority", () => trustList([listEntry(auditor, { purposes: ["evidence-authority"] })])],
    ["a bad list id", () => trustList([], { listId: "Acme Prod" })],
  ];
  for (const [name, build] of refused) {
    it(`refuses ${name}`, () => {
      const list = build();
      expect(codeOf(() => verify({ list, signatures: [rawSignature(list, root)] }))).toBe("TRUST_LIST_INVALID");
      expect(codeOf(() => signTrustList(list as never, root.privateKeyPem))).toBe("TRUST_LIST_INVALID");
    });
  }

  it("accepts an evidence-authority key that carries its authority, and a dated revocation with a reason", () => {
    const list = trustList([listEntry(auditor, {
      purposes: ["evidence-authority"], revokedAt: "2026-05-01T00:00:00.000Z", revocationReason: "superseded",
      authority: { producers: ["ci"], captureMethods: ["producer-callback"], maxTrustTier: "OBSERVED" }
    })]);
    expect(trustListSchema.parse(list)).toEqual(list);
  });

  it("refuses an unknown signature field and a list with more than 4,096 entries", () => {
    const list = trustList([listEntry(auditor)]);
    expect(codeOf(() => verify({ list, signatures: [{ ...rawSignature(list, root), at: 1 }] }))).toBe("TRUST_LIST_INVALID");
    const entries = Array.from({ length: 4097 }, () => listEntry(auditor));
    expect(trustListSchema.safeParse(trustList(entries)).success).toBe(false);
  });
});

describe("trust-list files", () => {
  function dir(): string {
    const made = mkdtempSync(join(tmpdir(), "amc-trust-list-"));
    dirs.push(made);
    return made;
  }

  it("a reordered JSON file still verifies", () => {
    const signed = signTrustList(trustList([listEntry(auditor)]), root.privateKeyPem);
    const reverse = (value: unknown): unknown => Array.isArray(value) ? value.map(reverse)
      : value && typeof value === "object" ? Object.fromEntries(Object.entries(value).reverse().map(([k, v]) => [k, reverse(v)])) : value;
    const file = join(dir(), "amc-trust-list.json");
    writeFileSync(file, JSON.stringify(reverse(signed), null, 2));
    expect(verify(readSignedTrustListFile(file))).toEqual(signed.list);
  });

  it("refuses files over 1 MiB and symlinks", () => {
    const base = dir();
    const big = join(base, "big.json");
    writeFileSync(big, " ".repeat(1024 * 1024 + 1));
    expect(codeOf(() => readSignedTrustListFile(big))).toBe("TRUST_LIST_INVALID");
    const real = join(base, "real.json");
    writeFileSync(real, JSON.stringify(signTrustList(trustList([]), root.privateKeyPem)));
    symlinkSync(real, join(base, "link.json"));
    expect(codeOf(() => readSignedTrustListFile(join(base, "link.json")))).toBe("TRUST_LIST_INVALID");
    expect(codeOf(() => readSignedTrustListFile(join(base, "missing.json")))).toBe("TRUST_LIST_INVALID");
  });
});
