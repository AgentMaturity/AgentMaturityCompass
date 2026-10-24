import { constants, closeSync, fstatSync, lstatSync, mkdirSync, mkdtempSync, openSync, readSync, realpathSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { verifySignedDigest } from "../crypto/signing/signer.js";
import { prepareFileSignatureWithAuditor, signSerializedPayloadWithAuditor } from "../org/orgSigner.js";
import { captureOrgCommitmentAuthority } from "../org/orgPublication.js";
import { verifyAuditorSignatureBytes } from "../org/orgSignatureBytes.js";
import { withControlFileLock } from "../lifecycle/controlFileLock.js";
import { orgSignatureSchema } from "../org/orgSchema.js";
import { sha256Hex } from "../utils/hash.js";
import { NATIVE_EXTENSION_LIMITS, NativeExtensionError, parseNativeExtensionManifest, type NativeExtensionManifest } from "./nativeExtensionManifest.js";

export interface NativeExtensionSnapshot {
  readonly workspace: string;
  readonly root: string;
  readonly manifestPath: string;
  readonly manifestDigest: string;
  readonly manifest: NativeExtensionManifest;
  readonly signatureValid: boolean;
  readonly totalContentBytes: number;
  readonly contents: ReadonlyMap<string, string>;
  /** Exact bytes are retained only for an explicit local installation. */
  readonly manifestBytes: Buffer;
  readonly signatureBytes: Buffer | null;
}

function refused(code: string, message: string): never { throw new NativeExtensionError(code, message); }
function assertRoot(root: string): void {
  if (realpathSync(root) !== root || !lstatSync(root).isDirectory()) {
    refused("ROOT_SYMLINK", "Use the actual reviewed extension directory, without symbolic-link components.");
  }
}
function assertPath(root: string, file: string): void {
  assertRoot(root);
  const suffix = relative(root, file);
  if (!suffix || isAbsolute(suffix) || suffix === ".." || suffix.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`)) {
    refused("PATH_ESCAPE", "An extension source must remain inside its reviewed directory.");
  }
  let cursor = root;
  const parts = suffix.split(/[\\/]/);
  for (let index = 0; index < parts.length; index++) {
    cursor = join(cursor, parts[index]!);
    const stat = lstatSync(cursor);
    if (stat.isSymbolicLink() || (index < parts.length - 1 && !stat.isDirectory())) {
      refused("SOURCE_SYMLINK", "Extension sources and signature paths cannot contain symbolic links.");
    }
  }
}

function readBounded(root: string, file: string, limit: number): Buffer {
  assertPath(root, file);
  const fd = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const before = fstatSync(fd);
    if (!before.isFile() || before.size > limit) refused("SOURCE_LIMIT", "Extension source must be a bounded regular file.");
    const bytes = Buffer.alloc(limit + 1);
    let offset = 0;
    while (offset < bytes.length) {
      const count = readSync(fd, bytes, offset, bytes.length - offset, null);
      if (count === 0) break;
      offset += count;
    }
    const after = fstatSync(fd);
    const current = lstatSync(file);
    assertPath(root, file);
    if (offset > limit || before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size
      || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs
      || current.dev !== after.dev || current.ino !== after.ino || current.isSymbolicLink()) {
      refused("SOURCE_CHANGED", "Extension source changed while it was being read; reload after review.");
    }
    return bytes.subarray(0, offset);
  } finally { closeSync(fd); }
}

function verifySignature(workspace: string, bytes: Buffer, digest: string): boolean {
  try {
    const signed = orgSignatureSchema.parse(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)));
    if (signed.digestSha256 !== digest) return false;
    return verifySignedDigest({ workspace, digestHex: digest, signed: { signature: signed.signature, envelope: signed.envelope } });
  } catch { return false; }
}

/** Reads exact bounded bytes; validation uses the same AMC signed-digest authority as orgSigner. */
export function readNativeExtension(options: {
  readonly workspace: string; readonly manifestPath: string;
  readonly expectedDigest?: string; readonly requireSignature?: boolean;
}): NativeExtensionSnapshot {
  try {
    const workspace = resolve(options.workspace);
    const manifestPath = resolve(workspace, options.manifestPath);
    const root = dirname(manifestPath);
    const manifestBytes = readBounded(root, manifestPath, NATIVE_EXTENSION_LIMITS.manifestBytes);
    const manifestDigest = sha256Hex(manifestBytes);
    if (options.expectedDigest !== undefined && (!/^[a-f0-9]{64}$/.test(options.expectedDigest) || options.expectedDigest !== manifestDigest)) {
      refused("MANIFEST_CHANGED", "Extension manifest differs from its reviewed digest.");
    }
    const manifest = parseNativeExtensionManifest(manifestBytes);
    const contents = new Map<string, string>();
    let totalContentBytes = 0;
    for (const entry of [...manifest.contexts, ...Object.values(manifest.commands)]) {
      const path = resolve(root, entry.path);
      if (path === manifestPath || path === `${manifestPath}.sig`) refused("SOURCE_RESERVED", "Manifest and signature files cannot be model context or command templates.");
      const bytes = readBounded(root, path, NATIVE_EXTENSION_LIMITS.fileBytes);
      if (sha256Hex(bytes) !== entry.sha256) refused("CONTENT_CHANGED", "An extension content hash differs from its reviewed manifest.");
      if (!contents.has(entry.path)) totalContentBytes += bytes.length;
      if (totalContentBytes > NATIVE_EXTENSION_LIMITS.totalBytes) refused("CONTENT_LIMIT", "Extension content exceeds the total size limit.");
      let text: string;
      try { text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes); }
      catch { refused("CONTENT_ENCODING", "Extension content must be valid UTF-8 text."); }
      if (text.includes("\0")) refused("CONTENT_ENCODING", "Extension content cannot contain NUL bytes.");
      contents.set(entry.path, text);
    }
    for (const command of Object.values(manifest.commands)) {
      const template = contents.get(command.path)!;
      if ((template.match(/\{\{args\}\}/g) ?? []).length !== 1 || /\{\{[^{}]*\}\}/.test(template.replace("{{args}}", ""))) {
        refused("TEMPLATE_INVALID", "Each command template must contain exactly one {{args}} placeholder and no other template substitutions.");
      }
    }
    let signatureBytes: Buffer | null = null;
    try { signatureBytes = readBounded(root, `${manifestPath}.sig`, NATIVE_EXTENSION_LIMITS.manifestBytes); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    const signatureValid = signatureBytes !== null && verifySignature(workspace, signatureBytes, manifestDigest);
    if (options.requireSignature !== false && !signatureValid) refused("SIGNATURE_INVALID", "The extension has no valid signature from this AMC workspace's admitted signing authority. Inspect and explicitly sign it before loading.");
    return { workspace, root, manifestPath, manifestDigest, manifest, signatureValid, totalContentBytes, contents, manifestBytes, signatureBytes };
  } catch (error) {
    if (error instanceof NativeExtensionError) throw error;
    throw new NativeExtensionError("SOURCE_UNREADABLE", "Could not read the extension's manifest, signature or declared content safely. Source text and filesystem diagnostics are withheld.");
  }
}

export function describeNativeExtension(snapshot: NativeExtensionSnapshot) {
  return {
    schemaVersion: snapshot.manifest.schemaVersion, id: snapshot.manifest.id, manifestPath: snapshot.manifestPath,
    manifestDigest: snapshot.manifestDigest, signatureValid: snapshot.signatureValid,
    contexts: snapshot.manifest.contexts.map(entry => ({ ...entry })),
    commands: Object.entries(snapshot.manifest.commands).map(([name, entry]) => ({ name, ...entry })),
    totalContentBytes: snapshot.totalContentBytes,
    ...(snapshot.manifest.schemaVersion === 2 ? { executable: JSON.parse(JSON.stringify(snapshot.manifest.executable)) as typeof snapshot.manifest.executable } : {}),
    boundary: snapshot.manifest.schemaVersion === 1
      ? "Declarative context and prompt commands only. No code execution, tool grants or OS confinement. Loading does not sign or activate an extension in another session."
      : "Executable contributions require the exact publisher-signed installed package, a separate workspace-signed execution approval, and Linux Bubblewrap confinement. Inspection, signing and installation do not approve or execute code. Only declared context and command handlers receive bounded input."
  };
}

/** Explicit operator mutation: signs exactly the reviewed manifest bytes using existing BUNDLE policy. */
export function signNativeExtension(workspace: string, manifestPath: string, expectedDigest: string) {
  const snapshot = readNativeExtension({ workspace, manifestPath, expectedDigest, requireSignature: false });
  const signed = signSerializedPayloadWithAuditor(snapshot.workspace, snapshot.manifestBytes.toString("utf8"));
  const signaturePath = `${snapshot.manifestPath}.sig`;
  // A replacement signature is the requested action; do not follow a symlink.
  try { if (lstatSync(signaturePath).isSymbolicLink()) refused("SOURCE_SYMLINK", "Cannot replace a symbolic-link signature."); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  const temp = mkdtempSync(join(snapshot.root, ".native-extension-sign-"));
  try {
    const staged = join(temp, "signature.json");
    writeFileSync(staged, JSON.stringify(signed, null, 2), { flag: "wx", mode: 0o600 });
    readNativeExtension({ workspace, manifestPath, expectedDigest, requireSignature: false });
    assertRoot(snapshot.root);
    renameSync(staged, signaturePath);
  } finally { rmSync(temp, { recursive: true, force: true }); }
  return describeNativeExtension(readNativeExtension({ workspace, manifestPath, expectedDigest }));
}

interface NativeSigningFile { path: string; bytes: Buffer; mode: number; identity: string; links: number }
function nativeSigningFile(root: string, path: string, limit: number, absent = false): NativeSigningFile | null {
  assertRoot(root);
  let first: ReturnType<typeof lstatSync>;
  try { first = lstatSync(path); }
  catch (cause) { if (absent && (cause as NodeJS.ErrnoException).code === "ENOENT") { assertRoot(root); return null; } throw cause; }
  const bytes = readBounded(root, path, limit), last = lstatSync(path);
  if (!first.isFile() || !last.isFile() || first.dev !== last.dev || first.ino !== last.ino || first.mode !== last.mode
    || first.size !== last.size || first.nlink !== last.nlink || first.mtimeMs !== last.mtimeMs || first.ctimeMs !== last.ctimeMs || bytes.length !== last.size)
    refused("SOURCE_CHANGED", "Extension source changed while its signing witness was captured; reload after review.");
  return { path, bytes: Buffer.from(bytes), mode: last.mode & 0o777, identity: `${last.dev}:${last.ino}`, links: last.nlink };
}
function sameNativeSigningFile(a: NativeSigningFile | null, b: NativeSigningFile | null): boolean {
  return a === null || b === null ? a === b : a.mode === b.mode && a.identity === b.identity && a.links === b.links && a.bytes.equals(b.bytes);
}
/** Fixed bounded manifest/content/sidecar family. Only the real signature rename may advance its target witness. */
function captureNativeSigningSources(snapshot: NativeExtensionSnapshot) {
  try {
    const files = new Map<string, NativeSigningFile>(), limits = new Map<string, number>();
    const add = (path: string, expected: Buffer, limit: number) => {
      const own = nativeSigningFile(snapshot.root, path, limit);
      if (own === null || !own.bytes.equals(expected)) refused("SOURCE_CHANGED", "Extension sources differ from the reviewed signing snapshot.");
      files.set(path, own); limits.set(path, limit);
    };
    add(snapshot.manifestPath, snapshot.manifestBytes, NATIVE_EXTENSION_LIMITS.manifestBytes);
    for (const entry of [...snapshot.manifest.contexts, ...Object.values(snapshot.manifest.commands)])
      add(resolve(snapshot.root, entry.path), Buffer.from(snapshot.contents.get(entry.path)!, "utf8"), NATIVE_EXTENSION_LIMITS.fileBytes);
    const signaturePath = `${snapshot.manifestPath}.sig`;
    let target = nativeSigningFile(snapshot.root, signaturePath, NATIVE_EXTENSION_LIMITS.manifestBytes, true);
    if (snapshot.signatureBytes === null ? target !== null : target === null || !target.bytes.equals(snapshot.signatureBytes))
      refused("SOURCE_CHANGED", "Extension signature target changed while signing was captured.");
    const directories = new Map<string, { mode: number; identity: string }>();
    for (const file of files.keys()) {
      let path = dirname(file);
      while (true) {
        const row = lstatSync(path);
        if (!row.isDirectory() || row.isSymbolicLink()) refused("SOURCE_SYMLINK", "Extension source parents must remain real directories.");
        directories.set(path, { mode: row.mode & 0o777, identity: `${row.dev}:${row.ino}` });
        if (path === snapshot.root) break;
        path = dirname(path);
      }
    }
    const assertDirectory = (path: string) => {
      const old = directories.get(path)!, row = lstatSync(path);
      if (!row.isDirectory() || row.isSymbolicLink() || old.mode !== (row.mode & 0o777) || old.identity !== `${row.dev}:${row.ino}`)
        refused("SOURCE_CHANGED", "Extension source directory changed during signing.");
    };
    const assertRootCurrent = () => { assertRoot(snapshot.root); assertDirectory(snapshot.root); };
    const assertCurrent = () => {
      try {
        assertRootCurrent(); for (const path of directories.keys()) assertDirectory(path);
        for (const [path, old] of files) if (!sameNativeSigningFile(old, nativeSigningFile(snapshot.root, path, limits.get(path)!)))
          refused("SOURCE_CHANGED", "Extension source changed during signing; no fresh source is adopted.");
        if (!sameNativeSigningFile(target, nativeSigningFile(snapshot.root, signaturePath, NATIVE_EXTENSION_LIMITS.manifestBytes, true)))
          refused("SOURCE_CHANGED", "Extension signature target changed during signing.");
      } catch (cause) {
        if (cause instanceof NativeExtensionError) throw cause;
        throw new NativeExtensionError("SOURCE_UNREADABLE", "Could not recheck the extension signing sources safely. Source text and filesystem diagnostics are withheld.");
      }
    };
    assertCurrent();
    return { assertCurrent, assertRootCurrent,
      acknowledgeSignature(bytes: Buffer, identity: string) {
        const own = nativeSigningFile(snapshot.root, signaturePath, NATIVE_EXTENSION_LIMITS.manifestBytes);
        if (own === null || own.mode !== 0o600 || own.identity !== identity || own.links !== 1 || !own.bytes.equals(bytes))
          refused("SIGNATURE_CHANGED", "The returned extension signature differs from its exact prepared publication.");
        target = own;
      }
    };
  } catch (cause) {
    if (cause instanceof NativeExtensionError) throw cause;
    throw new NativeExtensionError("SOURCE_UNREADABLE", "Could not capture the extension signing sources safely. Source text and filesystem diagnostics are withheld.");
  }
}
interface NativeExtensionSignProgress {
  phase: string; failurePhase: string | null; signaturePath: string; lockSetupAttempted: boolean; lockEntered: boolean;
  tempCreationAttempted: boolean; temp: string | null; tempReturned: boolean; tempAcknowledged: boolean;
  stageOpenAttempted: boolean; stageOpened: boolean; stageWriteAttempted: boolean; stageWriteReturned: boolean;
  stageCloseAttempted: boolean; stageClosed: boolean; stageAcknowledged: boolean;
  renameAttempted: boolean; renameReturned: boolean; targetAcknowledged: boolean;
  cleanupCheckAttempted: boolean; cleanupAttempted: boolean; cleanupReturned: boolean;
}
export class NativeExtensionSigningPublicationError extends Error {
  readonly code = "NATIVE_EXTENSION_SIGN_INCOMPLETE";
  constructor(readonly progress: Readonly<NativeExtensionSignProgress>, cause: unknown,
    readonly closeCauses: readonly unknown[], readonly cleanupCauses: readonly unknown[]) {
    super("Native extension signature publication did not complete; staging, replacement or cleanup effects may remain. Diagnostics are withheld.", { cause });
    this.name = "NativeExtensionSigningPublicationError";
  }
}
/** Maintained async BUNDLE producer. Existing sync/read/install APIs below and above retain their protocols. */
export async function signNativeExtensionAsync(workspaceInput: string, manifestInput: string, expectedInput: string): Promise<ReturnType<typeof describeNativeExtension>> {
  const refusedNoSign = process.env.AMC_NO_SIGN === "1";
  if (refusedNoSign) throw new Error("no-sign mode does not authorize policy signing");
  const workspace = resolve(workspaceInput), manifestPath = resolve(workspace, manifestInput), expectedDigest = expectedInput;
  const snapshot = readNativeExtension({ workspace, manifestPath, expectedDigest, requireSignature: false });
  const sources = captureNativeSigningSources(snapshot), original = captureOrgCommitmentAuthority(workspace), modeMask = process.umask();
  const beforeSign = () => {
    if (refusedNoSign || process.env.AMC_NO_SIGN === "1") throw new Error("no-sign mode does not authorize policy signing");
    original(); sources.assertCurrent();
    if (process.umask() !== modeMask) throw new Error("original extension signature creation mode changed");
  };
  beforeSign();
  const prepared = await prepareFileSignatureWithAuditor(workspace, manifestPath, snapshot.manifestBytes, "BUNDLE", beforeSign);
  beforeSign(); prepared.assertCurrent();
  const signatureBytes = Buffer.from(prepared.signatureBytes, "utf8"), signaturePath = `${manifestPath}.sig`;
  if (signatureBytes.length > NATIVE_EXTENSION_LIMITS.manifestBytes)
    refused("SIGNATURE_LIMIT", "The prepared extension signature exceeds the bounded signature limit.");
  const assertCurrent = () => {
    beforeSign(); prepared.assertCurrent();
    if (!verifyAuditorSignatureBytes(workspace, "BUNDLE", snapshot.manifestBytes, signatureBytes).valid)
      refused("SIGNATURE_INVALID", "The prepared extension signature is not currently admitted for BUNDLE.");
  };
  assertCurrent();
  let phase = "publication-lock", failurePhase: string | null = null, lockSetupAttempted = false, lockEntered = false;
  let tempCreationAttempted = false, temp: string | null = null, tempReturned = false, tempAcknowledged = false;
  let stageOpenAttempted = false, stageOpened = false, stageWriteAttempted = false, stageWriteReturned = false;
  let stageCloseAttempted = false, stageClosed = false, stageAcknowledged = false;
  let renameAttempted = false, renameReturned = false, targetAcknowledged = false;
  let cleanupCheckAttempted = false, cleanupAttempted = false, cleanupReturned = false;
  let stageFd: number | null = null, tempDirectory: { mode: number; identity: string } | null = null;
  const closeCauses: unknown[] = [], cleanupCauses: unknown[] = [];
  const progress = (): Readonly<NativeExtensionSignProgress> => Object.freeze({ phase, failurePhase, signaturePath, lockSetupAttempted, lockEntered,
    tempCreationAttempted, temp, tempReturned, tempAcknowledged, stageOpenAttempted, stageOpened, stageWriteAttempted, stageWriteReturned,
    stageCloseAttempted, stageClosed, stageAcknowledged, renameAttempted, renameReturned, targetAcknowledged,
    cleanupCheckAttempted, cleanupAttempted, cleanupReturned });
  let failed = false, primary: unknown, result: ReturnType<typeof describeNativeExtension> | null = null;
  try {
    lockSetupAttempted = true;
    withControlFileLock({ root: join(workspace, ".amc"), name: "native-extension-signature", operation: () => {
      lockEntered = true;
      try {
        assertCurrent(); phase = "temp-create"; tempCreationAttempted = true;
        temp = mkdtempSync(join(snapshot.root, ".native-extension-sign-")); tempReturned = true;
        const directory = lstatSync(temp);
        if (!directory.isDirectory() || directory.isSymbolicLink() || (directory.mode & 0o077) !== 0 || realpathSync(temp) !== temp)
          refused("SIGNATURE_STAGING_CHANGED", "The private extension signature stage could not be acknowledged.");
        tempDirectory = { mode: directory.mode & 0o777, identity: `${directory.dev}:${directory.ino}` }; tempAcknowledged = true;
        const assertStageDirectory = () => {
          sources.assertRootCurrent(); const current = lstatSync(temp!);
          if (!current.isDirectory() || current.isSymbolicLink() || realpathSync(temp!) !== temp
            || (current.mode & 0o777) !== tempDirectory!.mode || `${current.dev}:${current.ino}` !== tempDirectory!.identity)
            refused("SIGNATURE_STAGING_CHANGED", "The original private extension signature directory changed.");
        };
        const staged = join(temp, "signature.json");
        assertCurrent(); assertStageDirectory(); phase = "stage-open"; stageOpenAttempted = true;
        stageFd = openSync(staged, "wx", 0o600); stageOpened = true;
        const opened = fstatSync(stageFd), stageIdentity = `${opened.dev}:${opened.ino}`;
        if (!opened.isFile() || (opened.mode & 0o777) !== 0o600 || opened.nlink !== 1)
          refused("SIGNATURE_STAGING_CHANGED", "The extension signature stage is not the private exclusive file.");
        phase = "stage-write"; stageWriteAttempted = true; writeFileSync(stageFd, signatureBytes); stageWriteReturned = true;
        phase = "stage-close"; stageCloseAttempted = true;
        try { closeSync(stageFd); stageClosed = true; stageFd = null; } catch (cause) { closeCauses.push(cause); throw cause; }
        assertStageDirectory();
        const stage = nativeSigningFile(temp, staged, NATIVE_EXTENSION_LIMITS.manifestBytes);
        if (stage === null || stage.identity !== stageIdentity || stage.mode !== 0o600 || stage.links !== 1 || !stage.bytes.equals(signatureBytes))
          refused("SIGNATURE_STAGING_CHANGED", "The extension signature stage differs from its actual prepared bytes.");
        stageAcknowledged = true;
        phase = "source-recheck"; readNativeExtension({ workspace, manifestPath, expectedDigest, requireSignature: false }); assertCurrent(); assertStageDirectory();
        const unchangedStage = nativeSigningFile(temp, staged, NATIVE_EXTENSION_LIMITS.manifestBytes);
        if (!sameNativeSigningFile(stage, unchangedStage)) refused("SIGNATURE_STAGING_CHANGED", "The prepared extension signature stage changed before replacement.");
        phase = "signature-rename"; renameAttempted = true; renameSync(staged, signaturePath); renameReturned = true;
        phase = "signature-acknowledge"; sources.acknowledgeSignature(signatureBytes, stageIdentity); targetAcknowledged = true;
        phase = "published-admission"; assertCurrent();
        const actual = readNativeExtension({ workspace, manifestPath, expectedDigest, requireSignature: false });
        const admitted = actual.signatureBytes !== null && actual.signatureBytes.equals(signatureBytes)
          && verifyAuditorSignatureBytes(workspace, "BUNDLE", actual.manifestBytes, actual.signatureBytes).valid;
        if (!admitted) refused("SIGNATURE_INVALID", "The published extension signature is not currently admitted for BUNDLE.");
        assertCurrent(); result = describeNativeExtension({ ...actual, signatureValid: admitted });
      } catch (cause) { failed = true; failurePhase = phase; primary = cause; }
      finally {
        if (stageFd !== null && !stageCloseAttempted) {
          phase = "stage-close-after-failure"; stageCloseAttempted = true;
          try { closeSync(stageFd); stageClosed = true; stageFd = null; } catch (cause) { closeCauses.push(cause); }
        }
        if (temp !== null) {
          phase = "stage-cleanup-check"; cleanupCheckAttempted = true;
          try {
            sources.assertRootCurrent(); const current = lstatSync(temp);
            if (tempDirectory === null || !current.isDirectory() || current.isSymbolicLink() || (current.mode & 0o777) !== tempDirectory.mode
              || `${current.dev}:${current.ino}` !== tempDirectory.identity)
              refused("SIGNATURE_STAGING_CHANGED", "Cleanup refuses an unacknowledged extension signature directory.");
            phase = "stage-cleanup"; cleanupAttempted = true; rmSync(temp, { recursive: true, force: true }); cleanupReturned = true;
          } catch (cause) { if (failurePhase === null) failurePhase = phase; cleanupCauses.push(cause); }
        }
      }
    } });
  } catch (cause) { if (!failed) { failed = true; failurePhase = phase; primary = cause; } }
  if (failed || closeCauses.length > 0 || cleanupCauses.length > 0)
    throw new NativeExtensionSigningPublicationError(progress(), failed ? primary : closeCauses[0] ?? cleanupCauses[0], Object.freeze([...closeCauses]), Object.freeze([...cleanupCauses]));
  if (result === null) throw new Error("extension signature producer returned no result");
  try { phase = "final-continuation"; assertCurrent(); }
  catch (cause) { failurePhase = phase; throw new NativeExtensionSigningPublicationError(progress(), cause, Object.freeze([...closeCauses]), Object.freeze([...cleanupCauses])); }
  return result;
}

/** Copies an already signed, reviewed snapshot into the existing plugin store; never signs on install. */
export function installNativeExtension(workspace: string, manifestPath: string, expectedDigest: string) {
  const snapshot = readNativeExtension({ workspace, manifestPath, expectedDigest });
  const workspaceRoot = resolve(workspace);
  assertRoot(workspaceRoot);
  const amc = join(workspaceRoot, ".amc");
  if (!lstatSync(amc).isDirectory() || lstatSync(amc).isSymbolicLink()) refused("WORKSPACE_MISSING", "Initialize a real AMC workspace before installing native extensions.");
  let store = amc;
  for (const part of ["plugins", "native-extensions"]) {
    store = join(store, part);
    try { mkdirSync(store, { mode: 0o700 }); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
    assertRoot(store);
  }
  const target = join(store, snapshot.manifest.id);
  try { lstatSync(target); refused("INSTALL_EXISTS", "This extension ID is already installed. Use its explicit manifest path, or remove the old directory after unloading and review the replacement."); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  const temp = mkdtempSync(join(store, ".install-"));
  try {
    const name = basename(snapshot.manifestPath);
    writeFileSync(join(temp, name), snapshot.manifestBytes, { flag: "wx", mode: 0o600 });
    writeFileSync(join(temp, `${name}.sig`), snapshot.signatureBytes!, { flag: "wx", mode: 0o600 });
    for (const [path, text] of snapshot.contents) {
      const file = join(temp, path);
      mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
      writeFileSync(file, text, { flag: "wx", mode: 0o600 });
    }
    readNativeExtension({ workspace, manifestPath: join(temp, name), expectedDigest });
    assertRoot(store);
    renameSync(temp, target);
    return describeNativeExtension(readNativeExtension({ workspace, manifestPath: join(target, name), expectedDigest }));
  } finally { rmSync(temp, { recursive: true, force: true }); }
}
