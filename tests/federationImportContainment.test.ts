import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { federateInitCli } from "../src/federation/federationCli.js";
import { ensureFederationPublisherKey, signFederationDigest } from "../src/federation/federationIdentity.js";
import { addFederationPeer, federationInboxDir } from "../src/federation/federationStore.js";
import { federationManifestSchema } from "../src/federation/federationSchema.js";
import { exportFederationPackage, importFederationPackage, verifyFederationPackage } from "../src/federation/federationSync.js";
import { getPrivateKeyPem, signHexDigest } from "../src/crypto/keys.js";
import { ed25519KeyId } from "../src/trust/index.js";
import { sha256Hex } from "../src/utils/hash.js";
import { operatorTrustHome, pinnedTrust } from "./helpers/trustContext.js";

// Counts every archive extraction and can make one of them read a different bundle, to model a bundle replaced on disk
// between the two extractions an import makes (one to verify, one to copy from). Every other call passes through.
const extraction = vi.hoisted(() => ({ calls: 0, swapAt: 0, replacement: "" }));
vi.mock("../src/security/safeTarArchive.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/security/safeTarArchive.js")>();
  return {
    ...actual,
    extractValidatedTarGzipArchive: (input: Parameters<typeof actual.extractValidatedTarGzipArchive>[0]) => {
      extraction.calls += 1;
      return actual.extractValidatedTarGzipArchive(extraction.calls === extraction.swapAt ? { ...input, file: extraction.replacement } : input);
    }
  };
});

// An admitted peer's manifest is peer-signed but still attacker-controlled data (P0-52): its ids and file paths must
// not steer where the importing workspace writes, and the inbox is named after the identity that was admitted.

const roots: string[] = [];
const priorHome = process.env.AMC_HOME;

function tempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  roots.push(dir);
  return dir;
}

function newWorkspace(orgName: string): string {
  const dir = tempDir("amc-fed-contain-");
  process.env.AMC_VAULT_PASSPHRASE = "federation-test-passphrase";
  initWorkspace({ workspacePath: dir, trustBoundaryMode: "isolated" });
  federateInitCli({ workspace: dir, orgName });
  return dir;
}

beforeEach(() => {
  extraction.calls = 0;
  extraction.swapAt = 0;
  // An empty operator home: no trust list, so only peer records admit a package.
  process.env.AMC_HOME = tempDir("amc-fed-contain-home-");
});

afterEach(() => {
  vi.restoreAllMocks();
  if (priorHome === undefined) delete process.env.AMC_HOME;
  else process.env.AMC_HOME = priorHome;
  while (roots.length > 0) {
    const dir = roots.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

interface Member { path: string; content: string }

interface CraftParams {
  /** The workspace whose publisher key signs manifest.json, exactly as exportFederationPackage signs it. */
  signer: string;
  sourceOrgId?: string;
  manifestId?: string;
  /** Files listed in the manifest (with the sha256 of their content) and placed in the package under federation/. */
  listed?: Member[];
  /** manifest paths that differ from where the bytes sit: the listed row says `path`, the package holds `content` at `member`. */
  rows?: Array<{ path: string; member: string; content: string }>;
}

/** A real signed .amcfed laid out like exportFederationPackage's (federation/ root) with a hand-written manifest. */
function craftPackage(params: CraftParams): string {
  const top = tempDir("amc-fed-craft-");
  const root = join(top, "federation");
  const publisher = ensureFederationPublisherKey(params.signer);
  const put = (base: string, path: string, content: string): void => {
    mkdirSync(dirname(join(base, path)), { recursive: true });
    writeFileSync(join(base, path), content);
  };
  put(root, "public-keys/publisher.pub", publisher.publicKeyPem);
  const rows = [
    { path: "public-keys/publisher.pub", member: "federation/public-keys/publisher.pub", content: publisher.publicKeyPem },
    ...(params.listed ?? []).map((file) => ({ path: file.path, member: `federation/${file.path}`, content: file.content })),
    ...(params.rows ?? [])
  ];
  for (const row of rows) put(top, row.member, row.content);
  const manifest = {
    v: 1,
    manifestId: params.manifestId ?? "11111111-2222-4333-8444-555555555555",
    createdTs: Date.now(),
    sourceOrgName: "Crafted Org",
    sourceOrgId: params.sourceOrgId ?? "crafted-org",
    publisherKeyFingerprint: publisher.fingerprint,
    files: rows.map((row) => ({ path: row.path, sha256: sha256Hex(Buffer.from(row.content)), size: Buffer.byteLength(row.content) }))
  };
  put(root, "manifest.json", JSON.stringify(manifest, null, 2));
  const digest = sha256Hex(readFileSync(join(root, "manifest.json")));
  put(root, "manifest.sig", JSON.stringify({
    digestSha256: digest, signature: signFederationDigest(params.signer, digest), signedTs: Date.now(), signer: "publisher"
  }, null, 2));
  const out = join(tempDir("amc-fed-craft-out-"), "crafted.amcfed");
  const tar = spawnSync("tar", ["-czf", out, "-C", top, "."], { encoding: "utf8" });
  if (tar.status !== 0) throw new Error(`tar failed: ${tar.stderr}`);
  return out;
}

/** Every file and directory under a workspace, so a refused import can be shown to have written nothing at all. */
function tree(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      out.push(relative(root, full));
      if (entry.isDirectory()) walk(full);
    }
  };
  walk(root);
  return out.sort();
}

/** A source org, and a destination whose operator added the source's publisher key as peer `peerId`. */
function peerPair(peerId = "peer-a"): { source: string; dest: string; inbox: string } {
  const source = newWorkspace("Source Org");
  const dest = newWorkspace("Dest Org");
  addFederationPeer({ workspace: dest, peerId, name: "Peer", publisherPublicKeyPem: ensureFederationPublisherKey(source).publicKeyPem });
  return { source, dest, inbox: federationInboxDir(dest) };
}

function expectRefusedWithoutWriting(dest: string, bundleFile: string, pattern: RegExp): void {
  const before = tree(dest);
  expect(() => importFederationPackage({ workspace: dest, bundleFile })).toThrow(pattern);
  expect(tree(dest)).toEqual(before);
}

const MANIFEST_BASE = {
  v: 1, manifestId: "m-1", createdTs: 1, sourceOrgName: "Org", sourceOrgId: "org-1", publisherKeyFingerprint: "a".repeat(64),
  files: [{ path: "manifest-file.txt", sha256: "b".repeat(64), size: 1 }]
};

describe("federation manifest schema", () => {
  test.each([
    ["a uuid", "11111111-2222-4333-8444-555555555555"],
    ["a dotted name", "Acme.Corp_2-eu"],
    ["the longest id", `a${"b".repeat(127)}`]
  ])("accepts %s as sourceOrgId and manifestId", (_label, id) => {
    expect(federationManifestSchema.safeParse({ ...MANIFEST_BASE, sourceOrgId: id, manifestId: id }).success).toBe(true);
  });

  test.each([
    ["dot-dot", ".."], ["dot", "."], ["parent traversal", "../x"], ["nested traversal", "../../.."], ["a separator", "a/b"],
    ["a backslash", "a\\b"], ["absolute", "/abs"], ["empty", ""], ["leading dot", ".hidden"], ["leading hyphen", "-flag"],
    ["a space", "my org"], ["too long", `a${"b".repeat(128)}`], ["a newline", "a\nb"], ["a null byte", "a\0b"]
  ])("rejects %s as sourceOrgId and as manifestId", (_label, id) => {
    expect(federationManifestSchema.safeParse({ ...MANIFEST_BASE, sourceOrgId: id }).success).toBe(false);
    expect(federationManifestSchema.safeParse({ ...MANIFEST_BASE, manifestId: id }).success).toBe(false);
  });

  test.each([
    "public-keys/publisher.pub", "artifacts/benchmarks/a__b__c.amcbench", "artifacts/bom/x.json.sig", "transparency/proofs/ab12.amcproof", "a.txt"
  ])("accepts the relative path %s", (path) => {
    expect(federationManifestSchema.safeParse({ ...MANIFEST_BASE, files: [{ path, sha256: "b".repeat(64), size: 1 }] }).success).toBe(true);
  });

  test.each([
    ["parent traversal", "../escape.txt"], ["nested traversal", "a/../../escape.txt"], ["deep traversal", "../../../../etc/passwd"],
    ["absolute", "/etc/passwd"], ["drive letter", "C:/Windows/x"], ["drive letter with a backslash", "C:\\x"], ["a backslash", "a\\b"],
    ["an empty segment", "a//b"], ["a dot segment", "a/./b"], ["a leading ./", "./a"], ["the root", "."], ["a trailing slash", "a/"],
    ["empty", ""], ["a control character", "a\u0001b"], ["a null byte", "a\0b"], ["an over-long path", `${"a".repeat(1025)}`]
  ])("rejects %s as a files[].path", (_label, path) => {
    expect(federationManifestSchema.safeParse({ ...MANIFEST_BASE, files: [{ path, sha256: "b".repeat(64), size: 1 }] }).success).toBe(false);
  });
});

describe("importFederationPackage containment", () => {
  test.each([
    ["a parent-relative file path", { path: "../escape.txt", member: "escape.txt" }],
    ["an absolute file path", { path: "/escape.txt", member: "federation/escape.txt" }]
  ])("refuses %s and writes nothing", (_label, row) => {
    const { source, dest } = peerPair();
    const bundle = craftPackage({ signer: source, rows: [{ ...row, content: "pwned" }] });
    expectRefusedWithoutWriting(dest, bundle, /invalid manifest\.json/);
  });

  test("refuses a sourceOrgId that climbs out of the inbox, so nothing lands beside the workspace config", () => {
    const { source, dest } = peerPair();
    // Unconstrained, importedPath = <workspace>/escaped and the listed file is written there.
    const bundle = craftPackage({ signer: source, sourceOrgId: "../../..", manifestId: "escaped", listed: [{ path: "payload.txt", content: "pwned" }] });
    expectRefusedWithoutWriting(dest, bundle, /invalid manifest\.json/);
    expect(existsSync(join(dest, "escaped"))).toBe(false);
  });

  test.each([["../x"], [".."], ["../../.amc/keys"], ["a/b"]])("refuses the unsafe id %s as manifestId and as sourceOrgId", (id) => {
    const { source, dest } = peerPair();
    expectRefusedWithoutWriting(dest, craftPackage({ signer: source, manifestId: id }), /invalid manifest\.json/);
    expectRefusedWithoutWriting(dest, craftPackage({ signer: source, sourceOrgId: id }), /invalid manifest\.json/);
  });

  test("files a package under the admitted peer's directory, not under the org it claims", () => {
    const { source, dest, inbox } = peerPair("peer-a");
    // A second peer exists; peer A claims to be it, and claims the id of an org nobody added.
    addFederationPeer({ workspace: dest, peerId: "peer-b", name: "Peer B", publisherPublicKeyPem: ensureFederationPublisherKey(newWorkspace("B Org")).publicKeyPem });
    for (const claimed of ["peer-b", "some-other-org"]) {
      const manifestId = `aaaaaaaa-0000-4000-8000-${claimed === "peer-b" ? "000000000001" : "000000000002"}`;
      const bundle = craftPackage({ signer: source, sourceOrgId: claimed, manifestId, listed: [{ path: "artifacts/certs/a.amccert", content: "cert" }] });
      const imported = importFederationPackage({ workspace: dest, bundleFile: bundle });
      expect(imported.sourceOrgId).toBe(claimed);
      expect(imported.importedPath).toBe(join(inbox, "peer-a", manifestId));
      expect(readFileSync(join(imported.importedPath, "artifacts", "certs", "a.amccert"), "utf8")).toBe("cert");
      expect(imported.certCount).toBe(1);
    }
    expect(existsSync(join(inbox, "peer-b"))).toBe(false);
    expect(existsSync(join(inbox, "some-other-org"))).toBe(false);
    expect(readdirSync(inbox)).toEqual(["peer-a"]);
  });

  test("a genuine export imports into inbox/<peerId>/<manifestId> with the manifest, signature and key beside it", () => {
    const { source, dest, inbox } = peerPair("partner");
    const exported = exportFederationPackage({ workspace: source, outFile: join(tempDir("amc-fed-out-"), "sync.amcfed") });
    const imported = importFederationPackage({ workspace: dest, bundleFile: exported.outFile });
    expect(imported.sourceOrgId).toBe(exported.manifest.sourceOrgId);
    expect(imported.importedPath).toBe(join(inbox, "partner", exported.manifest.manifestId));
    for (const file of ["manifest.json", "manifest.sig", "public-keys/publisher.pub"]) {
      expect(existsSync(join(imported.importedPath, file))).toBe(true);
    }
  });

  test("names the directory after the pinned key when the operator's trust list, not a peer record, admitted it", () => {
    const source = newWorkspace("Source Org");
    const dest = newWorkspace("Dest Org");
    const pem = ensureFederationPublisherKey(source).publicKeyPem;
    const home = operatorTrustHome([{ publicKeyPem: pem, purposes: ["artifact-seal"] }]);
    roots.push(home);
    process.env.AMC_HOME = home;
    const exported = exportFederationPackage({ workspace: source, outFile: join(tempDir("amc-fed-out-"), "sync.amcfed") });
    const imported = importFederationPackage({ workspace: dest, bundleFile: exported.outFile });
    expect(imported.importedPath).toBe(join(federationInboxDir(dest), `key-${ed25519KeyId(pem)!.slice(0, 16)}`, exported.manifest.manifestId));
    expect(existsSync(join(imported.importedPath, "manifest.json"))).toBe(true);
  });

  test("a peer record whose own id is not a safe directory name falls back to the key-derived directory", () => {
    const source = newWorkspace("Source Org");
    const dest = newWorkspace("Dest Org");
    const pem = ensureFederationPublisherKey(source).publicKeyPem;
    const record = join(dest, ".amc", "federation", "peers", "odd.json");
    mkdirSync(dirname(record), { recursive: true });
    writeFileSync(record, JSON.stringify({ v: 1, peerId: "../../../elsewhere", name: "Odd", publisherPublicKeyPem: pem, addedTs: Date.now() }));
    const digest = sha256Hex(readFileSync(record));
    writeFileSync(`${record}.sig`, JSON.stringify({
      digestSha256: digest, signature: signHexDigest(digest, getPrivateKeyPem(dest, "auditor")), signedTs: Date.now(), signer: "auditor"
    }));
    const exported = exportFederationPackage({ workspace: source, outFile: join(tempDir("amc-fed-out-"), "sync.amcfed") });
    const imported = importFederationPackage({ workspace: dest, bundleFile: exported.outFile });
    expect(imported.importedPath).toBe(join(federationInboxDir(dest), `key-${ed25519KeyId(pem)!.slice(0, 16)}`, exported.manifest.manifestId));
  });
});

describe("containment at use, when a manifest reaches the importer without the schema's check", () => {
  // The schema is the first gate; these prove the importer and verifier refuse on their own if it is ever bypassed.
  function bypassSchema(): void {
    vi.spyOn(federationManifestSchema, "parse").mockImplementation((value: unknown) => value as never);
  }

  test("verifyFederationPackage will not hash a file outside the extraction root", () => {
    const { source } = peerPair();
    bypassSchema();
    const bundle = craftPackage({ signer: source, rows: [{ path: "../escape.txt", member: "escape.txt", content: "outside" }] });
    const verified = verifyFederationPackage(bundle, pinnedTrust([{ publicKeyPem: ensureFederationPublisherKey(source).publicKeyPem, purposes: ["artifact-seal"] }]));
    expect(verified.ok).toBe(false);
    expect(verified.errors.join("\n")).toMatch(/escapes the package root: "\.\.\/escape\.txt"/);
  });

  test("importFederationPackage will not write outside the inbox directory it chose", () => {
    const { source, dest } = peerPair();
    bypassSchema();
    const bundle = craftPackage({ signer: source, manifestId: "../../../escaped", listed: [{ path: "payload.txt", content: "pwned" }] });
    expectRefusedWithoutWriting(dest, bundle, /escapes the federation inbox/);
    expect(existsSync(join(dest, "escaped"))).toBe(false);
  });
});

describe("a bundle replaced between verification and import", () => {
  const CERT = "artifacts/certs/a.amccert";
  const append = (path: string) => (root: string): void => writeFileSync(join(root, path), `${readFileSync(join(root, path), "utf8")}\n`);

  /** The bundle with one file of its federation/ root changed after the fact (its manifest and signature are untouched). */
  function tamperedCopy(bundle: string, mutate: (root: string) => void): string {
    const top = tempDir("amc-fed-swap-");
    expect(spawnSync("tar", ["-xzf", bundle, "-C", top]).status).toBe(0);
    mutate(join(top, "federation"));
    const out = join(tempDir("amc-fed-swap-out-"), "swapped.amcfed");
    expect(spawnSync("tar", ["-czf", out, "-C", top, "."]).status).toBe(0);
    return out;
  }

  test.each([
    ["a listed file's bytes", CERT, (root: string) => writeFileSync(join(root, CERT), "EVIL")],
    ["a listed file, removed", CERT, (root: string) => rmSync(join(root, CERT))],
    ["manifest.json", "manifest.json", append("manifest.json")],
    ["manifest.sig", "manifest.sig", append("manifest.sig")],
    ["publisher.pub", "public-keys/publisher.pub", append("public-keys/publisher.pub")]
  ])("refuses a swapped %s and writes nothing", (_label, path, mutate) => {
    const { source, dest } = peerPair();
    const bundle = craftPackage({ signer: source, listed: [{ path: CERT, content: "cert" }] });
    const swapped = tamperedCopy(bundle, mutate);
    const before = tree(dest);
    extraction.calls = 0;
    extraction.swapAt = 2;
    extraction.replacement = swapped;
    expect(() => importFederationPackage({ workspace: dest, bundleFile: bundle })).toThrow(`changed between verification and import: ${path}`);
    expect(extraction.calls).toBe(2);
    expect(tree(dest)).toEqual(before);
  });
});
