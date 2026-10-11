import { createPublicKey, generateKeyPairSync, sign } from "node:crypto";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { addPublicKeyToHistory, ensureSigningKeys, getPrivateKeyPem } from "../../src/crypto/keys.js";
import { keysetAdoptionNotes, keysetAnchoring } from "../../src/keys/keyset.js";
import { rotateKeysForCli } from "../../src/keys/keysCli.js";
import { ClaimReplayCache, createAgentClaim, verifyAgentClaim, type ClaimExpectation } from "../../src/score/crossAgentTrust.js";
import { v1Workspace } from "../helpers/legacyVault.js";
import { historyLogId, loggedAnchor, machineMark } from "../../src/keys/anchors.js";
import { highWaterKey, highWaterPath, readHighWater, workspaceScope } from "../../src/keys/highWater.js";
import { getPurposeKeyHistory, getSigningKey, getSigningPublicKeyPem, rotatePurposeKeys } from "../../src/keys/purposeKeys.js";
import { encodeSignedRevocationList, revocationListSha256, signRevocationList } from "../../src/keys/revocationList.js";
import { encodeRotationStatement, signRotationStatement } from "../../src/keys/rotationStatement.js";
import { issueLeaseForCli, revokeLeaseForCli, verifyLeaseForCli } from "../../src/leases/leaseCli.js";
import { leaseRevocationPaths, readVerifiedLeaseRevocations, revokeLease } from "../../src/leases/leaseStore.js";
import { ed25519KeyId } from "../../src/trust/trustList.js";
import { statStamp } from "../../src/utils/containedFs.js";
import { sha256Hex } from "../../src/utils/hash.js";
import { canonicalize } from "../../src/utils/json.js";
import { lockVault, unlockVault, vaultExists, vaultPaths } from "../../src/vault/vault.js";
import { initWorkspace } from "../../src/workspace.js";

// Regression tests for the P1-08 independent review: each attack is a workspace-only writer (no vault passphrase, no write
// to AMC home) unless it says otherwise. Repros: p108-review/repro/{vault-rollback,workspace-writer,history-logfloor}.ts.
const PASS = "amc-test-passphrase";
const dirs: string[] = [];
const trustRoots = () => join(process.env.AMC_HOME!, "trust", "trust-roots.json");
afterEach(() => {
  for (const dir of dirs.splice(0)) { lockVault(dir); rmSync(dir, { recursive: true, force: true }); }
  rmSync(trustRoots(), { force: true });
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

function workspace(): string {
  const root = mkdtempSync(join(tmpdir(), "amc-ws-writer-"));
  dirs.push(root);
  initWorkspace({ workspacePath: root, trustBoundaryMode: "isolated" });
  return root;
}
const keyPair = () => {
  const keys = generateKeyPairSync("ed25519");
  return { privatePem: keys.privateKey.export({ format: "pem", type: "pkcs8" }).toString(), publicPem: keys.publicKey.export({ format: "pem", type: "spki" }).toString() };
};
/** A trust-list root this machine pins in <AMC home>/trust/trust-roots.json. */
function pinnedRoot(): string {
  const root = keyPair();
  mkdirSync(dirname(trustRoots()), { recursive: true });
  writeFileSync(trustRoots(), JSON.stringify({ type: "amc.trust-roots", version: 1, roots: [ed25519KeyId(root.publicPem)] }));
  return root.privatePem;
}
const idOf = (privatePem: string) => ed25519KeyId(createPublicKey(privatePem).export({ format: "pem", type: "spki" }).toString())!;

describe("H1: the key set is bound to this machine's mark", () => {
  it("restoring the pre-compromise vault and keys under a rewritten keyset.json is refused", () => {
    const root = workspace();
    const amc = join(root, ".amc");
    const backup = mkdtempSync(join(tmpdir(), "amc-ws-writer-backup-"));
    dirs.push(backup);
    cpSync(amc, backup, { recursive: true }); // a writer can read the workspace before the rotation
    const compromised = idOf(getSigningKey(root, "receipt"));
    const rotated = rotatePurposeKeys({ workspace: root, purposes: ["receipt"], reason: "key-compromise", rootPrivateKeyPems: [pinnedRoot()], passphrase: PASS });
    // The generation's recovery copies (the old vault among them) are kept in AMC home, not in the workspace.
    expect(rotated.recoveryDirectory.startsWith(process.env.AMC_HOME!)).toBe(true);
    expect(existsSync(join(rotated.recoveryDirectory, "vault.amcvault"))).toBe(true);
    expect(existsSync(join(amc, "keys", "rotations", `gen-${rotated.generation}`, "vault.amcvault"))).toBe(false);
    lockVault(root);

    for (const rel of ["vault.amcvault", "vault.amcvault.meta.json", "keys/receipt.pub", "keys/receipt_history.json", "keys/ledger-row.pub",
      "keys/ledger-row_history.json", "keys/monitor_ed25519.pub", "keys/monitor_history.json"]) cpSync(join(backup, rel), join(amc, rel));
    const keysetPath = join(amc, "keys", "keyset.json");
    const keyset = JSON.parse(readFileSync(keysetPath, "utf8"));
    const files = Object.fromEntries(Object.keys(keyset.files).map(rel => [rel, sha256Hex(readFileSync(join(amc, rel)))]));
    const meta = JSON.parse(readFileSync(join(amc, "vault.amcvault.meta.json"), "utf8"));
    writeFileSync(keysetPath, canonicalize({ ...keyset, generation: keyset.generation + 1, keys: meta.purposeKeyIds, files }));
    expect(() => { unlockVault(root, PASS); getSigningKey(root, "receipt"); }).toThrow(/never committed on this machine/);
    // Same generation, other bytes: FORK_DETECTED.
    writeFileSync(keysetPath, canonicalize({ ...keyset, keys: meta.purposeKeyIds, files }));
    expect(() => getSigningKey(root, "receipt")).toThrow(/FORK_DETECTED/);
    expect(compromised).not.toBe(rotated.rotated[0]!.nextKeyId);
  });

  it("reading a key set never raises this machine's mark", () => {
    const root = workspace();
    rmSync(highWaterPath());
    getSigningKey(root, "receipt");
    expect(readHighWater(highWaterKey("keyset", workspaceScope(root)))).toBeNull();
  });
});

describe("H2: verifiers refuse a public key the bound key set does not name", () => {
  it("a swapped revocation-list.pub cannot un-revoke a lease, and a swapped lease key cannot mint one", () => {
    const root = workspace();
    const token = issueLeaseForCli({ workspace: root, agentId: "default", ttl: "1h", scopes: "gateway:llm", routes: "/openai", models: "*", rpm: 10, tpm: 1000 }).token;
    const leaseId = (verifyLeaseForCli({ workspace: root, token }).payload as { leaseId: string }).leaseId;
    revokeLease(root, leaseId, "compromised");
    lockVault(root);
    const keys = join(root, ".amc", "keys");

    const attacker = keyPair();
    writeFileSync(join(keys, "revocation-list.pub"), attacker.publicPem);
    const file = leaseRevocationPaths(root).file;
    const current = JSON.parse(readFileSync(file, "utf8"));
    const unrevoked = { ...current.list, sequence: current.list.sequence + 1, previousSha256: revocationListSha256(current.list), issuedAt: new Date().toISOString(), revoked: [] };
    writeFileSync(file, encodeSignedRevocationList({ ...signRevocationList(unrevoked, attacker.privatePem), anchor: null }));
    expect(readVerifiedLeaseRevocations(root)).toMatchObject({ ok: false, reason: expect.stringMatching(/replaced public key/) });
    expect(verifyLeaseForCli({ workspace: root, token }).ok).toBe(false);
    expect(() => getSigningPublicKeyPem(root, "revocation-list")).toThrow(/replaced public key/);

    const minter = keyPair();
    writeFileSync(join(keys, "lease_ed25519.pub"), minter.publicPem);
    const now = Date.now();
    const payload = { v: 1, leaseId: "lease_forged", issuedTs: now, expiresTs: now + 86_400_000, workspaceId: "default", agentId: "default", workOrderId: null,
      scopes: ["gateway:llm"], routeAllowlist: ["/"], modelAllowlist: ["*"], maxTokensPerMinute: 1e9, maxRequestsPerMinute: 1e9, maxCostUsdPerDay: null, nonce: "x".repeat(32) };
    const bytes = Buffer.from(canonicalize(payload), "utf8");
    const b64u = (b: Buffer) => b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
    expect(verifyLeaseForCli({ workspace: root, token: `${b64u(bytes)}.${b64u(sign(null, bytes, minter.privatePem))}` }).ok).toBe(false);
  });
});

describe("M1: key-compromise authority comes from the pinned trust-list roots", () => {
  it("refuses a --root-key this machine does not pin, and accepts a pinned one", () => {
    const root = workspace();
    expect(() => rotatePurposeKeys({ workspace: root, purposes: ["receipt"], reason: "key-compromise", rootPrivateKeyPems: [keyPair().privatePem], passphrase: PASS }))
      .toThrow(/not a pinned trust-list root/);
    expect(rotatePurposeKeys({ workspace: root, purposes: ["receipt"], reason: "key-compromise", rootPrivateKeyPems: [pinnedRoot()], passphrase: PASS }).rotated.length).toBe(2);
  });
});

describe("M3: the workspace log is the key-history floor once this machine's marks are gone", () => {
  it("a restored pre-scrub history does not readmit the compromised key", () => {
    const root = workspace();
    const shared = getSigningPublicKeyPem(root, "ledger-row");
    rotatePurposeKeys({ workspace: root, purposes: ["receipt"], passphrase: PASS }); // purpose-split: receipt's history keeps the shared key
    const history = join(root, ".amc", "keys", "receipt_history.json");
    const preScrub = readFileSync(history);
    rotatePurposeKeys({ workspace: root, purposes: ["ledger-row"], reason: "key-compromise", rootPrivateKeyPems: [pinnedRoot()], passphrase: PASS });
    writeFileSync(history, preScrub);
    rmSync(highWaterPath()); // a fresh verifier, or a container restart that lost AMC home
    expect(getPurposeKeyHistory(root, "receipt")).not.toContain(shared);
  });

  it("logs every history revision, including the ones vault creation and an explicit admission write", () => {
    const root = workspace();
    const created = loggedAnchor(root, "KEY_HISTORY_REVISION", historyLogId(root, "artifact-seal"));
    expect(created).not.toBeNull();
    const before = loggedAnchor(root, "KEY_HISTORY_REVISION", historyLogId(root, "auditor"))!;
    addPublicKeyToHistory(root, "auditor", keyPair().publicPem, "notary");
    expect(loggedAnchor(root, "KEY_HISTORY_REVISION", historyLogId(root, "auditor"))!.sequence).toBe(before.sequence + 1);
  });
});

describe("review lows", () => {
  it("a planted, unverified chain head never raises this machine's rotation mark", () => {
    const root = workspace();
    const dir = join(root, ".amc", "keys", "statements", "receipt");
    mkdirSync(dir, { recursive: true });
    const next = keyPair();
    const planted = signRotationStatement({ type: "amc.key-rotation", version: 1, workspaceId: "default", purpose: "receipt", sequence: 1, previousStatementSha256: null,
      previousKeyId: null, nextKeyId: ed25519KeyId(next.publicPem)!, nextPublicKeyPem: next.publicPem, reason: "scheduled", overlap: null,
      issuedAt: new Date().toISOString() }, { next: next.privatePem });
    writeFileSync(join(dir, "1.json"), encodeRotationStatement(planted));
    expect(() => rotatePurposeKeys({ workspace: root, purposes: ["receipt"], passphrase: PASS })).toThrow(/does not end at the vault's current key/);
    expect(machineMark(root, "KEY_ROTATION", "default:receipt")).toBeNull();
    rmSync(join(dir, "1.json"));
    expect(rotatePurposeKeys({ workspace: root, purposes: ["receipt"], passphrase: PASS }).rotated.length).toBe(1);
  });

  it("a stat stamp changes when a file is rewritten in place and its mtime is set back", () => {
    const dir = mkdtempSync(join(tmpdir(), "amc-stamp-"));
    dirs.push(dir);
    const file = join(dir, "f");
    writeFileSync(file, "aaaa");
    const old = new Date(Date.now() - 60_000);
    utimesSync(file, old, old);
    const before = statStamp([file]);
    writeFileSync(file, "bbbb");
    utimesSync(file, old, old);
    expect(statStamp([file])).not.toBe(before);
  });

  it("amc lease revoke --token records the lease's expiry so the revocation can be pruned", () => {
    const root = workspace();
    const token = issueLeaseForCli({ workspace: root, agentId: "default", ttl: "1h", scopes: "gateway:llm", routes: "/openai", models: "*", rpm: 10, tpm: 1000 }).token;
    const payload = verifyLeaseForCli({ workspace: root, token }).payload as { leaseId: string; expiresTs: number };
    expect(() => revokeLeaseForCli({ workspace: root, leaseId: "lease_other", reason: "x", token })).toThrow(/not the lease/);
    revokeLeaseForCli({ workspace: root, leaseId: payload.leaseId, reason: "done", token });
    const { list } = JSON.parse(readFileSync(leaseRevocationPaths(root).file, "utf8"));
    expect(list.revoked).toEqual([expect.objectContaining({ id: payload.leaseId, expiresAt: new Date(payload.expiresTs).toISOString() })]);
  });
});

// Round 2 of the independent review: p108-review/repro/{bypass-v1-restore,bypass-legacy-plant,fresh-home-writer,overload}.ts.
describe("review round 2: a lost key set is refused, never re-created", () => {
  it("bypass-v1-restore: the v1 vault stays out of the workspace, and a restored one is refused with or without keyset.json", () => {
    const { root, roles, envelope } = v1Workspace(PASS);
    dirs.push(root);
    unlockVault(root, PASS); // the 1.x to 2.x migration
    expect(existsSync(join(root, ".amc", "previous-vault.amcvault"))).toBe(false);
    rotatePurposeKeys({ workspace: root, purposes: ["receipt"], reason: "key-compromise", rootPrivateKeyPems: [pinnedRoot()], passphrase: PASS });
    lockVault(root);
    const amc = join(root, ".amc");
    writeFileSync(join(amc, "vault.amcvault"), envelope); // a copy the writer kept from before the migration
    for (const file of ["monitor_ed25519.pub", "ledger-row.pub", "receipt.pub"]) writeFileSync(join(amc, "keys", file), roles.monitor.publicPem);
    expect(() => unlockVault(root, PASS)).toThrow(/does not hold the keys key set generation \d+ names/);
    rmSync(join(amc, "keys", "keyset.json"));
    expect(() => unlockVault(root, PASS)).toThrow(/keyset\.json is missing, but this machine committed generation/);
    expect(() => getSigningKey(root, "receipt")).toThrow();
  });

  it("bypass-legacy-plant: a deleted vault, key set and purpose keys beside a planted legacy key pair are refused, and nothing is created", () => {
    const root = workspace();
    rotatePurposeKeys({ workspace: root, purposes: ["receipt"], reason: "key-compromise", rootPrivateKeyPems: [pinnedRoot()], passphrase: PASS });
    lockVault(root);
    const amc = join(root, ".amc");
    const keys = join(amc, "keys");
    const mark = readHighWater(highWaterKey("keyset", workspaceScope(root)));
    const mine = keyPair();
    for (const file of ["vault.amcvault", "keys/keyset.json", "keys/revocations.signed.json"]) rmSync(join(amc, file));
    for (const purpose of ["ledger-row", "receipt", "artifact-seal", "revocation-list", "config-signature", "lease", "session"]) rmSync(join(keys, `${purpose}.pub`));
    writeFileSync(join(keys, "monitor_ed25519"), mine.privatePem);
    writeFileSync(join(keys, "monitor_ed25519.pub"), mine.publicPem);
    expect(() => ensureSigningKeys(root)).toThrow(/keyset\.json is missing, but this machine committed generation/);
    expect(vaultExists(root)).toBe(false);
    expect(existsSync(join(keys, "keyset.json"))).toBe(false);
    expect(readHighWater(highWaterKey("keyset", workspaceScope(root)))).toEqual(mark);
    expect(() => getSigningKey(root, "ledger-row")).toThrow();
  });

  it("a deleted vault beside an intact key set is never re-created", () => {
    const root = workspace();
    lockVault(root);
    rmSync(join(root, ".amc", "vault.amcvault"));
    expect(() => ensureSigningKeys(root)).toThrow(/refusing to create a new vault or adopt key files/);
    expect(vaultExists(root)).toBe(false);
  });

  it("a trust-config refusal comes before any key-set write", () => {
    const donor = workspace();
    const fresh = mkdtempSync(join(tmpdir(), "amc-ws-writer-fresh-"));
    dirs.push(fresh);
    mkdirSync(join(fresh, ".amc"), { recursive: true });
    // A trust config signed by another workspace's auditor key does not verify here.
    cpSync(join(donor, ".amc", "trust.yaml"), join(fresh, ".amc", "trust.yaml"));
    cpSync(join(donor, ".amc", "trust.yaml.sig"), join(fresh, ".amc", "trust.yaml.sig"));
    expect(() => ensureSigningKeys(fresh)).toThrow(/trust config signature invalid/);
    expect(existsSync(join(fresh, ".amc", "keys", "keyset.json"))).toBe(false);
    expect(readHighWater(highWaterKey("keyset", workspaceScope(fresh)))).toBeNull();
  });

  it("the owner restores a lost key set explicitly, from the copies AMC home kept", () => {
    const root = workspace();
    rotatePurposeKeys({ workspace: root, purposes: ["receipt"], passphrase: PASS });
    const receipt = getSigningPublicKeyPem(root, "receipt");
    lockVault(root);
    for (const file of ["vault.amcvault", "keys/keyset.json", "keys/receipt.pub"]) rmSync(join(root, ".amc", file));
    expect(() => getSigningPublicKeyPem(root, "ledger-row")).toThrow(/keyset\.json is missing/);
    expect(() => getSigningKey(root, "receipt")).toThrow();
    return rotateKeysForCli(root, { restore: true }).then(result => {
      expect(result).toMatchObject({ restored: expect.arrayContaining(["vault.amcvault", "keys/receipt.pub"]), missing: [] });
      unlockVault(root, PASS);
      expect(getSigningPublicKeyPem(root, "receipt")).toBe(receipt);
      expect(getSigningKey(root, "receipt")).toBeTruthy();
    });
  });
});

describe("review round 2: a machine that never committed the key set", () => {
  it("fresh-home-writer: deleting keyset.json does not reopen the swapped-key attacks", () => {
    const root = workspace();
    const token = issueLeaseForCli({ workspace: root, agentId: "default", ttl: "1h", scopes: "gateway:llm", routes: "/openai", models: "*", rpm: 10, tpm: 1000 }).token;
    const leaseId = (verifyLeaseForCli({ workspace: root, token }).payload as { leaseId: string }).leaseId;
    revokeLease(root, leaseId, "compromised");
    lockVault(root);
    rmSync(highWaterPath()); // a container restart without the state volume, or another machine
    rmSync(join(root, ".amc", "keys", "keyset.json"));
    const keys = join(root, ".amc", "keys");
    const attacker = keyPair();
    writeFileSync(join(keys, "revocation-list.pub"), attacker.publicPem);
    const file = leaseRevocationPaths(root).file;
    const current = JSON.parse(readFileSync(file, "utf8"));
    const unrevoked = { ...current.list, sequence: current.list.sequence + 1, previousSha256: revocationListSha256(current.list), issuedAt: new Date().toISOString(), revoked: [] };
    writeFileSync(file, encodeSignedRevocationList({ ...signRevocationList(unrevoked, attacker.privatePem), anchor: null }));
    expect(verifyLeaseForCli({ workspace: root, token }).ok).toBe(false);
    writeFileSync(join(keys, "lease_ed25519.pub"), keyPair().publicPem);
    expect(() => getSigningPublicKeyPem(root, "lease")).toThrow(/keyset\.json is missing from a workspace with purpose keys/);
  });

  it("adopts a key set it never committed visibly: it says so, records it, and refuses a later fork", () => {
    const root = workspace();
    vi.stubEnv("AMC_HOME", mkdtempSync(join(tmpdir(), "amc-ws-writer-other-machine-")));
    expect(keysetAnchoring(root).state).toBe("none");
    getSigningPublicKeyPem(root, "receipt");
    expect(keysetAnchoring(root)).toEqual({ state: "adopted-unanchored", generation: 1 });
    expect(keysetAdoptionNotes().join("\n")).toMatch(/adopted unanchored \(trust on first use\)/); // printed on exit
    const keyset = JSON.parse(readFileSync(join(root, ".amc", "keys", "keyset.json"), "utf8"));
    writeFileSync(join(root, ".amc", "keys", "keyset.json"), canonicalize({ ...keyset, statements: ["0".repeat(64)] }));
    expect(() => getSigningPublicKeyPem(root, "receipt")).toThrow(/FORK_DETECTED/);
  });
});

describe("review round 2: strict key resolution", () => {
  it("the purpose probe throws on an unknown purpose and never serves a no-sign ephemeral key", () => {
    const root = workspace();
    for (const bad of ["release", "trust-list-root", "artifact_seal", "__proto__"]) expect(() => getPrivateKeyPem(root, bad as never)).toThrow();
    vi.stubEnv("AMC_NO_SIGN", "1");
    lockVault(root);
    vi.stubEnv("AMC_VAULT_PASSPHRASE", "");
    expect(() => getPrivateKeyPem(root, "artifact-seal")).toThrow(/no-sign mode holds no artifact-seal signing key/);
    expect(() => getPrivateKeyPem(root, "release" as never)).toThrow();
  });

  it("a claim expectation without issuerKeyIds is a typed refusal, not a TypeError", () => {
    const secret = "a-shared-secret-of-enough-length";
    const claim = createAgentClaim("agent-a", "h", "ws", secret, { audience: "agent-b" });
    const expectation = { audience: "agent-b", issuer: "agent-a", requestedScope: "read", grants: { "agent-a": ["read"] }, replay: new ClaimReplayCache() } as unknown as ClaimExpectation;
    const result = verifyAgentClaim(claim, { requirePassport: false, requireFreshness: true }, secret, expectation);
    expect(result).toMatchObject({ trusted: false, trustTier: "UNVERIFIED", grantedScopes: [] });
    expect(result.reasons.join(" ")).toMatch(/no grants or no issuerKeyIds/);
  });
});
