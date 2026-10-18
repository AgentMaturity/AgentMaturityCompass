import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { describe, expect, it } from "vitest";
import { admitDelegatedRow, encodeDelegation, issueDelegation, verifyDelegation } from "../../src/keys/delegation.js";
import { signingKeyId } from "../../src/keys/algorithmPolicy.js";
import { awsKmsProvider } from "../../src/keys/providers/awsKms.js";
import { AWS_ARN, awsFake, fakeKey } from "./providerFakes.js";

const HOUR = 3_600_000;
const issuerKey = fakeKey("p256");
const kms = awsFake({ [AWS_ARN("issuer")]: issuerKey, [AWS_ARN("other")]: fakeKey("ed25519") });
const provider = awsKmsProvider(kms.call);
const delegate = generateKeyPairSync("ed25519");
const delegatePem = delegate.publicKey.export({ format: "pem", type: "spki" }).toString();
const t0 = new Date("2026-10-18T00:00:00.000Z");

async function delegation(opts: { hours?: number; maxEvents?: number; issuer?: string } = {}) {
  const description = await provider.describe({ provider: "aws-kms", id: AWS_ARN(opts.issuer ?? "issuer") });
  return { description, bytes: encodeDelegation(await issueDelegation(provider, description, { delegatePublicKeyPem: delegatePem, notBefore: t0, hours: opts.hours ?? 24, maxEvents: opts.maxEvents ?? 3 })) };
}

function row(index: number) {
  const digestHex = createHash("sha256").update(`ledger row ${index}`).digest("hex");
  return { digestHex, signatureB64: sign(null, Buffer.from(digestHex, "hex"), delegate.privateKey).toString("base64") };
}

describe("ledger-row delegation from a provider-held key (P2-08)", () => {
  it("admits a delegate's ledger rows only through a valid delegation from a pinned provider key", async () => {
    const { description, bytes } = await delegation();
    const pinned = [description.publicKeyPem];
    for (let index = 1; index <= 3; index++) {
      expect(admitDelegatedRow({ delegation: bytes, issuerPublicKeyPems: pinned, ...row(index), signedAt: new Date(t0.getTime() + index * HOUR), eventIndex: index })).toEqual({ admitted: true });
    }
    // The statement names the delegate and the issuer by key id; the issuer signed it with ECDSA P-256 in P1363.
    const parsed = JSON.parse(bytes.toString("utf8"));
    expect(parsed.delegation).toMatchObject({ type: "amc.key-delegation", version: 1, purpose: "ledger-row", delegateKeyId: signingKeyId(delegatePem), issuerKeyId: description.keyId, maxEvents: 3 });
    expect(Buffer.from(parsed.signature, "base64")).toHaveLength(64);
  });

  it("refuses rows without a delegation's authority: expired, before notBefore, unpinned issuer, past maxEvents, wrong delegate", async () => {
    const { description, bytes } = await delegation();
    const pinned = [description.publicKeyPem];
    const inWindow = new Date(t0.getTime() + HOUR);
    const refused = (reason: RegExp, input: Partial<Parameters<typeof admitDelegatedRow>[0]>) =>
      expect(admitDelegatedRow({ delegation: bytes, issuerPublicKeyPems: pinned, ...row(1), signedAt: inWindow, eventIndex: 1, ...input })).toEqual({ admitted: false, reason: expect.stringMatching(reason) });
    refused(/expired|outside/, { signedAt: new Date(t0.getTime() + 25 * HOUR) });
    refused(/outside/, { signedAt: new Date(t0.getTime() - 1) });
    refused(/not a pinned/, { issuerPublicKeyPems: [fakeKey("p256").publicKey.export({ format: "pem", type: "spki" }).toString()] });
    refused(/maxEvents/, { eventIndex: 4 });
    const stranger = generateKeyPairSync("ed25519");
    refused(/does not verify/, { signatureB64: sign(null, Buffer.from(row(1).digestHex, "hex"), stranger.privateKey).toString("base64") });
    refused(/issuer's signature does not verify/, { delegation: Buffer.from(bytes.toString("utf8").replace('"maxEvents":3', '"maxEvents":30')) });
    refused(/not a canonical/, { delegation: Buffer.from(` ${bytes.toString("utf8")}`) });
  });

  it("never issues or accepts a delegation longer than 24 hours, and checks the issuer's signature", async () => {
    await expect(delegation({ hours: 25 })).rejects.toThrow(/24 hours/);
    const { description, bytes } = await delegation();
    const parsed = JSON.parse(bytes.toString("utf8"));
    parsed.delegation.notAfter = new Date(t0.getTime() + 48 * HOUR).toISOString();
    const stretched = Buffer.from(JSON.stringify(parsed));
    expect(verifyDelegation(stretched, { issuerPublicKeyPems: [description.publicKeyPem], at: new Date(t0.getTime() + HOUR) }).valid).toBe(false);
    // Another provider key (pinned too) cannot vouch for a statement naming this issuer.
    const other = await provider.describe({ provider: "aws-kms", id: AWS_ARN("other") });
    expect(verifyDelegation(bytes, { issuerPublicKeyPems: [other.publicKeyPem], at: new Date(t0.getTime() + HOUR) })).toEqual({ valid: false, reason: expect.stringMatching(/not a pinned/) });
  });

  it("signs through the provider: one KMS Sign per delegation, never per ledger row", async () => {
    const before = kms.requests.filter(r => r.operation === "Sign").length;
    const { description, bytes } = await delegation();
    for (let index = 1; index <= 3; index++) admitDelegatedRow({ delegation: bytes, issuerPublicKeyPems: [description.publicKeyPem], ...row(index), signedAt: new Date(t0.getTime() + HOUR), eventIndex: index });
    expect(kms.requests.filter(r => r.operation === "Sign").length - before).toBe(1);
  });
});
