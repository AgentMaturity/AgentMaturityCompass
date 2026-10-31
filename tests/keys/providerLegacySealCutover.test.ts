import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import YAML from "yaml";
import { afterEach, describe, expect, it, vi } from "vitest";
import { addPublicKeyToHistory, signHexDigest, verifyHexDigestAny } from "../../src/crypto/keys.js";
import { highWaterPath, workspaceScope } from "../../src/keys/highWater.js";
import { keysetPaths } from "../../src/keys/keyset.js";
import { KeyProviderError, type KeyProvider } from "../../src/keys/provider.js";
import { awsKmsProvider } from "../../src/keys/providers/awsKms.js";
import { bindPurposeProviderKey } from "../../src/keys/purposeProviders.js";
import { signingKeyId } from "../../src/keys/algorithmPolicy.js";
import { openLedger } from "../../src/ledger/ledger.js";
import { openSessionEventStore } from "../../src/persistence/openSessionEventStore.js";
import { jsonlSessionsPath } from "../../src/persistence/jsonl/jsonlEventLog.js";
import { verifyStoredSessionEvents } from "../../src/persistence/sessionStoreVerification.js";
import { withPins } from "../../src/trust/trustContext.js";
import type { SessionRecord } from "../../src/types.js";
import { sha256Hex } from "../../src/utils/hash.js";
import { lockVault } from "../../src/vault/vault.js";
import { initWorkspace, signAmcConfig } from "../../src/workspace.js";
import { workspaceKeyTrust } from "../helpers/trustContext.js";
import { AWS_ARN, awsFake, fakeKey, publicPem } from "./providerFakes.js";

const PASS = "owned-seal-only-provider-cutover";
const fixtures: Array<{ root: string; workspace: string; close: () => void }> = [];
afterEach(() => {
  for (const f of fixtures.splice(0).reverse()) { f.close(); lockVault(f.workspace); rmSync(f.root, { recursive: true, force: true }); }
  vi.unstubAllEnvs();
});
const prefixRefusal = (error: unknown) => error instanceof KeyProviderError && error.code === "KEY_DELEGATION_INVALID";

function publicationState(workspace: string) {
  const paths = [keysetPaths(workspace).keyset, keysetPaths(workspace).pending,
    join(workspace, ".amc/keys/ledger-row-provider.pub"), join(workspace, ".amc/keys/delegations/ledger-row.json"),
    join(workspace, ".amc/keys/ledger-row_history.json"), join(workspace, ".amc/keys/monitor_history.json"),
    join(workspace, ".amc/keys/revocations.signed.json"), join(workspace, ".amc/transparency/log.jsonl")];
  const inventory = (path: string): unknown => existsSync(path)
    ? readdirSync(path, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))
      .map(entry => [entry.name, entry.isDirectory() ? inventory(join(path, entry.name)) : sha256Hex(readFileSync(join(path, entry.name)))]) : null;
  const marks = existsSync(highWaterPath()) ? (JSON.parse(readFileSync(highWaterPath(), "utf8")) as { entries: Record<string, unknown> }).entries : {};
  return { files: paths.map(path => existsSync(path) ? sha256Hex(readFileSync(path)) : null),
    ownedMarks: Object.fromEntries(Object.entries(marks).filter(([key]) => key.includes(workspaceScope(workspace))).sort(([a], [b]) => a.localeCompare(b))),
    delegations: inventory(join(workspace, ".amc/keys/delegations")), statements: inventory(join(workspace, ".amc/keys/statements")) };
}

function fixture(backend: "sqlite" | "jsonl", empty: boolean) {
  const root = mkdtempSync(join(tmpdir(), "amc-seal-only-cutover-")), workspace = join(root, "workspace"), home = join(root, "home");
  mkdirSync(home); const owned = { root, workspace, close: () => {} }; fixtures.push(owned);
  vi.stubEnv("AMC_HOME", home); vi.stubEnv("AMC_VAULT_PASSPHRASE", PASS); vi.stubEnv("AMC_NO_SIGN", "0");
  vi.stubEnv("AMC_EXPECTED_MONITOR_FINGERPRINT", ""); vi.stubEnv("AMC_SESSION_STORE", "sqlite");
  initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
  const imported = fakeKey("ed25519"), importedPem = publicPem(imported), providerKey = fakeKey("p256");
  addPublicKeyToHistory(workspace, "monitor", importedPem, "imported");
  const arn = AWS_ARN("owned-seal-only-" + backend + (empty ? "-empty" : "-event")), fake = awsFake({ [arn]: providerKey });
  const trust = withPins(workspaceKeyTrust(workspace), [importedPem, publicPem(providerKey)].map(pem => ({
    keyId: signingKeyId(pem)!, purposes: ["ledger-row"] as const, origin: "owned independent seal and provider operator pins"
  })));
  vi.stubEnv("AMC_SESSION_STORE", backend);
  const sessionId = "owned-sealed-target", openId = "owned-unsealed-control";
  const store = openSessionEventStore(workspace, backend);
  try {
    store.startSession({ sessionId: openId, runtime: "unknown", binaryPath: "owned-open-control", binarySha256: "a".repeat(64) });
    store.appendSessionEvent({ sessionId: openId, runtime: "unknown", eventType: "audit", meta: { witness: "wellformed-unsealed-control" } });
    store.startSession({ sessionId, runtime: "unknown", binaryPath: "owned-sealed-target", binarySha256: "b".repeat(64) });
    if (!empty) store.appendSessionEvent({ sessionId, runtime: "unknown", eventType: "audit", meta: { witness: "seal-only-target" } });
    store.sealSession(sessionId);
  } finally { store.close(); }
  const read = () => {
    const reader = openSessionEventStore(workspace, backend, { readOnly: true });
    try {
      const records = [reader.readSessionRecord(sessionId), reader.readSessionRecord(openId)];
      if (records.some(record => record === null)) throw new Error("Owned fixture has no actual lifecycle record");
      return { rows: reader.readAllEvents(), records: records as SessionRecord[] };
    } finally { reader.close(); }
  };
  const original = read(), target = original.records.find(record => record.session_id === sessionId)!;
  expect(target.session_final_event_hash).not.toBeNull(); expect(target.session_seal_sig).not.toBeNull();
  expect(original.records.find(record => record.session_id === openId)).toMatchObject({ ended_ts: null, session_final_event_hash: null, session_seal_sig: null });
  if (empty) { expect(original.rows.some(row => row.session_id === sessionId)).toBe(false); expect(target.session_final_event_hash).toBe(sha256Hex("EMPTY_SESSION")); }
  const signature = signHexDigest(target.session_final_event_hash!, imported.privateKey.export({ type: "pkcs8", format: "pem" }).toString());
  expect(verifyHexDigestAny(target.session_final_event_hash!, signature, [importedPem])).toBe(true);
  let useImported: () => void, restore: () => void;
  if (backend === "sqlite") {
    const ledger = openLedger(workspace); owned.close = () => ledger.close();
    // Only this owned adversarial fixture may replace a sealed session. Evidence rows and their guard stay intact.
    ledger.db.exec("DROP TRIGGER protect_sessions_sealed_immutable");
    const update = ledger.db.prepare("UPDATE sessions SET session_seal_sig = ? WHERE session_id = ?");
    useImported = () => { update.run(signature, sessionId); };
    restore = () => { update.run(target.session_seal_sig, sessionId); };
  } else {
    const path = jsonlSessionsPath(workspace), before = readFileSync(path);
    useImported = () => {
      let changed = 0;
      const lines = before.toString("utf8").split("\n").filter(line => line.trim()).map(line => {
        const record = JSON.parse(line) as { op: string; session_id: string; session_seal_sig?: string };
        if (record.op === "seal" && record.session_id === sessionId) { changed++; return JSON.stringify({ ...record, session_seal_sig: signature }); }
        return line;
      });
      if (changed !== 1) throw new Error("Owned fixture did not select exactly one actual JSONL seal");
      writeFileSync(path, lines.join("\n") + "\n");
    };
    restore = () => writeFileSync(path, before);
  }
  const verify = () => { const actual = read(); return verifyStoredSessionEvents(workspace, actual.rows, { trust: { ...trust, asOf: new Date() }, sessionRecords: actual.records }); };
  expect(verify()).toMatchObject({ ok: true, errors: [] });
  const configPath = join(workspace, ".amc/amc.config.yaml"), config = YAML.parse(readFileSync(configPath, "utf8"));
  config.keys = { refs: { "ledger-row": { provider: "aws-kms", id: arn } } };
  writeFileSync(configPath, YAML.stringify(config)); signAmcConfig(workspace);
  return { workspace, fake, provider: awsKmsProvider(fake.call), read, original, verify, restore, useImported };
}

describe("seal-only imported legacy prefixes and prospective provider authority", () => {
  it("malformed actual JSONL lifecycle bytes refuse typed before provider work and restore a fresh valid bind", async () => {
    const f = fixture("jsonl", false), path = jsonlSessionsPath(f.workspace), original = readFileSync(path);
    expect(f.verify()).toMatchObject({ ok: true, errors: [] });
    const before = publicationState(f.workspace); expect(f.fake.requests).toEqual([]);
    try {
      writeFileSync(path, "{not valid owned JSONL lifecycle bytes\n");
      expect(() => f.read()).toThrow(/jsonl session log line .*not valid JSON/);
      await expect(bindPurposeProviderKey(f.workspace, "ledger-row", { passphrase: PASS, provider: f.provider })).rejects.toSatisfy(prefixRefusal);
      expect(f.fake.requests).toEqual([]);
      expect(publicationState(f.workspace)).toEqual(before);
    } finally { writeFileSync(path, original); }
    expect(readFileSync(path)).toEqual(original);
    expect(f.verify()).toMatchObject({ ok: true, errors: [] });
    await expect(bindPurposeProviderKey(f.workspace, "ledger-row", { passphrase: PASS, provider: f.provider })).resolves.toMatchObject({ purpose: "ledger-row" });
    expect(f.verify()).toMatchObject({ ok: true, errors: [] });
  });

  for (const backend of ["sqlite", "jsonl"] as const) for (const empty of [false, true]) {
    const label = backend + (empty ? " empty sealed session" : " sealed session with event");
    it(label + ": first bind refuses an imported-only seal before every provider request and preserves an unsealed control", async () => {
      const f = fixture(backend, empty);
      try {
        f.useImported();
        expect(f.read().rows).toEqual(f.original.rows);
        expect(f.verify()).toMatchObject({ ok: true, errors: [] });
        const before = publicationState(f.workspace); expect(f.fake.requests).toEqual([]);
        await expect(bindPurposeProviderKey(f.workspace, "ledger-row", { passphrase: PASS, provider: f.provider })).rejects.toSatisfy(prefixRefusal);
        expect(f.fake.requests).toEqual([]); expect(publicationState(f.workspace)).toEqual(before);
        expect(f.read().rows).toEqual(f.original.rows); expect(f.verify().ok).toBe(true);
        f.restore();
        await expect(bindPurposeProviderKey(f.workspace, "ledger-row", { passphrase: PASS, provider: f.provider })).resolves.toMatchObject({ purpose: "ledger-row" });
        expect(f.verify()).toMatchObject({ ok: true, errors: [] });
      } finally { f.restore(); }
    });

    it(label + ": final locked cutover refuses a seal-only substitution after actual V2 delegation Sign begins", async () => {
      const f = fixture(backend, empty);
      let release!: () => void, entered!: () => void, paused = false, operation: Promise<unknown> | undefined;
      const gate = new Promise<void>(resolve => { release = resolve; }), reached = new Promise<void>(resolve => { entered = resolve; });
      const slow: KeyProvider = { ...f.provider, sign: async (ref, bytes) => {
        if (!paused && Buffer.from(bytes).subarray(0, 22).toString("utf8") === "AMC_KEY_DELEGATION_V2\0") { paused = true; entered(); await gate; }
        return f.provider.sign(ref, bytes);
      } };
      try {
        const before = publicationState(f.workspace);
        operation = bindPurposeProviderKey(f.workspace, "ledger-row", { passphrase: PASS, provider: slow });
        await Promise.race([reached, operation.then(() => { throw new Error("Owned bind completed before its actual delegation signing wait"); },
          () => { throw new Error("Owned bind refused before its actual delegation signing wait"); })]);
        f.useImported();
        expect(f.read().rows).toEqual(f.original.rows);
        expect(f.verify()).toMatchObject({ ok: true, errors: [] });
        release(); await expect(operation).rejects.toSatisfy(prefixRefusal);
        expect(publicationState(f.workspace)).toEqual(before); expect(f.read().rows).toEqual(f.original.rows);
        f.restore();
        await expect(bindPurposeProviderKey(f.workspace, "ledger-row", { passphrase: PASS, provider: f.provider })).resolves.toMatchObject({ purpose: "ledger-row" });
        expect(f.verify()).toMatchObject({ ok: true, errors: [] });
      } finally { release(); if (operation) await operation.catch(() => undefined); f.restore(); }
    });
  }
});
