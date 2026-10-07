import { mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { federationManifestSchema, federationManifestSignatureSchema, type FederationManifest } from "./federationSchema.js";
import { ensureFederationPublisherKey, signFederationDigest } from "./federationIdentity.js";
import { federationInboxDir, federationOutboxDir, listFederationPeers, loadFederationConfig } from "./federationStore.js";
import { buildVerifierReport, checkDigestSignature, ed25519KeyId, loadTrustContext, untrustedReasons, withPins, type IssuerAdmission, type TrustContext, type VerifierReportV1 } from "../trust/index.js";
import { fileSha256 } from "../trust/signatureCheck.js";
import { toErrorMessage } from "../utils/errors.js";
import { ensureDir, pathExists, readUtf8, writeFileAtomic } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import { containedPath, safeIdSchema } from "../utils/pathSafety.js";
import { generateTransparencyInclusionProof, currentTransparencyMerkleRoot, ensureTransparencyMerkleInitialized, exportTransparencyProofBundle } from "../transparency/merkleIndexStore.js";
import { admitBenchmark, ingestBenchmarks } from "../benchmarks/benchImport.js";
import { readTransparencyEntries } from "../transparency/logChain.js";
import { extractValidatedTarGzipArchive, type TarArchiveLimits } from "../security/safeTarArchive.js";

/**
 * Extraction limits for AMC archives.
 *
 * Raw `tar -xzf` on an archive from outside the workspace is a path-traversal
 * and zip-bomb risk: a member named ../../etc/x escapes the destination, and a
 * small archive can expand without bound. These bounds mirror the ones the
 * passport and plugin verifiers already use.
 */
const AMC_ARCHIVE_LIMITS: TarArchiveLimits = {
  maxEntries: 10_000,
  maxCompressedBytes: 128 * 1024 * 1024,
  maxEntryBytes: 128 * 1024 * 1024,
  maxTotalBytes: 512 * 1024 * 1024,
  maxPathBytes: 1024,
};


function tarCreate(sourceDir: string, outFile: string): void {
  const out = spawnSync("tar", ["-czf", outFile, "-C", sourceDir, "."], { encoding: "utf8" });
  if (out.status !== 0) {
    throw new Error(`failed to create federation package: ${(`${out.stdout ?? ""}${out.stderr ?? ""}`).trim()}`);
  }
}

function tarExtract(bundleFile: string, outDir: string): void {
  extractValidatedTarGzipArchive({ file: bundleFile, destination: outDir, label: "archive", limits: AMC_ARCHIVE_LIMITS });
}

/** The three files every package carries and an import copies; verification records the sha256 of each one it admitted. */
const PACKAGE_ENVELOPE = ["manifest.json", "manifest.sig", "public-keys/publisher.pub"];

function resolveExtractedRoot(outDir: string, requiredFiles: string[]): string {
  const hasRequiredAt = (base: string): boolean => requiredFiles.every((file) => pathExists(join(base, file)));
  if (hasRequiredAt(outDir)) {
    return outDir;
  }
  const dirs = readdirSync(outDir, { withFileTypes: true }).filter((entry) => entry.isDirectory());
  for (const dir of dirs) {
    const candidate = join(outDir, dir.name);
    if (hasRequiredAt(candidate)) {
      return candidate;
    }
  }
  return outDir;
}

function collectArtifacts(workspace: string): {
  benchmarks: string[];
  certs: string[];
  bom: string[];
  plugins: string[];
} {
  const searchRoots = [join(workspace, ".amc"), workspace];
  const benchmarks: string[] = [];
  const certs: string[] = [];
  const bom: string[] = [];
  const plugins: string[] = [];
  const seen = new Set<string>();
  const walk = (dir: string): void => {
    if (!pathExists(dir)) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name === "dist" || entry.name.startsWith(".")) {
          if (!full.includes(join(workspace, ".amc"))) {
            continue;
          }
        }
        walk(full);
        continue;
      }
      if (!entry.isFile()) continue;
      if (seen.has(full)) continue;
      seen.add(full);
      if (entry.name.endsWith(".amcbench")) benchmarks.push(full);
      else if (entry.name.endsWith(".amccert")) certs.push(full);
      else if (entry.name.endsWith(".amcplug")) plugins.push(full);
      else if (entry.name.endsWith(".json") && entry.name.includes("bom")) {
        const sig = `${full}.sig`;
        if (pathExists(sig)) bom.push(full);
      }
    }
  };
  for (const root of searchRoots) {
    walk(root);
  }
  const sorter = (a: string, b: string) => a.localeCompare(b);
  return {
    benchmarks: benchmarks.sort(sorter),
    certs: certs.sort(sorter),
    bom: bom.sort(sorter),
    plugins: plugins.sort(sorter)
  };
}

function artifactShaToTransparencyEntryHash(workspace: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const entry of readTransparencyEntries(workspace)) {
    const artifactSha = entry.artifact?.sha256;
    if (typeof artifactSha === "string" && artifactSha.length === 64 && !map.has(artifactSha)) {
      map.set(artifactSha, entry.hash);
    }
  }
  return map;
}

function listFiles(root: string): Array<{ path: string; sha256: string; size: number }> {
  const out: Array<{ path: string; sha256: string; size: number }> = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile()) {
        const rel = relative(root, full).replace(/\\/g, "/");
        if (rel === "manifest.sig") continue;
        const bytes = readFileSync(full);
        out.push({
          path: rel,
          sha256: sha256Hex(bytes),
          size: statSync(full).size
        });
      }
    }
  };
  walk(root);
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

export function exportFederationPackage(params: {
  workspace: string;
  outFile: string;
}): {
  outFile: string;
  manifest: FederationManifest;
  benchmarkCount: number;
  certCount: number;
  bomCount: number;
  pluginCount: number;
} {
  const config = loadFederationConfig(params.workspace);
  const publisher = ensureFederationPublisherKey(params.workspace);
  ensureTransparencyMerkleInitialized(params.workspace);
  const merkleRoot = currentTransparencyMerkleRoot(params.workspace);
  const artifacts = collectArtifacts(params.workspace);
  const temp = mkdtempSync(join(tmpdir(), "amc-fed-export-"));
  try {
    const root = join(temp, "federation");
    ensureDir(root);
    ensureDir(join(root, "artifacts", "benchmarks"));
    ensureDir(join(root, "artifacts", "certs"));
    ensureDir(join(root, "artifacts", "bom"));
    ensureDir(join(root, "public-keys"));
    ensureDir(join(root, "transparency"));
    ensureDir(join(root, "transparency", "proofs"));
    ensureDir(join(root, "artifacts", "plugins"));

    for (const file of (config.federation.sharePolicy.allowBenchmarks ? artifacts.benchmarks : [])) {
      const dst = join(root, "artifacts", "benchmarks", relative(params.workspace, file).replace(/[\\/]/g, "__"));
      writeFileAtomic(dst, readFileSync(file), 0o644);
    }
    for (const file of (config.federation.sharePolicy.allowCerts ? artifacts.certs : [])) {
      const dst = join(root, "artifacts", "certs", relative(params.workspace, file).replace(/[\\/]/g, "__"));
      writeFileAtomic(dst, readFileSync(file), 0o644);
    }
    for (const file of (config.federation.sharePolicy.allowBom ? artifacts.bom : [])) {
      const dst = join(root, "artifacts", "bom", relative(params.workspace, file).replace(/[\\/]/g, "__"));
      writeFileAtomic(dst, readFileSync(file), 0o644);
      const sig = `${file}.sig`;
      writeFileAtomic(`${dst}.sig`, readFileSync(sig), 0o644);
    }
    for (const file of (config.federation.sharePolicy.allowPlugins ? artifacts.plugins : [])) {
      const dst = join(root, "artifacts", "plugins", relative(params.workspace, file).replace(/[\\/]/g, "__"));
      writeFileAtomic(dst, readFileSync(file), 0o644);
    }

    const currentRootFile = join(params.workspace, ".amc", "transparency", "merkle", "current.root.json");
    const currentRootSigFile = join(params.workspace, ".amc", "transparency", "merkle", "current.root.sig");
    if (pathExists(currentRootFile)) {
      writeFileAtomic(join(root, "transparency", "current.root.json"), readFileSync(currentRootFile), 0o644);
    }
    if (pathExists(currentRootSigFile)) {
      writeFileAtomic(join(root, "transparency", "current.root.sig"), readFileSync(currentRootSigFile), 0o644);
    }
    // Optional inclusion proofs for transparency entries matching exported artifact hashes.
    const allShas = [
      ...(config.federation.sharePolicy.allowBenchmarks ? artifacts.benchmarks.map((file) => sha256Hex(readFileSync(file))) : []),
      ...(config.federation.sharePolicy.allowCerts ? artifacts.certs.map((file) => sha256Hex(readFileSync(file))) : []),
      ...(config.federation.sharePolicy.allowBom ? artifacts.bom.map((file) => sha256Hex(readFileSync(file))) : []),
      ...(config.federation.sharePolicy.allowPlugins ? artifacts.plugins.map((file) => sha256Hex(readFileSync(file))) : [])
    ];
    const transparencyLookup = artifactShaToTransparencyEntryHash(params.workspace);
    for (const sha of allShas) {
      const entryHash = transparencyLookup.get(sha);
      if (!entryHash) {
        continue;
      }
      try {
        const proof = generateTransparencyInclusionProof(params.workspace, entryHash);
        const proofOut = join(root, "transparency", "proofs", `${proof.entryHash}.amcproof`);
        exportTransparencyProofBundle({
          workspace: params.workspace,
          entryHash: proof.entryHash,
          outFile: proofOut
        });
      } catch {
        // no matching transparency entry is acceptable.
      }
    }

    writeFileAtomic(join(root, "public-keys", "publisher.pub"), Buffer.from(publisher.publicKeyPem, "utf8"), 0o644);

    const manifest = federationManifestSchema.parse({
      v: 1,
      manifestId: randomUUID(),
      createdTs: Date.now(),
      sourceOrgName: config.federation.orgName,
      sourceOrgId: config.federation.orgId,
      publisherKeyFingerprint: publisher.fingerprint,
      files: listFiles(root)
    });
    const manifestPath = join(root, "manifest.json");
    writeFileAtomic(manifestPath, JSON.stringify(manifest, null, 2), 0o644);
    const digest = sha256Hex(readFileSync(manifestPath));
    const sig = federationManifestSignatureSchema.parse({
      digestSha256: digest,
      signature: signFederationDigest(params.workspace, digest),
      signedTs: Date.now(),
      signer: "publisher"
    });
    writeFileAtomic(join(root, "manifest.sig"), JSON.stringify(sig, null, 2), 0o644);

    const outFile = resolve(params.workspace, params.outFile);
    ensureDir(dirname(outFile));
    ensureDir(federationOutboxDir(params.workspace));
    tarCreate(root, outFile);
    return {
      outFile,
      manifest,
      benchmarkCount: config.federation.sharePolicy.allowBenchmarks ? artifacts.benchmarks.length : 0,
      certCount: config.federation.sharePolicy.allowCerts ? artifacts.certs.length : 0,
      bomCount: config.federation.sharePolicy.allowBom ? artifacts.bom.length : 0,
      pluginCount: config.federation.sharePolicy.allowPlugins ? artifacts.plugins.length : 0
    };
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}

/** verifyFederationPackage plus the sha256 of each envelope file it read, so an import can tell the bytes it copies are the ones admitted. */
function verifyPackage(bundleFile: string, trust: TrustContext, pubkeyPath?: string): {
  ok: boolean;
  errors: string[];
  manifest: FederationManifest | null;
  report: VerifierReportV1;
  envelope: Array<{ path: string; sha256: string }>;
} {
  const errors: string[] = [];
  let envelope: Array<{ path: string; sha256: string }> = [];
  const signatures: IssuerAdmission[] = [];
  let manifest: FederationManifest | null = null;
  const finish = () => {
    const report = buildVerifierReport({ artifact: { kind: "federation-package", path: resolve(bundleFile), sha256: fileSha256(resolve(bundleFile)) },
      context: trust, integrityErrors: errors, signatures, anchoring: { status: "not-applicable", detail: null } });
    return { ok: report.trusted, errors, manifest, report, envelope };
  };
  const temp = mkdtempSync(join(tmpdir(), "amc-fed-verify-"));
  try {
    tarExtract(bundleFile, temp);
    const root = resolveExtractedRoot(temp, PACKAGE_ENVELOPE);
    const manifestPath = join(root, "manifest.json");
    const sigPath = join(root, "manifest.sig");
    const pubPath = join(root, "public-keys", "publisher.pub");
    if (!pathExists(manifestPath) || !pathExists(sigPath) || !pathExists(pubPath)) {
      errors.push("federation package missing manifest/signature/publisher key");
      return finish();
    }
    envelope = PACKAGE_ENVELOPE.map((path) => ({ path, sha256: sha256Hex(readFileSync(join(root, path))) }));
    try {
      manifest = federationManifestSchema.parse(JSON.parse(readUtf8(manifestPath)) as unknown);
    } catch (error) {
      errors.push(`invalid manifest.json: ${String(error)}`);
    }
    try {
      const sig = federationManifestSignatureSchema.parse(JSON.parse(readUtf8(sigPath)) as unknown);
      const digest = sha256Hex(readFileSync(manifestPath));
      const check = checkDigestSignature({ signature: "manifest.sig", purpose: "artifact-seal", digestHex: digest, signatureB64: sig.signature,
        candidates: [pubkeyPath ? readUtf8(resolve(pubkeyPath)) : null, readUtf8(pubPath)], context: trust, claimedSignedAt: sig.signedTs });
      signatures.push(check.admission);
      if (digest !== sig.digestSha256) {
        errors.push("manifest digest mismatch");
      } else if (!check.verified) {
        errors.push("manifest signature invalid");
      }
    } catch (error) {
      errors.push(`invalid manifest.sig: ${String(error)}`);
    }
    if (manifest) {
      for (const row of manifest.files) {
        let file: string;
        try {
          file = containedPath(root, "the package root", row.path);
        } catch (error) {
          errors.push(toErrorMessage(error));
          continue;
        }
        if (!pathExists(file)) {
          errors.push(`missing file listed in manifest: ${row.path}`);
          continue;
        }
        const digest = sha256Hex(readFileSync(file));
        if (digest !== row.sha256) {
          errors.push(`sha mismatch for ${row.path}`);
        }
      }
    }
    return finish();
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}

/**
 * Verifies a .amcfed offline. public-keys/publisher.pub and --pubkey only locate the signer; manifest.sig needs a key
 * the trust context admits for artifact-seal (P0-09). ok equals report.trusted.
 */
export function verifyFederationPackage(bundleFile: string, trust: TrustContext, pubkeyPath?: string): {
  ok: boolean;
  errors: string[];
  manifest: FederationManifest | null;
  report: VerifierReportV1;
} {
  const { ok, errors, manifest, report } = verifyPackage(bundleFile, trust, pubkeyPath);
  return { ok, errors, manifest, report };
}

/** The operator's trust plus the publisher keys of the peers this workspace added (auditor-signed peer records). */
export function federationPeerTrust(workspace: string): TrustContext {
  return withPins(loadTrustContext(), listFederationPeers(workspace).flatMap(({ peer, valid }) => {
    const keyId = valid ? ed25519KeyId(peer.publisherPublicKeyPem) : null;
    return keyId ? [{ keyId, purposes: ["artifact-seal" as const], origin: `federation peer ${peer.peerId}` }] : [];
  }));
}

/**
 * The inbox directory for a package is named after the identity that was admitted, never after the sourceOrgId the
 * manifest claims: the matching peer record's peerId, or key-<first 16 hex of the key id> when only the operator's
 * trust list admitted the key (or the peer record's id is not a safe directory name).
 */
function admittedInboxName(workspace: string, report: VerifierReportV1): string {
  const keyId = report.issuerAdmission.signatures.find((row) => row.status === "admitted")?.keyId;
  if (!keyId) {
    throw new Error("federation package has no admitted signing key");
  }
  const peerId = listFederationPeers(workspace).find(({ peer, valid }) => valid && ed25519KeyId(peer.publisherPublicKeyPem) === keyId)?.peer.peerId;
  return peerId !== undefined && safeIdSchema.safeParse(peerId).success ? peerId : `key-${keyId.slice(0, 16)}`;
}

const STAGING_PREFIX = ".staging-";

/** A top-level `.amcbench` under artifacts/benchmarks/, the files the import ingests. */
function isPackageBenchmark(path: string): boolean {
  const name = path.startsWith("artifacts/benchmarks/") ? path.slice("artifacts/benchmarks/".length) : "";
  return name.endsWith(".amcbench") && !name.includes("/");
}

/**
 * A manifestId is imported once (a re-import would overwrite what was imported), and a package older than one already
 * imported from the same admitted publisher is refused as a rollback. An imported package whose manifest cannot be read
 * blocks further imports from that publisher rather than being ignored.
 */
function refuseReplayOrRollback(publisherInbox: string, manifest: FederationManifest): void {
  if (!pathExists(publisherInbox)) return;
  for (const entry of readdirSync(publisherInbox, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith(STAGING_PREFIX)) continue;
    if (entry.name === manifest.manifestId) {
      throw new Error(`federation package ${manifest.manifestId} was already imported from this publisher; it is not imported again`);
    }
    const priorFile = join(publisherInbox, entry.name, "manifest.json");
    let prior: FederationManifest | null = null;
    try {
      prior = federationManifestSchema.parse(JSON.parse(readUtf8(priorFile)) as unknown);
    } catch {
      prior = null;
    }
    if (!prior) {
      throw new Error(`cannot read the manifest of imported federation package ${entry.name}; refusing to import until it is restored or removed`);
    }
    if (prior.createdTs > manifest.createdTs) {
      throw new Error(`federation package ${manifest.manifestId} (created ${new Date(manifest.createdTs).toISOString()}) is older than `
        + `${prior.manifestId} (created ${new Date(prior.createdTs).toISOString()}) already imported from this publisher; refused as a rollback`);
    }
  }
}

/** The bytes at `src`, refused unless they hash to what verification admitted for `path`. */
function admittedBytes({ src, path, sha256 }: { src: string; path: string; sha256: string }): Buffer {
  const bytes = pathExists(src) ? readFileSync(src) : null;
  if (bytes === null || sha256Hex(bytes) !== sha256) {
    throw new Error(`federation package changed between verification and import: ${path}`);
  }
  return bytes;
}

export function importFederationPackage(params: {
  workspace: string;
  bundleFile: string;
}): {
  sourceOrgId: string;
  importedPath: string;
  benchmarkCount: number;
  certCount: number;
  bomCount: number;
  pluginCount: number;
} {
  // Only a package signed by a peer the operator added (`amc federate peer add`) or a trust list pins is imported.
  const trust = federationPeerTrust(params.workspace);
  const verify = verifyPackage(params.bundleFile, trust);
  if (!verify.ok || !verify.manifest) {
    throw new Error(`federation package verify failed: ${untrustedReasons(verify.report).join("; ")}`);
  }
  const temp = mkdtempSync(join(tmpdir(), "amc-fed-import-"));
  try {
    tarExtract(params.bundleFile, temp);
    const root = resolveExtractedRoot(temp, PACKAGE_ENVELOPE);
    const importedPath = containedPath(federationInboxDir(params.workspace), "the federation inbox",
      admittedInboxName(params.workspace, verify.report), verify.manifest.manifestId);
    refuseReplayOrRollback(dirname(importedPath), verify.manifest);
    // Everything copied: the manifest's files and the envelope, each with the sha256 verification admitted.
    const copies = [...verify.manifest.files, ...verify.envelope].map(({ path, sha256 }) => ({
      path,
      sha256,
      src: containedPath(root, "the package root", path)
    }));
    // The bundle was extracted once to verify and is extracted again here. Before writing anything, refuse unless every
    // byte about to be copied is still what verification admitted (a bundle replaced in between must not be imported).
    for (const copy of copies) {
      admittedBytes(copy);
    }
    // Every benchmark signer is checked before anything is written, so a refused package leaves nothing behind.
    for (const copy of copies.filter(({ path }) => isPackageBenchmark(path))) {
      admitBenchmark(params.workspace, copy.src, trust);
    }
    // Staged next to its final place and renamed in one step: the inbox never holds a partial package.
    const staging = containedPath(dirname(importedPath), "the federation inbox", `${STAGING_PREFIX}${randomBytes(6).toString("hex")}`);
    try {
      for (const copy of copies) {
        const dst = containedPath(staging, "the staged package directory", copy.path);
        ensureDir(dirname(dst));
        writeFileAtomic(dst, admittedBytes(copy), 0o644);
      }
      renameSync(staging, importedPath);
    } finally {
      rmSync(staging, { recursive: true, force: true });
    }

    const benchDir = join(importedPath, "artifacts", "benchmarks");
    let benchmarkCount = 0;
    if (pathExists(benchDir)) {
      for (const entry of readdirSync(benchDir, { withFileTypes: true })) {
        if (!entry.isFile() || !entry.name.endsWith(".amcbench")) continue;
        // A peer pin admits the package seal, not the benchmarks inside it: each benchmark's own signer must be
        // admitted by the operator's trust (or be the peer key itself) before it reaches the workspace's stats.
        ingestBenchmarks(params.workspace, join(benchDir, entry.name), trust);
        benchmarkCount += 1;
      }
    }
    const certDir = join(importedPath, "artifacts", "certs");
    const bomDir = join(importedPath, "artifacts", "bom");
    const pluginDir = join(importedPath, "artifacts", "plugins");
    const certCount = pathExists(certDir)
      ? readdirSync(certDir, { withFileTypes: true }).filter((entry) => entry.isFile() && entry.name.endsWith(".amccert")).length
      : 0;
    const bomCount = pathExists(bomDir)
      ? readdirSync(bomDir, { withFileTypes: true }).filter((entry) => entry.isFile() && entry.name.endsWith(".json")).length
      : 0;
    const pluginCount = pathExists(pluginDir)
      ? readdirSync(pluginDir, { withFileTypes: true }).filter((entry) => entry.isFile() && entry.name.endsWith(".amcplug")).length
      : 0;
    return {
      sourceOrgId: verify.manifest.sourceOrgId,
      importedPath,
      benchmarkCount,
      certCount,
      bomCount,
      pluginCount
    };
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}
