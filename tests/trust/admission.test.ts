import { describe, expect, it } from "vitest";
import { buildKeyHistoryEntry } from "../../src/crypto/keyHistoryChain.js";
import { sealKeyHistory, type KeyHistoryRole } from "../../src/crypto/keyHistoryEnvelope.js";
import { admitKey, type AdmitKeyInput, type IssuerAdmission, type TrustListEntry } from "../../src/trust/index.js";
import { context, distrustEntry, listEntry, testKey, trustList, type TestKey } from "./trustFixtures.js";

const issuer = testKey();
const older = testKey();

function history(role: KeyHistoryRole, anchor: TestKey, previous: TestKey) {
  const first = buildKeyHistoryEntry(previous.publicKeyPem, []);
  return sealKeyHistory(role, [first, buildKeyHistoryEntry(anchor.publicKeyPem, [first])], anchor.privateKeyPem);
}
const listed = (entry: Partial<TrustListEntry> = {}, key = issuer) => context({ lists: [trustList([listEntry(key, entry)])] });
const admit = (input: Partial<AdmitKeyInput>): IssuerAdmission => admitKey({
  publicKeyPem: issuer.publicKeyPem, purpose: "artifact-seal", signature: "manifest.sig", context: context(), ...input
});
const crlf = (pem: string) => pem.replaceAll("\n", "\r\n");
const outcome = (admission: IssuerAdmission) => [admission.status, admission.source, admission.timeBasis];

describe("admitKey", () => {
  const rows: Array<[string, Partial<AdmitKeyInput>, [IssuerAdmission["status"], IssuerAdmission["source"], "claimed" | null]]> = [
    ["an explicit pin for the purpose", { context: context({ explicitPins: [{ keyId: issuer.keyId, purposes: ["artifact-seal"], origin: "--pubkey a.pub" }] }) },
      ["admitted", "explicit-key", null]],
    ["a trust-list entry for the purpose", { context: listed() }, ["admitted", "trust-list", null]],
    ["a trust-list entry checked at the claimed time", { context: listed(), claimedSignedAt: "2026-03-01T00:00:00.000Z" }, ["admitted", "trust-list", "claimed"]],
    ["a trust-list entry for another purpose", { context: listed({ purposes: ["release"] }) }, ["wrong-purpose", null, null]],
    // The spec's order: a pin admits only for its purpose, so a pin for another purpose falls through to not-pinned.
    ["an explicit pin for another purpose", { context: context({ explicitPins: [{ keyId: issuer.keyId, purposes: ["ledger-row"], origin: "--expect-monitor" }] }) },
      ["not-pinned", null, null]],
    ["an explicit pin for another purpose with --allow-unpinned", { context: context({ allowUnpinned: true,
      explicitPins: [{ keyId: issuer.keyId, purposes: ["ledger-row"], origin: "--expect-monitor" }] }) }, ["unpinned-allowed", null, null]],
    ["an absent key", {}, ["not-pinned", null, null]],
    ["an absent key with --allow-unpinned", { context: context({ allowUnpinned: true }) }, ["unpinned-allowed", null, null]],
    ["a pinned and distrusted key", { context: { ...listed(), distrust: [distrustEntry(issuer.keyId)] } }, ["distrusted", null, null]],
    ["a distrusted key with --allow-unpinned and an explicit pin", { context: context({ allowUnpinned: true, distrust: [distrustEntry(issuer.keyId)],
      explicitPins: [{ keyId: issuer.keyId, purposes: ["artifact-seal"], origin: "--pubkey a.pub" }] }) }, ["distrusted", null, null]],
    ["a key distrusted from a date, claim before it", { context: context({ distrust: [distrustEntry(issuer.keyId, { distrustedFrom: "2026-05-01T00:00:00.000Z" })],
      explicitPins: [{ keyId: issuer.keyId, purposes: ["artifact-seal"], origin: "--pubkey a.pub" }] }), claimedSignedAt: "2026-04-01T00:00:00.000Z" },
      ["admitted", "explicit-key", null]],
    ["a key distrusted from a date, claim at it", { context: context({ distrust: [distrustEntry(issuer.keyId, { distrustedFrom: "2026-05-01T00:00:00.000Z" })] }),
      claimedSignedAt: "2026-05-01T00:00:00.000Z" }, ["distrusted", null, null]],
    ["a key distrusted from a date, no claimed time", { context: context({ distrust: [distrustEntry(issuer.keyId, { distrustedFrom: "2026-05-01T00:00:00.000Z" })] }) },
      ["distrusted", null, null]],
    ["a key-compromise revocation, claim before it", { context: listed({ revokedAt: "2026-05-01T00:00:00.000Z", revocationReason: "key-compromise" }),
      claimedSignedAt: "2026-02-01T00:00:00.000Z" }, ["revoked", null, null]],
    ["a key-compromise revocation, no claimed time", { context: listed({ revokedAt: "2026-05-01T00:00:00.000Z", revocationReason: "key-compromise" }) },
      ["revoked", null, null]],
    ["a superseded key, claim before the revocation", { context: listed({ revokedAt: "2026-05-01T00:00:00.000Z", revocationReason: "superseded" }),
      claimedSignedAt: "2026-02-01T00:00:00.000Z" }, ["admitted", "trust-list", "claimed"]],
    ["a superseded key, claim at the revocation", { context: listed({ revokedAt: "2026-05-01T00:00:00.000Z", revocationReason: "superseded" }),
      claimedSignedAt: "2026-05-01T00:00:00.000Z" }, ["revoked", null, null]],
    ["a superseded key, no claimed time", { context: listed({ revokedAt: "2026-05-01T00:00:00.000Z", revocationReason: "superseded" }) }, ["revoked", null, null]],
    ["a claim before validFrom", { context: listed(), claimedSignedAt: "2025-12-31T23:59:59.000Z" }, ["not-yet-valid", null, null]],
    ["a claim at validTo", { context: { ...listed(), asOf: new Date("2027-02-01T00:00:00.000Z") }, claimedSignedAt: "2027-01-01T00:00:00.000Z" },
      ["expired", null, null]],
    ["a claim later than the verification time, inside the window", { context: listed(), claimedSignedAt: "2026-11-01T00:00:00.000Z" },
      ["not-yet-valid", null, null]],
    ["a claim later than the verification time, for a key valid only from then", { context: listed({ validFrom: "2026-12-01T00:00:00.000Z" }),
      claimedSignedAt: "2026-12-15T00:00:00.000Z" }, ["not-yet-valid", null, null]],
    ["an expired key, claim before validTo", { context: { ...listed(), asOf: new Date("2027-02-01T00:00:00.000Z") },
      claimedSignedAt: "2026-06-01T00:00:00.000Z" }, ["admitted", "trust-list", "claimed"]],
    ["a key-compromise revocation in one list and an entry in another", { context: context({ lists: [
      trustList([listEntry(issuer)], { listId: "stale" }),
      trustList([listEntry(issuer, { revokedAt: "2026-05-01T00:00:00.000Z", revocationReason: "key-compromise" })], { listId: "amc-project" })] }) },
      ["revoked", null, null]],
    ["the same two lists in the other order", { context: context({ lists: [
      trustList([listEntry(issuer, { revokedAt: "2026-05-01T00:00:00.000Z", revocationReason: "key-compromise", purposes: ["release"] })], { listId: "amc-project" }),
      trustList([listEntry(issuer)], { listId: "stale" })] }) }, ["revoked", null, null]],
    ["a CRLF copy of a distrusted key with an explicit pin", { publicKeyPem: crlf(issuer.publicKeyPem), context: context({ distrust: [distrustEntry(issuer.keyId)],
      explicitPins: [{ keyId: issuer.keyId, purposes: ["artifact-seal"], origin: "--pubkey a.pub" }] }) }, ["distrusted", null, null]],
    ["a CRLF copy of a distrusted key with --allow-unpinned", { publicKeyPem: crlf(issuer.publicKeyPem),
      context: context({ allowUnpinned: true, distrust: [distrustEntry(issuer.keyId)] }) }, ["distrusted", null, null]],
    ["a CRLF copy of a listed key", { publicKeyPem: crlf(issuer.publicKeyPem), context: listed() }, ["admitted", "trust-list", null]],
    ["a private key in place of the public key", { publicKeyPem: issuer.privateKeyPem, context: listed() }, ["not-pinned", null, null]],
    ["no claim and a verification time after validTo", { context: { ...listed(), asOf: new Date("2027-02-01T00:00:00.000Z") } }, ["expired", null, null]],
    ["tenant B's key against tenant A's list", { publicKeyPem: testKey().publicKeyPem, context: listed() }, ["not-pinned", null, null]],
    ["an artifact without a public key", { publicKeyPem: null, context: listed() }, ["not-pinned", null, null]],
  ];
  for (const [name, input, expected] of rows) {
    it(name, () => expect(outcome(admit(input))).toEqual(expected));
  }

  it("names the key id to pin and the signature in every refusal", () => {
    const refused = admit({});
    expect(refused).toMatchObject({ signature: "manifest.sig", purpose: "artifact-seal", keyId: issuer.keyId, listId: null });
    expect(refused.detail).toContain(issuer.keyId);
    expect(admit({ context: listed() }).listId).toBe("tenant-a");
    expect(admit({ context: listed({ revokedAt: "2026-05-01T00:00:00.000Z", revocationReason: "superseded" }),
      claimedSignedAt: "2026-02-01T00:00:00.000Z" }).detail).toContain("claimed");
    expect(admit({ context: { ...listed(), asOf: new Date("2027-02-01T00:00:00.000Z") }, claimedSignedAt: "2026-06-01T00:00:00.000Z" }).detail)
      .toMatch(/expired.*claimed/);
    expect(admit({ publicKeyPem: crlf(issuer.publicKeyPem) }).keyId).toBe(issuer.keyId);
  });
});

describe("admitKey with key history (AMC-1525)", () => {
  const anchor = issuer;
  const signedHistory = history("auditor", anchor, older);
  const old = (input: Partial<AdmitKeyInput>) => outcome(admit({ publicKeyPem: older.publicKeyPem, keyHistory: signedHistory, ...input }));

  it("admits an older key when the pinned anchor allows key history", () => {
    expect(old({ context: listed({ allowKeyHistory: true }) })).toEqual(["admitted", "trust-list-history", null]);
  });
  it("refuses it without allowKeyHistory", () => {
    expect(old({ context: listed() })).toEqual(["not-pinned", null, null]);
  });
  it("refuses history signed by an unpinned anchor", () => {
    const stranger = testKey();
    expect(old({ keyHistory: history("auditor", stranger, older), context: listed({ allowKeyHistory: true }) })).toEqual(["not-pinned", null, null]);
  });
  it("refuses history for a role that does not sign the purpose", () => {
    expect(old({ keyHistory: history("monitor", anchor, older), context: listed({ allowKeyHistory: true }) })).toEqual(["not-pinned", null, null]);
  });
  it("refuses tampered history", () => {
    const tampered = { ...signedHistory, revision: 2 };
    expect(old({ keyHistory: tampered, context: listed({ allowKeyHistory: true }) })).toEqual(["not-pinned", null, null]);
  });
  it("still applies distrust to a history key", () => {
    expect(old({ context: { ...listed({ allowKeyHistory: true }), distrust: [distrustEntry(older.keyId)] } })).toEqual(["distrusted", null, null]);
  });
  it("refuses history anchored by a distrusted key", () => {
    expect(old({ context: { ...listed({ allowKeyHistory: true }), distrust: [distrustEntry(anchor.keyId)] } })).toEqual(["not-pinned", null, null]);
    expect(old({ context: { ...listed({ allowKeyHistory: true }), distrust: [distrustEntry(anchor.keyId, { distrustedFrom: "2026-05-01T00:00:00.000Z" })] },
      claimedSignedAt: "2026-06-01T00:00:00.000Z" })).toEqual(["not-pinned", null, null]);
  });
  it("refuses history anchored by a key that another list revoked for key compromise", () => {
    const lists = [trustList([listEntry(anchor, { allowKeyHistory: true })], { listId: "stale" }),
      trustList([listEntry(anchor, { revokedAt: "2026-05-01T00:00:00.000Z", revocationReason: "key-compromise" })], { listId: "amc-project" })];
    expect(old({ context: context({ lists }) })).toEqual(["not-pinned", null, null]);
  });
});
