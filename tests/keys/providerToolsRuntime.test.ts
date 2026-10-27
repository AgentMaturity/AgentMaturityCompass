import { sign } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import YAML from "yaml";
import { afterEach, describe, expect, test, vi } from "vitest";
import * as tools from "../../src/toolhub/toolhubValidators.js";
import { defaultToolsConfig } from "../../src/toolhub/toolsSchema.js";
import { initWorkspace } from "../../src/workspace.js";
import { setMode } from "../../src/mode/mode.js";
import { rotateKeysForCli } from "../../src/keys/keysCli.js";
import { getSigningKey, rotatePurposeKeys } from "../../src/keys/purposeKeys.js";
import { getPurposeKeyHistory } from "../../src/keys/signingKeys.js";
import { getPublicKeyHistory } from "../../src/crypto/keys.js";
import { verifyCanonical } from "../../src/keys/algorithmPolicy.js";
import { keysetPaths } from "../../src/keys/keyset.js";
import { lockVault } from "../../src/vault/vault.js";
import { sha256Hex } from "../../src/utils/hash.js";
import type { KmsCall } from "../../src/keys/providers/awsKms.js";
import { AWS_ARN, awsFake, fakeKey, publicPem } from "./providerFakes.js";

const transport = vi.hoisted(() => ({ call: undefined as KmsCall | undefined }));
vi.mock("../../src/keys/providers/awsKms.js", async importOriginal => {
  const actual = await importOriginal<typeof import("../../src/keys/providers/awsKms.js")>();
  return { ...actual, awsKmsProvider: (call?: KmsCall) => actual.awsKmsProvider(call ?? ((...args) => {
    if (transport.call === undefined) throw new Error("owned tools transport is unset");
    return transport.call(...args);
  })) };
});
const PASS = "tools-provider-owner-passphrase", roots: Array<{ root: string; workspace: string }> = [];
afterEach(() => {
  for (const f of roots.splice(0)) { lockVault(f.workspace); rmSync(f.root, { recursive: true, force: true }); }
  transport.call = undefined; vi.restoreAllMocks(); vi.unstubAllEnvs();
});
function deferred() { let resolve!: () => void; const promise = new Promise<void>(done => { resolve = done; }); return { promise, resolve }; }
async function atPause(entered: ReturnType<typeof deferred>, operation: Promise<unknown>) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { await Promise.race([entered.promise, operation.then(() => { throw new Error("tools producer settled before the actual provider pause"); }),
    new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new Error("tools producer never entered its provider pause")), 5_000); })]); }
  finally { clearTimeout(timer); }
}
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "amc-provider-tools-")), workspace = join(root, "workspace"); roots.push({ root, workspace });
  vi.stubEnv("AMC_HOME", join(root, "home")); vi.stubEnv("AMC_VAULT_PASSPHRASE", PASS); vi.stubEnv("AMC_NO_SIGN", "0");
  initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
  const key = fakeKey("p256"), id = AWS_ARN(basename(root)), fake = awsFake({ [id]: key });
  const control: { pause: null | { entered: ReturnType<typeof deferred>; release: ReturnType<typeof deferred> }; failure: "unavailable" | "bad-crypto" | null } = { pause: null, failure: null };
  transport.call = async (operation, input, region) => {
    if (operation === "Sign") {
      expect(existsSync(join(workspace, ".amc", ".tools-config.lock"))).toBe(false);
      const paused = control.pause; control.pause = null;
      if (paused) { paused.entered.resolve(); await paused.release.promise; }
      if (control.failure === "unavailable") throw Object.assign(new Error("https://private.invalid PIN=tools-fixture-secret"), { name: "TimeoutError" });
    }
    const answer = await fake.call(operation, input, region);
    if (operation === "Sign" && control.failure === "bad-crypto") {
      const signature = Buffer.from(answer.Signature as Uint8Array); signature[signature.length - 1] = signature[signature.length - 1]! ^ 1;
      return { ...answer, Signature: signature };
    }
    return answer;
  };
  const file = tools.toolsConfigPath(workspace), sigFile = tools.toolsConfigSigPath(workspace);
  const pair = () => ({ body: existsSync(file) ? readFileSync(file) : null, signature: existsSync(sigFile) ? readFileSync(sigFile) : null });
  const bind = async () => {
    const config = YAML.parse(readFileSync(join(workspace, ".amc", "amc.config.yaml"), "utf8"));
    config.keys = { refs: { "config-signature": { provider: "aws-kms", id } } };
    const candidate = join(root, "candidate.yaml"); writeFileSync(candidate, YAML.stringify(config));
    await rotateKeysForCli(workspace, { purpose: "config-signature", configCandidate: candidate }); fake.requests.splice(0);
  };
  const pause = () => { const paused = { entered: deferred(), release: deferred() }; control.pause = paused; return paused; };
  const verify = () => {
    const bytes = readFileSync(file), sidecar = JSON.parse(readFileSync(sigFile, "utf8"));
    expect(Object.keys(sidecar).sort()).toEqual(["digestSha256", "signature", "signedTs", "signer"]);
    expect(sidecar).toMatchObject({ digestSha256: sha256Hex(bytes), signer: "auditor" });
    expect(verifyCanonical("ecdsa-p256-sha256", Buffer.from(sidecar.digestSha256, "hex"), publicPem(key), Buffer.from(sidecar.signature, "base64"))).toBe(true);
    expect(tools.verifyToolsConfigSignature(workspace)).toMatchObject({ valid: true });
    expect(tools.loadVerifiedToolsConfigSnapshot(workspace)).toMatchObject({ signatureValid: true, config: tools.loadToolsConfig(workspace) });
  };
  return { root, workspace, file, sigFile, pair, bind, pause, verify, control, key, fake };
}

describe("actual tools config publication under config-purpose provider authority", () => {
  test("default async init/sign preserve literal legacy YAML and sidecar bytes", async () => {
    const f = fixture(), now = Date.now() + 1000, clock = vi.spyOn(Date, "now").mockReturnValue(now);
    tools.initToolsConfig(f.workspace); const before = f.pair();
    await tools.initToolsConfigAsync(f.workspace); expect(f.pair()).toEqual(before);
    await tools.signToolsConfigAsync(f.workspace); expect(f.pair()).toEqual(before);
    expect(before.body!.toString()).toBe(YAML.stringify(defaultToolsConfig()));
    const digest = sha256Hex(before.body!), signature = sign(null, Buffer.from(digest, "hex"), getSigningKey(f.workspace, "config-signature")).toString("base64");
    expect(before.signature!.toString()).toBe(["{", `  "digestSha256": "${digest}",`, `  "signature": "${signature}",`,
      `  "signedTs": ${now},`, '  "signer": "auditor"', "}"].join("\n"));
    clock.mockRestore();
  });

  test("direct tools initialization refuses existing agent mode before any provider operation or file change", async () => {
    const f = fixture(); await f.bind(); const before = f.pair(); setMode(f.workspace, "agent");
    try {
      await expect(tools.initToolsConfigAsync(f.workspace)).rejects.toThrow("Command 'tools init' is blocked in agent mode");
      expect(() => tools.initToolsConfig(f.workspace)).toThrow("Command 'tools init' is blocked in agent mode");
      expect(f.fake.requests).toEqual([]); expect(f.pair()).toEqual(before);
    } finally { setMode(f.workspace, "owner"); }
    await tools.initToolsConfigAsync(f.workspace); f.verify();
  });

  test("tools init rechecks actual owner mode after provider wait before either file changes", async () => {
    const f = fixture(); await f.bind(); const before = f.pair(), paused = f.pause(), pending = tools.initToolsConfigAsync(f.workspace);
    const outcome = pending.then(() => null, error => error);
    try {
      await atPause(paused.entered, pending); setMode(f.workspace, "agent"); paused.release.resolve();
      expect(await outcome).toMatchObject({ message: "Command 'tools init' is blocked in agent mode. Switch to owner mode with: amc mode owner" });
      expect(f.pair()).toEqual(before);
    } finally { paused.release.resolve(); await Promise.allSettled([pending]); setMode(f.workspace, "owner"); }
    await tools.initToolsConfigAsync(f.workspace); f.verify();
  });

  test("tools sign retains its existing agent-mode allowance with real provider crypto", async () => {
    const f = fixture(); await f.bind(); const before = f.fake.requests.filter(row => row.operation === "Sign").length; setMode(f.workspace, "agent");
    try {
      await tools.signToolsConfigAsync(f.workspace); f.verify();
      expect(f.fake.requests.filter(row => row.operation === "Sign")).toHaveLength(before + 1);
    } finally { setMode(f.workspace, "owner"); }
  });

  test("real owner-bound provider signs init and exact reviewed tools bytes without a lock or vault fallback", async () => {
    const f = fixture(); await f.bind();
    await tools.initToolsConfigAsync(f.workspace); f.verify();
    const reviewed = Buffer.from("# owned reviewed comment retained\n" + readFileSync(f.file, "utf8")); writeFileSync(f.file, reviewed);
    await tools.signToolsConfigAsync(f.workspace); f.verify(); expect(readFileSync(f.file)).toEqual(reviewed);
    const calls = f.fake.requests.filter(row => row.operation === "Sign"); expect(calls).toHaveLength(2);
    expect(calls.every(row => Buffer.from(row.input.Message as Uint8Array).length === 32)).toBe(true);
    expect(calls[1]!.input.Message).toEqual(Buffer.from(sha256Hex(reviewed), "hex"));
    const before = f.pair();
    expect(() => tools.initToolsConfig(f.workspace)).toThrow(expect.objectContaining({ code: "KEY_PROVIDER_HELD" })); expect(f.pair()).toEqual(before);
    expect(() => tools.signToolsConfig(f.workspace)).toThrow(expect.objectContaining({ code: "KEY_PROVIDER_HELD" })); expect(f.pair()).toEqual(before);
  });

  test("another actual auditor-role key cannot authenticate config-purpose tools grants", async () => {
    const f = fixture(); rotatePurposeKeys({ workspace: f.workspace, purposes: ["artifact-seal"], passphrase: PASS });
    const wrongPrivate = getSigningKey(f.workspace, "artifact-seal"), wrongPublic = getPublicKeyHistory(f.workspace, "auditor").at(-1)!;
    expect(getPurposeKeyHistory(f.workspace, "config-signature")).not.toContain(wrongPublic);
    await f.bind(); await tools.signToolsConfigAsync(f.workspace); f.verify();
    const sidecar = JSON.parse(readFileSync(f.sigFile, "utf8"));
    sidecar.signature = sign(null, Buffer.from(sidecar.digestSha256, "hex"), wrongPrivate).toString("base64");
    writeFileSync(f.sigFile, JSON.stringify(sidecar, null, 2));
    expect(tools.verifyToolsConfigSignature(f.workspace)).toMatchObject({ valid: false, reason: "signature verification failed" });
    expect(tools.loadVerifiedToolsConfigSnapshot(f.workspace)).toMatchObject({ signatureValid: false, config: null });
  });

  test.each(["unavailable", "bad-crypto"] as const)("%s leaves both existing files untouched and fixed errors redacted", async failure => {
    const f = fixture(); await f.bind(); const before = f.pair(); f.control.failure = failure;
    const error = await tools.initToolsConfigAsync(f.workspace).catch(error => error);
    expect(error).toMatchObject({ code: failure === "unavailable" ? "KEY_PROVIDER_UNAVAILABLE" : "KEY_PROVIDER_KEY_REFUSED" });
    expect(String(error)).not.toMatch(/private\.invalid|PIN=|tools-fixture-secret/); expect(f.pair()).toEqual(before);
  });

  test("malformed reviewed grants refuse before any provider operation", async () => {
    const f = fixture(); await f.bind(); writeFileSync(f.file, "tools: [malformed\n"); const before = f.pair();
    await expect(tools.signToolsConfigAsync(f.workspace)).rejects.toThrow(); expect(f.fake.requests).toEqual([]); expect(f.pair()).toEqual(before);
  });

  test("an actual concurrent signed init survives the paused stale signature publication", async () => {
    const f = fixture(); await f.bind(); const paused = f.pause(), operation = tools.signToolsConfigAsync(f.workspace), outcome = operation.then(() => null, error => error);
    try {
      await atPause(paused.entered, operation);
      const replacement = defaultToolsConfig(); replacement.tools.allowedTools = replacement.tools.allowedTools.slice(0, 1);
      await tools.initToolsConfigAsync(f.workspace, replacement); const committed = f.pair(); f.verify();
      paused.release.resolve(); expect(await outcome).toMatchObject({ message: "tools config or signature changed while signing; retry" });
      expect(f.pair()).toEqual(committed);
    } finally { paused.release.resolve(); await outcome; }
  });

  test("sidecar-only drift refuses and retains the actual replacement pair", async () => {
    const f = fixture(); await f.bind(); const paused = f.pause(), operation = tools.signToolsConfigAsync(f.workspace), outcome = operation.then(() => null, error => error);
    try {
      await atPause(paused.entered, operation); const previous = f.pair(); writeFileSync(f.sigFile, previous.signature!.toString() + "\n"); const changed = f.pair();
      paused.release.resolve(); expect(await outcome).toMatchObject({ message: "tools config or signature changed while signing; retry" }); expect(f.pair()).toEqual(changed);
    } finally { paused.release.resolve(); await outcome; }
  });

  test("a real keyset generation change refuses the prepared signature", async () => {
    const f = fixture(); await f.bind(); const before = f.pair(), paused = f.pause(), operation = tools.signToolsConfigAsync(f.workspace), outcome = operation.then(() => null, error => error);
    try {
      await atPause(paused.entered, operation); const old = readFileSync(keysetPaths(f.workspace).keyset);
      rotatePurposeKeys({ workspace: f.workspace, purposes: ["receipt"], passphrase: PASS }); expect(readFileSync(keysetPaths(f.workspace).keyset)).not.toEqual(old);
      paused.release.resolve(); expect(await outcome).toMatchObject({ code: "KEY_PROVIDER_KEY_REFUSED" }); expect(f.pair()).toEqual(before);
    } finally { paused.release.resolve(); await outcome; }
  });

  test("current editable refusal policy is rechecked after remote signing", async () => {
    const f = fixture(); await f.bind(); const before = f.pair(), paused = f.pause(), operation = tools.signToolsConfigAsync(f.workspace), outcome = operation.then(() => null, error => error);
    try {
      await atPause(paused.entered, operation); const path = join(f.workspace, ".amc", "amc.config.yaml"), config = YAML.parse(readFileSync(path, "utf8"));
      config.keys.algorithmPolicy = { allowed: ["ed25519"] }; writeFileSync(path, YAML.stringify(config));
      paused.release.resolve(); expect(await outcome).toMatchObject({ code: "KEY_PROVIDER_KEY_REFUSED" }); expect(f.pair()).toEqual(before);
    } finally { paused.release.resolve(); await outcome; }
  });

  test("cold init preparation never replaces a tools file created by another actual owner before it publishes", async () => {
    const f = fixture(); await f.bind(); unlinkSync(f.file); unlinkSync(f.sigFile); const paused = f.pause();
    const operation = tools.initToolsConfigAsync(f.workspace, undefined, { onlyIfMissing: true }), outcome = operation.then(() => null, error => error);
    try {
      await atPause(paused.entered, operation); await tools.initToolsConfigAsync(f.workspace); const committed = f.pair(); f.verify();
      paused.release.resolve(); expect(await outcome).toMatchObject({ message: "tools config or signature changed while signing; retry" }); expect(f.pair()).toEqual(committed);
    } finally { paused.release.resolve(); await outcome; }
  });
});
