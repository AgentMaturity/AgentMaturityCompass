import { createHash, createPublicKey, generateKeyPairSync, sign, verify } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import YAML from "yaml";
import { afterEach, describe, expect, test, vi } from "vitest";
import { getSigningKey, getSigningPublicKeyPem } from "../../src/crypto/keys.js";
import { signDigestWithVault } from "../../src/crypto/signing/signerVault.js";
import { derToP1363, lowS, signingKeyId, verifyCanonical } from "../../src/keys/algorithmPolicy.js";
import { signChecked } from "../../src/keys/provider.js";
import { awsKmsProvider } from "../../src/keys/providers/awsKms.js";
import { loadKeyProvider } from "../../src/keys/purposeProviders.js";
import { rotatePurposeKeys } from "../../src/keys/purposeKeys.js";
import { openLedger } from "../../src/ledger/ledger.js";
import { anchorCheckpoints, checkpointLedger, checkpointsDir, readCheckpointChain } from "../../src/time/checkpoint.js";
import { encode, encodeUint } from "../../src/time/der.js";
import { anchorReceiptPath, anchorsDir, checkpointNotePath, checkpointNoteText, verifyBundledAnchor } from "../../src/transparency/anchors/anchor.js";
import { verifyRekorV2Response } from "../../src/transparency/anchors/rekorV2.js";
import { formatSignedNote, parseSignedNote, signNote, verifyCanonicalSignedNote, verifySignedNote } from "../../src/transparency/checkpointNote.js";
import { rebuildTransparencyMerkle } from "../../src/transparency/merkleIndexStore.js";
import { loadTrustConfig, trustConfigPath, trustConfigSigPath, trustConfigSchema, verifyTrustConfigSignature, type TrustConfig } from "../../src/trust/trustConfig.js";
import { loadTrustContext, withPins } from "../../src/trust/trustContext.js";
import { sha256Hex } from "../../src/utils/hash.js";
import { canonicalize } from "../../src/utils/json.js";
import { lockVault, unlockVault } from "../../src/vault/vault.js";
import { initWorkspace, signAmcConfig } from "../../src/workspace.js";
import { AWS_ARN, awsFake, fakeKey, publicPem } from "./providerFakes.js";
import { rawSignature, testKey, trustList } from "../trust/trustFixtures.js";

const PASS = "owned-p208-checkpoint-note", N = 0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551n;
const roots: Array<{ root: string; workspace: string }> = [];
afterEach(() => { vi.restoreAllMocks(); for (const f of roots.splice(0)) { lockVault(f.workspace); rmSync(f.root, { recursive: true, force: true }); } vi.unstubAllEnvs(); });
function saveTrust(workspace: string, config: TrustConfig) {
  const bytes = Buffer.from(YAML.stringify(trustConfigSchema.parse(config))); writeFileSync(trustConfigPath(workspace), bytes);
  const signed = signDigestWithVault({ workspace, kind: "BUNDLE", digestHex: sha256Hex(bytes) });
  writeFileSync(trustConfigSigPath(workspace), JSON.stringify({ digestSha256: signed.digestSha256, signature: signed.signature,
    signedTs: signed.signedTs, signer: "auditor", envelope: signed.envelope }, null, 2));
  expect(verifyTrustConfigSignature(workspace).valid).toBe(true);
}
async function fixture() {
  const root = mkdtempSync(join(tmpdir(), "amc-checkpoint-note-")), workspace = join(root, "workspace"); roots.push({ root, workspace });
  vi.stubEnv("AMC_HOME", join(root, "home")); vi.stubEnv("AMC_VAULT_PASSPHRASE", PASS); vi.stubEnv("AMC_NO_SIGN", "0");
  vi.stubEnv("AMC_SESSION_STORE", "sqlite"); vi.stubEnv("AMC_EXPECTED_MONITOR_FINGERPRINT", undefined);
  initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
  const monitor = getSigningPublicKeyPem(workspace, "ledger-row"), artifact = getSigningPublicKeyPem(workspace, "artifact-seal");
  const log = testKey(), authority = testKey(), list = trustList([], { transparencyLogs: [{ logId: "owned-log", name: "Owned log",
    origin: "owned.example/log", publicKeyPem: log.publicKeyPem }] });
  const listFile = join(root, "operator-list.json"); writeFileSync(listFile, JSON.stringify({ list, signatures: [rawSignature(list, authority)] }));
  // Independent operator pins are chosen before any checkpoint or note is created.
  const trust = withPins(loadTrustContext({ trustLists: [listFile], trustRoots: [authority.keyId], amcHome: join(root, "operator"), env: {} }),
    [{ keyId: signingKeyId(monitor)!, purposes: ["ledger-row"], origin: "owned operator monitor" },
      { keyId: signingKeyId(artifact)!, purposes: ["artifact-seal"], origin: "owned operator artifact key" }]);
  const path = join(workspace, ".amc", "amc.config.yaml"), config = YAML.parse(readFileSync(path, "utf8"));
  config.time = { required: false, tsa: [{ name: "unpinned-tsa", url: "https://tsa.invalid/", anchorIds: ["absent"] }] };
  config.transparency = { anchorEvery: "checkpoint", anchors: [{ name: "owned", backend: "rekor-v2", url: "https://log.invalid/", logIds: ["owned-log"] }] };
  writeFileSync(path, YAML.stringify(config)); signAmcConfig(workspace);
  const ledger = openLedger(workspace);
  try { ledger.startSession({ sessionId: "note-source", runtime: "unknown", binaryPath: "owned", binarySha256: "a".repeat(64) });
    ledger.appendEvidence({ sessionId: "note-source", runtime: "unknown", eventType: "audit", meta: {} }); ledger.sealSession("note-source");
  } finally { ledger.close(); }
  expect(rebuildTransparencyMerkle(workspace).algorithm).toBe("rfc9162-sha256");
  expect((await checkpointLedger(workspace, trust)).status).toBe("pending");
  const entry = readCheckpointChain(workspace, trust)[0]!, tree = entry.checkpoint.transparency!;
  const text = checkpointNoteText({ workspaceId: entry.checkpoint.workspaceId, sequence: entry.checkpoint.sequence, checkpointSha256: entry.sha256,
    treeSize: tree.leafCount, rootHash: tree.root }), origin = text.split("\n")[0]!;
  return { root, workspace, trust, log, artifact, text, origin, entry, note: checkpointNotePath(workspace, 1),
    checkpoint: join(checkpointsDir(workspace), "1.json"), provider: loadKeyProvider(workspace, "file") };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
function deferred() { let resolve!: () => void; const promise = new Promise<void>(done => { resolve = done; }); return { promise, resolve }; }
function pause(f: Fixture) { const entered = deferred(), release = deferred(), original = f.provider.sign.bind(f.provider);
  vi.spyOn(f.provider, "sign").mockImplementationOnce(async (ref, bytes) => { const signature = await original(ref, bytes); entered.resolve(); await release.promise; return signature; });
  return { entered, release }; }
async function atPause(p: ReturnType<typeof pause>, pending: Promise<unknown>) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { await Promise.race([p.entered.promise, pending.then(() => { throw new Error("anchor settled before the real file Sign pause"); }, error => { throw error; }),
    new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("real file Sign was not reached")), 5_000); })]); }
  finally { clearTimeout(timer); }
}
async function notePositive(f: Fixture) {
  const result = await anchorCheckpoints(f.workspace, f.trust);
  // No TSA is pinned: actual note production is proved, without claiming a public log anchor or making network requests.
  expect(result).toHaveLength(1); expect(result[0]).toMatchObject({ status: "failed", sequence: 1 });
  expect(result[0]!.detail).toContain("no RFC 3161 token"); expect(existsSync(anchorReceiptPath(f.workspace, 1, "owned"))).toBe(false);
  const note = readFileSync(f.note); expect(verifySignedNote(note, { name: f.origin, publicKeyPem: f.artifact })).toBe(f.text);
  expect(verifyCanonicalSignedNote(note, { name: f.origin, publicKeyPem: f.artifact })).toBe(f.text); return note;
}
function wire(text: string, name: string, keyId: Buffer, signature: Buffer) { return Buffer.from(`${text}\n— ${name} ${Buffer.concat([keyId, signature]).toString("base64")}\n`); }
function der(raw: Buffer) { return encode(0x30, encodeUint(raw.subarray(0, 32)), encodeUint(raw.subarray(32))); }
function twin(raw: Buffer) { return Buffer.concat([raw.subarray(0, 32), Buffer.from((N - BigInt(`0x${raw.subarray(32).toString("hex")}`)).toString(16).padStart(64, "0"), "hex")]); }

// This is the actual maintained anchor producer, with real checkpoint, file provider, signature and verifier APIs.
describe("asynchronous C2SP checkpoint note publication", () => {
  test("preserves default Ed25519 note wire and explicit private PEM compatibility", async () => {
    const f = await fixture(), privateKey = getSigningKey(f.workspace, "artifact-seal"), spy = vi.spyOn(f.provider, "sign");
    const note = await notePositive(f);
    expect(note.toString()).toBe(signNote(f.text, f.origin, privateKey)); expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0]![0]).toEqual({ provider: "file", id: "artifact-seal" }); expect(Buffer.from(spy.mock.calls[0]![1])).toEqual(Buffer.from(f.text));
    const parsed = parseSignedNote(note), spki = createPublicKey(f.artifact).export({ type: "spki", format: "der" });
    const keyId = createHash("sha256").update(f.origin).update(Buffer.from([10, 1])).update(spki.subarray(spki.length - 32)).digest().subarray(0, 4);
    expect(parsed.signatures[0]!.keyId).toEqual(keyId); expect(verify(null, Buffer.from(f.text), f.artifact, parsed.signatures[0]!.signature)).toBe(true);
    expect(verifySignedNote(note, { name: f.origin, publicKeyPem: testKey().publicKeyPem })).toBeNull();
  });
  test("awaits the real file signature without holding the note lock or publishing early", async () => {
    const f = await fixture(), p = pause(f), pending = notePositive(f);
    try { await atPause(p, pending); expect(existsSync(f.note)).toBe(false);
      expect(existsSync(join(anchorsDir(f.workspace), ".checkpoint-note-1.lock"))).toBe(false); p.release.resolve(); await pending;
    } finally { p.release.resolve(); await Promise.allSettled([pending]); }
  });
  test("refuses full committed generation drift during the actual Sign and a fresh call succeeds", async () => {
    const f = await fixture(), p = pause(f), pending = anchorCheckpoints(f.workspace, f.trust);
    try { await atPause(p, pending); rotatePurposeKeys({ workspace: f.workspace, purposes: ["session"], passphrase: PASS }); p.release.resolve();
      expect((await pending)[0]!.detail).toContain("committed purpose authority changed"); expect(existsSync(f.note)).toBe(false);
    } finally { p.release.resolve(); await Promise.allSettled([pending]); }
    await notePositive(f);
  });
  test("refuses a different still-valid selected checkpoint during Sign and restores the source positive", async () => {
    const f = await fixture(), before = readFileSync(f.checkpoint), p = pause(f), pending = anchorCheckpoints(f.workspace, f.trust);
    try { await atPause(p, pending); const next = JSON.parse(before.toString()); next.checkpoint.transparency.root = "b".repeat(64);
      next.sha256 = sha256Hex(canonicalize(next.checkpoint)); next.signature = sign(null, Buffer.from(next.sha256, "hex"), getSigningKey(f.workspace, "ledger-row")).toString("base64");
      writeFileSync(f.checkpoint, JSON.stringify(next, null, 2) + "\n"); expect(readCheckpointChain(f.workspace, f.trust)[0]!.sha256).toBe(next.sha256);
      p.release.resolve(); expect((await pending)[0]!.detail).toContain("selected checkpoint changed"); expect(existsSync(f.note)).toBe(false);
    } finally { p.release.resolve(); await Promise.allSettled([pending]); writeFileSync(f.checkpoint, before); }
    await notePositive(f);
  });
  test("refuses a changed authenticated policy even when its current route remains vault", async () => {
    const f = await fixture(), original = loadTrustConfig(f.workspace), p = pause(f), pending = anchorCheckpoints(f.workspace, f.trust);
    try { await atPause(p, pending); const next = structuredClone(original); next.trust.enforcement.notaryMaxClockSkewSeconds += 1; saveTrust(f.workspace, next);
      p.release.resolve(); expect((await pending)[0]!.detail).toContain("signing policy changed"); expect(existsSync(f.note)).toBe(false);
    } finally { p.release.resolve(); await Promise.allSettled([pending]); saveTrust(f.workspace, original); }
    await notePositive(f);
  });
  test("refuses no-sign arriving after the real signature and restores the signing positive", async () => {
    const f = await fixture(), p = pause(f), pending = anchorCheckpoints(f.workspace, f.trust);
    try { await atPause(p, pending); vi.stubEnv("AMC_NO_SIGN", "1"); p.release.resolve();
      expect((await pending)[0]!.detail).toContain("no-sign mode"); expect(existsSync(f.note)).toBe(false);
    } finally { p.release.resolve(); await Promise.allSettled([pending]); vi.stubEnv("AMC_NO_SIGN", "0"); }
    await notePositive(f);
  });
  test.each(["no-sign", "vault-lock", "unbound-provider", "notary-policy"] as const)("refuses initial %s without a file-provider Sign, then restores the positive", async mode => {
    const f = await fixture(), spy = vi.spyOn(f.provider, "sign"), path = join(f.workspace, ".amc", "amc.config.yaml"), bytes = readFileSync(path), trust = loadTrustConfig(f.workspace);
    try { if (mode === "no-sign") vi.stubEnv("AMC_NO_SIGN", "1");
      if (mode === "vault-lock") { lockVault(f.workspace); vi.stubEnv("AMC_VAULT_PASSPHRASE", undefined); }
      if (mode === "unbound-provider") { const next = YAML.parse(bytes.toString()); next.keys = { refs: { "artifact-seal": { provider: "aws-kms", id: AWS_ARN("owned-unbound") } } }; writeFileSync(path, YAML.stringify(next)); }
      if (mode === "notary-policy") { const next = structuredClone(trust); next.trust.mode = "NOTARY"; next.trust.notary.pinnedPubkeyFingerprint = signingKeyId(f.artifact)!; saveTrust(f.workspace, next); spy.mockClear(); }
      const refused = (await anchorCheckpoints(f.workspace, f.trust))[0]!; expect(refused.status).toBe("failed");
      if (mode === "notary-policy") expect(refused.detail).toContain("notary does not provide raw-message C2SP note signing");
      expect(existsSync(f.note)).toBe(false); expect(spy).not.toHaveBeenCalled();
    } finally { vi.stubEnv("AMC_NO_SIGN", "0"); vi.stubEnv("AMC_VAULT_PASSPHRASE", PASS); unlockVault(f.workspace, PASS); writeFileSync(path, bytes); saveTrust(f.workspace, trust); }
    spy.mockClear(); await notePositive(f); expect(spy).toHaveBeenCalledTimes(1);
  });
  test("a corrupt actual provider signature publishes no note and a fresh real signature succeeds", async () => {
    const f = await fixture(); vi.spyOn(f.provider, "sign").mockResolvedValueOnce(Buffer.alloc(64));
    expect((await anchorCheckpoints(f.workspace, f.trust))[0]!.detail).toContain("KEY_PROVIDER_KEY_REFUSED"); expect(existsSync(f.note)).toBe(false); await notePositive(f);
  });
  test("refuses a corrupt stored note without resigning, then reuses the restored note even in no-sign mode", async () => {
    const f = await fixture(), original = await notePositive(f), parsed = parseSignedNote(original), row = parsed.signatures[0]!;
    const bad = Buffer.from(row.signature); bad[0] = bad[0]! ^ 1;
    expect(verify(null, Buffer.from(f.text), f.artifact, bad)).toBe(false);
    const spy = vi.spyOn(f.provider, "sign"); writeFileSync(f.note, wire(f.text, f.origin, row.keyId, bad));
    try { const refused = (await anchorCheckpoints(f.workspace, f.trust))[0]!;
      expect(refused.detail).toBe("stored checkpoint 1 note is not its canonical auditor signature"); expect(refused.detail).not.toContain(f.workspace); expect(spy).not.toHaveBeenCalled();
    } finally { writeFileSync(f.note, original); }
    vi.stubEnv("AMC_NO_SIGN", "1"); expect(await notePositive(f)).toEqual(original); expect(spy).not.toHaveBeenCalled();
  });
  test("two simultaneous actual producers publish one identical write-once note", async () => {
    const f = await fixture(), entered = deferred(), release = deferred(), original = f.provider.sign.bind(f.provider); let count = 0;
    vi.spyOn(f.provider, "sign").mockImplementation(async (ref, bytes) => { const signature = await original(ref, bytes); if (++count === 2) entered.resolve(); await release.promise; return signature; });
    const first = notePositive(f), second = notePositive(f); let timer: ReturnType<typeof setTimeout> | undefined;
    try { await Promise.race([entered.promise, first.then(() => { throw new Error("first producer settled before both signatures"); }), second.then(() => { throw new Error("second producer settled before both signatures"); }),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("both real Signs were not reached")), 5_000); })]);
      expect(existsSync(f.note)).toBe(false); release.resolve(); const notes = await Promise.all([first, second]); expect(notes[0]).toEqual(notes[1]); expect(count).toBe(2);
    } finally { clearTimeout(timer); release.resolve(); await Promise.allSettled([first, second]); }
  });
});

// Protocol/provider math only: these cases do not bind artifact-seal or claim a normal remote workspace producer.
describe("checked provider note wire and external-log compatibility", () => {
  test.each(["ed25519", "p256"] as const)("encodes the actual fake AWS %s answer over original text with its real note key ID", async kind => {
    const key = fakeKey(kind), id = AWS_ARN(`owned-note-${kind}`), fake = awsFake({ [id]: key }), provider = awsKmsProvider(fake.call), ref = { provider: "aws-kms" as const, id };
    const description = await provider.describe(ref), text = "owned.example/checkpoint\n1\n" + Buffer.alloc(32, 7).toString("base64") + "\n";
    const signature = await signChecked(provider, description, Buffer.from(text)), note = Buffer.from(formatSignedNote(text, "owned.example/checkpoint", description.publicKeyPem, signature));
    const request = fake.requests.find(row => row.operation === "Sign")!; expect(Buffer.from(request.input.Message as Uint8Array)).toEqual(Buffer.from(text)); expect(request.input.MessageType).toBe("RAW");
    const parsed = parseSignedNote(note), row = parsed.signatures[0]!, spki = key.publicKey.export({ type: "spki", format: "der" });
    const keyId = kind === "p256" ? createHash("sha256").update(spki).digest().subarray(0, 4)
      : createHash("sha256").update("owned.example/checkpoint").update(Buffer.from([10, 1])).update(spki.subarray(spki.length - 32)).digest().subarray(0, 4);
    expect(row.keyId).toEqual(keyId); expect(verify(kind === "ed25519" ? null : "sha256", Buffer.from(text), key.publicKey, row.signature)).toBe(true);
    expect(verifyCanonicalSignedNote(note, { name: "owned.example/checkpoint", publicKeyPem: publicPem(key) })).toBe(text);
    if (kind === "p256") { expect(row.signature[0]).toBe(0x30); expect(derToP1363(row.signature)).toEqual(signature); }
    expect(verifyCanonicalSignedNote(note, { name: "owned.example/checkpoint", publicKeyPem: testKey().publicKeyPem })).toBeNull();
  });
  test("canonical AMC note verifier rejects high-S, P1363 wire and malformed DER while external DER remains compatible", () => {
    const key = fakeKey("p256"), pem = publicPem(key), text = "amc-transparency/owned\n1\n" + Buffer.alloc(32, 8).toString("base64") + "\n", name = "amc-transparency/owned";
    const raw = lowS(sign("sha256", Buffer.from(text), { key: key.privateKey, dsaEncoding: "ieee-p1363" })), high = twin(raw);
    const id = createHash("sha256").update(key.publicKey.export({ type: "spki", format: "der" })).digest().subarray(0, 4), highNote = wire(text, name, id, der(high));
    expect(verify("sha256", Buffer.from(text), key.publicKey, der(high))).toBe(true); expect(verifySignedNote(highNote, { name, publicKeyPem: pem })).toBe(text);
    expect(verifyCanonicalSignedNote(highNote, { name, publicKeyPem: pem })).toBeNull();
    expect(verifyCanonicalSignedNote(wire(text, name, id, raw), { name, publicKeyPem: pem })).toBeNull();
    expect(verifyCanonicalSignedNote(wire(text, name, id, Buffer.concat([der(raw), Buffer.from([0])])), { name, publicKeyPem: pem })).toBeNull();
    expect(() => formatSignedNote(text, name, pem, high)).toThrow(/not canonical/); expect(() => formatSignedNote(text, name, pem, der(raw))).toThrow(/not canonical/);
    expect(verifyCanonicalSignedNote(Buffer.from(formatSignedNote(text, name, pem, raw)), { name, publicKeyPem: pem })).toBe(text);
  });
  test.each(["P-384", "P-521"] as const)("retains external %s DER verification without admitting that algorithm for an AMC note", curve => {
    const key = generateKeyPairSync("ec", { namedCurve: curve }), pem = key.publicKey.export({ type: "spki", format: "pem" }).toString(), text = "owned.example/log\n";
    const id = createHash("sha256").update(key.publicKey.export({ type: "spki", format: "der" })).digest().subarray(0, 4), note = wire(text, "owned.example/log", id, sign("sha256", Buffer.from(text), key.privateKey));
    expect(verifySignedNote(note, { name: "owned.example/log", publicKeyPem: pem })).toBe(text); expect(verifyCanonicalSignedNote(note, { name: "owned.example/log", publicKeyPem: pem })).toBeNull();
  });
  test("the actual bundled AMC-note reader rejects high-S and keeps independent artifact admission separate from absent TSA", async () => {
    const f = await fixture(), key = fakeKey("p256"), pem = publicPem(key), name = "amc-transparency/owned", text = `${name}\n1\n${Buffer.alloc(32, 9).toString("base64")}\n`;
    const pinned = withPins(f.trust, [{ keyId: signingKeyId(pem)!, purposes: ["artifact-seal"], origin: "operator fixture key selected before note" }]);
    const raw = lowS(sign("sha256", Buffer.from(text), { key: key.privateKey, dsaEncoding: "ieee-p1363" })), id = createHash("sha256").update(key.publicKey.export({ type: "spki", format: "der" })).digest().subarray(0, 4);
    const dir = join(f.root, "proof"); mkdirSync(dir);
    function publish(note: Buffer) {
      const body = Buffer.from(canonicalize({ apiVersion: "0.0.2", kind: "hashedrekord", spec: { hashedRekordV002: { data: { algorithm: "SHA2_256", digest: Buffer.from(sha256Hex(note), "hex").toString("base64") } } } }));
      const root = createHash("sha256").update(Buffer.from([0])).update(body).digest().toString("base64"), logText = `owned.example/log\n1\n${root}\n`;
      const response = { logIndex: "0", kindVersion: { kind: "hashedrekord", version: "0.0.2" }, canonicalizedBody: body.toString("base64"),
        inclusionProof: { logIndex: "0", rootHash: root, treeSize: "1", hashes: [], checkpoint: { envelope: signNote(logText, "owned.example/log", f.log.privateKeyPem) } } };
      expect(verifyRekorV2Response(Buffer.from(JSON.stringify(response)).toString("base64"), sha256Hex(note), f.trust.lists.flatMap(list => list.transparencyLogs ?? [])).status).toBe("anchored");
      writeFileSync(join(dir, "anchor.note"), note); writeFileSync(join(dir, "anchor.consistency.json"), JSON.stringify({ hashes: [] }));
      writeFileSync(join(dir, "anchor.receipt.json"), JSON.stringify({ type: "amc.anchor-receipt", version: 1, backend: "rekor-v2", service: "https://owned.invalid", checkpointSha256: sha256Hex(note),
        submittedAt: new Date().toISOString(), responseB64: Buffer.from(JSON.stringify(response)).toString("base64"), timestampTokenB64: null }));
    }
    const input = { dir, tree: { algorithm: "rfc9162-sha256" as const, treeSize: 1, root: Buffer.alloc(32, 9).toString("hex") }, leafIndex: 0, trust: pinned, candidates: [pem] };
    publish(wire(text, name, id, der(raw))); const positive = verifyBundledAnchor(input);
    expect(positive.admission?.status).toBe("admitted"); expect(positive.publicAnchoring.status).toBe("not-anchored"); expect(positive.publicAnchoring.detail).toContain("no RFC 3161 token");
    expect(verifyBundledAnchor({ ...input, trust: f.trust }).admission?.status).toBe("not-pinned");
    publish(wire(text, name, id, der(twin(raw)))); expect(verifyBundledAnchor(input).publicAnchoring).toMatchObject({ status: "invalid", detail: "the checkpoint note is not signed by the bundle's auditor key" });
    publish(wire(text, name, id, der(raw))); expect(verifyBundledAnchor(input).publicAnchoring.status).toBe("not-anchored");
  });
});
