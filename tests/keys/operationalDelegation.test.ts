import { generateKeyPairSync, sign, verify } from "node:crypto";
import { describe, expect, it } from "vitest";
import { encodeDelegation, issueDelegation } from "../../src/keys/delegation.js";
import { operationalDelegationChain, verifyOperationalRows, verifyOperationalCheckpoints, type DelegationRow, type DelegationRows } from "../../src/keys/operationalDelegation.js";
import { DELEGATION_META, type DelegationScope, type DelegationStream } from "../../src/keys/delegationScope.js";
import { signingKeyId } from "../../src/keys/algorithmPolicy.js";
import { awsKmsProvider } from "../../src/keys/providers/awsKms.js";
import { AWS_ARN, awsFake, fakeKey } from "./providerFakes.js";
import { sha256Hex } from "../../src/utils/hash.js";
import { canonicalize } from "../../src/utils/json.js";
import type { TrustContext } from "../../src/trust/trustContext.js";
import { signChecked } from "../../src/keys/provider.js";

const HOUR = 3_600_000;
const t0 = new Date("2026-10-20T00:00:00.000Z");
const delegate = generateKeyPairSync("ed25519");
const pem = delegate.publicKey.export({ format: "pem", type: "spki" }).toString();
const fake = awsFake({ [AWS_ARN("first")]: fakeKey("p256"), [AWS_ARN("second")]: fakeKey("ed25519"),
  [AWS_ARN("same")]: { kind: "ed25519", ...delegate } });
const provider = awsKmsProvider(fake.call);
const empty: DelegationRows = { "sqlite-evidence": [], "jsonl-evidence": [], "sqlite-outcome": [] };
const scope = (): DelegationScope => ({ workspaceId: "default", sequence: 1, previousDelegationSha256: null,
  starts: { "sqlite-evidence": { count: 0, head: "GENESIS" }, "jsonl-evidence": { count: 0, head: "GENESIS" },
    "sqlite-outcome": { count: 0, head: "GENESIS_OUTCOME" } }, checkpoints: { sequence: 0, sha256: null } });

async function issued(input: DelegationScope, issuer = "first", maxEvents = 3) {
  const description = await provider.describe({ provider: "aws-kms", id: AWS_ARN(issuer) });
  const bytes = encodeDelegation(await issueDelegation(provider, description, { delegatePublicKeyPem: pem,
    notBefore: new Date(t0.getTime() + (input.sequence - 1) * HOUR), hours: 24, maxEvents, scope: input }));
  return { bytes, sha256: sha256Hex(bytes), description };
}
function trust(pems: readonly string[]): TrustContext {
  return { mode: "pinned", asOf: new Date(t0.getTime() + 3 * HOUR), lists: [], distrust: [], allowUnpinned: false, allowUnanchored: false,
    explicitPins: pems.map(publicKeyPem => ({ keyId: signingKeyId(publicKeyPem)!, purposes: ["ledger-row"], origin: "fixture operator" })) };
}
function row(stream: DelegationStream, index: number, previousHash: string, grantSha?: string, useSequence = index, ts = t0.getTime() + index): DelegationRow {
  const metaJson = JSON.stringify(grantSha ? { [DELEGATION_META]: { sha256: grantSha, useSequence } } : {});
  const hash = sha256Hex(canonicalize({ stream, index, previousHash, metaJson, ts }));
  return { id: `${stream}-${index}`, ts, hash, previousHash, metaJson,
    signature: sign(null, Buffer.from(hash, "hex"), delegate.privateKey).toString("base64") };
}

describe("operational delegation scope and global admission", () => {
  it("preserves a same-key legacy prefix and refuses a newly signed marker-free downgrade", async () => {
    const legacy = row("sqlite-evidence", 1, "GENESIS");
    const start = scope();
    start.starts["sqlite-evidence"] = { count: 1, head: legacy.hash };
    const grant = await issued(start);
    const chain = operationalDelegationChain(grant.bytes, () => null, [grant.description.publicKeyPem], "default");
    const valid = row("sqlite-evidence", 2, legacy.hash, grant.sha256, 1);
    expect(verifyOperationalRows(chain, { ...empty, "sqlite-evidence": [legacy, valid] }, [pem], trust([grant.description.publicKeyPem])).errors).toEqual([]);
    const downgraded = row("sqlite-evidence", 2, legacy.hash);
    expect(verify(null, Buffer.from(downgraded.hash, "hex"), delegate.publicKey, Buffer.from(downgraded.signature, "base64"))).toBe(true);
    expect(verifyOperationalRows(chain, { ...empty, "sqlite-evidence": [legacy, downgraded] }, [pem], trust([grant.description.publicKeyPem])).errors)
      .toContainEqual(expect.stringMatching(/marker missing/));
  });

  it("admits every cutover issuer even when successive epochs contain no delegated rows", async () => {
    const firstKey = await provider.describe({ provider: "aws-kms", id: AWS_ARN("first") });
    const secondKey = await provider.describe({ provider: "aws-kms", id: AWS_ARN("second") });
    // Pin keys independently before issuing either statement. Both statements will only classify a legacy row.
    const both = trust([firstKey.publicKeyPem, secondKey.publicKeyPem]);
    const onlyFirst = trust([firstKey.publicKeyPem]), onlySecond = trust([secondKey.publicKeyPem]), neither = trust([]);
    const legacy = row("sqlite-evidence", 1, "GENESIS");
    const initial = scope(); initial.starts["sqlite-evidence"] = { count: 1, head: legacy.hash };
    const first = await issued(initial, "first");
    const next = scope(); next.sequence = 2; next.previousDelegationSha256 = first.sha256;
    next.starts["sqlite-evidence"] = { count: 1, head: legacy.hash };
    const second = await issued(next, "second");
    const chain = operationalDelegationChain(second.bytes, sha => sha === first.sha256 ? first.bytes : null,
      [firstKey.publicKeyPem, secondKey.publicKeyPem], "default");
    const rows = { ...empty, "sqlite-evidence": [legacy] };
    expect(verifyOperationalRows(chain, rows, [pem], both).errors).toEqual([]);
    for (const pins of [onlyFirst, onlySecond, neither]) {
      expect(verifyOperationalRows(chain, rows, [pem], pins).errors).toContainEqual(expect.stringMatching(/issuer.*not-pinned/));
    }
  });

  it("refuses a duplicate use index across SQLite and JSONL, and rejects indices over the signed cap", async () => {
    const grant = await issued(scope(), "first", 1);
    const chain = operationalDelegationChain(grant.bytes, () => null, [grant.description.publicKeyPem], "default");
    const options = trust([grant.description.publicKeyPem]);
    const sqlite = row("sqlite-evidence", 1, "GENESIS", grant.sha256, 1);
    const jsonl = row("jsonl-evidence", 1, "GENESIS", grant.sha256, 1);
    expect(verifyOperationalRows(chain, { ...empty, "sqlite-evidence": [sqlite], "jsonl-evidence": [jsonl] }, [pem], options).errors)
      .toContainEqual(expect.stringMatching(/reused across/));
    const overCap = row("sqlite-evidence", 1, "GENESIS", grant.sha256, 2);
    expect(verifyOperationalRows(chain, { ...empty, "sqlite-evidence": [overCap] }, [pem], options).errors)
      .toContainEqual(expect.stringMatching(/maxEvents/));
  });

  it("keeps old rows verifiable across renewal/rebinding and closes the retired epoch", async () => {
    const first = await issued(scope());
    const old = row("sqlite-evidence", 1, "GENESIS", first.sha256, 1);
    const next = scope();
    next.sequence = 2;
    next.previousDelegationSha256 = first.sha256;
    next.starts["sqlite-evidence"] = { count: 1, head: old.hash };
    const second = await issued(next, "second");
    const archive = (sha: string) => sha === first.sha256 ? first.bytes : null;
    const pems = [first.description.publicKeyPem, second.description.publicKeyPem];
    const chain = operationalDelegationChain(second.bytes, archive, pems, "default");
    const current = row("sqlite-evidence", 2, old.hash, second.sha256, 1, t0.getTime() + HOUR + 1);
    expect(verifyOperationalRows(chain, { ...empty, "sqlite-evidence": [old, current] }, [pem], trust(pems)).errors).toEqual([]);
    const stale = row("sqlite-evidence", 2, old.hash, first.sha256, 2);
    expect(verifyOperationalRows(chain, { ...empty, "sqlite-evidence": [old, stale] }, [pem], trust(pems)).errors)
      .toContainEqual(expect.stringMatching(/marker missing or mismatched/));
    expect(() => operationalDelegationChain(second.bytes, () => null, pems, "default")).toThrow(/missing or changed/);
    expect(() => operationalDelegationChain(second.bytes, () => Buffer.from("changed archive"), pems, "default")).toThrow(/missing or changed/);
  });

  it("does not treat an archived issuer PEM as an external pin or accept an incomplete prefix", async () => {
    const legacy = row("sqlite-evidence", 1, "GENESIS");
    const start = scope(); start.starts["sqlite-evidence"] = { count: 1, head: legacy.hash };
    const grant = await issued(start);
    const chain = operationalDelegationChain(grant.bytes, () => null, [grant.description.publicKeyPem], "default");
    const current = row("sqlite-evidence", 2, legacy.hash, grant.sha256, 1);
    expect(verifyOperationalRows(chain, { ...empty, "sqlite-evidence": [legacy, current] }, [pem], trust([])).errors)
      .toContainEqual(expect.stringMatching(/issuer not-pinned/));
    expect(verifyOperationalRows(chain, empty, [pem], trust([grant.description.publicKeyPem])).errors)
      .toContainEqual(expect.stringMatching(/cutover is absent/));
    expect(() => operationalDelegationChain(grant.bytes, () => null, [grant.description.publicKeyPem], "different")).toThrow(/another workspace/);
  });

  it("admits a checkpoint cutover issuer even when the checkpoint epoch is empty", async () => {
    const grant = await issued(scope());
    const chain = operationalDelegationChain(grant.bytes, () => null, [grant.description.publicKeyPem], "default");
    expect(verifyOperationalCheckpoints(chain, [], [pem], trust([grant.description.publicKeyPem]))).toEqual([]);
    expect(verifyOperationalCheckpoints(chain, [], [pem], trust([]))).toContainEqual(expect.stringMatching(/issuer.*not-pinned/));
  });

  it("requires provider identity after checkpoint cutover even when the provider key equals the old vault key", async () => {
    const grant = await issued(scope(), "same");
    const chain = operationalDelegationChain(grant.bytes, () => null, [grant.description.publicKeyPem], "default");
    const digest = sha256Hex("checkpoint fixture");
    const signature = (await signChecked(provider, grant.description, Buffer.from(digest, "hex"))).toString("base64");
    const checkpoint = { sequence: 1, sha256: digest, signature, providerKeyId: grant.description.keyId, claimedAt: t0.toISOString() };
    const pins = trust([grant.description.publicKeyPem]);
    expect(verifyOperationalCheckpoints(chain, [checkpoint], [pem], pins)).toEqual([]);
    const { providerKeyId: _id, ...downgraded } = checkpoint;
    expect(verify(null, Buffer.from(digest, "hex"), delegate.publicKey, Buffer.from(signature, "base64"))).toBe(true);
    expect(verifyOperationalCheckpoints(chain, [downgraded], [pem], pins)).toContainEqual(expect.stringMatching(/provider key id missing/));
  });

  it("uses signed checkpoint boundaries to prevent a retired issuer signing a later epoch", async () => {
    const first = await issued(scope());
    const digest = sha256Hex("old provider checkpoint");
    const oldCheckpoint = { sequence: 1, sha256: digest, claimedAt: t0.toISOString(), providerKeyId: first.description.keyId,
      signature: (await signChecked(provider, first.description, Buffer.from(digest, "hex"))).toString("base64") };
    const next = scope(); next.sequence = 2; next.previousDelegationSha256 = first.sha256; next.checkpoints = { sequence: 1, sha256: digest };
    const second = await issued(next, "second");
    const pems = [first.description.publicKeyPem, second.description.publicKeyPem];
    const chain = operationalDelegationChain(second.bytes, sha => sha === first.sha256 ? first.bytes : null, pems, "default");
    const newDigest = sha256Hex("new provider checkpoint");
    const current = { sequence: 2, sha256: newDigest, claimedAt: new Date(t0.getTime() + HOUR).toISOString(), providerKeyId: second.description.keyId,
      signature: (await signChecked(provider, second.description, Buffer.from(newDigest, "hex"))).toString("base64") };
    expect(verifyOperationalCheckpoints(chain, [oldCheckpoint, current], [pem], trust(pems))).toEqual([]);
    const forged = { ...current, providerKeyId: first.description.keyId,
      signature: (await signChecked(provider, first.description, Buffer.from(newDigest, "hex"))).toString("base64") };
    expect(verifyOperationalCheckpoints(chain, [oldCheckpoint, forged], [pem], trust(pems)))
      .toContainEqual(expect.stringMatching(/active provider key id missing or mismatched/));
    expect(verifyOperationalCheckpoints(chain, [{ ...oldCheckpoint, sha256: "a".repeat(64) }, current], [pem], trust(pems)))
      .toContainEqual(expect.stringMatching(/cutoff missing or changed/));
  });
});
