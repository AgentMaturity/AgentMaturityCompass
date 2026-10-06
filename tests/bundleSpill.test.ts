import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { openLedger } from "../src/ledger/ledger.js";
import { SessionService } from "../src/session/sessionService.js";
import { extractSpillRef, type SpillRef } from "../src/session/spill/spillTypes.js";
import { resolveSpillPath, spillRoot } from "../src/session/spill/spillStore.js";
import type { SpillExportIndex } from "../src/session/spill/spillLifecycle.js";
import { runDiagnostic } from "../src/diagnostic/runner.js";
import { exportEvidenceBundle, verifyEvidenceBundle } from "../src/bundles/bundle.js";
import { getPrivateKeyPem, signHexDigest } from "../src/crypto/keys.js";
import { getVaultSecretReadOnly, lockVault } from "../src/vault/vault.js";
import { sha256Hex } from "../src/utils/hash.js";
import type { BundleManifest, EvidenceEvent } from "../src/types.js";
import { workspaceKeyTrust } from "./helpers/trustContext.js";

const FULL = Buffer.from(`synthetic-bundle-head\n${"private-spill-middle-sentinel-".repeat(220)}\nsynthetic-bundle-tail`);
const LEGACY = Buffer.from("private-historical-spill-only-fixture-".repeat(60));
const CONFIG = { maxInlineBytes: 1024, previewHeadBytes: 64, previewTailBytes: 32 };

// Every artifact and signature is created from disposable fixtures in the
// eventual test run. This file contains no collected provider/human outcomes.
describe("portable evidence bundles retain encrypted spill commitments and explicit gaps", () => {
  const roots: string[] = [];
  let previousPass: string | undefined;
  let previousNoSign: string | undefined;
  let workspace: string;

  function temporary(prefix: string): string {
    const root = mkdtempSync(join(tmpdir(), prefix));
    roots.push(root);
    return root;
  }

  beforeEach(() => {
    previousPass = process.env.AMC_VAULT_PASSPHRASE;
    previousNoSign = process.env.AMC_NO_SIGN;
    process.env.AMC_VAULT_PASSPHRASE = "synthetic-bundle-spill-passphrase";
    delete process.env.AMC_NO_SIGN;
    workspace = temporary("amc-bundle-spill-");
    initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
  });

  afterEach(() => {
    lockVault(workspace);
    for (const root of roots.splice(0).reverse()) rmSync(root, { recursive: true, force: true });
    if (previousPass === undefined) delete process.env.AMC_VAULT_PASSPHRASE;
    else process.env.AMC_VAULT_PASSPHRASE = previousPass;
    if (previousNoSign === undefined) delete process.env.AMC_NO_SIGN;
    else process.env.AMC_NO_SIGN = previousNoSign;
  });

  function archive(command: "extract" | "create", path: string, directory: string): void {
    const args = command === "extract" ? ["-xzf", path, "-C", directory] : ["-czf", path, "-C", directory, "."];
    const result = spawnSync("tar", args, { encoding: "utf8", timeout: 10_000 });
    if (result.error || result.status !== 0) throw new Error(`synthetic archive ${command} failed: ${result.error?.message ?? result.stderr}`);
  }

  function extract(path: string): string {
    const root = temporary("amc-bundle-spill-extract-");
    archive("extract", path, root);
    return root;
  }

  function paths(root: string): string[] {
    const files: string[] = [];
    const visit = (directory: string): void => {
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) visit(path);
        else if (entry.isFile()) files.push(relative(root, path).replaceAll("\\", "/"));
      }
    };
    visit(root);
    return files.sort();
  }

  function resignManifest(root: string): void {
    const path = join(root, "manifest.json");
    const manifest = JSON.parse(readFileSync(path, "utf8")) as BundleManifest;
    manifest.files = paths(root).filter(file => !["manifest.json", "manifest.sig"].includes(file)).map(file => {
      const bytes = readFileSync(join(root, file));
      return { path: file, sha256: sha256Hex(bytes), size: bytes.length };
    });
    writeFileSync(path, JSON.stringify(manifest, null, 2));
    const manifestSha256 = sha256Hex(readFileSync(path));
    writeFileSync(join(root, "manifest.sig"), JSON.stringify({ manifestSha256,
      signature: signHexDigest(manifestSha256, getPrivateKeyPem(workspace, "auditor")), signedTs: Date.now(), signer: "auditor" }));
  }

  function nativeSpill(): { event: EvidenceEvent; ref: SpillRef; path: string } {
    const service = new SessionService(workspace, undefined, CONFIG);
    let closed = false;
    try {
      service.open({ sessionId: "bundle-native-spill", agentId: "default", harnessVersion: "synthetic-fixture",
        compositionDigest: sha256Hex("bundle-composition"), policyDigest: sha256Hex("bundle-policy") });
      service.startTurn({ trigger: "user" });
      service.startStep();
      service.recordToolCall({ toolCallId: "call-1", toolName: "fixture", args: "{}", dispatch: "native", parentToken: null });
      service.recordToolResult({ toolCallId: "call-1", outcome: "OK", exitCode: 0, timedOut: false, denied: false, content: FULL });
      service.endStep({ stopReason: "end_turn", usage: { inputTokens: 0, outputTokens: 0, cacheRead: 0, cacheWrite: 0 } });
      service.endTurn({ reason: "complete" }); service.sealTurn(); service.close({ reason: "synthetic fixture complete" }); closed = true;
    } finally { if (!closed) service.disposeWithoutClosing(); }
    const ledger = openLedger(workspace);
    try {
      const event = ledger.getAllEvents().find(row => row.session_id === "bundle-native-spill" && row.event_type === "tool/result")!;
      const ref = extractSpillRef(event.meta_json)!;
      expect(ref.v).toBe(2);
      expect(ref.unretrievable).toBeNull();
      return { event, ref, path: resolveSpillPath(workspace, ref.locator!)! };
    } finally { ledger.close(); }
  }

  function legacySpill(): void {
    const sessionId = "legacy-bundle-spill";
    const locator = `amc-spill:v1:${sha256Hex(sessionId)}:${"a".repeat(32)}-legacy`;
    mkdirSync(spillRoot(workspace), { recursive: true, mode: 0o700 });
    mkdirSync(join(spillRoot(workspace), `session-${sha256Hex(sessionId)}`), { mode: 0o700 });
    writeFileSync(resolveSpillPath(workspace, locator)!, LEGACY, { flag: "wx", mode: 0o600 });
    const ref: SpillRef = { v: 1, locator, contentSha256: sha256Hex(LEGACY), bytes: LEGACY.length,
      previewBytes: 0, maxInlineBytes: 1024, retrievalHint: "historical fixture only", unretrievable: null };
    const ledger = openLedger(workspace);
    try {
      ledger.startSession({ sessionId, runtime: "unknown", binaryPath: "historical-fixture", binarySha256: sha256Hex("historical-fixture") });
      ledger.appendEvidence({ sessionId, runtime: "unknown", eventType: "tool/result",
        meta: { spilled: ref, outcome: "OK", trustTier: "OBSERVED", agentId: "default" } });
      ledger.sealSession(sessionId);
    } finally { ledger.close(); }
  }

  async function exported() {
    const run = await runDiagnostic({ workspace, window: "14d", targetName: "default", claimMode: "auto" });
    const bundle = join(temporary("amc-bundle-spill-output-"), "fixture.amcbundle");
    exportEvidenceBundle({ workspace, runId: run.runId, outFile: bundle });
    const root = extract(bundle);
    const indexPath = join(root, "evidence", "spill", "index.json");
    const index = JSON.parse(readFileSync(indexPath, "utf8")) as SpillExportIndex;
    return { bundle, root, index, indexPath };
  }

  it("exports actual ciphertext with no raw spill or private key and verifies completeness without a vault", async () => {
    const source = nativeSpill();
    if (source.ref.v !== 2 || source.ref.keyVersion === null) throw new Error("expected versioned encrypted reference");
    const privateKey = getVaultSecretReadOnly(workspace, `vault.secrets.blobKeys.${source.ref.keyVersion}`)!;
    const artifact = await exported();
    expect(artifact.index.format).toBe("amc-spill-export-v1");
    expect(artifact.index.contentVerification).toBe("not-decrypted");
    expect(artifact.index.entries).toHaveLength(1);
    const entry = artifact.index.entries[0]!;
    expect(entry.status).toBe("exported");
    expect(entry.eventIds).toHaveLength(2);
    expect(readFileSync(join(artifact.root, "evidence", "spill", entry.objectFile!))).toEqual(readFileSync(source.path));
    const files = paths(artifact.root);
    expect(files.some(file => /(?:vault\.amcvault|unvaulted\.key|blob-keys\/|_ed25519\.pem)/.test(file))).toBe(false);
    for (const file of files) {
      const bytes = readFileSync(join(artifact.root, file));
      expect(bytes.includes(FULL), file).toBe(false);
      expect(bytes.includes(Buffer.from("private-spill-middle-sentinel-".repeat(10))), file).toBe(false);
      expect(bytes.includes(Buffer.from(privateKey)), file).toBe(false);
    }
    lockVault(workspace);
    delete process.env.AMC_VAULT_PASSPHRASE;
    const verified = await verifyEvidenceBundle(artifact.bundle, workspaceKeyTrust(workspace));
    expect(verified.ok, verified.errors.join("; ")).toBe(true);
    expect(verified.retainedSpills).toEqual({ objectsComplete: true, plaintextVerified: false, gaps: [] });
  }, 60_000);

  it("names originally missing encrypted objects and excluded legacy plaintext without fabricating completeness", async () => {
    const source = nativeSpill();
    unlinkSync(source.path);
    legacySpill();
    const artifact = await exported();
    expect(artifact.index.entries.map(entry => entry.status).sort()).toEqual(["legacy-excluded", "missing"]);
    expect(artifact.index.entries.every(entry => entry.objectFile === null)).toBe(true);
    for (const file of paths(artifact.root)) {
      const bytes = readFileSync(join(artifact.root, file));
      expect(bytes.includes(FULL), file).toBe(false);
      expect(bytes.includes(LEGACY), file).toBe(false);
    }
    const verified = await verifyEvidenceBundle(artifact.bundle, workspaceKeyTrust(workspace));
    expect(verified.ok, verified.errors.join("; ")).toBe(true);
    expect(verified.retainedSpills?.objectsComplete).toBe(false);
    expect(verified.retainedSpills?.plaintextVerified).toBe(false);
    expect(verified.retainedSpills?.gaps.join("; ")).toContain("missing");
    expect(verified.retainedSpills?.gaps.join("; ")).toContain("legacy-excluded");
  }, 60_000);

  it.each(["ciphertext-only", "index-also-forged"] as const)("rejects a %s attack despite a genuinely re-signed bundle manifest", async attack => {
    nativeSpill();
    const artifact = await exported();
    const entry = artifact.index.entries[0]!;
    const path = join(artifact.root, "evidence", "spill", entry.objectFile!);
    const changed = readFileSync(path);
    changed[changed.length - 1] = changed[changed.length - 1]! ^ 1;
    writeFileSync(path, changed);
    // With an unchanged index, only the signed encoded commitment detects the
    // changed ciphertext during keyless restore. In the stronger index forgery,
    // every transport digest agrees, so destination signed-row authorization
    // must reject the substituted reference independently of the outer signer.
    if (attack === "index-also-forged") {
      const index = JSON.parse(readFileSync(artifact.indexPath, "utf8"));
      index.entries[0].encodedSha256 = sha256Hex(changed);
      index.entries[0].ref.encodedSha256 = sha256Hex(changed);
      writeFileSync(artifact.indexPath, JSON.stringify(index, null, 2));
    }
    resignManifest(artifact.root);
    const attacked = join(temporary("amc-bundle-spill-attack-"), "changed.amcbundle");
    archive("create", attacked, artifact.root);
    const verified = await verifyEvidenceBundle(attacked, workspaceKeyTrust(workspace));
    expect(verified.ok).toBe(false);
    expect(verified.errors.join("; ")).toMatch(/spill.*(commitment|refus|differ|match|authoriz)/i);
    expect(verified.errors.join("; ")).not.toMatch(/Manifest signature verification failed|File hash mismatch/i);
    expect(verified.retainedSpills?.objectsComplete).toBe(false);
    expect(verified.retainedSpills?.plaintextVerified).toBe(false);
  }, 60_000);
});
