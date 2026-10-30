import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, readlinkSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { z } from "zod";

// All product work happens in finished initializer/cold-reader children. The parent never opens a ledger.
const project = fileURLToPath(new URL("../../", import.meta.url));
const object = z.record(z.string(), z.unknown());
const resultSchema = z.object({ value: z.unknown(), proof: object, before: object, after: object,
  rowsBefore: z.array(object), rowsAfter: z.array(object), coordinationChanges: z.array(z.string()) });
type Result = z.infer<typeof resultSchema>;
let fixture: string;
let phaseArtifacts: string;
const records: Array<Record<string, unknown>> = [];
const retained = process.env.AMC_P0_18_CRYPTO_EFFECTS_DIR;

const child = String.raw`
import * as fs from 'node:fs';
import { join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash, createPublicKey, generateKeyPairSync, sign, verify } from 'node:crypto';
import http from 'node:http'; import https from 'node:https'; import net from 'node:net';
const deny = () => { throw new Error('P0-18 owned child denies external transport'); };
globalThis.fetch = deny; http.request = deny; https.request = deny; net.Socket.prototype.connect = deny;
const [moduleRoot, root, scenario] = process.argv.slice(1);
const load = path => import(pathToFileURL(join(moduleRoot, 'dist', path)).href);
const { initWorkspace } = await load('workspace.js');
const { openLedger } = await load('ledger/ledger.js');
const { ingestEvidence, ingestBundleHash, attestIngestSession } = await load('ingest/ingest.js');
const { bundleDigest, effectiveTrustTier, readerTrustFor, verifyThirdPartyAttestation, countAttestedOnce } = await load('claims/evidenceProvenance.js');
const { loadTrustContext } = await load('trust/trustContext.js');
const { signTrustList } = await load('trust/trustList.js');
const { getPrivateKeyPem } = await load('crypto/keys.js');
const { readEventPayload } = await load('session/eventPayload.js');
const { closeSqlitePool } = await load('storage/sqlitePool.js');
const hash = value => createHash('sha256').update(value).digest('hex');
const canonical = value => JSON.stringify(sort(value));
function sort(value) {
  if (Array.isArray(value)) return value.map(sort);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(k => [k, sort(value[k])]));
  return value;
}
const id = pem => hash(createPublicKey(pem).export({ type: 'spki', format: 'pem' }).toString());
const snapshot = dir => {
  const found = {};
  function walk(path) {
    const stat = fs.lstatSync(path), key = relative(dir, path) || '.';
    found[key] = stat.isDirectory() ? { kind: 'directory', mode: stat.mode } :
      stat.isSymbolicLink() ? { kind: 'link', target: fs.readlinkSync(path) } :
      { kind: 'file', mode: stat.mode, size: stat.size, sha256: hash(fs.readFileSync(path)) };
    if (stat.isDirectory()) for (const name of fs.readdirSync(path).sort()) walk(join(path, name));
  }
  walk(dir); return found;
};
const same = (a, b) => canonical(a) === canonical(b);
const manifestPath = join(root, 'fixture.json');
if (scenario === 'initialize') {
  const workspace = join(root, 'workspace'); fs.mkdirSync(workspace, { mode: 0o700 });
  const order = [], keys = {};
  for (const name of ['rootA', 'rootB', 'attesterA', 'attesterB']) {
    const pair = generateKeyPairSync('ed25519');
    keys[name] = { publicKeyPem: pair.publicKey.export({ type: 'spki', format: 'pem' }).toString(),
      privateKeyPem: pair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString() };
    keys[name].keyId = id(keys[name].publicKeyPem);
  }
  const pins = Object.fromEntries(Object.entries(keys).map(([name, key]) => [name, { publicKeyPem: key.publicKeyPem, keyId: key.keyId }]));
  fs.writeFileSync(join(root, 'public-pins-before-signatures.json'), JSON.stringify(pins, null, 2), { mode: 0o600 });
  order.push('independent-public-pins-persisted');
  initWorkspace({ workspacePath: workspace, trustBoundaryMode: 'isolated' });
  const own = ['monitor', 'auditor'].map(role => {
    const publicKeyPem = fs.readFileSync(join(workspace, '.amc/keys', role + '_ed25519.pub'), 'utf8');
    return { role, publicKeyPem, keyId: id(publicKeyPem) };
  });
  fs.writeFileSync(join(root, 'own-public-pins-before-attestation.json'), JSON.stringify(own, null, 2), { mode: 0o600 });
  order.push('workspace-own-public-exclusions-persisted');
  const now = Date.now(), iso = n => new Date(n).toISOString();
  const entry = (key, overrides = {}) => ({ keyId: key.keyId, algorithm: 'ed25519', publicKeyPem: key.publicKeyPem,
    purposes: ['independent-attestation'], subject: 'Owned cryptographic fixture key', validFrom: iso(now - 86400000),
    validTo: null, source: 'operator', ...overrides });
  const makeList = (entries, overrides = {}) => ({ type: 'amc.trust-list', version: 1, listId: 'p018-owned', sequence: 1,
    issuedAt: iso(now - 3600000), expiresAt: iso(now + 86400000), entries, distrust: [], ...overrides });
  const variants = {}, signedProof = {};
  function home(name, list, signer = keys.rootA, roots = [keys.rootA.keyId], tamper = false) {
    const dir = join(root, 'homes', name); fs.mkdirSync(join(dir, 'trust'), { recursive: true, mode: 0o700 });
    const envelope = signTrustList(list, signer.privateKeyPem); order.push('signed-list:' + name);
    if (tamper) envelope.list.entries[0].purposes = ['artifact-seal'];
    const bytes = Buffer.concat([Buffer.from('AMC_TRUST_LIST_V1', 'ascii'), Buffer.from([0]), Buffer.from(canonical(envelope.list))]);
    signedProof[name] = verify(null, bytes, signer.publicKeyPem, Buffer.from(envelope.signatures[0].signature, 'base64'));
    fs.writeFileSync(join(dir, 'trust/amc-trust-list.json'), JSON.stringify(envelope), { mode: 0o600 });
    if (roots) fs.writeFileSync(join(dir, 'trust/trust-roots.json'), JSON.stringify({ type: 'amc.trust-roots', version: 1, roots }), { mode: 0o600 });
    variants[name] = dir;
  }
  home('valid', makeList([entry(keys.attesterA)]));
  home('missing-root', makeList([entry(keys.attesterA)]), keys.rootA, null);
  home('foreign-root', makeList([entry(keys.attesterA)]), keys.rootB);
  home('tamper', makeList([entry(keys.attesterA)]), keys.rootA, undefined, true);
  home('wrong-purpose', makeList([entry(keys.attesterA, { purposes: ['artifact-seal'] })]));
  home('revoked', makeList([entry(keys.attesterA, { revokedAt: iso(now - 1000), revocationReason: 'key-compromise' })]));
  home('expired', makeList([entry(keys.attesterA, { validFrom: iso(now - 172800000), validTo: iso(now - 86400000) })]));
  home('unpinned', makeList([]));
  home('own', makeList(own.map(key => entry(key))));
  process.env.AMC_HOME = variants.valid;
  const trust = loadTrustContext();
  const input = join(root, 'input.txt'); fs.writeFileSync(input, 'Owned source evidence, not an external review.\n');
  const ingested = ingestEvidence({ workspace, inputPath: input, type: 'generic_text' });
  const digest = ingestBundleHash(workspace, ingested.ingestSessionId);
  const sigB64 = sign(null, Buffer.from(digest, 'hex'), keys.attesterA.privateKeyPem).toString('base64');
  order.push('signed-attestation:attesterA');
  const attested = attestIngestSession({ workspace, ingestSessionId: ingested.ingestSessionId,
    attestedBy: 'Recorded fixture label', statement: 'Recorded statement outside the signature',
    attesterSignature: { keyId: keys.attesterA.keyId, sigB64 }, trust });
  let ledger = openLedger(workspace), rows = ledger.getAllEvents();
  const original = rows.find(row => row.id === ingested.eventIds[0]);
  const copy = rows.find(row => row.event_type === 'review' && JSON.parse(row.meta_json).originalEventId === original.id);
  const audit = rows.find(row => row.event_type === 'audit' && JSON.parse(row.meta_json).auditType === 'INGEST_ATTESTED');
  const plaintext = readEventPayload(workspace, original);
  if (plaintext.status !== 'ok') throw new Error('Actual initializer payload read failed: ' + JSON.stringify(plaintext));
  const originalPayloadHash = hash(plaintext.bytes), metadata = JSON.parse(copy.meta_json);
  const independentDigest = hash(canonical(metadata.attestation.bundle));
  const duplicateId = ledger.appendEvidence({ sessionId: copy.session_id, runtime: copy.runtime, eventType: 'review',
    payload: plaintext.bytes, inline: true, ts: copy.ts + 1, meta: metadata });
  ledger.startSession({ sessionId: 'p018-other-registered-session', runtime: 'unknown', binaryPath: 'owned-fixture', binarySha256: '0'.repeat(64) });
  const guard = [];
  for (const meta of [{ source: 'eval_import', trustTier: 'OBSERVED' }, { source: 'attested_ingest', trustTier: 'ATTESTED' }]) {
    const rowsBefore = ledger.getAllEvents(), before = snapshot(workspace); let error = null;
    try { ledger.appendEvidence({ sessionId: 'p018-other-registered-session', runtime: 'unknown', eventType: 'review', payload: 'Harmless inline refusal', inline: true, meta }); }
    catch (caught) { error = String(caught.message); }
    guard.push({ meta, error, rowsBefore, rowsAfter: ledger.getAllEvents(), before, after: snapshot(workspace) });
  }
  ledger.close();
  const ownCases = [];
  process.env.AMC_HOME = variants.own;
  for (const key of own) {
    const ownSig = sign(null, Buffer.from(digest, 'hex'), getPrivateKeyPem(workspace, key.role)).toString('base64');
    order.push('signed-attestation:own-' + key.role);
    const writer = attestIngestSession({ workspace, ingestSessionId: ingested.ingestSessionId,
      attestedBy: 'Owned key label', statement: 'This is self-attestation',
      attesterSignature: { keyId: key.keyId, sigB64: ownSig }, trust: loadTrustContext() });
    // This is an in-memory adversarial projection; the real writer refused to store it as ATTESTED.
    ownCases.push({ role: key.role, writer, signatureValid: verify(null, Buffer.from(digest, 'hex'), key.publicKeyPem, Buffer.from(ownSig, 'base64')),
      row: { ...copy, meta_json: JSON.stringify({ ...metadata, attestation: { ...metadata.attestation, keyId: key.keyId, sigB64: ownSig } }) } });
  }
  const forgedSig = sign(null, Buffer.from(digest, 'hex'), keys.attesterB.privateKeyPem).toString('base64');
  const forged = { ...copy, meta_json: JSON.stringify({ ...metadata, attestation: { ...metadata.attestation, sigB64: forgedSig } }) };
  const proof = { signedProof, digest, independentDigest, plaintextPayloadHash: originalPayloadHash,
    attesterSignatureValid: verify(null, Buffer.from(digest, 'hex'), keys.attesterA.publicKeyPem, Buffer.from(sigB64, 'base64')),
    digestTextSignatureValid: verify(null, Buffer.from(digest), keys.attesterA.publicKeyPem, Buffer.from(sigB64, 'base64')),
    forgedValidUnderB: verify(null, Buffer.from(digest, 'hex'), keys.attesterB.publicKeyPem, Buffer.from(forgedSig, 'base64')),
    forgedValidUnderA: verify(null, Buffer.from(digest, 'hex'), keys.attesterA.publicKeyPem, Buffer.from(forgedSig, 'base64')) };
  ledger = openLedger(workspace); rows = ledger.getAllEvents(); ledger.close();
  closeSqlitePool('ledger:' + workspace + ':' + join(workspace, '.amc/evidence.sqlite'));
  fs.writeFileSync(manifestPath, JSON.stringify({ fixtureType: 'p018-owned-signed-fixture-v1', workspace, variants, pins, own,
    original, copy, audit, duplicateId, attested, ownCases, forged, guard, proof, order, rows }, null, 2), { mode: 0o600 });
  console.log('P018_RESULT ' + JSON.stringify({ initialized: true, writerPid: process.pid, node: process.version, order }));
} else {
  const f = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const before = snapshot(f.workspace), ledger = openLedger(f.workspace, { readonly: true });
  const rowsBefore = ledger.getAllEvents(), copy = rowsBefore.find(row => row.id === f.copy.id);
  const original = rowsBefore.find(row => row.id === f.original.id), audit = rowsBefore.find(row => row.id === f.audit.id);
  let trust = null, loaderError = null;
  try { trust = loadTrustContext(); } catch (error) { loaderError = { name: error.name, code: error.code, message: error.message }; }
  const reader = readerTrustFor(f.workspace), tier = row => effectiveTrustTier(row, reader);
  const meta = JSON.parse(copy.meta_json);
  const proof = { ...f.proof, loaderError, loader: trust ? { mode: trust.mode, explicitPins: trust.explicitPins,
    allowUnpinned: trust.allowUnpinned, allowUnanchored: trust.allowUnanchored, lists: trust.lists.length } : null,
    originalId: original.id, copyId: copy.id, auditId: audit.id, originalTier: tier(original), auditTier: tier(audit),
    storedCopyTier: meta.trustTier, originalPayloadHash: original.payload_sha256, copyPayloadHash: copy.payload_sha256,
    rowsMatchInitializer: same(rowsBefore, f.rows), independentPins: f.pins, order: f.order, node: process.version, readerPid: process.pid };
  let value;
  if (scenario === 'positive') {
    value = tier(copy);
    const changedLabels = { ...copy, meta_json: JSON.stringify({ ...meta, attestation: { ...meta.attestation, attestedBy: 'Different recorded label', statement: 'Different unsigned statement' } }) };
    proof.changedRecordedLabelsTier = tier(changedLabels);
    proof.attested = f.attested;
  } else if (['missing-root', 'foreign-root', 'tamper', 'wrong-purpose', 'revoked', 'expired', 'unpinned'].includes(scenario)) {
    value = tier(copy); proof.verdict = verifyThirdPartyAttestation(meta.attestation, trust);
  } else if (scenario === 'own') {
    value = f.ownCases.map(item => ({ role: item.role, writerTier: item.writer.trustTier, writerReason: item.writer.reason,
      signatureValid: item.signatureValid, readerTier: tier(item.row) }));
  } else if (scenario === 'forged') {
    value = tier(f.forged); proof.verdict = verifyThirdPartyAttestation(JSON.parse(f.forged.meta_json).attestation, trust);
  } else if (scenario === 'binding') {
    const variants = [
      ['agent', { ...copy, meta_json: JSON.stringify({ ...meta, agentId: 'another-agent' }) }],
      ['session', { ...copy, session_id: 'p018-other-registered-session' }],
      ['payload', { ...copy, payload_sha256: hash('different payload') }],
      ['original', { ...copy, meta_json: JSON.stringify({ ...meta, originalEventId: 'another-original' }) }],
      ['time', { ...copy, ts: original.ts - 300001 }]
    ];
    value = variants.map(([field, row]) => ({ field, tier: tier(row) })); proof.positiveTier = tier(copy);
  } else if (scenario === 'dedup') {
    const duplicate = rowsBefore.find(row => row.id === f.duplicateId), input = [copy, duplicate, original];
    proof.copyTimes = [copy.ts, duplicate.ts]; proof.copyTiers = [tier(copy), tier(duplicate)];
    const window = { startTs: original.ts, endTs: duplicate.ts };
    value = { forward: countAttestedOnce(input, tier, window).map(row => row.id),
      reverse: countAttestedOnce([...input].reverse(), tier, window).map(row => row.id),
      outside: countAttestedOnce(input, tier, { startTs: original.ts + 1, endTs: duplicate.ts + 1000 }).map(row => row.id),
      copyId: copy.id, originalId: original.id, duplicateId: duplicate.id };
  } else if (scenario === 'guard') {
    value = f.guard.map(item => ({ error: item.error, rowsUnchanged: same(item.rowsBefore, item.rowsAfter),
      filesUnchanged: same(item.before, item.after), beforeCount: item.rowsBefore.length, afterCount: item.rowsAfter.length }));
    proof.guardIntervals = f.guard;
  } else if (scenario === 'legacy') {
    const project = patch => ({ ...original, meta_json: JSON.stringify({ ...JSON.parse(original.meta_json), ...patch }) });
    value = { legacyObserved: tier(project({ trustTier: 'OBSERVED' })),
      unverifiedAttested: tier(project({ trustTier: 'ATTESTED', attestation: { keyId: f.pins.attesterA.keyId, sigB64: 'c2ln', digestSha256: f.proof.digest } })),
      syntheticClaim: tier(project({ claimKind: 'synthetic_example' })), syntheticProvenance: tier(project({ provenance: 'dogfood' })) };
  } else throw new Error('Unknown owned scenario ' + scenario);
  const rowsAfter = ledger.getAllEvents(); ledger.close(); const after = snapshot(f.workspace);
  const changes = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter(path => !same(before[path], after[path]));
  console.log('P018_RESULT ' + JSON.stringify({ value, proof, before, after, rowsBefore, rowsAfter,
    coordinationChanges: changes.filter(path => /evidence\.sqlite-(wal|shm)$/.test(path)), allChanges: changes }));
}
`;

function run(scenario: string, home: string) {
  const inventory = () => {
    const found: Record<string, unknown> = {};
    const walk = (path: string) => {
      const stat = lstatSync(path), key = relative(fixture, path) || ".";
      found[key] = stat.isDirectory() ? { kind: "directory", mode: stat.mode } : stat.isSymbolicLink()
        ? { kind: "link", target: readlinkSync(path) } : { kind: "file", mode: stat.mode, bytes: stat.size,
          sha256: createHash("sha256").update(readFileSync(path)).digest("hex") };
      if (stat.isDirectory()) for (const name of readdirSync(path).sort()) walk(join(path, name));
    };
    walk(fixture); return found;
  };
  const parentBefore = inventory();
  const output = spawnSync(process.execPath, ["--input-type=module", "-e", child, project, fixture, scenario], {
    cwd: fixture, encoding: "utf8", timeout: 30_000, maxBuffer: 8 * 1024 * 1024,
    env: { PATH: `${dirname(process.execPath)}:/usr/bin:/bin`, HOME: join(fixture, "user-home"), AMC_HOME: home,
      AMC_VAULT_PASSPHRASE: "p018-owned-fixture-passphrase", NODE_ENV: "test",
      AMC_GUARD_EVENTS_DB_PATH: join(fixture, "guard-events.sqlite"), AMC_GUARD_RECEIPTS_WORKSPACE: join(fixture, "guard-workspace") }
  });
  const parentAfter = inventory();
  const ordinal = String(records.length).padStart(2, "0");
  writeFileSync(join(phaseArtifacts, `${ordinal}-${scenario}.stdout`), output.stdout ?? "");
  writeFileSync(join(phaseArtifacts, `${ordinal}-${scenario}.stderr`), output.stderr ?? "");
  records.push({ scenario, home, status: output.status, signal: output.signal, error: output.error?.message ?? null,
    node: process.version, executable: process.execPath, scriptSha256: createHash("sha256").update(child).digest("hex"), parentBefore, parentAfter });
  expect(output.error).toBeUndefined(); expect(output.signal).toBeNull(); expect(output.status, output.stderr).toBe(0);
  const lines = output.stdout.split("\n").filter(line => line.startsWith("P018_RESULT "));
  expect(lines).toHaveLength(1);
  return JSON.parse(lines[0]!.slice("P018_RESULT ".length)) as unknown;
}

function read(scenario: string, variant = "valid"): Result {
  const result = resultSchema.parse(run(scenario, join(fixture, "homes", variant)));
  records.push({ scenario, result });
  expect(result.rowsBefore.length).toBeGreaterThan(0); expect(result.rowsAfter).toEqual(result.rowsBefore);
  expect(result.proof.rowsMatchInitializer).toBe(true);
  // Coordination files are inventoried explicitly; every other existing byte/path remains unchanged.
  const withoutSidecars = (snapshot: Record<string, unknown>) => Object.fromEntries(Object.entries(snapshot)
    .filter(([path]) => !/evidence\.sqlite-(wal|shm)$/.test(path)));
  expect(withoutSidecars(result.after)).toEqual(withoutSidecars(result.before));
  return result;
}

beforeAll(() => {
  fixture = retained ? resolve(retained) : mkdtempSync(join(tmpdir(), "amc-p018-crypto-"));
  mkdirSync(fixture, { recursive: true, mode: 0o700 }); mkdirSync(join(fixture, "user-home"), { recursive: true, mode: 0o700 });
  mkdirSync(join(fixture, "initializer-home"), { recursive: true, mode: 0o700 });
  const phase = z.string().regex(/^[a-zA-Z0-9_-]+$/).parse(process.env.AMC_P0_18_CRYPTO_PHASE ?? randomUUID());
  phaseArtifacts = join(fixture, "phases", phase); mkdirSync(phaseArtifacts, { recursive: true, mode: 0o700 });
  if (!existsSync(join(fixture, "fixture.json"))) run("initialize", join(fixture, "initializer-home"));
  const stored = object.parse(JSON.parse(readFileSync(join(fixture, "fixture.json"), "utf8")));
  expect(stored.fixtureType).toBe("p018-owned-signed-fixture-v1");
  records.push({ fixture, reusedFinishedInitializer: records.length === 0,
    fixtureSha256: createHash("sha256").update(readFileSync(join(fixture, "fixture.json"))).digest("hex") });
}, 30_000);
afterAll(() => {
  if (phaseArtifacts) writeFileSync(join(phaseArtifacts, "effects.json"), JSON.stringify(records, null, 2) + "\n");
  if (fixture && !retained) rmSync(fixture, { recursive: true, force: true });
});

describe("P0-18 actual pinned ingestion and cold provenance readers", () => {
  test("a genuinely signed loaded list and bound ingest copy survive a cold reader", () => {
    const r = read("positive"), loader = object.parse(r.proof.loader), signed = object.parse(r.proof.signedProof);
    expect(r.value).toBe("ATTESTED"); expect(loader).toEqual({ mode: "pinned", explicitPins: [], allowUnpinned: false, allowUnanchored: false, lists: 1 });
    expect(r.proof.originalTier).toBe("SELF_REPORTED"); expect(r.proof.auditTier).toBe("SELF_REPORTED");
    expect(r.proof.copyId).not.toBe(r.proof.originalId); expect(r.proof.originalPayloadHash).toBe(r.proof.copyPayloadHash);
    expect(r.proof.plaintextPayloadHash).toBe(r.proof.originalPayloadHash);
    expect(r.proof.independentDigest).toBe(r.proof.digest); expect(r.proof.attesterSignatureValid).toBe(true);
    expect(r.proof.digestTextSignatureValid).toBe(false); expect(signed.valid).toBe(true);
    expect(r.proof.order).toEqual(expect.arrayContaining(["independent-public-pins-persisted", "signed-attestation:attesterA"]));
    expect(z.array(z.string()).parse(r.proof.order)[0]).toBe("independent-public-pins-persisted");
    expect(r.proof.changedRecordedLabelsTier).toBe("ATTESTED"); expect(object.parse(r.proof.attested).attestedEventCount).toBe(1);
  });
  test("a default signed list without its separate root pin refuses", () => {
    const r = read("missing-root", "missing-root"); expect(r.value).toBe("SELF_REPORTED");
    expect(object.parse(r.proof.loaderError)).toMatchObject({ code: "TRUST_LIST_SIGNATURE_INVALID" });
    expect(object.parse(r.proof.loaderError).message).toEqual(expect.stringContaining("no trust-list root is pinned"));
  });
  test("a genuine foreign-root signature cannot admit its carried root", () => {
    const r = read("foreign-root", "foreign-root"); expect(object.parse(r.proof.signedProof)["foreign-root"]).toBe(true);
    expect(r.value).toBe("SELF_REPORTED"); expect(object.parse(r.proof.loaderError).code).toBe("TRUST_LIST_SIGNATURE_INVALID");
  });
  test("parseable post-signature list tamper refuses", () => {
    const r = read("tamper", "tamper"); expect(object.parse(r.proof.signedProof).tamper).toBe(false);
    expect(r.value).toBe("SELF_REPORTED"); expect(object.parse(r.proof.loaderError).code).toBe("TRUST_LIST_SIGNATURE_INVALID");
  });
  test("genuine own-key signatures fail both the actual writer and bound local cold projections", () => {
    const r = read("own", "own"), cases = z.array(object).parse(r.value); expect(cases).toHaveLength(2);
    expect(cases.map(item => item.role).sort()).toEqual(["auditor", "monitor"]);
    for (const item of cases) { expect(item.signatureValid).toBe(true); expect(item.writerTier).toBe("SELF_REPORTED");
      expect(item.writerReason).toEqual(expect.stringContaining("operator's own")); expect(item.readerTier).toBe("SELF_REPORTED"); }
  });
  for (const [scenario, variant, reason] of [["wrong-purpose", "wrong-purpose", "wrong-purpose"],
    ["revoked", "revoked", "revoked"], ["expired", "expired", "expired"], ["unpinned", "unpinned", "not pinned"]]) {
    test(`a real signed list with ${scenario} admission cannot confer ATTESTED`, () => {
      const r = read(scenario!, variant!), verdict = object.parse(r.proof.verdict);
      expect(object.parse(r.proof.signedProof)[variant!]).toBe(true); expect(r.proof.attesterSignatureValid).toBe(true);
      expect(r.proof.loaderError).toBeNull(); expect(r.value).toBe("SELF_REPORTED"); expect(verdict.verified).toBe(false);
      expect(verdict.reason).toEqual(expect.stringContaining(reason!));
    });
  }
  test("a genuine key B signature claiming pinned key A refuses", () => {
    const r = read("forged"); expect(r.proof.forgedValidUnderB).toBe(true); expect(r.proof.forgedValidUnderA).toBe(false);
    expect(r.value).toBe("SELF_REPORTED"); expect(object.parse(r.proof.verdict).verified).toBe(false);
    expect(object.parse(r.proof.verdict).reason).toEqual(expect.stringContaining("does not verify"));
  });
  test("a genuine signature binds agent, session, payload, original ID and recorded time", () => {
    const r = read("binding"); expect(r.proof.positiveTier).toBe("ATTESTED"); expect(r.proof.attesterSignatureValid).toBe(true);
    expect(r.value).toEqual(["agent", "session", "payload", "original", "time"].map(field => ({ field, tier: "SELF_REPORTED" })));
  });
  test("actual duplicate copies count once in both orders and only in the signed-time window", () => {
    const r = read("dedup"), times = z.array(z.number()).parse(r.proof.copyTimes), value = object.parse(r.value);
    expect(times[1]!).toBeGreaterThan(times[0]!); expect(r.proof.copyTiers).toEqual(["ATTESTED", "ATTESTED"]);
    expect(value.forward).toEqual([value.copyId, value.originalId]); expect(value.reverse).toEqual([value.originalId, value.copyId]);
    expect(value.outside).toEqual([value.originalId]); expect(value.duplicateId).not.toBe(value.copyId);
  });
  test("actual inline elevated-producer refusal preserves the measured rows and files", () => {
    const r = read("guard"), cases = z.array(object).parse(r.value); expect(cases).toHaveLength(2);
    for (const item of cases) { expect(item.error).toEqual(expect.stringContaining("trust tier"));
      expect(item.error).toEqual(expect.stringContaining("is not allowed for import evidence"));
      expect(item.rowsUnchanged).toBe(true); expect(item.filesUnchanged).toBe(true); expect(item.afterCount).toBe(item.beforeCount); }
  });
  test("local legacy, unverified and synthetic projections never gain provenance credit", () => {
    const r = read("legacy"); expect(r.proof.originalTier).toBe("SELF_REPORTED");
    expect(r.value).toEqual({ legacyObserved: "SELF_REPORTED", unverifiedAttested: "SELF_REPORTED", syntheticClaim: null, syntheticProvenance: null });
  });
});
