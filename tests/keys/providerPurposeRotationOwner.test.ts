// Proposed destination: tests/keys/providerPurposeRotationOwner.test.ts. Actual owner APIs; all provider transport is the existing AWS fake.
import { mkdtempSync, readFileSync, existsSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import YAML from "yaml";
import { Command } from "commander";
import { afterEach, describe, expect, test, vi } from "vitest";
import { initWorkspace, signAmcConfig } from "../../src/workspace.js";
import { bindPurposeProviderKey } from "../../src/keys/purposeProviders.js";
import { awsKmsProvider } from "../../src/keys/providers/awsKms.js";
import { boundKeyset, keysetPaths } from "../../src/keys/keyset.js";
import { getPurposeKeyHistory, getSigningPublicKeyPem, revokeKeyAsync, rotatePurposeKeys } from "../../src/keys/purposeKeys.js";
import { parseRotationStatement, verifyRotationStatement } from "../../src/keys/rotationStatement.js";
import { readKeyRevocations } from "../../src/keys/keyRevocations.js";
import { readOperationalLedgerContext } from "../../src/keys/operationalLedgerReader.js";
import { registerKeysCommands } from "../../src/keys/keysCli.js";
import { setMode } from "../../src/mode/mode.js";
import { lockVault } from "../../src/vault/vault.js";
import { signingKeyId } from "../../src/keys/algorithmPolicy.js";
import type { KeyProvider } from "../../src/keys/provider.js";
import type { LocalPurpose } from "../../src/vault/vaultPayload.js";
import { verifyArtifact } from "../../packages/verifier/src/index.js";
import { signTrustList } from "../../src/trust/trustList.js";
import { listEntry, testKey, trustList } from "../trust/trustFixtures.js";
import { AWS_ARN, awsFake, fakeKey } from "./providerFakes.js";

const PASS = "owned-provider-rotation-passphrase", A = AWS_ARN("rotation-old"), B = AWS_ARN("rotation-next"), ALIAS = AWS_ARN("rotation-alias");
const roots: Array<{ root: string; workspace: string }> = [];
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); for (const f of roots.splice(0)) { lockVault(f.workspace); rmSync(f.root, { recursive: true, force: true }); } vi.unstubAllEnvs(); });
function configure(workspace: string, purpose: LocalPurpose, id: string) {
  const path = join(workspace, ".amc", "amc.config.yaml"), config = YAML.parse(readFileSync(path, "utf8"));
  config.keys = { refs: { [purpose]: { provider: "aws-kms", id } } }; writeFileSync(path, YAML.stringify(config)); signAmcConfig(workspace);
}
function fixture(purpose: "ledger-row" | "session", retireReceipt = false) {
  const root = mkdtempSync(join(tmpdir(), "amc-provider-rotation-owner-")), workspace = join(root, "workspace"); roots.push({ root, workspace });
  vi.stubEnv("AMC_HOME", join(root, "home")); vi.stubEnv("AMC_VAULT_PASSPHRASE", PASS); vi.stubEnv("AMC_NO_SIGN", "0");
  initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
  let retired = "";
  if (retireReceipt) {
    rotatePurposeKeys({ workspace, purposes: ["receipt"], passphrase: PASS }); retired = signingKeyId(getSigningPublicKeyPem(workspace, "receipt"))!;
    rotatePurposeKeys({ workspace, purposes: ["receipt"], passphrase: PASS });
  }
  const old = fakeKey("ed25519"), next = fakeKey("p256"), fake = awsFake({ [A]: old, [ALIAS]: old, [B]: next });
  const provider = awsKmsProvider(fake.call), anchor = getSigningPublicKeyPem(workspace, purpose), keyset = () => readFileSync(keysetPaths(workspace).keyset);
  const statementPath = (sequence: number) => join(workspace, ".amc", "keys", "statements", purpose, sequence + ".json");
  const log = () => readFileSync(join(workspace, ".amc", "transparency", "log.jsonl"));
  return { root, workspace, purpose, fake, provider, old, next, anchor, keyset, statementPath, log, retired };
}
function paused(provider: KeyProvider, tag: string, id?: string) {
  let enter!: () => void, release!: () => void, seen = false;
  const entered = new Promise<void>(resolve => { enter = resolve; }), resumed = new Promise<void>(resolve => { release = resolve; });
  return { entered, release, provider: { ...provider, sign: async (ref, message) => {
    if (!seen && (id === undefined || ref.id === id) && Buffer.from(message).subarray(0, tag.length).toString() === tag) { seen = true; enter(); await resumed; }
    return provider.sign(ref, message);
  } } satisfies KeyProvider };
}
async function first(f: ReturnType<typeof fixture>) {
  configure(f.workspace, f.purpose, A);
  return bindPurposeProviderKey(f.workspace, f.purpose, { passphrase: PASS, provider: f.provider });
}
async function waitForPause(entered: Promise<void>, operation: Promise<unknown>): Promise<void> {
  await Promise.race([entered, operation.then(() => { throw new Error("the actual owner completed without reaching the required provider signing boundary"); },
    () => { throw new Error("the actual owner refused before reaching the required provider signing boundary"); })]);
}

describe("actual provider purpose rotation owner preparation and atomic publication", () => {
  test.each(["ledger-row", "session"] as const)("%s first bind and genuine issuer rebind publish independently verifiable P1-08 statements without changing vault anchors", async purpose => {
    const f = fixture(purpose), boundA = await first(f), firstBytes = readFileSync(f.statementPath(1)), previous = parseRotationStatement(firstBytes);
    expect(verifyRotationStatement(firstBytes, { expected: { workspaceId: previous.statement.workspaceId, purpose }, trustedCurrentPublicKeyPem: f.anchor, previous: null }).valid).toBe(true);
    configure(f.workspace, purpose, B);
    const boundB = await bindPurposeProviderKey(f.workspace, purpose, { passphrase: PASS, provider: f.provider });
    const bytes = readFileSync(f.statementPath(2)), current = parseRotationStatement(bytes), oldPem = f.old.publicKey.export({ format: "pem", type: "spki" }).toString();
    expect(boundB.generation).toBe(boundA.generation + 1);
    expect(current.statement).toMatchObject({ previousKeyId: boundA.keyId, nextKeyId: boundB.keyId, reason: "scheduled", sequence: 2 });
    expect(verifyRotationStatement(bytes, { expected: { workspaceId: current.statement.workspaceId, purpose }, trustedCurrentPublicKeyPem: oldPem, previous }).valid).toBe(true);
    expect(getSigningPublicKeyPem(f.workspace, purpose)).toBe(f.anchor);
    expect(boundKeyset(f.workspace)!.files[`keys/statements/${purpose}/2.json`]).toBeDefined();
    expect(boundKeyset(f.workspace)!.statements).toHaveLength(1);
    const publicKeys = getPurposeKeyHistory(f.workspace, purpose);
    expect(publicKeys).toContain(oldPem); expect(publicKeys).toContain(current.statement.nextPublicKeyPem);
    for (const other of ["receipt", "artifact-seal", "config-signature"] as const) {
      expect(getPurposeKeyHistory(f.workspace, other)).not.toContain(oldPem); expect(getPurposeKeyHistory(f.workspace, other)).not.toContain(current.statement.nextPublicKeyPem);
    }
    const root = testKey(), authority = signTrustList(trustList([listEntry({ ...root, keyId: boundA.keyId, publicKeyPem: oldPem }, { purposes: [purpose] })]), root.privateKeyPem);
    const portable = verifyArtifact(bytes, { asOf: new Date("2026-10-20T23:59:59.000Z"), trustRoots: [root.keyId], trustLists: [authority] });
    expect(portable.integrity.status).toBe("pass"); expect(portable.issuerAdmission.status).toBe("pass");
    // The next holder's mere possession is insufficient previous-key authority.
    const missingPrevious = { ...current, signatures: current.signatures.filter(row => row.by !== "previous") };
    const { canonicalize } = await import("../../src/utils/json.js");
    expect(verifyRotationStatement(Buffer.from(canonicalize(missingPrevious)), { expected: { workspaceId: current.statement.workspaceId, purpose }, trustedCurrentPublicKeyPem: oldPem, previous }).valid).toBe(false);
  });

  test("same-key renewal and a signed ref alias advance backing state without fabricating a P1-08 key rotation", async () => {
    const f = fixture("ledger-row"), a = await first(f), statement = readFileSync(f.statementPath(1));
    const renewed = await bindPurposeProviderKey(f.workspace, f.purpose, { passphrase: PASS, provider: f.provider });
    configure(f.workspace, f.purpose, ALIAS);
    const aliased = await bindPurposeProviderKey(f.workspace, f.purpose, { passphrase: PASS, provider: f.provider });
    expect(renewed.keyId).toBe(a.keyId); expect(aliased.keyId).toBe(a.keyId); expect(aliased.id).toBe(ALIAS);
    expect(aliased.generation).toBe(a.generation + 2); expect(readFileSync(f.statementPath(1))).toEqual(statement); expect(existsSync(f.statementPath(2))).toBe(false);
  });

  test("an unavailable old provider cannot be replaced by the new provider's proof, delegation or vault key", async () => {
    const f = fixture("ledger-row"); await first(f); configure(f.workspace, f.purpose, B);
    const before = f.keyset(), log = f.log(), refusing: KeyProvider = { ...f.provider, sign: async (ref, message) => {
      if (ref.id === A) throw Object.assign(new Error("owned unavailable sentinel"), { code: "Unavailable" }); return f.provider.sign(ref, message);
    } };
    await expect(bindPurposeProviderKey(f.workspace, f.purpose, { passphrase: PASS, provider: refusing })).rejects.toMatchObject({ code: "KEY_PROVIDER_UNAVAILABLE" });
    expect(f.keyset()).toEqual(before); expect(f.log()).toEqual(log); expect(existsSync(f.statementPath(2))).toBe(false);
    expect(boundKeyset(f.workspace)!.providers![f.purpose]!.id).toBe(A);
  });

  test.each(["policy", "generation", "revocation", "owner", "vault"] as const)("%s changing during real previous/next signing refuses the stale atomic publication", async change => {
    const f = fixture("session", change === "revocation"); await first(f); configure(f.workspace, f.purpose, B);
    const slow = paused(f.provider, "AMC_KEY_ROTATION_V1\0", B), operation = bindPurposeProviderKey(f.workspace, f.purpose, { passphrase: PASS, provider: slow.provider });
    const refused = expect(operation).rejects.toThrow();
    void refused.catch(() => {}); // Preserve the assertion without an unhandled rejection if the old implementation completes early.
    let expectedKeyset = f.keyset();
    try {
      await waitForPause(slow.entered, operation);
      if (change === "policy") {
        const path = join(f.workspace, ".amc", "amc.config.yaml"), config = YAML.parse(readFileSync(path, "utf8"));
        config.keys.algorithmPolicy = { allowed: ["ed25519"] }; writeFileSync(path, YAML.stringify(config));
      } else if (change === "generation") {
        rotatePurposeKeys({ workspace: f.workspace, purposes: ["receipt"], passphrase: PASS }); expectedKeyset = f.keyset();
      } else if (change === "revocation") {
        await revokeKeyAsync(f.workspace, "receipt", f.retired, "superseded", PASS);
        expect(readKeyRevocations(f.workspace, true).map(row => row.keyId)).toContain(f.retired);
      } else if (change === "owner") setMode(f.workspace, "agent");
      else lockVault(f.workspace);
      slow.release(); await refused;
      expect(f.keyset()).toEqual(expectedKeyset); expect(existsSync(f.statementPath(2))).toBe(false);
      expect(boundKeyset(f.workspace)!.providers!.session!.id).toBe(A);
    } finally { slow.release(); await operation.catch(() => {}); }
  });

  test("final publication uses the live final clock and refuses a grant that expires during its real provider wait", async () => {
    const f = fixture("ledger-row"), t0 = Date.now(); configure(f.workspace, f.purpose, A);
    const before = f.keyset(), log = f.log(), slow = paused(f.provider, "AMC_KEY_DELEGATION_V2\0");
    // Advance beyond the 30-second grant while staying inside the independent 30-minute vault TTL.
    const operation = bindPurposeProviderKey(f.workspace, f.purpose, { passphrase: PASS, provider: slow.provider, now: new Date(t0), delegation: { hours: 1 / 120 } });
    const refused = expect(operation).rejects.toMatchObject({ code: "KEY_DELEGATION_INVALID" });
    void refused.catch(() => {});
    let clock: ReturnType<typeof vi.spyOn> | undefined;
    try {
      await waitForPause(slow.entered, operation); clock = vi.spyOn(Date, "now").mockReturnValue(t0 + 60_000); slow.release(); await refused;
      expect(f.keyset()).toEqual(before); expect(f.log()).toEqual(log); expect(existsSync(f.statementPath(1))).toBe(false);
    } finally { clock?.mockRestore(); slow.release(); await operation.catch(() => {}); }
  });

  test("the real registered CLI keeps provider compromise/root flags explicitly refused before SDK resolution", () => {
    const f = fixture("session"); configure(f.workspace, f.purpose, B);
    const before = f.keyset(), requests = f.fake.requests.length, blocked = join(f.root, "blocked-sdk.txt"), driver = join(f.root, "cli-driver.mjs"), loader = join(f.root, "no-sdk-loader.mjs");
    const commander = createRequire(import.meta.url).resolve("commander"), cli = resolve("dist/keys/keysCli.js");
    writeFileSync(driver, `import { Command } from ${JSON.stringify(pathToFileURL(commander).href)};
import { registerKeysCommands } from ${JSON.stringify(pathToFileURL(cli).href)};
const program = new Command().exitOverride(); registerKeysCommands(program);
try { await program.parseAsync(["node", "amc", ...process.argv.slice(2)]); }
catch (error) { console.error(error.message); process.exitCode = 1; }
`);
    writeFileSync(loader, `import { appendFileSync } from "node:fs";
export async function resolve(specifier, context, nextResolve) {
  if (["@aws-sdk/", "@google-cloud/", "@azure/", "pkcs11js", "agent-maturity-compass-key-provider-pkcs11"].some(prefix => specifier.startsWith(prefix))) {
    appendFileSync(process.env.P208_BLOCKED_SDK, specifier + "\\n"); throw new Error("owned CLI witness forbids every SDK/native import");
  }
  return nextResolve(specifier, context);
}
`);
    for (const flags of [["--reason", "key-compromise"], ["--root-key", "owned-nonexistent-root.pem"], ["--overlap-days", "1"]]) {
      const out = spawnSync(process.execPath, ["--experimental-loader", loader, driver, "keys", "rotate", "--purpose", "session", ...flags],
        { cwd: f.workspace, env: { ...process.env, P208_BLOCKED_SDK: blocked }, encoding: "utf8", timeout: 10_000 });
      expect(out.status, out.stderr).toBe(1); expect(out.stderr).toContain("do not apply to a provider key"); expect(out.stdout).toBe(""); expect(existsSync(blocked)).toBe(false);
    }
    expect(f.keyset()).toEqual(before); expect(f.fake.requests).toHaveLength(requests);
  });

  test.each(["ledger-row", "session"] as const)("%s cannot fall through to a vault-only rotation when the editable provider ref is removed", async purpose => {
    const f = fixture(purpose); await first(f);
    const path = join(f.workspace, ".amc", "amc.config.yaml"), config = YAML.parse(readFileSync(path, "utf8"));
    config.keys = { refs: {} }; writeFileSync(path, YAML.stringify(config)); signAmcConfig(f.workspace);
    const before = f.keyset(), statement = readFileSync(f.statementPath(1));
    expect(() => rotatePurposeKeys({ workspace: f.workspace, purposes: [purpose], passphrase: PASS })).toThrow(expect.objectContaining({ code: "KEY_PROVIDER_HELD" }));
    vi.spyOn(process, "cwd").mockReturnValue(f.workspace);
    const program = new Command().exitOverride(); registerKeysCommands(program);
    await expect(program.parseAsync(["node", "amc", "keys", "rotate", "--purpose", purpose])).rejects.toMatchObject({ code: "KEY_PROVIDER_HELD" });
    expect(f.keyset()).toEqual(before); expect(readFileSync(f.statementPath(1))).toEqual(statement); expect(existsSync(f.statementPath(2))).toBe(false);
  });

  test("a retired provider issuer can be explicitly revoked only for its exact purpose; historical local admission then fails closed", async () => {
    const f = fixture("ledger-row"), a = await first(f); configure(f.workspace, f.purpose, B);
    const b = await bindPurposeProviderKey(f.workspace, f.purpose, { passphrase: PASS, provider: f.provider });
    await expect(revokeKeyAsync(f.workspace, f.purpose, b.keyId, "superseded", PASS)).rejects.toThrow(/still signs/);
    await expect(revokeKeyAsync(f.workspace, "receipt", a.keyId, "superseded", PASS)).rejects.toThrow(/not in the receipt key history/);
    await revokeKeyAsync(f.workspace, f.purpose, a.keyId, "superseded", PASS);
    expect(readKeyRevocations(f.workspace, true).map(row => row.keyId)).toContain(a.keyId);
    expect(readOperationalLedgerContext(f.workspace).errors).toContainEqual(expect.stringMatching(/issuer distrusted/));
    expect(boundKeyset(f.workspace)!.providers![f.purpose]!.keyId).toBe(b.keyId);
  });
});
