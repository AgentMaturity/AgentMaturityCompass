import { constants, closeSync, fstatSync, lstatSync, mkdirSync, mkdtempSync, openSync, readSync, realpathSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { verifySignedDigest } from "../crypto/signing/signer.js";
import { signSerializedPayloadWithAuditor } from "../org/orgSigner.js";
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
