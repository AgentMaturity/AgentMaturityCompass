import { linkSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { afterEach, describe, expect, test } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { appendTransparencyEntry } from "../src/transparency/logChain.js";
import { exportTransparencyProofBundle, verifyTransparencyProofBundle } from "../src/transparency/merkleIndexStore.js";
import { merkleCurrentRootPath } from "../src/transparency/merklePaths.js";
import { pinnedTrust, workspaceKeyPem } from "./helpers/trustContext.js";

const roots: string[] = [];
const originalPassphrase = process.env.AMC_VAULT_PASSPHRASE;
const digest = (bytes: Buffer): string => createHash("sha256").update(bytes).digest("hex");

function newFixture() {
  const root = mkdtempSync(join(tmpdir(), "amc-proof-export-links-"));
  roots.push(root);
  const workspace = join(root, "workspace");
  const sibling = join(root, "fixture-output");
  mkdirSync(sibling);
  process.env.AMC_VAULT_PASSPHRASE = "proof-export-fixture-passphrase";
  initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
  // Record the fixture operator's key before export; the archive cannot appoint its own issuer.
  const trust = pinnedTrust([{ publicKeyPem: workspaceKeyPem(workspace, "auditor"), purposes: ["artifact-seal"] }]);
  const entry = appendTransparencyEntry({ workspace, type: "BOM_SIGNED", agentId: "default",
    artifact: { kind: "bom", sha256: digest(Buffer.from("fixture BOM")), id: "proof-export-fixture" } });
  return { root, workspace, sibling, trust, entryHash: entry.hash };
}

function record(name: string, row: Record<string, unknown>, files: Record<string, Buffer> = {}): void {
  // Qualification may retain only these public archives and fixture-created sentinel bytes.
  const evidenceDir = process.env.AMC_P0_51_EXPORT_EFFECTS_DIR;
  let saved: string | null = null;
  if (evidenceDir) {
    saved = mkdtempSync(join(evidenceDir, `${name}-`));
    for (const [file, bytes] of Object.entries(files)) writeFileSync(join(saved, file), bytes);
    writeFileSync(join(saved, "effect.json"), JSON.stringify(row, null, 2) + "\n");
  }
  console.info("proof-export-fixture-effect", JSON.stringify({ name, saved, ...row }));
}

function exportControl(fixture: ReturnType<typeof newFixture>, outFile: string, name: string): void {
  const result = exportTransparencyProofBundle({ workspace: fixture.workspace, entryHash: fixture.entryHash, outFile });
  const verification = verifyTransparencyProofBundle(outFile, fixture.trust);
  const bytes = readFileSync(outFile);
  record(name, { outFile, entryHash: fixture.entryHash, signedRoot: result.proof.merkleRoot,
    trusted: verification.ok, sha256: digest(bytes), bytes: bytes.length }, { "control.amcproof": bytes });
  expect(result.outFile).toBe(outFile);
  expect(result.proof.entryHash).toBe(fixture.entryHash);
  expect(verification.ok).toBe(true);
  expect(verification.report.trusted).toBe(true);
}

function linkState(path: string): { isLink: boolean; target: string | null } {
  try {
    const isLink = lstatSync(path).isSymbolicLink();
    return { isLink, target: isLink ? readlinkSync(path) : null };
  } catch {
    return { isLink: false, target: null };
  }
}

afterEach(() => {
  while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true });
  if (originalPassphrase === undefined) delete process.env.AMC_VAULT_PASSPHRASE;
  else process.env.AMC_VAULT_PASSPHRASE = originalPassphrase;
});

describe("transparency proof export file-link handling", () => {
  test("exports a genuine signed archive to regular caller-chosen files", () => {
    const fixture = newFixture();
    exportControl(fixture, join(fixture.workspace, ".amc", "transparency", "proofs", "regular.amcproof"), "regular-workspace");
    // The public library also permits ordinary caller-chosen output outside the workspace, within this owned fixture.
    exportControl(fixture, join(fixture.sibling, "regular.amcproof"), "regular-caller-output");
    writeFileSync(join(fixture.sibling, "regular.amcproof"), "existing ordinary output is replaceable\n");
    exportControl(fixture, join(fixture.sibling, "regular.amcproof"), "regular-overwrite");
    exportControl(fixture, join(fixture.workspace, "new", "nested", "proof.amcproof"), "regular-new-parents");
  });

  test.each(["directory", "filename"] as const)("refuses a linked %s without changing its fixture-owned target", (kind) => {
    const fixture = newFixture();
    const proofs = join(fixture.workspace, ".amc", "transparency", "proofs");
    exportControl(fixture, join(proofs, "control.amcproof"), `${kind}-control`);
    const sentinel = join(fixture.sibling, "sentinel.amcproof");
    const before = Buffer.from(`owned ${kind} target sentinel\n`);
    writeFileSync(sentinel, before);
    const link = join(proofs, `linked-${kind}`);
    symlinkSync(kind === "directory" ? fixture.sibling : sentinel, link);
    const outFile = kind === "directory" ? join(link, "sentinel.amcproof") : link;
    const beforeLink = linkState(link);
    const signedRootBefore = digest(readFileSync(merkleCurrentRootPath(fixture.workspace)));
    let refusal: string | null = null;
    let returned: string | null = null;
    try {
      returned = exportTransparencyProofBundle({ workspace: fixture.workspace, entryHash: fixture.entryHash, outFile }).outFile;
    } catch (error) {
      refusal = error instanceof Error ? error.message : String(error);
    }
    const after = readFileSync(sentinel);
    const afterLink = linkState(link);
    const signedRootAfter = digest(readFileSync(merkleCurrentRootPath(fixture.workspace)));
    record(`linked-${kind}`, { fixtureRoot: fixture.root, outFile, sentinel, entryHash: fixture.entryHash,
      refusal, returned, targetChanged: !before.equals(after), beforeSha256: digest(before), afterSha256: digest(after),
      beforeBytes: before.length, afterBytes: after.length, beforeLink, afterLink, signedRootBefore, signedRootAfter },
    { "sentinel-before.bin": before, "sentinel-after.bin": after });
    expect.soft(refusal, "a file-link destination must be refused").not.toBeNull();
    expect.soft(after, "the fixture-owned target bytes must remain untouched").toEqual(before);
    expect.soft(afterLink, "the fixture-owned link must remain untouched").toEqual(beforeLink);
    expect(signedRootAfter).toBe(signedRootBefore);
  });

  test("refuses a hard-linked leaf and preserves both fixture-owned names", () => {
    const fixture = newFixture();
    const target = join(fixture.sibling, "target.bin");
    const outFile = join(fixture.workspace, "hard-linked.amcproof");
    const before = Buffer.from("owned hard-linked target\n");
    writeFileSync(target, before);
    linkSync(target, outFile);
    expect(() => exportTransparencyProofBundle({ workspace: fixture.workspace, entryHash: fixture.entryHash, outFile })).toThrow();
    expect(readFileSync(target)).toEqual(before);
    expect(readFileSync(outFile)).toEqual(before);
    expect(lstatSync(outFile).nlink).toBe(2);
  });

  test("refuses directory output and a non-directory parent without changing existing bytes", () => {
    const fixture = newFixture();
    const parent = join(fixture.workspace, "ordinary-file.bin");
    const before = Buffer.from("owned parent-file sentinel\n");
    writeFileSync(parent, before);
    for (const outFile of [fixture.workspace, fixture.sibling, join(parent, "proof.amcproof")]) {
      expect(() => exportTransparencyProofBundle({ workspace: fixture.workspace, entryHash: fixture.entryHash, outFile })).toThrow();
    }
    expect(readFileSync(parent)).toEqual(before);
    expect(lstatSync(fixture.workspace).isDirectory()).toBe(true);
    expect(lstatSync(fixture.sibling).isDirectory()).toBe(true);
  });

  test("accepts the operator's workspace-root alias while checking paths below its real root", () => {
    const fixture = newFixture();
    const alias = join(fixture.root, "workspace-alias");
    symlinkSync(fixture.workspace, alias);
    const outFile = join(alias, "new", "proof.amcproof");
    const aliased = { ...fixture, workspace: alias };
    exportControl(aliased, outFile, "workspace-root-alias");
    expect(readlinkSync(alias)).toBe(fixture.workspace);
  });
});
