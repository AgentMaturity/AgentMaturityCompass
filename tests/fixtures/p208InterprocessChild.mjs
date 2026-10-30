/** Proposed tests/fixtures/p208InterprocessChild.mjs. Loads the real current build; never an SDK or network client. */
import fs from "node:fs";
import crypto from "node:crypto";
import { syncBuiltinESMExports } from "node:module";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
const cfg = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const original = { readFileSync: fs.readFileSync, writeFileSync: fs.writeFileSync, openSync: fs.openSync,
  writeSync: fs.writeSync, linkSync: fs.linkSync, sign: crypto.sign };
const event = (name, value = {}) => {
  const target = join(cfg.barriers, `${cfg.role}.${name}.json`), temporary = `${target}.${process.pid}.tmp`;
  original.writeFileSync(temporary, JSON.stringify(value), { mode: 0o600 });
  fs.renameSync(temporary, target);
};
const exists = name => fs.existsSync(join(cfg.barriers, name));
const wait = name => {
  const end = Date.now() + 25_000;
  while (!exists(name)) {
    if (exists("abort.json")) throw new Error("owned fixture cleanup interrupted barrier");
    if (Date.now() > end) throw new Error(`owned fixture barrier expired: ${name}`);
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5);
  }
};
let armed = false, held = false, phase = "prepare", pairingReadHeld = false;
const fds = new Map();
fs.openSync = function(path, ...args) { const fd = original.openSync.call(fs, path, ...args); fds.set(fd, String(path)); return fd; };
fs.linkSync = function(from, to) {
  try { return original.linkSync.call(fs, from, to); }
  catch (error) {
    const target = String(to);
    const quota = /\.ledger-delegation-[0-9a-f]+\.lock$/.test(target);
    const pairing = target.endsWith(".pairing-codes.lock") && phase === "finalize";
    if (error?.code === "EEXIST" && (quota || pairing)) event("contended", { lock: quota ? "delegation-use" : "pairing-finalize" });
    throw error;
  }
};
fs.readFileSync = function(path, ...args) {
  const bytes = original.readFileSync.call(fs, path, ...args);
  if (cfg.mode === "quota-jsonl" && armed && !held && String(path) === cfg.eventsPath && String(new Error().stack).includes("operationalLedgerReader.js")) {
    held = true; event("floor-ready", { bytes: Buffer.byteLength(bytes) }); wait(`${cfg.role}.floor-release.json`);
  }
  if (cfg.mode === "pairing" && phase === "finalize" && !pairingReadHeld && String(path) === cfg.pairingStore) {
    pairingReadHeld = true;
    const store = JSON.parse(Buffer.isBuffer(bytes) ? bytes.toString("utf8") : bytes);
    const row = store.codes.find(row => row.id === cfg.pairingId);
    event("final-read", { usedTs: row?.usedTs ?? null }); wait(`${cfg.role}.final-release.json`);
  }
  return bytes;
};
fs.writeSync = function(fd, bytes, ...args) {
  if (cfg.mode === "publication-jsonl" && armed && !held && fds.get(fd) === cfg.eventsPath) {
    const raw = Buffer.from(bytes).toString("utf8");
    const row = JSON.parse(raw.trim());
    if (typeof row.event_hash === "string") {
      held = true; event("raw-write-ready", { marker: JSON.parse(row.meta_json).amcKeyDelegation ?? null });
      wait(`${cfg.role}.write-release.json`);
    }
  }
  return original.writeSync.call(fs, fd, bytes, ...args);
};
crypto.sign = function(algorithm, data, key, ...args) {
  let payload;
  try { payload = JSON.parse(Buffer.from(data).toString("utf8")); } catch { /* unrelated tagged payload */ }
  const pairing = cfg.mode === "pairing" && payload?.pairingId === cfg.pairingId;
  if (pairing) { event("sign-ready", { pairingId: payload.pairingId }); wait(`${cfg.role}.sign-release.json`); }
  const signed = original.sign.call(crypto, algorithm, data, key, ...args);
  if (pairing) phase = "finalize";
  return signed;
};
syncBuiltinESMExports();
const moduleAt = path => import(pathToFileURL(resolve(cfg.repo, "dist", path)).href);
let resource;
try {
  let value;
  if (cfg.mode === "quota-jsonl" || cfg.mode === "publication-jsonl") {
    const { openSessionEventStore } = await moduleAt("persistence/openSessionEventStore.js");
    resource = openSessionEventStore(cfg.workspace, "jsonl");
    resource.startSession({ sessionId: cfg.sessionId, runtime: "unknown", binaryPath: "p208-owned-child", binarySha256: "a".repeat(64) });
    armed = true;
    const appended = resource.appendSessionEvent({ sessionId: cfg.sessionId, runtime: "unknown", eventType: "audit", meta: { witness: cfg.mode } });
    if (cfg.mode === "quota-jsonl") resource.sealSession(cfg.sessionId);
    value = { ok: true, eventId: appended.id };
  } else if (cfg.mode === "quota-sql") {
    const { openLedger } = await moduleAt("ledger/ledger.js");
    resource = openLedger(cfg.workspace);
    resource.startSession({ sessionId: cfg.sessionId, runtime: "unknown", binaryPath: "p208-owned-child", binarySha256: "b".repeat(64) });
    try {
      const appended = resource.appendEvidenceDetailed({ sessionId: cfg.sessionId, runtime: "unknown", eventType: "audit", meta: { witness: cfg.mode } });
      value = { ok: true, eventId: appended.id };
    } catch (error) { value = { ok: false, code: error?.code ?? null, message: String(error?.message ?? error) }; }
    resource.sealSession(cfg.sessionId);
  } else if (cfg.mode === "bind") {
    const { awsKmsProvider } = await moduleAt("keys/providers/awsKms.js");
    const { bindPurposeProviderKey } = await moduleAt("keys/purposeProviders.js");
    const privateKey = crypto.createPrivateKey(cfg.issuerPrivatePem), publicKey = crypto.createPublicKey(privateKey);
    const provider = awsKmsProvider(async (operation, input) => {
      if (input.KeyId !== cfg.arn) throw new Error("owned fixture key mismatch");
      if (operation === "GetPublicKey") return { KeyId: cfg.arn, PublicKey: publicKey.export({ format: "der", type: "spki" }),
        KeyUsage: "SIGN_VERIFY", KeySpec: "ECC_NIST_P256", SigningAlgorithms: ["ECDSA_SHA_256"] };
      if (operation === "DescribeKey") return { KeyMetadata: { KeyId: cfg.arn, KeyState: "Enabled", Origin: "AWS_KMS" } };
      if (operation === "Sign") return { Signature: crypto.sign("sha256", input.Message, privateKey) };
      throw new Error("unexpected owned fake KMS operation");
    });
    const bound = await bindPurposeProviderKey(cfg.workspace, "ledger-row", { passphrase: cfg.passphrase, provider, delegation: { maxEvents: 10 } });
    value = { ok: true, generation: bound.generation, delegationSha256: bound.delegationSha256 };
  } else if (cfg.mode === "pairing") {
    const { claimPairingCodeAsync } = await moduleAt("pairing/pairingCodes.js");
    value = await claimPairingCodeAsync({ workspace: cfg.workspace, code: cfg.code, pairingTtlMs: 300_000 });
  } else throw new Error("unknown owned child mode");
  event("result", value);
} catch (error) {
  event("result", { ok: false, code: error?.code ?? null, message: String(error?.message ?? error) });
} finally {
  let cleanupError;
  try { resource?.close(); } catch (error) { cleanupError = error; }
  try { const { lockVault } = await moduleAt("vault/vault.js"); lockVault(cfg.workspace); } catch (error) { cleanupError ??= error; }
  if (cleanupError) { process.stderr.write(`owned child cleanup failed: ${String(cleanupError)}\n`); process.exit(2); }
  process.exit(0);
}
