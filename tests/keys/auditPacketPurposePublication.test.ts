import { generateKeyPairSync, sign, verify } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import YAML from "yaml";
import { afterEach, describe, expect, test, vi } from "vitest";
import { generateAuditPacket } from "../../src/evidence/auditPacket.js";
import * as zip from "../../src/evidence/zip.js";
import { getSigningKey, getSigningPublicKeyPem } from "../../src/crypto/keys.js";
import { loadKeyProvider } from "../../src/keys/purposeProviders.js";
import { rotatePurposeKeys } from "../../src/keys/purposeKeys.js";
import { assertKeysetComplete } from "../../src/keys/keyset.js";
import { openLedger } from "../../src/ledger/ledger.js";
import { initWorkspace } from "../../src/workspace.js";
import { lockVault, unlockVault } from "../../src/vault/vault.js";
import { sha256Hex } from "../../src/utils/hash.js";

const PASS = "p208-owned-audit-packet-passphrase", SENTINEL = Buffer.from("owned existing packet");
const roots: Array<{ root: string; workspace: string }> = [];
afterEach(() => {
  vi.restoreAllMocks();
  for (const f of roots.splice(0)) { lockVault(f.workspace); rmSync(f.root, { recursive: true, force: true }); }
  vi.unstubAllEnvs();
});
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "amc-async-audit-packet-")), workspace = join(root, "workspace");
  roots.push({ root, workspace });
  vi.stubEnv("AMC_HOME", join(root, "home")); vi.stubEnv("AMC_VAULT_PASSPHRASE", PASS);
  vi.stubEnv("AMC_NO_SIGN", "0"); vi.stubEnv("AMC_SESSION_STORE", "sqlite");
  vi.stubEnv("AMC_EXPECTED_MONITOR_FINGERPRINT", undefined);
  initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
  const ledger = openLedger(workspace);
  try {
    ledger.startSession({ sessionId: "owned_packet", runtime: "unknown", binaryPath: "owned", binarySha256: "owned" });
    ledger.appendEvidence({ sessionId: "owned_packet", runtime: "unknown", eventType: "stdout", inline: true,
      payload: "owned packet bytes", meta: { agentId: "default" } });
    ledger.sealSession("owned_packet");
  } finally { ledger.close(); }
  const output = join(workspace, "packet.zip"), provider = loadKeyProvider(workspace, "file");
  return { root, workspace, output, provider, privateKey: getSigningKey(workspace, "artifact-seal"),
    publicKey: getSigningPublicKeyPem(workspace, "artifact-seal") };
}
/** Read only the stored, non-descriptor ZIP entries emitted by the actual AMC writer. */
function packetEntries(file: string) {
  const zip = readFileSync(file), entries = new Map<string, Buffer>(); let at = 0;
  while (at + 4 <= zip.length && zip.readUInt32LE(at) === 0x04034b50) {
    expect(at + 30).toBeLessThanOrEqual(zip.length);
    expect(zip.readUInt16LE(at + 6)).toBe(0); expect(zip.readUInt16LE(at + 8)).toBe(0);
    const size = zip.readUInt32LE(at + 18), nameLength = zip.readUInt16LE(at + 26), extraLength = zip.readUInt16LE(at + 28);
    const begin = at + 30 + nameLength + extraLength, end = begin + size; expect(end).toBeLessThanOrEqual(zip.length);
    entries.set(zip.subarray(at + 30, at + 30 + nameLength).toString("utf8"), zip.subarray(begin, end)); at = end;
  }
  expect(zip.readUInt32LE(at)).toBe(0x02014b50); return entries;
}
function verifies(f: ReturnType<typeof fixture>, file = f.output) {
  const entries = packetEntries(file), manifest = entries.get("meta/manifest.json")!, signatureBytes = entries.get("meta/manifest.sig.json")!;
  expect(manifest).toBeDefined(); expect(signatureBytes).toBeDefined();
  const payload = JSON.parse(manifest.toString("utf8")) as { schemaVersion: number; generatedTs: number };
  const digest = sha256Hex(manifest), expected = { signer: "auditor", signedTs: payload.generatedTs, manifestSha256: digest,
    signature: sign(null, Buffer.from(digest, "hex"), f.privateKey).toString("base64") };
  expect(payload.schemaVersion).toBe(1);
  expect(signatureBytes.toString("utf8")).toBe(JSON.stringify(expected, null, 2) + "\n");
  expect(verify(null, Buffer.from(digest, "hex"), f.publicKey, Buffer.from(expected.signature, "base64"))).toBe(true);
  const unrelated = generateKeyPairSync("ed25519").publicKey;
  expect(verify(null, Buffer.from(digest, "hex"), unrelated, Buffer.from(expected.signature, "base64"))).toBe(false);
  expect(entries.get("README.md")!.toString("utf8")).toContain("pinned outside this packet");
  return { digest, expected };
}
function deferred() { let resolve!: () => void; const promise = new Promise<void>(done => { resolve = done; }); return { promise, resolve }; }
function pauseSign(f: ReturnType<typeof fixture>) {
  const entered = deferred(), release = deferred(), original = f.provider.sign.bind(f.provider);
  const spy = vi.spyOn(f.provider, "sign").mockImplementationOnce(async (ref, message) => {
    const signature = await original(ref, message); entered.resolve(); await release.promise; return signature;
  });
  return { entered, release, spy };
}
async function atPause(paused: ReturnType<typeof pauseSign>, pending: Promise<unknown>) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([paused.entered.promise, pending.then(() => { throw new Error("packet settled before its actual file-provider Sign"); },
      error => { throw error; }), new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error("packet did not enter its actual file-provider Sign")), 5_000);
    })]);
  } finally { clearTimeout(timer); }
}
async function freshPositive(f: ReturnType<typeof fixture>) {
  const result = await generateAuditPacket({ workspace: f.workspace, outputFile: "packet.zip" });
  expect(result.outFile).toBe(f.output); verifies(f); return result;
}

describe("audit packet async checked artifact-purpose publication", () => {
  test("preserves the exact four-field wire bytes and signs the actual 32-byte manifest through the file provider", async () => {
    const f = fixture(), spy = vi.spyOn(f.provider, "sign");
    await freshPositive(f); const { digest } = verifies(f);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0]![0]).toEqual({ provider: "file", id: "artifact-seal" });
    expect(Buffer.from(spy.mock.calls[0]![1])).toEqual(Buffer.from(digest, "hex"));
  });

  test("awaits real signing before publication and snapshots the caller's output path", async () => {
    const f = fixture(), paused = pauseSign(f); writeFileSync(f.output, SENTINEL);
    const input = { workspace: f.workspace, outputFile: "packet.zip" }, pending = generateAuditPacket(input);
    const outcome = pending.then(() => null, error => error); let settled = false; void outcome.then(() => { settled = true; });
    try {
      await atPause(paused, pending); expect(settled).toBe(false); expect(readFileSync(f.output)).toEqual(SENTINEL);
      input.outputFile = "mutated.zip"; paused.release.resolve(); expect(await outcome).toBeNull();
      expect(existsSync(join(f.workspace, "mutated.zip"))).toBe(false); verifies(f);
    } finally { paused.release.resolve(); await Promise.allSettled([pending]); }
  });

  test("refuses a vault lock after the actual signature and preserves the existing output", async () => {
    const f = fixture(), paused = pauseSign(f); writeFileSync(f.output, SENTINEL);
    const pending = generateAuditPacket({ workspace: f.workspace, outputFile: "packet.zip" }), outcome = pending.then(() => null, error => error);
    try {
      await atPause(paused, pending); lockVault(f.workspace); vi.stubEnv("AMC_VAULT_PASSPHRASE", undefined);
      paused.release.resolve(); expect(await outcome).toMatchObject({ message: expect.stringMatching(/Vault locked/i) });
      expect(readFileSync(f.output)).toEqual(SENTINEL);
    } finally { paused.release.resolve(); await Promise.allSettled([pending]); vi.stubEnv("AMC_VAULT_PASSPHRASE", PASS); unlockVault(f.workspace, PASS); }
    await freshPositive(f);
  });

  test("refuses an unrelated committed generation change at final publication even though its artifact signature is valid", async () => {
    const f = fixture(), paused = pauseSign(f), generation = assertKeysetComplete(f.workspace)!.generation; writeFileSync(f.output, SENTINEL);
    const pending = generateAuditPacket({ workspace: f.workspace, outputFile: "packet.zip" }), outcome = pending.then(() => null, error => error);
    try {
      await atPause(paused, pending); rotatePurposeKeys({ workspace: f.workspace, purposes: ["session"], passphrase: PASS });
      expect(assertKeysetComplete(f.workspace)!.generation).toBeGreaterThan(generation);
      expect(getSigningPublicKeyPem(f.workspace, "artifact-seal")).toBe(f.publicKey);
      paused.release.resolve(); expect(await outcome).toMatchObject({ code: "KEY_PROVIDER_KEY_REFUSED",
        message: expect.stringContaining("the committed purpose authority changed while signing was prepared") });
      expect(readFileSync(f.output)).toEqual(SENTINEL);
    } finally { paused.release.resolve(); await Promise.allSettled([pending]); }
    await freshPositive(f);
  });

  test("refuses a vault lock after the checked signer returns and before the actual output write", async () => {
    const f = fixture(), archive = zip.createZipArchive;
    const spy = vi.spyOn(zip, "createZipArchive").mockImplementationOnce(entries => {
      const bytes = archive(entries);
      lockVault(f.workspace); vi.stubEnv("AMC_VAULT_PASSPHRASE", undefined);
      return bytes;
    });
    try {
      await expect(generateAuditPacket({ workspace: f.workspace, outputFile: "packet.zip" })).rejects.toMatchObject({
        message: expect.stringMatching(/Vault locked/i) });
      expect(spy).toHaveBeenCalledTimes(1); expect(existsSync(f.output)).toBe(false);
    } finally { spy.mockRestore(); vi.stubEnv("AMC_VAULT_PASSPHRASE", PASS); unlockVault(f.workspace, PASS); }
    await freshPositive(f);
  });

  test("refuses real corrupted returned signature bytes without replacing the output", async () => {
    const f = fixture(), original = f.provider.sign.bind(f.provider); writeFileSync(f.output, SENTINEL);
    vi.spyOn(f.provider, "sign").mockImplementationOnce(async (ref, message) => {
      const bytes = Buffer.from(await original(ref, message)); bytes[0] = bytes[0]! ^ 1; return bytes;
    });
    await expect(generateAuditPacket({ workspace: f.workspace, outputFile: "packet.zip" })).rejects.toMatchObject({
      code: "KEY_PROVIDER_KEY_REFUSED", message: expect.stringContaining("the provider's signature does not verify under the described public key") });
    expect(readFileSync(f.output)).toEqual(SENTINEL); await freshPositive(f);
  });

  test("rechecks current nonexportability refusal after signing rather than publishing the prepared signature", async () => {
    const f = fixture(), paused = pauseSign(f), configPath = join(f.workspace, ".amc", "amc.config.yaml"), originalConfig = readFileSync(configPath);
    writeFileSync(f.output, SENTINEL);
    const pending = generateAuditPacket({ workspace: f.workspace, outputFile: "packet.zip" }), outcome = pending.then(() => null, error => error);
    try {
      await atPause(paused, pending); const config = YAML.parse(originalConfig.toString("utf8")) as Record<string, unknown>;
      config.keys = { requireNonExportable: true }; writeFileSync(configPath, YAML.stringify(config)); paused.release.resolve();
      expect(await outcome).toMatchObject({ code: "KEY_PROVIDER_KEY_REFUSED" }); expect(readFileSync(f.output)).toEqual(SENTINEL);
    } finally { paused.release.resolve(); await Promise.allSettled([pending]); writeFileSync(configPath, originalConfig); }
    await freshPositive(f);
  });

  test("keeps an unbound artifact ref refused before any file-provider Sign and does not enable binding", async () => {
    const f = fixture(), configPath = join(f.workspace, ".amc", "amc.config.yaml"), originalConfig = readFileSync(configPath);
    const spy = vi.spyOn(f.provider, "sign"); writeFileSync(f.output, SENTINEL);
    try {
      const config = YAML.parse(originalConfig.toString("utf8")) as Record<string, unknown>;
      config.keys = { refs: { "artifact-seal": { provider: "aws-kms", id: "owned-not-a-live-key" } } };
      writeFileSync(configPath, YAML.stringify(config));
      await expect(generateAuditPacket({ workspace: f.workspace, outputFile: "packet.zip" })).rejects.toMatchObject({ code: "KEY_PROVIDER_HELD" });
      expect(spy).not.toHaveBeenCalled(); expect(readFileSync(f.output)).toEqual(SENTINEL);
    } finally { writeFileSync(configPath, originalConfig); }
    await freshPositive(f);
  });

  test("refuses the historical locked no-sign ephemeral mismatch and preserves unlocked no-sign byte compatibility", async () => {
    const f = fixture(); writeFileSync(f.output, SENTINEL); lockVault(f.workspace);
    vi.stubEnv("AMC_VAULT_PASSPHRASE", undefined); vi.stubEnv("AMC_NO_SIGN", "1");
    try {
      await expect(generateAuditPacket({ workspace: f.workspace, outputFile: "packet.zip" })).rejects.toMatchObject({
        code: "KEY_PROVIDER_KEY_REFUSED" });
      expect(readFileSync(f.output)).toEqual(SENTINEL);
    } finally { vi.stubEnv("AMC_VAULT_PASSPHRASE", PASS); unlockVault(f.workspace, PASS); }
    // This producer adds no blanket AMC_NO_SIGN prohibition: a real unlocked file key still verifies.
    await freshPositive(f);
  });
});

