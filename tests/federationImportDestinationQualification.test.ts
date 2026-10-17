import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, readlinkSync, realpathSync, renameSync, rmSync, rmdirSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { federateInitCli } from "../src/federation/federationCli.js";
import { ensureFederationPublisherKey } from "../src/federation/federationIdentity.js";
import { addFederationPeer, federationInboxDir } from "../src/federation/federationStore.js";
import { exportFederationPackage, importFederationPackage, verifyFederationPackage } from "../src/federation/federationSync.js";
import { ed25519KeyId } from "../src/trust/index.js";
import { sha256Hex } from "../src/utils/hash.js";
import { pinnedTrust } from "./helpers/trustContext.js";

type Row = { path: string; kind: string; mode: number; inode: number; links: number; sha256?: string; target?: string };
let state: string;
let evidence: string;
let sequence = 0;

beforeAll(() => {
  expect(process.versions.node.split(".")[0]).toMatch(/^(22|24)$/);
  const repo = fileURLToPath(new URL("../", import.meta.url));
  expect(existsSync(join(repo, "dist/cli.js"))).toBe(true);
  evidence = mkdtempSync("/private/tmp/amc-p0-52-destination-evidence-");
  const inputs = ["src/federation/federationSync.ts", "src/federation/federationStore.ts", "src/utils/pathSafety.ts", "dist/federation/federationSync.js"];
  writeFileSync(join(evidence, "inputs.json"), JSON.stringify({
    node: process.version, executable: process.execPath,
    testSha256: sha256Hex(readFileSync(fileURLToPath(import.meta.url))),
    inputs: inputs.map((path) => ({ path, sha256: sha256Hex(readFileSync(join(repo, path))) })),
    scope: "Static destination links to fresh fixture-owned siblings only. No concurrent replacement or OS-level confinement claim.",
  }, null, 2), { mode: 0o600 });
  console.info("federation-destination-evidence", evidence);
});

beforeEach(() => {
  state = mkdtempSync("/private/tmp/amc-p0-52-destination-state-");
  const home = join(state, "home"); mkdirSync(home, { mode: 0o700 });
  vi.stubEnv("HOME", home);
  vi.stubEnv("AMC_HOME", home);
  vi.stubEnv("AMC_AGENT_ID", "");
  vi.stubEnv("AMC_VAULT_PASSPHRASE", "p0-52-owned-destination-fixture-passphrase");
});

afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(state, { recursive: true, force: true });
});

function snapshot(root: string): Row[] {
  const rows: Row[] = [];
  const walk = (path: string): void => {
    const stat = lstatSync(path);
    const row: Row = { path: relative(root, path) || ".", kind: stat.isSymbolicLink() ? "link" : stat.isDirectory() ? "directory" : stat.isFile() ? "file" : "other",
      mode: stat.mode, inode: stat.ino, links: stat.nlink };
    if (stat.isSymbolicLink()) row.target = readlinkSync(path);
    if (stat.isFile()) row.sha256 = sha256Hex(readFileSync(path));
    rows.push(row);
    if (stat.isDirectory()) for (const name of readdirSync(path).sort()) walk(join(path, name));
  };
  walk(root);
  return rows;
}

function fixture(): { dest: string; bundle: ReturnType<typeof exportFederationPackage>; keyId: string } {
  const create = (name: string): string => {
    const workspace = join(state, name); mkdirSync(workspace);
    initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
    federateInitCli({ workspace, orgName: `Local destination fixture ${name}` });
    return workspace;
  };
  const source = create("source");
  const dest = create("recipient");
  // The operator captures this key in its creation context before the exporter produces any package.
  const publicKeyPem = ensureFederationPublisherKey(source).publicKeyPem;
  const keyId = ed25519KeyId(publicKeyPem);
  if (keyId === null) throw new Error("Fixture publisher is not Ed25519");
  addFederationPeer({ workspace: dest, peerId: "known-publisher", name: "Independently configured publisher", publisherPublicKeyPem: publicKeyPem });
  const bundle = exportFederationPackage({ workspace: source, outFile: join(state, "genuine.amcfed") });
  const verified = verifyFederationPackage(bundle.outFile, pinnedTrust([{ publicKeyPem, purposes: ["artifact-seal"] }]));
  expect(verified.ok, verified.errors.join("; ")).toBe(true);
  expect(verified.report).toMatchObject({ trusted: true, overrides: [], integrity: { status: "pass" } });
  expect(verified.report.issuerAdmission.signatures[0]).toMatchObject({ keyId, status: "admitted" });
  writeFileSync(join(evidence, `package-${sequence++}.json`), JSON.stringify({
    publisherKeyId: keyId, publicKeySha256: sha256Hex(publicKeyPem), capturedBeforeExport: true,
    packageSha256: sha256Hex(readFileSync(bundle.outFile)), manifest: bundle.manifest,
  }, null, 2), { mode: 0o600 });
  return { dest, bundle, keyId };
}

describe("P0-52 genuine imports into static linked destinations", () => {
  test("normal unlinked recipient commits the complete signed package", () => {
    const { dest, bundle } = fixture();
    const result = importFederationPackage({ workspace: dest, bundleFile: bundle.outFile });
    expect(result.importedPath).toBe(join(federationInboxDir(dest), "known-publisher", bundle.manifest.manifestId));
    expect(JSON.parse(readFileSync(join(result.importedPath, "manifest.json"), "utf8"))).toEqual(bundle.manifest);
    for (const name of ["manifest.sig", "public-keys/publisher.pub"]) expect(existsSync(join(result.importedPath, name))).toBe(true);
    expect(readdirSync(dirname(result.importedPath))).toEqual([bundle.manifest.manifestId]);
    expect(result).toMatchObject({ benchmarkCount: 0, certCount: 0, bomCount: 0, pluginCount: 0 });
    writeFileSync(join(evidence, `normal-${sequence++}.json`), JSON.stringify({ result, recipient: snapshot(dest) }, null, 2), { mode: 0o600 });
  });

  test("a link to the workspace root imports inside the real operator workspace", () => {
    const { dest, bundle } = fixture();
    const linkedWorkspace = join(state, "recipient-link");
    symlinkSync(dest, linkedWorkspace, "dir");
    const linkBefore = snapshot(linkedWorkspace);
    const result = importFederationPackage({ workspace: linkedWorkspace, bundleFile: bundle.outFile });
    const expected = join(federationInboxDir(realpathSync(dest)), "known-publisher", bundle.manifest.manifestId);
    expect(realpathSync(result.importedPath)).toBe(realpathSync(expected));
    expect(JSON.parse(readFileSync(join(result.importedPath, "manifest.json"), "utf8"))).toEqual(bundle.manifest);
    for (const name of ["manifest.sig", "public-keys/publisher.pub"]) expect(existsSync(join(result.importedPath, name))).toBe(true);
    expect(snapshot(linkedWorkspace)).toEqual(linkBefore);
    expect(result).toMatchObject({ benchmarkCount: 0, certCount: 0, bomCount: 0, pluginCount: 0 });
    writeFileSync(join(evidence, `workspace-link-${sequence++}.json`), JSON.stringify({ result, expectedRealPath: realpathSync(expected),
      workspaceLink: snapshot(linkedWorkspace), recipient: snapshot(dest) }, null, 2), { mode: 0o600 });
  });

  test("missing inbox and publisher directories are created inside the recipient", () => {
    const { dest, bundle } = fixture();
    const inbox = federationInboxDir(dest), publisher = join(inbox, "known-publisher");
    expect(existsSync(publisher)).toBe(false);
    rmdirSync(inbox);
    expect(existsSync(inbox)).toBe(false);
    const result = importFederationPackage({ workspace: dest, bundleFile: bundle.outFile });
    expect(realpathSync(result.importedPath)).toBe(join(realpathSync(dest), ".amc", "federation", "inbox", "known-publisher", bundle.manifest.manifestId));
    for (const directory of [inbox, publisher, result.importedPath]) {
      expect(lstatSync(directory).isDirectory()).toBe(true);
      expect(lstatSync(directory).isSymbolicLink()).toBe(false);
    }
    expect(JSON.parse(readFileSync(join(result.importedPath, "manifest.json"), "utf8"))).toEqual(bundle.manifest);
    for (const name of ["manifest.sig", "public-keys/publisher.pub"]) expect(existsSync(join(result.importedPath, name))).toBe(true);
    writeFileSync(join(evidence, `missing-suffix-${sequence++}.json`), JSON.stringify({ result, recipient: snapshot(dest) }, null, 2), { mode: 0o600 });
  });

  test("an existing final directory is refused without replacing its contents", () => {
    const { dest, bundle } = fixture();
    const target = join(federationInboxDir(dest), "known-publisher", bundle.manifest.manifestId);
    mkdirSync(target, { recursive: true });
    writeFileSync(join(target, "owned-sentinel.txt"), "An existing final destination must not be replaced.\n");
    const before = snapshot(dest);
    let result: ReturnType<typeof importFederationPackage> | null = null;
    let error: string | null = null;
    try { result = importFederationPackage({ workspace: dest, bundleFile: bundle.outFile }); }
    catch (caught) { error = String(caught); }
    const after = snapshot(dest);
    writeFileSync(join(evidence, `final-collision-${sequence++}.json`), JSON.stringify({ result, error, before, after }, null, 2), { mode: 0o600 });
    expect.soft(result).toBeNull();
    expect.soft(error).toMatch(/already imported|already exists|destination.*exists|cannot read the manifest.*refusing to import/i);
    expect(after).toEqual(before);
  });

  test.each(["inbox", "publisher", "federation-root"] as const)("refuses a static linked %s before writing outside the recipient", (boundary) => {
    const { dest, bundle } = fixture();
    const outside = join(state, "owned-outside-target");
    const inbox = federationInboxDir(dest);
    if (boundary === "federation-root") {
      renameSync(dirname(inbox), outside);
      symlinkSync(outside, dirname(inbox));
    } else {
      mkdirSync(outside);
      if (boundary === "inbox") {
        rmdirSync(inbox);
        symlinkSync(outside, inbox);
      } else symlinkSync(outside, join(inbox, "known-publisher"));
    }
    const sentinel = join(outside, "sentinel.txt");
    writeFileSync(sentinel, "P0-52 owned sentinel must remain byte-identical\n");
    const before = snapshot(outside);
    const recipientBefore = snapshot(dest);
    let result: ReturnType<typeof importFederationPackage> | null = null;
    let error: string | null = null;
    try { result = importFederationPackage({ workspace: dest, bundleFile: bundle.outFile }); }
    catch (caught) { error = String(caught); }
    const after = snapshot(outside);
    const recipientAfter = snapshot(dest);
    writeFileSync(join(evidence, `linked-${boundary}-${sequence++}.json`), JSON.stringify({
      boundary, result, error, before, after, recipientBefore, recipientAfter,
      outsideChanged: JSON.stringify(before) !== JSON.stringify(after),
    }, null, 2), { mode: 0o600 });
    expect.soft(result, "An admitted package must not commit through a destination parent link").toBeNull();
    expect.soft(error, "A static linked destination needs an explicit refusal").not.toBeNull();
    expect.soft(after, "Every outside-target name, byte hash and link state must remain unchanged").toEqual(before);
    expect.soft(recipientAfter, "Refusal must preserve recipient names, bytes and links").toEqual(recipientBefore);
  });
});
