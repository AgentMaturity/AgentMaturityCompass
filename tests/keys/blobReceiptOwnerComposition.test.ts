import { createPublicKey, randomUUID, verify } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import YAML from "yaml";
import { afterEach, expect, test, vi } from "vitest";
import { signAmcConfig } from "../../src/workspace.js";
import { prepareBlobIndexAuthorityOwner } from "../../src/keys/blobIndexOwner.js";
import { prepareReceiptAuthorityOwner } from "../../src/keys/receiptAuthorityOwner.js";
import { assertKeysetComplete, commitKeyset } from "../../src/keys/keyset.js";
import { getPurposeKeyHistory } from "../../src/keys/signingKeys.js";
import { getReceiptChildKey } from "../../src/vault/vault.js";
import { RECEIPT_AUTHORITY_CURRENT, parseReceiptAuthority } from "../../src/keys/receiptAuthority.js";
import { receiptLedgerProblems } from "../../src/keys/receiptSqlAuthority.js";
import * as receiptState from "../../src/keys/receiptAuthorityState.js";
import { captureTransparencyState } from "../../src/transparency/workspacePublication.js";
import { openLedger } from "../../src/ledger/ledger.js";
import { closeSqlitePool } from "../../src/storage/sqlitePool.js";
import { storeEncryptedBlob, verifyBlobIndexChain } from "../../src/storage/blobs/blobStore.js";
import { verifyReceipt } from "../../src/receipts/receipt.js";
import { withPins } from "../../src/trust/trustContext.js";
import { signingKeyId } from "../../src/keys/algorithmPolicy.js";
import { sha256Hex } from "../../src/utils/hash.js";
import { AWS_ARN, awsFake, publicPem, type FakeKey } from "./providerFakes.js";
import { BLOB_OWNER_PASS as PASS, makeBlobOwnerFixture, cleanupBlobOwnerFixtures } from "../helpers/blobIndexOwnerFixture.js";

const sdk = vi.hoisted(() => ({ dispatch: null as null | import("../../src/keys/providers/awsKms.js").KmsCall }));
vi.mock("../../src/keys/providers/awsKms.js", async importOriginal => {
  const actual = await importOriginal<typeof import("../../src/keys/providers/awsKms.js")>();
  return { ...actual, awsKmsProvider: (call?: import("../../src/keys/providers/awsKms.js").KmsCall) => actual.awsKmsProvider(call ?? ((...args) => {
    if (sdk.dispatch === null) throw new Error("owned composition provider dispatcher is absent"); return sdk.dispatch(...args);
  })) };
});
const fixtures: Array<ReturnType<typeof makeBlobOwnerFixture>> = [];
afterEach(() => {
  vi.restoreAllMocks(); sdk.dispatch = null;
  for (const f of fixtures.splice(0)) closeSqlitePool(`ledger:${resolve(f.workspace)}:${join(f.workspace, ".amc/evidence.sqlite")}`);
  cleanupBlobOwnerFixtures(); vi.unstubAllEnvs();
});
function fixture() {
  const f = makeBlobOwnerFixture(); fixtures.push(f); sdk.dispatch = f.fake.call;
  // Pins are independently supplied before either operation's certificate exists. No child is positively pinned.
  const trust = withPins(f.trust, [f.a, f.b].map(key => ({ keyId: signingKeyId(publicPem(key))!, purposes: ["receipt"] as const,
    origin: "independent composition fixture before operation certificates" })));
  return { ...f, trust };
}
function refs(f: ReturnType<typeof fixture>, changes: Partial<Record<"artifact-seal" | "receipt", string | null>>): void {
  const path = f.target(".amc/amc.config.yaml"), config = YAML.parse(readFileSync(path, "utf8")) as { keys?: { refs?: Record<string, unknown> } };
  const next = { ...config.keys?.refs };
  for (const [purpose, id] of Object.entries(changes)) { if (id === null) delete next[purpose]; else next[purpose] = { provider: "aws-kms", id }; }
  config.keys = { ...config.keys, refs: next }; writeFileSync(path, YAML.stringify(config)); signAmcConfig(f.workspace);
}
async function receiptFirst(f: ReturnType<typeof fixture>): Promise<void> {
  refs(f, { "artifact-seal": null, receipt: f.id });
  await prepareReceiptAuthorityOwner(f.workspace, { passphrase: PASS });
}
function usefulWrites(f: ReturnType<typeof fixture>, requests: () => number): void {
  const before = requests(); storeEncryptedBlob(f.workspace, Buffer.from("real composed blob payload"));
  const ledger = openLedger(f.workspace), trust = () => ({ ...f.trust, asOf: new Date(Date.now()) });
  try {
    const sessionId = `composed-${randomUUID()}`;
    ledger.startSession({ sessionId, runtime: "unknown", binaryPath: "owned", binarySha256: sha256Hex("owned composition") });
    const out = ledger.appendEvidenceWithReceipt({ sessionId, runtime: "unknown", eventType: "audit", inline: true, payload: "real composed receipt payload", meta: {},
      receipt: { kind: "guard_check", agentId: "default", providerId: "owned", model: null, bodySha256: sha256Hex("real composed receipt payload") } });
    ledger.sealSession(sessionId); expect(verifyReceipt(out.receipt, [publicPem(f.a)]).ok).toBe(true);
    expect(receiptLedgerProblems(ledger, trust())).toEqual([]);
  } finally { ledger.close(); }
  expect(verifyBlobIndexChain(f.workspace, trust()).ok).toBe(true); expect(requests()).toBe(before);
}

test.each(["receipt-first", "blob-first"] as const)("actual %s owner order preserves both certified writers and permits a shared ordinary issuer", async order => {
  const f = fixture();
  if (order === "receipt-first") {
    await receiptFirst(f); refs(f, { "artifact-seal": f.id }); await prepareBlobIndexAuthorityOwner(f.workspace, { passphrase: PASS });
  } else {
    await prepareBlobIndexAuthorityOwner(f.workspace, { passphrase: PASS }); refs(f, { receipt: f.id }); await prepareReceiptAuthorityOwner(f.workspace, { passphrase: PASS });
  }
  const keyset = assertKeysetComplete(f.workspace)!;
  expect(keyset.providers?.receipt?.keyId).toBe(signingKeyId(publicPem(f.a)));
  expect(keyset.providers?.["artifact-seal"]?.keyId).toBe(signingKeyId(publicPem(f.a)));
  const receipt = parseReceiptAuthority(f.read(RECEIPT_AUTHORITY_CURRENT));
  expect(getPurposeKeyHistory(f.workspace, "receipt")).not.toContain(receipt.authority.childPublicKeyPem);
  usefulWrites(f, () => f.signatures());
});

test("a real certified receipt child with valid provider PoP cannot be promoted to the blob issuer", async () => {
  const f = fixture(); await receiptFirst(f);
  const receipt = parseReceiptAuthority(f.read(RECEIPT_AUTHORITY_CURRENT)), child = getReceiptChildKey(f.workspace);
  const candidate: FakeKey = { kind: "ed25519", privateKey: child, publicKey: createPublicKey(child) }, candidateId = AWS_ARN(randomUUID());
  expect(signingKeyId(publicPem(candidate))).toBe(receipt.authority.childKeyId);
  const transport = awsFake({ [f.id]: f.a, [f.nextId]: f.b, [candidateId]: candidate }), proofs: Array<{ bytes: Buffer; signature: Buffer }> = [];
  sdk.dispatch = async (operation, input, region) => {
    const response = await transport.call(operation, input, region);
    if (operation === "Sign" && input.KeyId === candidateId) proofs.push({ bytes: Buffer.from(input.Message as Uint8Array), signature: Buffer.from((response as { Signature: Uint8Array }).Signature) });
    return response;
  };
  refs(f, { "artifact-seal": candidateId });
  const keyset = assertKeysetComplete(f.workspace)!, keysetBytes = f.read(".amc/keys/keyset.json"), pinnedPaths = Object.keys(keyset.files).map(rel => `.amc/${rel}`);
  const pinnedBytes = pinnedPaths.map(f.read), log = captureTransparencyState(f.workspace, true), state = f.ownedState();
  const failure = await prepareBlobIndexAuthorityOwner(f.workspace, { passphrase: PASS }).then(() => null, error => error);
  const pop = proofs.find(proof => proof.bytes.subarray(0, 15).toString("ascii") === "AMC_KEY_POP_V1\0");
  expect(pop).toBeDefined(); expect(verify(null, pop!.bytes, candidate.publicKey, pop!.signature)).toBe(true);
  expect(proofs.filter(proof => proof.bytes.toString("ascii").startsWith("AMC_BLOB_INDEX_AUTHORITY_V1\0"))).toHaveLength(0);
  expect(f.read(".amc/keys/keyset.json")).toEqual(keysetBytes); expect(pinnedPaths.map(f.read)).toEqual(pinnedBytes);
  expect(f.ownedState()).toEqual(state); expect(captureTransparencyState(f.workspace, true)).toEqual(log);
  expect(failure).toBeInstanceOf(Error); expect(failure.message).toBe("a receipt operation child cannot become the artifact provider issuer"); expect(failure.committed).toBeUndefined();
  refs(f, { "artifact-seal": f.id }); await prepareBlobIndexAuthorityOwner(f.workspace, { passphrase: PASS });
  usefulWrites(f, () => transport.requests.filter(row => row.operation === "Sign").length);
});

test("the receipt archive read is tied to the original full owner generation before any blob certificate Sign", async () => {
  const f = fixture(); await receiptFirst(f); refs(f, { "artifact-seal": f.id });
  const original = receiptState.readReceiptAuthorityState, before = f.fake.requests.length;
  let winner: ReturnType<typeof commitKeyset> | undefined, winnerBytes: Buffer | undefined;
  const spy = vi.spyOn(receiptState, "readReceiptAuthorityState").mockImplementationOnce(workspace => {
    const state = original(workspace), keyset = assertKeysetComplete(workspace)!;
    winner = commitKeyset(workspace, { expectedGeneration: keyset.generation, keys: keyset.keys, providers: keyset.providers, writes: [] });
    winnerBytes = f.read(".amc/keys/keyset.json"); return state;
  });
  try {
    const failure = await prepareBlobIndexAuthorityOwner(f.workspace, { passphrase: PASS }).then(() => null, error => error);
    expect(winner).toBeDefined();
    const certificateSigns = f.fake.requests.slice(before).filter(row => row.operation === "Sign"
      && Buffer.from(row.input.Message as Uint8Array).toString("ascii").startsWith("AMC_BLOB_INDEX_AUTHORITY_V1\0"));
    expect(certificateSigns).toHaveLength(0); expect(f.read(".amc/keys/keyset.json")).toEqual(winnerBytes);
    expect(failure).toBeInstanceOf(Error); expect(failure.message).toBe("the captured owner generation changed before blob certificate preparation");
  } finally { spy.mockRestore(); }
  await prepareBlobIndexAuthorityOwner(f.workspace, { passphrase: PASS }); usefulWrites(f, () => f.signatures());
});
