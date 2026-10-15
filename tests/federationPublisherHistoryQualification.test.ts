import { spawnSync } from "node:child_process";
import { verify } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, readlinkSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { federateInitCli } from "../src/federation/federationCli.js";
import { ensureFederationPublisherKey, signFederationDigest } from "../src/federation/federationIdentity.js";
import { addFederationPeer, federationInboxDir } from "../src/federation/federationStore.js";
import { federationManifestSchema, federationManifestSignatureSchema, type FederationManifest } from "../src/federation/federationSchema.js";
import { exportFederationPackage, importFederationPackage, verifyFederationPackage } from "../src/federation/federationSync.js";
import { ed25519KeyId } from "../src/trust/index.js";
import { sha256Hex } from "../src/utils/hash.js";
import { operatorTrustHome, pinnedTrust } from "./helpers/trustContext.js";

type Publisher = { workspace: string; publicKeyPem: string; keyId: string };
type Package = { file: string; manifest: FederationManifest; publisher: Publisher; signedTs: number; sha256: string };
type SnapshotRow = { path: string; kind: string; mode: number; inode: number; links: number; sha256?: string; target?: string };
const stateRoots: string[] = [];
let evidence: string, state: string, home: string;
let sequence = 0;
let claimedBase: number;

beforeAll(() => {
  expect(process.versions.node.split(".")[0], "Use the prepared Node 22 or 24 runtime").toMatch(/^(22|24)$/);
  expect(existsSync(fileURLToPath(new URL("../dist/cli.js", import.meta.url))), "Parent must finish the normal build first").toBe(true);
  evidence = mkdtempSync("/private/tmp/amc-p0-52-publisher-history-");
  const paths = ["src/federation/federationSync.ts", "src/federation/federationStore.ts", "src/federation/federationSchema.ts",
    "src/federation/federationIdentity.ts", "src/utils/pathSafety.ts", "tests/helpers/trustContext.ts", "dist/federation/federationSync.js"];
  const repo = fileURLToPath(new URL("../", import.meta.url));
  writeFileSync(join(evidence, "inputs.json"), JSON.stringify({
    phase: process.env.AMC_P0_52_HISTORY_PHASE ?? "unspecified", node: process.version, executable: process.execPath,
    testPath: fileURLToPath(import.meta.url), testSha256: sha256Hex(readFileSync(fileURLToPath(import.meta.url))),
    inputs: paths.map((path) => ({ path, sha256: sha256Hex(readFileSync(join(repo, path))) })),
    timing: "createdTs is a controlled publisher claim in a genuinely signed fixture. signedTs is actual local signing time; neither is a TSA attestation.",
    scope: "Serial fixture operations only. Snapshots compare recipient names, bytes, link targets and inode metadata; they make no concurrency or atomic-race claim.",
  }, null, 2), { mode: 0o600 });
  console.info("publisher-history-evidence", evidence);
});

beforeEach(() => {
  state = mkdtempSync("/private/tmp/amc-p0-52-history-state-");
  stateRoots.push(state);
  home = join(state, "home"); mkdirSync(home, { mode: 0o700 });
  vi.stubEnv("HOME", home);
  vi.stubEnv("AMC_HOME", home);
  vi.stubEnv("AMC_AGENT_ID", "");
  vi.stubEnv("AMC_VAULT_PASSPHRASE", "p0-52-owned-history-fixture-passphrase");
  claimedBase = Date.now() - 120_000;
});

afterEach(() => {
  vi.unstubAllEnvs();
  for (const path of stateRoots.splice(0)) rmSync(path, { recursive: true, force: true });
});

function newWorkspace(name: string): string {
  const workspace = join(state, name);
  mkdirSync(workspace);
  initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
  federateInitCli({ workspace, orgName: `Local history fixture ${name}` });
  return workspace;
}

function publisher(name = "source"): Publisher {
  const workspace = newWorkspace(name);
  // Captured in the fixture operator's key-creation context before exporting or reading any package.
  const publicKeyPem = ensureFederationPublisherKey(workspace).publicKeyPem;
  const keyId = ed25519KeyId(publicKeyPem);
  if (keyId === null) throw new Error("Fixture publisher key is not Ed25519");
  return { workspace, publicKeyPem, keyId };
}

function addPeer(dest: string, source: Publisher, peerId: string): void {
  const added = addFederationPeer({ workspace: dest, peerId, name: `Local ${peerId}`, publisherPublicKeyPem: source.publicKeyPem });
  expect(added.peer.publisherPublicKeyPem).toBe(source.publicKeyPem);
}

function useOperatorList(publishers: Publisher[]): void {
  const operator = operatorTrustHome(publishers.map(({ publicKeyPem }) => ({ publicKeyPem, purposes: ["artifact-seal"] })));
  stateRoots.push(operator);
  vi.stubEnv("AMC_HOME", operator);
  // Only public operator configuration hashes enter the receipt; no private signing material is persisted here.
  writeFileSync(join(evidence, `operator-list-${sequence++}.json`), JSON.stringify({
    home: operator, issuerKeyIds: publishers.map(({ keyId }) => keyId),
    listSha256: sha256Hex(readFileSync(join(operator, "trust", "amc-trust-list.json"))),
    rootsSha256: sha256Hex(readFileSync(join(operator, "trust", "trust-roots.json"))),
    capturedBeforeExport: true,
  }, null, 2), { mode: 0o600 });
}

function tar(args: string[]): void {
  const result = spawnSync("/usr/bin/tar", args, { encoding: "utf8", timeout: 30_000 });
  expect(result.status, result.stderr || result.stdout).toBe(0);
}

/** Real exporter bytes with explicit fixture metadata claims, sealed again by the actual publisher. */
function packageAt(source: Publisher, label: string, createdTs: number, manifestId?: string,
  metadata: Partial<Pick<FederationManifest, "sourceOrgId" | "publisherKeyFingerprint">> = {}): Package {
  const holder = join(state, label); mkdirSync(holder);
  const original = exportFederationPackage({ workspace: source.workspace, outFile: join(holder, "export.amcfed") });
  const unpacked = join(holder, "unpacked"); mkdirSync(unpacked);
  tar(["-xzf", original.outFile, "-C", unpacked]);
  const root = unpacked;
  const manifestPath = join(root, "manifest.json");
  const manifest = federationManifestSchema.parse({
    ...federationManifestSchema.parse(JSON.parse(readFileSync(manifestPath, "utf8"))),
    createdTs, ...(manifestId === undefined ? {} : { manifestId }), ...metadata,
  });
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  const digest = sha256Hex(readFileSync(manifestPath));
  const signedTs = Date.now();
  const signature = federationManifestSignatureSchema.parse({
    digestSha256: digest, signature: signFederationDigest(source.workspace, digest), signedTs, signer: "publisher",
  });
  writeFileSync(join(root, "manifest.sig"), JSON.stringify(signature, null, 2));
  const file = join(holder, "history.amcfed");
  tar(["-czf", file, "-C", unpacked, "."]);
  const verified = verifyFederationPackage(file, pinnedTrust([{ publicKeyPem: source.publicKeyPem, purposes: ["artifact-seal"] }]));
  expect(verified.ok, verified.errors.join("; ")).toBe(true);
  expect(verified.report).toMatchObject({ trusted: true, integrity: { status: "pass" }, overrides: [] });
  expect(verified.report.issuerAdmission.signatures[0]).toMatchObject({ keyId: source.keyId, purpose: "artifact-seal", status: "admitted" });
  expect(verified.manifest).toEqual(manifest);
  const sha256 = sha256Hex(readFileSync(file));
  const artifactName = `public-package-${sequence++}`;
  const retainedFile = join(evidence, `${artifactName}.amcfed`);
  const operatorPin = join(evidence, `${artifactName}-operator.pub`);
  writeFileSync(retainedFile, readFileSync(file), { mode: 0o600 });
  writeFileSync(operatorPin, source.publicKeyPem, { mode: 0o600 });
  writeFileSync(join(evidence, `${artifactName}.json`), JSON.stringify({
    label, publisherKeyId: source.keyId, independentlyCapturedPublicKeySha256: sha256Hex(source.publicKeyPem),
    retainedFile, operatorPin, fileSha256: sha256, manifest, signedTs, originalExportManifestId: original.manifest.manifestId,
    fixtureMetadata: "createdTs and optional manifestId are explicit fixture claims, with a genuine replacement publisher seal",
    signedMetadataOverrides: metadata,
  }, null, 2), { mode: 0o600 });
  return { file, manifest, publisher: source, signedTs, sha256 };
}

function snapshot(root: string): SnapshotRow[] {
  const rows: SnapshotRow[] = [];
  const walk = (path: string): void => {
    const stat = lstatSync(path);
    const row: SnapshotRow = { path: relative(root, path) || ".", kind: stat.isSymbolicLink() ? "link" : stat.isDirectory() ? "directory" : stat.isFile() ? "file" : "other",
      mode: stat.mode, inode: stat.ino, links: stat.nlink };
    if (stat.isSymbolicLink()) row.target = readlinkSync(path);
    if (stat.isFile()) row.sha256 = sha256Hex(readFileSync(path));
    rows.push(row);
    if (stat.isDirectory()) for (const name of readdirSync(path).sort()) walk(join(path, name));
  };
  walk(root);
  return rows;
}

function accept(dest: string, bundle: Package, bucket: string): ReturnType<typeof importFederationPackage> {
  const result = importFederationPackage({ workspace: dest, bundleFile: bundle.file });
  expect(result.importedPath).toBe(join(federationInboxDir(dest), bucket, bundle.manifest.manifestId));
  expect(federationManifestSchema.parse(JSON.parse(readFileSync(join(result.importedPath, "manifest.json"), "utf8")))).toEqual(bundle.manifest);
  for (const path of ["manifest.sig", "public-keys/publisher.pub"]) expect(existsSync(join(result.importedPath, path))).toBe(true);
  expect(result).toMatchObject({ sourceOrgId: bundle.manifest.sourceOrgId, benchmarkCount: 0, certCount: 0, bomCount: 0, pluginCount: 0 });
  return result;
}

function refuseUnchanged(name: string, dest: string, bundle: Package, reason: RegExp, outside?: string): void {
  const before = snapshot(dest);
  const outsideBefore = outside === undefined ? null : snapshot(outside);
  let refusal: string | null = null;
  let returned: ReturnType<typeof importFederationPackage> | null = null;
  try { returned = importFederationPackage({ workspace: dest, bundleFile: bundle.file }); }
  catch (error) { refusal = error instanceof Error ? error.message : String(error); }
  const after = snapshot(dest);
  const outsideAfter = outside === undefined ? null : snapshot(outside);
  writeFileSync(join(evidence, `effect-${sequence++}-${name}.json`), JSON.stringify({
    name, dest, incoming: { publisherKeyId: bundle.publisher.keyId, manifestId: bundle.manifest.manifestId,
      createdTs: bundle.manifest.createdTs, signedTs: bundle.signedTs, sha256: bundle.sha256 },
    refusal, returned, before, after, beforeSha256: sha256Hex(JSON.stringify(before)), afterSha256: sha256Hex(JSON.stringify(after)),
    outside: outside ?? null, outsideBefore, outsideAfter,
  }, null, 2), { mode: 0o600 });
  expect.soft(refusal, "The genuine admitted package must be refused for its history, not accepted").not.toBeNull();
  expect.soft(refusal ?? "").toMatch(reason);
  if (outside !== undefined) expect.soft(outsideAfter, "The owned history-link target must remain unchanged").toEqual(outsideBefore);
  expect(after, "Recipient names, file contents, history and link/inode metadata must equal the pre-refusal snapshot").toEqual(before);
}

describe("federation publisher history with genuine signed packages", () => {
  test("same publisher cannot import the exact manifest twice", () => {
    const source = publisher(), dest = newWorkspace("dest"); addPeer(dest, source, "peer-z");
    const first = packageAt(source, "first", claimedBase);
    accept(dest, first, "peer-z");
    refuseUnchanged("same-publisher-replay", dest, first, /already imported/);
  });

  test.each([1_000, 0])("distinct manifest at timestamp delta %i is accepted without changing previous history", (delta) => {
    const source = publisher(), dest = newWorkspace("dest"); addPeer(dest, source, "peer-z");
    const first = packageAt(source, "first", claimedBase), next = packageAt(source, "next", claimedBase + delta);
    expect(next.manifest.manifestId).not.toBe(first.manifest.manifestId);
    const original = accept(dest, first, "peer-z"), before = snapshot(original.importedPath);
    accept(dest, next, "peer-z");
    expect(snapshot(original.importedPath)).toEqual(before);
    expect(readdirSync(join(federationInboxDir(dest), "peer-z")).sort()).toEqual([first.manifest.manifestId, next.manifest.manifestId].sort());
  });

  test("an older distinct manifest from the same publisher is refused as a rollback", () => {
    const source = publisher(), dest = newWorkspace("dest"); addPeer(dest, source, "peer-z");
    const latest = packageAt(source, "latest", claimedBase + 1_000), older = packageAt(source, "older", claimedBase);
    accept(dest, latest, "peer-z");
    refuseUnchanged("same-publisher-rollback", dest, older, /refused as a rollback/);
  });

  test.each(["older-package", "same-manifest-id"] as const)("a different publisher remains independent for %s", (variant) => {
    const a = publisher("source-a"), b = publisher("source-b"), dest = newWorkspace("dest");
    addPeer(dest, a, "peer-a"); addPeer(dest, b, "peer-b");
    const first = packageAt(a, "first", claimedBase + 1_000);
    const other = packageAt(b, "other", claimedBase, variant === "same-manifest-id" ? first.manifest.manifestId : undefined);
    const original = accept(dest, first, "peer-a"), before = snapshot(original.importedPath);
    accept(dest, other, "peer-b");
    expect(snapshot(original.importedPath)).toEqual(before);
  });

  test.each(["missing", "invalid-json", "invalid-schema"] as const)("%s prior manifest blocks a later package without changing recipient state", (damage) => {
    const source = publisher(), dest = newWorkspace("dest"); addPeer(dest, source, "peer-z");
    const first = packageAt(source, "first", claimedBase), later = packageAt(source, "later", claimedBase + 1_000);
    const original = accept(dest, first, "peer-z");
    const manifest = join(original.importedPath, "manifest.json");
    if (damage === "missing") rmSync(manifest);
    else writeFileSync(manifest, damage === "invalid-json" ? "not JSON\n" : JSON.stringify({ ...first.manifest, createdTs: "invalid" }));
    refuseUnchanged(`prior-${damage}`, dest, later, /cannot read the manifest.*refusing to import/);
  });
});

describe("publisher history across admitted-identity aliases", () => {
  test.each(["bucket", "package", "public-keys", "manifest.json", "manifest.sig", "public-keys/publisher.pub"] as const)(
    "a static retained-history link at %s refuses a genuine later package without changing either location", (boundary) => {
      const source = publisher(), dest = newWorkspace("dest"); addPeer(dest, source, "peer-z");
      const first = packageAt(source, "first", claimedBase), later = packageAt(source, "later", claimedBase + 1_000);
      const original = accept(dest, first, "peer-z");
      const target = boundary === "bucket" ? join(federationInboxDir(dest), "peer-z")
        : boundary === "package" ? original.importedPath : join(original.importedPath, boundary);
      const outside = join(state, "owned-history-link-target");
      renameSync(target, outside);
      symlinkSync(outside, target, lstatSync(outside).isDirectory() ? "dir" : "file");
      refuseUnchanged(`linked-history-${boundary.replaceAll("/", "-")}`, dest, later,
        boundary === "bucket" ? /linked or non-directory destination component/ : /cannot read the manifest.*refusing to import/, outside);
    });

  test.each(["replay", "rollback"] as const)("signed-list key bucket to peer alias retains %s refusal", (operation) => {
    const source = publisher(), dest = newWorkspace("dest");
    useOperatorList([source]);
    const first = packageAt(source, "first", claimedBase + 1_000);
    const incoming = operation === "replay" ? first : packageAt(source, "older", claimedBase);
    accept(dest, first, `key-${source.keyId.slice(0, 16)}`);
    addPeer(dest, source, "peer-a");
    refuseUnchanged(`list-to-peer-${operation}`, dest, incoming, operation === "replay" ? /already imported/ : /refused as a rollback/);
  });

  test.each(["replay", "rollback"] as const)("earlier duplicate peer alias retains the same publisher's %s refusal", (operation) => {
    const source = publisher(), dest = newWorkspace("dest"); addPeer(dest, source, "peer-z");
    const first = packageAt(source, "first", claimedBase + 1_000);
    const incoming = operation === "replay" ? first : packageAt(source, "older", claimedBase);
    accept(dest, first, "peer-z");
    addPeer(dest, source, "peer-a");
    refuseUnchanged(`earlier-peer-alias-${operation}`, dest, incoming, operation === "replay" ? /already imported/ : /refused as a rollback/);
  });

  test.each(["replay", "rollback"] as const)("replacing the old peer alias with another key retains the original publisher's %s refusal", (operation) => {
    const source = publisher(), replacement = publisher("replacement"), dest = newWorkspace("dest");
    expect(replacement.keyId).not.toBe(source.keyId);
    addPeer(dest, source, "peer-z");
    const first = packageAt(source, "first", claimedBase + 1_000);
    const incoming = operation === "replay" ? first : packageAt(source, "older", claimedBase);
    accept(dest, first, "peer-z");
    addPeer(dest, replacement, "peer-z");
    addPeer(dest, source, "peer-a");
    refuseUnchanged(`replaced-peer-alias-${operation}`, dest, incoming, operation === "replay" ? /already imported/ : /refused as a rollback/);
  });

  test.each(["manifest", "publisher-key"] as const)("an unauthentic retained %s blocks import after an alias change", (damage) => {
    const source = publisher(), replacement = publisher("replacement"), dest = newWorkspace("dest");
    addPeer(dest, source, "peer-z"); addPeer(dest, replacement, "peer-b");
    const first = packageAt(source, "first", claimedBase);
    const incoming = packageAt(source, "later", claimedBase + 1_000);
    const original = accept(dest, first, "peer-z");
    addPeer(dest, source, "peer-a");
    const manifestPath = join(original.importedPath, "manifest.json");
    const signaturePath = join(original.importedPath, "manifest.sig");
    const publisherPath = join(original.importedPath, "public-keys", "publisher.pub");
    const signatureBytes = readFileSync(signaturePath);
    if (damage === "manifest") {
      const changed = federationManifestSchema.parse({ ...first.manifest, createdTs: claimedBase - 1_000 });
      writeFileSync(manifestPath, JSON.stringify(changed, null, 2));
      expect(federationManifestSchema.parse(JSON.parse(readFileSync(manifestPath, "utf8")))).toEqual(changed);
    } else {
      expect(replacement.keyId).not.toBe(source.keyId);
      writeFileSync(publisherPath, replacement.publicKeyPem);
      expect(readFileSync(publisherPath, "utf8")).toBe(replacement.publicKeyPem);
    }
    expect(readFileSync(signaturePath)).toEqual(signatureBytes);
    const signature = federationManifestSignatureSchema.parse(JSON.parse(signatureBytes.toString("utf8")));
    expect(verify(null, Buffer.from(sha256Hex(readFileSync(manifestPath)), "hex"), readFileSync(publisherPath, "utf8"),
      Buffer.from(signature.signature, "base64"))).toBe(false);
    refuseUnchanged(`unauthentic-prior-${damage}`, dest, incoming, /cannot (?:read|authenticate|verify).*imported federation package.*refusing to import/);
  });

  test("a different authenticated key stays independent when its signed metadata names the first publisher", () => {
    const a = publisher("source-a"), b = publisher("source-b"), dest = newWorkspace("dest");
    expect(b.keyId).not.toBe(a.keyId);
    addPeer(dest, a, "peer-a"); addPeer(dest, b, "peer-b");
    const first = packageAt(a, "first", claimedBase + 1_000);
    const other = packageAt(b, "other", claimedBase, undefined, {
      sourceOrgId: first.manifest.sourceOrgId, publisherKeyFingerprint: first.manifest.publisherKeyFingerprint,
    });
    expect(other.manifest.sourceOrgId).toBe(first.manifest.sourceOrgId);
    expect(other.manifest.publisherKeyFingerprint).toBe(first.manifest.publisherKeyFingerprint);
    const original = accept(dest, first, "peer-a"), before = snapshot(original.importedPath);
    accept(dest, other, "peer-b");
    expect(snapshot(original.importedPath)).toEqual(before);
  });

  test("reusing a peer alias for another authenticated key does not inherit the first publisher's newer history", () => {
    const a = publisher("source-a"), b = publisher("source-b"), dest = newWorkspace("dest");
    expect(b.keyId).not.toBe(a.keyId);
    useOperatorList([a, b]);
    addPeer(dest, a, "peer-shared");
    const first = packageAt(a, "first", claimedBase + 1_000), other = packageAt(b, "other", claimedBase);
    const original = accept(dest, first, "peer-shared"), before = snapshot(original.importedPath);
    addPeer(dest, b, "peer-shared");
    accept(dest, other, "peer-shared");
    expect(snapshot(original.importedPath)).toEqual(before);
    expect(readdirSync(join(federationInboxDir(dest), "peer-shared")).sort()).toEqual([first.manifest.manifestId, other.manifest.manifestId].sort());
  });
});
