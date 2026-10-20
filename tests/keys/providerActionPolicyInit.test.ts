import { sign } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import YAML from "yaml";
import { afterEach, describe, expect, test, vi } from "vitest";
import * as policy from "../../src/governor/actionPolicyEngine.js";
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
const PASS = "action-provider-owner-passphrase", roots: Array<{ root: string; workspace: string }> = [];
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
  const root = mkdtempSync(join(tmpdir(), "amc-provider-action-")), workspace = join(root, "workspace"); roots.push({ root, workspace });
  vi.stubEnv("AMC_HOME", join(root, "home")); vi.stubEnv("AMC_VAULT_PASSPHRASE", PASS); vi.stubEnv("AMC_NO_SIGN", "0");
  initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
  const key = fakeKey("p256"), id = AWS_ARN(basename(root)), fake = awsFake({ [id]: key });
  const control: { pause: null | { entered: ReturnType<typeof deferred>; release: ReturnType<typeof deferred> }; failure: "unavailable" | "bad-crypto" | null } = { pause: null, failure: null };
  transport.call = async (operation, input, region) => {
    if (operation === "Sign") {
      expect(existsSync(join(workspace, ".amc", ".action-policy-writer.lock"))).toBe(false);
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
  const file = policy.actionPolicyPath(workspace), sigFile = policy.actionPolicySigPath(workspace);
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
    expect(policy.verifyActionPolicySignature(workspace)).toMatchObject({ valid: true });
  };
  return { root, workspace, file, sigFile, pair, bind, pause, verify, control, key, fake };
}


describe("actual action policy init under config-purpose provider authority", () => {
  test("default async init preserves literal legacy YAML and sidecar bytes and lock-held sync signing remains synchronous", async () => {
    const f = fixture(), now = Date.now() + 1000, clock = vi.spyOn(Date, "now").mockReturnValue(now);
    policy.initActionPolicy(f.workspace); const before = f.pair();
    await policy.initActionPolicyAsync(f.workspace); expect(f.pair()).toEqual(before);
    expect(before.body!.toString()).toBe(YAML.stringify(policy.defaultActionPolicy()));
    const digest = sha256Hex(before.body!), signature = sign(null, Buffer.from(digest, "hex"), getSigningKey(f.workspace, "config-signature")).toString("base64");
    expect(before.signature!.toString()).toBe(["{", '  "digestSha256": "' + digest + '",', '  "signature": "' + signature + '",',
      '  "signedTs": ' + now + ',', '  "signer": "auditor"', "}"].join("\n"));
    const { withControlFileLock } = await import("../../src/lifecycle/controlFileLock.js");
    const returned = withControlFileLock({ root: join(f.workspace, ".amc"), name: policy.ACTION_POLICY_WRITER_LOCK,
      operation: () => policy.signActionPolicyWithLockHeld(f.workspace) });
    expect(typeof returned).toBe("string"); expect(f.pair()).toEqual(before); clock.mockRestore();
  });

  test("direct action initialization refuses existing agent mode before any provider operation or file change", async () => {
    const f = fixture(); await f.bind(); const before = f.pair(); setMode(f.workspace, "agent");
    try {
      await expect(policy.initActionPolicyAsync(f.workspace)).rejects.toThrow("Command 'policy action init' is blocked in agent mode");
      expect(() => policy.initActionPolicy(f.workspace)).toThrow("Command 'policy action init' is blocked in agent mode");
      expect(f.fake.requests).toEqual([]); expect(f.pair()).toEqual(before);
    } finally { setMode(f.workspace, "owner"); }
    await policy.initActionPolicyAsync(f.workspace); f.verify();
  });

  test("action init rechecks actual owner mode after provider wait before either file changes", async () => {
    const f = fixture(); await f.bind(); const before = f.pair(), paused = f.pause(), pending = policy.initActionPolicyAsync(f.workspace);
    const outcome = pending.then(() => null, error => error);
    try {
      await atPause(paused.entered, pending); setMode(f.workspace, "agent"); paused.release.resolve();
      expect(await outcome).toMatchObject({ message: "Command 'policy action init' is blocked in agent mode. Switch to owner mode with: amc mode owner" });
      expect(f.pair()).toEqual(before);
    } finally { paused.release.resolve(); await Promise.allSettled([pending]); setMode(f.workspace, "owner"); }
    await policy.initActionPolicyAsync(f.workspace); f.verify();
  });

  test("real bound provider signs an actual init without holding the action writer lock", async () => {
    const f = fixture(); await f.bind(); const candidate = policy.defaultActionPolicy(); candidate.actions = candidate.actions.slice(0, 1);
    await policy.initActionPolicyAsync(f.workspace, candidate); f.verify();
    expect(policy.loadActionPolicy(f.workspace)).toEqual(candidate);
    const calls = f.fake.requests.filter(row => row.operation === "Sign"); expect(calls).toHaveLength(1);
    expect(calls[0]!.input.Message).toEqual(Buffer.from(sha256Hex(readFileSync(f.file)), "hex"));
    const before = f.pair();
    expect(() => policy.initActionPolicy(f.workspace)).toThrow(expect.objectContaining({ code: "KEY_PROVIDER_HELD" })); expect(f.pair()).toEqual(before);
    expect(() => policy.signActionPolicy(f.workspace)).toThrow(expect.objectContaining({ code: "KEY_PROVIDER_HELD" })); expect(f.pair()).toEqual(before);
  });

  test("another actual auditor-role key cannot authenticate config-purpose action policy", async () => {
    const f = fixture(); rotatePurposeKeys({ workspace: f.workspace, purposes: ["artifact-seal"], passphrase: PASS });
    const wrongPrivate = getSigningKey(f.workspace, "artifact-seal"), wrongPublic = getPublicKeyHistory(f.workspace, "auditor").at(-1)!;
    expect(getPurposeKeyHistory(f.workspace, "config-signature")).not.toContain(wrongPublic);
    await f.bind(); await policy.initActionPolicyAsync(f.workspace); f.verify();
    const sidecar = JSON.parse(readFileSync(f.sigFile, "utf8"));
    sidecar.signature = sign(null, Buffer.from(sidecar.digestSha256, "hex"), wrongPrivate).toString("base64");
    writeFileSync(f.sigFile, JSON.stringify(sidecar, null, 2));
    expect(policy.verifyActionPolicySignature(f.workspace)).toMatchObject({ valid: false, reason: "signature verification failed" });
  });

  test.each(["unavailable", "bad-crypto"] as const)("%s refuses before either policy file changes", async failure => {
    const f = fixture(); await f.bind(); const before = f.pair(); f.control.failure = failure;
    const error = await policy.initActionPolicyAsync(f.workspace).catch(error => error);
    expect(error).toMatchObject({ code: failure === "unavailable" ? "KEY_PROVIDER_UNAVAILABLE" : "KEY_PROVIDER_KEY_REFUSED" });
    expect(String(error)).not.toMatch(/private\.invalid|PIN=|tools-fixture-secret/); expect(f.pair()).toEqual(before);
  });

  test("existing recovery-pending state refuses before any provider request", async () => {
    const f = fixture(); await f.bind(); const before = f.pair(), pending = policy.actionPolicyWriterPendingPath(f.workspace);
    writeFileSync(pending, '{"owned":"unrecovered marker"}');
    await expect(policy.initActionPolicyAsync(f.workspace)).rejects.toThrow("Action Policy writer recovery is pending");
    expect(f.fake.requests).toEqual([]); expect(f.pair()).toEqual(before); expect(existsSync(pending)).toBe(true);
  });

  test("recovery-pending state introduced during signing is preserved and refuses publication", async () => {
    const f = fixture(); await f.bind(); const before = f.pair(), paused = f.pause(), operation = policy.initActionPolicyAsync(f.workspace), outcome = operation.then(() => null, error => error);
    try {
      await atPause(paused.entered, operation); const pending = policy.actionPolicyWriterPendingPath(f.workspace); writeFileSync(pending, '{"owned":"unrecovered marker"}');
      paused.release.resolve(); expect(await outcome).toMatchObject({ message: "Action Policy writer recovery is pending; retry the original exact-confirm apply first." });
      expect(f.pair()).toEqual(before); expect(existsSync(pending)).toBe(true);
    } finally { paused.release.resolve(); await outcome; }
  });

  test("an actual concurrent signed init survives the stale remote preparation", async () => {
    const f = fixture(); await f.bind(); const paused = f.pause(), operation = policy.initActionPolicyAsync(f.workspace), outcome = operation.then(() => null, error => error);
    try {
      await atPause(paused.entered, operation); const candidate = policy.defaultActionPolicy(); candidate.actions = candidate.actions.slice(0, 1);
      await policy.initActionPolicyAsync(f.workspace, candidate); const committed = f.pair(); f.verify();
      paused.release.resolve(); expect(await outcome).toMatchObject({ message: "action policy or signature changed while signing; retry" }); expect(f.pair()).toEqual(committed);
    } finally { paused.release.resolve(); await outcome; }
  });

  test("sidecar-only drift refuses the prepared init", async () => {
    const f = fixture(); await f.bind(); const paused = f.pause(), operation = policy.initActionPolicyAsync(f.workspace), outcome = operation.then(() => null, error => error);
    try {
      await atPause(paused.entered, operation); writeFileSync(f.sigFile, readFileSync(f.sigFile, "utf8") + "\n"); const changed = f.pair();
      paused.release.resolve(); expect(await outcome).toMatchObject({ message: "action policy or signature changed while signing; retry" }); expect(f.pair()).toEqual(changed);
    } finally { paused.release.resolve(); await outcome; }
  });

  test.each(["keyset", "policy"] as const)("current %s change refuses the prepared init", async changed => {
    const f = fixture(); await f.bind(); const before = f.pair(), paused = f.pause(), operation = policy.initActionPolicyAsync(f.workspace), outcome = operation.then(() => null, error => error);
    try {
      await atPause(paused.entered, operation);
      if (changed === "keyset") {
        const previous = readFileSync(keysetPaths(f.workspace).keyset);
        rotatePurposeKeys({ workspace: f.workspace, purposes: ["receipt"], passphrase: PASS });
        expect(readFileSync(keysetPaths(f.workspace).keyset)).not.toEqual(previous);
      }
      else {
        const file = join(f.workspace, ".amc", "amc.config.yaml"), config = YAML.parse(readFileSync(file, "utf8"));
        config.keys.algorithmPolicy = { allowed: ["ed25519"] }; writeFileSync(file, YAML.stringify(config));
      }
      paused.release.resolve(); expect(await outcome).toMatchObject({ code: "KEY_PROVIDER_KEY_REFUSED" }); expect(f.pair()).toEqual(before);
    } finally { paused.release.resolve(); await outcome; }
  });

  test("missing-file startup preparation cannot replace a later real owner init", async () => {
    const f = fixture(); await f.bind(); unlinkSync(f.file); unlinkSync(f.sigFile); const paused = f.pause();
    const operation = policy.initActionPolicyAsync(f.workspace, undefined, { onlyIfMissing: true }), outcome = operation.then(() => null, error => error);
    try {
      await atPause(paused.entered, operation); await policy.initActionPolicyAsync(f.workspace); const committed = f.pair(); f.verify();
      paused.release.resolve(); expect(await outcome).toMatchObject({ message: "action policy or signature changed while signing; retry" }); expect(f.pair()).toEqual(committed);
    } finally { paused.release.resolve(); await outcome; }
  });
});
