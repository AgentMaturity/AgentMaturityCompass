import { mkdtempSync, readFileSync, existsSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { sign } from "node:crypto";
import { Command } from "commander";
import YAML from "yaml";
import { afterEach, describe, expect, test, vi } from "vitest";
import { initWorkspace, loadAMCConfig, saveAMCConfig, saveAMCConfigAsync, signAmcConfig, signAmcConfigAsync } from "../../src/workspace.js";
import { verifyAmcConfigSignature } from "../../src/config/amcConfigSignature.js";
import { assertKeysetComplete, boundProviderKey, keysetPaths, restoreCommittedKeyset } from "../../src/keys/keyset.js";
import { registerKeysCommands, rotateKeysForCli } from "../../src/keys/keysCli.js";
import { ConfigTransitionAnchoringError, transitionConfigSignatureProvider } from "../../src/keys/configProviderTransition.js";
import { readTransparencyEntries, verifyTransparencyLog } from "../../src/transparency/logChain.js";
import { getPurposeKeyHistory, getSigningKey, getSigningPublicKeyPem, resumeKeyRotation, rotatePurposeKeys } from "../../src/keys/purposeKeys.js";
import { parseRotationStatement, verifyRotationStatement } from "../../src/keys/rotationStatement.js";
import { signingKeyId, verifyCanonical, verifyWithKey } from "../../src/keys/algorithmPolicy.js";
import { getPublicKeyHistory } from "../../src/crypto/keys.js";
import { verifyKeyHistoryEnvelope } from "../../src/crypto/keyHistoryEnvelope.js";
import { sha256Hex } from "../../src/utils/hash.js";
import { setMode } from "../../src/mode/mode.js";
import { lockVault, vaultEnvelopeKeyIds } from "../../src/vault/vault.js";
import type { KmsCall } from "../../src/keys/providers/awsKms.js";
import { AWS_ARN, awsFake, fakeKey, publicPem } from "./providerFakes.js";
import { v1Workspace } from "../helpers/legacyVault.js";

// Production provider resolution remains real. Only its supported SDK transport boundary is replaced.
const sdk = vi.hoisted(() => ({ call: undefined as KmsCall | undefined }));
vi.mock("../../src/keys/providers/awsKms.js", async importOriginal => {
  const actual = await importOriginal<typeof import("../../src/keys/providers/awsKms.js")>();
  return { ...actual, awsKmsProvider: (call?: KmsCall) => actual.awsKmsProvider(call ?? ((...args) => sdk.call!(...args))) };
});
const crash = vi.hoisted(() => ({ target: "", observeWorkspace: "", logLockHeld: [] as boolean[], failLogAt: 0 }));
vi.mock("node:fs", async importOriginal => {
  const actual = await importOriginal<typeof import("node:fs")>();
  const renameSync: typeof actual.renameSync = (from, to) => {
    if (crash.target && String(from).endsWith(".keyset-staged") && String(to).endsWith("/" + crash.target)) {
      throw new Error("owned simulated config publication crash");
    }
    return actual.renameSync(from, to);
  };
  const appendFileSync: typeof actual.appendFileSync = (...args) => {
    if (crash.observeWorkspace && String(args[0]).replaceAll("\\", "/") === `${crash.observeWorkspace.replaceAll("\\", "/")}/.amc/transparency/log.jsonl`) {
      crash.logLockHeld.push(actual.existsSync(`${crash.observeWorkspace}/.amc/.amc-config.lock`));
      if (crash.failLogAt === crash.logLockHeld.length) throw new Error("owned postcommit log failure https://private.invalid PIN=not-for-output");
    }
    return actual.appendFileSync(...args);
  };
  return { ...actual, renameSync, appendFileSync, default: { ...actual, renameSync, appendFileSync } };
});

const PASS = "owner-config-provider-passphrase", roots: Array<{ root: string; workspace: string }> = [];
afterEach(() => {
  crash.target = ""; crash.observeWorkspace = ""; crash.logLockHeld = []; crash.failLogAt = 0; vi.restoreAllMocks(); vi.useRealTimers();
  for (const f of roots.splice(0)) { lockVault(f.workspace); rmSync(f.root, { recursive: true, force: true }); }
  vi.unstubAllEnvs(); sdk.call = undefined;
});
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "amc-owner-config-")), workspace = join(root, "workspace"); roots.push({ root, workspace });
  vi.stubEnv("AMC_HOME", join(root, "home")); vi.stubEnv("AMC_VAULT_PASSPHRASE", PASS); vi.stubEnv("AMC_NO_SIGN", "0");
  initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
  const path = join(workspace, ".amc", "amc.config.yaml"), candidatePath = join(root, "candidate.yaml");
  // Unique refs avoid the existing process-scoped provider's description memo crossing fixtures.
  const a = AWS_ARN(basename(root) + "-a"), b = AWS_ARN(basename(root) + "-b"), first = fakeKey("p256"), next = fakeKey("ed25519");
  const fake = awsFake({ [a]: first, [b]: next }); let afterSign: ((id: string, bytes: Buffer) => void | Promise<void>) | undefined;
  let unavailable: string | undefined;
  sdk.call = async (operation, input, region) => {
    if (operation === "Sign" && input.KeyId === unavailable) throw Object.assign(new Error("https://private.invalid PIN=owner-secret"), { name: "ServiceUnavailableException" });
    const answer = await fake.call(operation, input, region);
    if (operation === "Sign") await afterSign?.(String(input.KeyId), Buffer.from(input.Message as Uint8Array));
    return answer;
  };
  const candidate = (id = a, extra: object = {}) => {
    const config = YAML.parse(readFileSync(path, "utf8")); config.keys = { refs: { "config-signature": { provider: "aws-kms", id } }, ...extra };
    return Buffer.from("# exact owner candidate\n" + YAML.stringify(config));
  };
  const snapshot = () => ({ config: readFileSync(path), signature: readFileSync(path + ".sig"), keyset: readFileSync(keysetPaths(workspace).keyset) });
  const firstBind = async () => { writeFileSync(candidatePath, candidate()); return rotateKeysForCli(workspace, { purpose: "config-signature", configCandidate: candidatePath }); };
  return { root, workspace, path, candidatePath, candidate, snapshot, fake, first, next, a, b, firstBind,
    hook: (hook?: typeof afterSign) => { afterSign = hook; }, unavailable: (id: string) => { unavailable = id; } };
}

describe("config backing-key owner transition and actual async config publication", () => {
  test("the existing registered keys rotate route atomically endorses exact candidate bytes, PoP, purpose history and P1-08 statement", async () => {
    const f = fixture(), before = assertKeysetComplete(f.workspace)!, anchor = getSigningPublicKeyPem(f.workspace, "config-signature"), bytes = f.candidate();
    const unchanged = ["monitor_history.json", "auditor_history.json", "lease_history.json", "session_history.json", "config-signature.pub"]
      .map(name => [name, readFileSync(join(f.workspace, ".amc", "keys", name))] as const);
    writeFileSync(f.candidatePath, bytes); vi.spyOn(process, "cwd").mockReturnValue(f.workspace); vi.spyOn(console, "log").mockImplementation(() => {});
    const program = new Command().exitOverride(); registerKeysCommands(program);
    await program.parseAsync(["node", "amc", "keys", "rotate", "--purpose", "config-signature", "--config-candidate", f.candidatePath]);
    const keyset = assertKeysetComplete(f.workspace)!, pub = publicPem(f.first), id = signingKeyId(pub)!;
    expect(keyset.generation).toBe(before.generation + 1); expect(readFileSync(f.path)).toEqual(bytes);
    expect(keyset.providers!["config-signature"]).toMatchObject({ provider: "aws-kms", id: f.a, keyId: id, algorithm: "ecdsa-p256-sha256" });
    for (const rel of ["amc.config.yaml", "amc.config.yaml.sig", "keys/config-signature-provider.pub", "keys/config-signature_history.json", "keys/statements/config-signature/1.json"]) {
      expect(keyset.files[rel]).toBe(sha256Hex(readFileSync(join(f.workspace, ".amc", rel))));
    }
    const sidecar = JSON.parse(readFileSync(f.path + ".sig", "utf8"));
    expect(verifyWithKey(Buffer.from(sha256Hex(bytes), "hex"), anchor, Buffer.from(sidecar.signature, "base64"))).toBe(true);
    expect(verifyAmcConfigSignature(f.workspace)).toMatchObject({ valid: true });
    const history = verifyKeyHistoryEnvelope(JSON.parse(readFileSync(join(f.workspace, ".amc", "keys", "config-signature_history.json"), "utf8")), "config-signature", anchor);
    expect(history.valid).toBe(true); expect(history.envelope!.entries.map(row => row.publicKeyPem)).toContain(pub);
    const statementBytes = readFileSync(join(f.workspace, ".amc", "keys", "statements", "config-signature", "1.json")), statement = parseRotationStatement(statementBytes);
    expect(verifyRotationStatement(statementBytes, { expected: { workspaceId: statement.statement.workspaceId, purpose: "config-signature" }, trustedCurrentPublicKeyPem: anchor, previous: null }).valid).toBe(true);
    expect(f.fake.requests.some(row => row.operation === "Sign" && Buffer.from(row.input.Message as Uint8Array).subarray(0, 14).toString() === "AMC_KEY_POP_V1")).toBe(true);
    for (const [name, bytes] of unchanged) expect(readFileSync(join(f.workspace, ".amc", "keys", name))).toEqual(bytes);
    for (const role of ["monitor", "auditor", "lease", "session"] as const) expect(getPublicKeyHistory(f.workspace, role)).not.toContain(pub);
    expect(() => getSigningKey(f.workspace, "config-signature")).toThrow(expect.objectContaining({ code: "KEY_PROVIDER_HELD" }));
  });

  test("an edited unsigned self-ref remains a runtime refusal and is endorsed only through the explicit existing owner route", async () => {
    const f = fixture(), bytes = f.candidate(); writeFileSync(f.path, bytes);
    expect(() => signAmcConfig(f.workspace)).toThrow(expect.objectContaining({ code: "KEY_PROVIDER_HELD" }));
    await expect(signAmcConfigAsync(f.workspace)).rejects.toMatchObject({ code: "KEY_PROVIDER_HELD" });
    expect(boundProviderKey(f.workspace, "config-signature")).toBeNull(); expect(f.fake.requests).toEqual([]);
    await rotateKeysForCli(f.workspace, { purpose: "config-signature" });
    expect(readFileSync(f.path)).toEqual(bytes); expect(verifyAmcConfigSignature(f.workspace).valid).toBe(true);
  });

  test.each(["sign", "save"] as const)("actual async config %s refuses existing agent mode before provider work and preserves the committed pair", async operation => {
    const f = fixture(); await f.firstBind(); f.fake.requests.splice(0);
    const before = f.snapshot(), candidate = loadAMCConfig(f.workspace); candidate.profile = "ci";
    const invoke = () => operation === "sign" ? signAmcConfigAsync(f.workspace) : saveAMCConfigAsync(f.workspace, candidate);
    setMode(f.workspace, "agent");
    try {
      await expect(invoke()).rejects.toThrow("Command 'keys commit' is blocked in agent mode. Switch to owner mode with: amc mode owner");
      expect(f.fake.requests).toEqual([]); expect(f.snapshot()).toEqual(before);
    } finally { setMode(f.workspace, "owner"); }
    await invoke();
    expect(verifyAmcConfigSignature(f.workspace).valid).toBe(true);
    const sidecar = JSON.parse(readFileSync(f.path + ".sig", "utf8"));
    expect(verifyCanonical("ecdsa-p256-sha256", Buffer.from(sidecar.configSha256, "hex"), publicPem(f.first), Buffer.from(sidecar.signature, "base64"))).toBe(true);
    expect(f.fake.requests.filter(row => row.operation === "Sign")).toHaveLength(1);
    if (operation === "save") expect(loadAMCConfig(f.workspace).profile).toBe("ci");
  });

  test("normal async sign/save use the actual bound provider and preserve local default signature bytes", async () => {
    const f = fixture(); const digest = sha256Hex(readFileSync(f.path)), expected = sign(null, Buffer.from(digest, "hex"), getSigningKey(f.workspace, "config-signature"));
    vi.spyOn(Date, "now").mockReturnValue(Date.now() + 1000); signAmcConfig(f.workspace); const legacy = readFileSync(f.path + ".sig");
    await signAmcConfigAsync(f.workspace); expect(readFileSync(f.path + ".sig")).toEqual(legacy);
    expect(JSON.parse(legacy.toString()).signature).toBe(expected.toString("base64")); vi.restoreAllMocks();
    await f.firstBind(); await signAmcConfigAsync(f.workspace);
    const sidecar = JSON.parse(readFileSync(f.path + ".sig", "utf8"));
    expect(verifyCanonical("ecdsa-p256-sha256", Buffer.from(sidecar.configSha256, "hex"), publicPem(f.first), Buffer.from(sidecar.signature, "base64"))).toBe(true);
    const updated = loadAMCConfig(f.workspace); updated.profile = "ci"; await saveAMCConfigAsync(f.workspace, updated);
    expect(loadAMCConfig(f.workspace).profile).toBe("ci"); expect(verifyAmcConfigSignature(f.workspace).valid).toBe(true);
    const before = f.snapshot(); f.unavailable(f.a);
    await expect(signAmcConfigAsync(f.workspace)).rejects.toMatchObject({ code: "KEY_PROVIDER_UNAVAILABLE", status: 503 }); expect(f.snapshot()).toEqual(before);
    updated.profile = "prod"; await expect(saveAMCConfigAsync(f.workspace, updated)).rejects.toMatchObject({ code: "KEY_PROVIDER_UNAVAILABLE" }); expect(f.snapshot()).toEqual(before);
  });

  test("the actual pre-P1-08 unbound vault migrates through its normal gate and preserves config signature bytes", async () => {
    const home = mkdtempSync(join(tmpdir(), "amc-config-v1-home-"));
    vi.stubEnv("AMC_HOME", join(home, "home")); vi.stubEnv("AMC_VAULT_PASSPHRASE", PASS); vi.stubEnv("AMC_NO_SIGN", "0");
    const f = v1Workspace(PASS); roots.push({ root: f.root, workspace: f.root }, { root: home, workspace: f.root });
    const path = join(f.root, ".amc", "amc.config.yaml"), bytes = Buffer.from("security:\n  trustBoundaryMode: isolated\n"); writeFileSync(path, bytes);
    const expected = sign(null, Buffer.from(sha256Hex(bytes), "hex"), f.roles.auditor.privatePem).toString("base64");
    await signAmcConfigAsync(f.root);
    expect(JSON.parse(readFileSync(path + ".sig", "utf8")).signature).toBe(expected);
    expect(getSigningPublicKeyPem(f.root, "config-signature")).toBe(f.roles.auditor.publicPem);
    expect(verifyAmcConfigSignature(f.root).valid).toBe(true);
  });

  test("a real provider rebind preserves historical config admission and cannot fall back when the committed old holder is unavailable", async () => {
    const f = fixture(); await f.firstBind(); await signAmcConfigAsync(f.workspace);
    const oldBytes = readFileSync(f.path), oldSidecar = JSON.parse(readFileSync(f.path + ".sig", "utf8")), before = f.snapshot();
    writeFileSync(f.candidatePath, f.candidate(f.b)); f.unavailable(f.a);
    const error = await rotateKeysForCli(f.workspace, { purpose: "config-signature", configCandidate: f.candidatePath }).catch(error => error);
    expect(error).toMatchObject({ code: "KEY_PROVIDER_UNAVAILABLE" }); expect(String(error)).not.toMatch(/private\.invalid|PIN=|owner-secret/); expect(f.snapshot()).toEqual(before);
    f.unavailable(""); await rotateKeysForCli(f.workspace, { purpose: "config-signature", configCandidate: f.candidatePath });
    expect(getPurposeKeyHistory(f.workspace, "config-signature")).toEqual(expect.arrayContaining([publicPem(f.first), publicPem(f.next)]));
    expect(getPurposeKeyHistory(f.workspace, "config-signature").some(pem => verifyWithKey(Buffer.from(sha256Hex(oldBytes), "hex"), pem, Buffer.from(oldSidecar.signature, "base64")))).toBe(true);
    const record = JSON.parse(readFileSync(f.path + ".sig", "utf8"));
    expect(verifyWithKey(Buffer.from(record.configSha256, "hex"), publicPem(f.first), Buffer.from(record.signature, "base64"))).toBe(true);
    expect(boundProviderKey(f.workspace, "config-signature")!.binding.id).toBe(f.b); expect(verifyAmcConfigSignature(f.workspace).valid).toBe(true);
  });

  test("pins caller candidate bytes before a real provider await", async () => {
    const f = fixture(), candidate = f.candidate(), original = Buffer.from(candidate);
    f.hook(() => { candidate.fill(0); });
    await transitionConfigSignatureProvider(f.workspace, candidate, { passphrase: PASS });
    expect(readFileSync(f.path)).toEqual(original); expect(verifyAmcConfigSignature(f.workspace).valid).toBe(true);
  });

  test("an invalid signature from the real provider PoP transport never admits its key or publishes the candidate", async () => {
    const f = fixture(), before = f.snapshot(), actual = sdk.call!;
    sdk.call = async (...args) => {
      const answer = await actual(...args);
      if (args[0] !== "Sign") return answer;
      const signature = Buffer.from(answer.Signature as Uint8Array); signature[signature.length - 1] = signature[signature.length - 1]! ^ 1;
      return { ...answer, Signature: signature };
    };
    await expect(transitionConfigSignatureProvider(f.workspace, f.candidate(), { passphrase: PASS })).rejects.toMatchObject({ code: "KEY_PROVIDER_KEY_REFUSED" });
    expect(f.snapshot()).toEqual(before); expect(boundProviderKey(f.workspace, "config-signature")).toBeNull();
  });

  test.each(["config", "signature", "generation", "owner", "vault"] as const)("%s changing during real provider signing refuses before stale publication", async change => {
    const f = fixture(), before = f.snapshot(); let once = false, expected = before;
    f.hook(() => {
      if (once) return; once = true;
      if (change === "config") { const config = loadAMCConfig(f.workspace); config.profile = "ci"; saveAMCConfig(f.workspace, config); expected = f.snapshot(); }
      else if (change === "signature") {
        const clock = vi.spyOn(Date, "now").mockReturnValue(JSON.parse(before.signature.toString()).signedTs + 1);
        try { signAmcConfig(f.workspace); } finally { clock.mockRestore(); }
        expected = f.snapshot();
      }
      else if (change === "generation") { rotatePurposeKeys({ workspace: f.workspace, purposes: ["receipt"], passphrase: PASS }); expected = f.snapshot(); }
      else if (change === "owner") setMode(f.workspace, "agent");
      else lockVault(f.workspace);
    });
    await expect(transitionConfigSignatureProvider(f.workspace, f.candidate(), { passphrase: PASS })).rejects.toThrow();
    expect(f.snapshot()).toEqual(expected); expect(boundProviderKey(f.workspace, "config-signature")).toBeNull();
    expect(existsSync(join(f.workspace, ".amc", "keys", "statements", "config-signature", "1.json"))).toBe(false);
  });

  test("owner passphrase and prospective postcommit transparency constraints refuse before provider resolution or writes", async () => {
    const f = fixture(), before = f.snapshot();
    await expect(transitionConfigSignatureProvider(f.workspace, f.candidate(), { passphrase: "incorrect passphrase" })).rejects.toThrow();
    for (const extra of [{ requireNonExportable: true }, { algorithmPolicy: { allowed: ["ecdsa-p256-sha256"] } }]) {
      await expect(transitionConfigSignatureProvider(f.workspace, f.candidate(f.a, extra), { passphrase: PASS })).rejects.toMatchObject({ code: "KEY_PROVIDER_KEY_REFUSED" });
    }
    await expect(rotateKeysForCli(f.workspace, { purpose: "receipt", configCandidate: f.candidatePath })).rejects.toThrow(/only works/);
    await expect(rotateKeysForCli(f.workspace, { purpose: "config-signature", configCandidate: f.candidatePath, resume: true })).rejects.toThrow(/no other options/);
    expect(f.fake.requests).toEqual([]); expect(f.snapshot()).toEqual(before);
  });

  test.each(["amc.config.yaml", "amc.config.yaml.sig"])("an interrupted %s rename is fail-closed, and actual owner resume completes the entire pair plus binding", async target => {
    const f = fixture(), bytes = f.candidate(); crash.target = target;
    await expect(transitionConfigSignatureProvider(f.workspace, bytes, { passphrase: PASS })).rejects.toThrow(/owned simulated/); crash.target = "";
    expect(existsSync(keysetPaths(f.workspace).pending)).toBe(true); expect(verifyAmcConfigSignature(f.workspace).valid).toBe(false);
    expect(resumeKeyRotation(f.workspace, PASS).action).toBe("completed");
    expect(readFileSync(f.path)).toEqual(bytes); expect(boundProviderKey(f.workspace, "config-signature")!.binding.id).toBe(f.a); expect(verifyAmcConfigSignature(f.workspace).valid).toBe(true);
  });

  test("actual owner resume rolls the complete pair and binding back if a required staged signature is corrupt", async () => {
    const f = fixture(), before = f.snapshot(); crash.target = "amc.config.yaml.sig";
    await expect(transitionConfigSignatureProvider(f.workspace, f.candidate(), { passphrase: PASS })).rejects.toThrow(/owned simulated/); crash.target = "";
    writeFileSync(f.path + ".sig.keyset-staged", "corrupt staged signature");
    expect(resumeKeyRotation(f.workspace, PASS).action).toBe("rolled-back"); expect(f.snapshot()).toEqual(before);
    expect(boundProviderKey(f.workspace, "config-signature")).toBeNull(); expect(verifyAmcConfigSignature(f.workspace).valid).toBe(true);
  });

  test("actual explicit restore recovers a missing committed config pair with public modes, while later edits remain mutable", async () => {
    const f = fixture(); await f.firstBind(); const before = f.snapshot(); rmSync(f.path); rmSync(f.path + ".sig");
    const restored = restoreCommittedKeyset(f.workspace, { vaultKeyIds: bytes => vaultEnvelopeKeyIds(bytes.toString(), PASS) });
    expect(restored.restored).toEqual(expect.arrayContaining(["amc.config.yaml", "amc.config.yaml.sig"])); expect(f.snapshot()).toEqual(before);
    expect(statSync(f.path).mode & 0o777).toBe(0o644); expect(statSync(f.path + ".sig").mode & 0o777).toBe(0o644);
    const historyPath = join(f.workspace, ".amc", "keys", "config-signature_history.json"), history = readFileSync(historyPath);
    writeFileSync(historyPath, history.toString() + " "); expect(() => assertKeysetComplete(f.workspace)).toThrow(/incomplete/);
    expect(restoreCommittedKeyset(f.workspace, { vaultKeyIds: bytes => vaultEnvelopeKeyIds(bytes.toString(), PASS) }).restored).toContain("keys/config-signature_history.json");
    expect(readFileSync(historyPath)).toEqual(history);
    writeFileSync(f.path, "# later owner edit\n" + before.config.toString()); expect(() => assertKeysetComplete(f.workspace)).not.toThrow();
    expect(verifyAmcConfigSignature(f.workspace).valid).toBe(false);
  });

  test("real postcommit history and rotation appends occur after the config publication lock is released", async () => {
    const f = fixture(); crash.observeWorkspace = f.workspace;
    const before = readTransparencyEntries(f.workspace).length;
    const result = await transitionConfigSignatureProvider(f.workspace, f.candidate(), { passphrase: PASS });
    expect(assertKeysetComplete(f.workspace)!.generation).toBe(result.generation);
    expect(crash.logLockHeld.length).toBeGreaterThanOrEqual(2); expect(crash.logLockHeld.every(held => !held)).toBe(true);
    const added = readTransparencyEntries(f.workspace).slice(before);
    expect(added.map(row => row.type)).toEqual(["KEY_HISTORY_REVISION", "KEY_ROTATION"]);
    expect(verifyTransparencyLog(f.workspace).ok).toBe(true); expect(verifyAmcConfigSignature(f.workspace).valid).toBe(true);
  });

  test("partial postcommit log failure reports the active committed generation without claiming rollback or keyset-resume anchor repair", async () => {
    const f = fixture(), before = assertKeysetComplete(f.workspace)!;
    const originalEntries = readTransparencyEntries(f.workspace).length;
    crash.observeWorkspace = f.workspace; crash.failLogAt = 2; // history really commits; rotation append then fails
    const error = await transitionConfigSignatureProvider(f.workspace, f.candidate(), { passphrase: PASS }).catch(error => error);
    expect(error).toBeInstanceOf(ConfigTransitionAnchoringError);
    expect(error).toMatchObject({ code: "CONFIG_TRANSITION_ANCHOR_INCOMPLETE", committed: { purpose: "config-signature", generation: before.generation + 1 } });
    expect(String(error)).toContain("remain active"); expect(String(error)).not.toMatch(/private\.invalid|PIN=|not-for-output/);
    expect(crash.logLockHeld).toEqual([false, false]); expect(existsSync(join(f.workspace, ".amc", ".amc-config.lock"))).toBe(false);
    const committed = assertKeysetComplete(f.workspace)!;
    expect(committed.generation).toBe(error.committed.generation); expect(committed.providers!["config-signature"]!.id).toBe(f.a);
    expect(existsSync(keysetPaths(f.workspace).pending)).toBe(false); expect(verifyAmcConfigSignature(f.workspace).valid).toBe(true);
    expect(readTransparencyEntries(f.workspace).slice(originalEntries).map(row => row.type)).toEqual(["KEY_HISTORY_REVISION"]);
    expect(verifyTransparencyLog(f.workspace).ok).toBe(true);
    crash.failLogAt = 0;
    expect(resumeKeyRotation(f.workspace, PASS)).toMatchObject({ action: "nothing-pending" });
    expect(readTransparencyEntries(f.workspace).slice(originalEntries).map(row => row.type)).toEqual(["KEY_HISTORY_REVISION"]);
    expect(assertKeysetComplete(f.workspace)!.generation).toBe(error.committed.generation);
  });
});
