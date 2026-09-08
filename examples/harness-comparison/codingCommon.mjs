import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { closeSync, constants, fstatSync, lstatSync, mkdirSync, openSync, readFileSync, readSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";

export const VERSION = "2026-09-08";
export const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
export function readJson(path) {
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.size > 32 * 1024 * 1024) throw new Error("Expected a bounded regular JSON input");
  return JSON.parse(readFileSync(path, "utf8"));
}
export function putJson(path, value) {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  writeFileSync(path, JSON.stringify(value, null, 2) + "\n", { flag: "wx", mode: 0o600 });
}
export function loopbackOrigin(value) {
  const url = new URL(value);
  if (url.protocol !== "http:" || !["127.0.0.1", "[::1]"].includes(url.hostname) || url.username || url.password || url.search || url.hash || url.pathname !== "/" || url.port === "0" || value !== url.origin) {
    throw new Error("Coding inference must use an explicit HTTP literal loopback origin, without path or credentials");
  }
  return url.origin;
}
export function seedRepository(workspace, fixture) {
  const root = realpathSync(workspace);
  if (!fixture.files || Object.keys(fixture.files).length < 1 || Object.keys(fixture.files).length > 32) throw new Error("Invalid coding fixture files");
  for (const [name, content] of Object.entries(fixture.files)) {
    if (!/^repo\/[a-zA-Z0-9_./-]+$/.test(name) || name.split("/").includes("..") || typeof content !== "string" || Buffer.byteLength(content) > 256000) throw new Error("Unsafe coding fixture member");
    const file = resolve(root, name);
    if (!file.startsWith(root + sep)) throw new Error("Coding fixture escaped workspace");
    mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
    writeFileSync(file, content, { flag: "wx", mode: 0o600 });
  }
}

const OUTPUT_SOURCE_LIMIT = 128 * 1024;
class OutputSnapshotError extends Error {
  constructor(reason) { super(reason); this.reason = reason; }
}
const sameSnapshotStat = (first, second) => ["dev", "ino", "size", "mtimeMs", "ctimeMs"].every(key => first[key] === second[key]);

/** Read bytes only: never import, execute or judge the target's output module. */
export function captureCodingOutputSnapshot(workspace, { secrets = [] } = {}) {
  const base = { schemaVersion: 1, path: "repo/solution.mjs", limitBytes: OUTPUT_SOURCE_LIMIT };
  let original = null, stage = "workspace";
  try {
    const root = realpathSync(resolve(workspace)), repo = join(root, "repo");
    stage = "repository";
    const directory = lstatSync(repo);
    if (directory.isSymbolicLink()) throw new OutputSnapshotError("repository-symlink");
    if (!directory.isDirectory() || realpathSync(repo) !== repo) throw new OutputSnapshotError("repository-not-directory");
    stage = "file";
    const path = join(repo, "solution.mjs"), linkedBefore = lstatSync(path);
    if (linkedBefore.isSymbolicLink()) throw new OutputSnapshotError("file-symlink");
    if (!linkedBefore.isFile()) throw new OutputSnapshotError("file-not-regular");
    if (typeof constants.O_NOFOLLOW !== "number") throw new OutputSnapshotError("nofollow-unavailable");
    const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    let bytes;
    try {
      const before = fstatSync(fd);
      if (!before.isFile()) throw new OutputSnapshotError("file-not-regular");
      if (!sameSnapshotStat(linkedBefore, before)) throw new OutputSnapshotError("file-changed");
      if (!Number.isSafeInteger(before.size) || before.size < 0 || before.size > OUTPUT_SOURCE_LIMIT) throw new OutputSnapshotError("file-too-large");
      const buffer = Buffer.alloc(before.size + 1); let length = 0;
      while (length < buffer.length) {
        const count = readSync(fd, buffer, length, buffer.length - length, null);
        if (!count) break;
        length += count;
      }
      const after = fstatSync(fd), linkedAfter = lstatSync(path);
      if (length !== before.size || !linkedAfter.isFile() || linkedAfter.isSymbolicLink()
        || !sameSnapshotStat(before, after) || !sameSnapshotStat(before, linkedAfter)) throw new OutputSnapshotError("file-changed");
      bytes = buffer.subarray(0, length);
    } finally { closeSync(fd); }
    stage = "repository";
    const directoryAfter = lstatSync(repo);
    if (!directoryAfter.isDirectory() || directoryAfter.isSymbolicLink() || !sameSnapshotStat(directory, directoryAfter)
      || realpathSync(repo) !== repo) throw new OutputSnapshotError("repository-changed");
    original = { sha256: sha256(bytes), bytes: bytes.length };
    stage = "decode";
    // ignoreBOM preserves the actual U+FEFF bytes in the returned source text.
    const source = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
    stage = "redaction";
    if (!Array.isArray(secrets) || secrets.some(secret => typeof secret !== "string")) throw new OutputSnapshotError("invalid-redaction-input");
    let retained = source;
    for (const secret of [...new Set(secrets)].filter(Boolean).sort((a, b) => b.length - a.length)) {
      retained = retained.split(secret).join("[REDACTED]");
      if (Buffer.byteLength(retained, "utf8") > OUTPUT_SOURCE_LIMIT) throw new OutputSnapshotError("retained-text-too-large");
    }
    const retainedBytes = Buffer.from(retained, "utf8");
    return { ...base, status: "captured", reason: null, original,
      retained: { sourceText: retained, sha256: sha256(retainedBytes), bytes: retainedBytes.length },
      fidelity: { atAdapterCapture: retained === source ? "byte-identical" : "synthetic-secrets-redacted",
        digestScope: "before-outer-publication-redaction", publicationMayRedact: true } };
  } catch (error) {
    // File paths and OS errors can themselves carry model-written text. Publish
    // fixed reasons only, never error messages or a partial/encoded source.
    const reason = error instanceof OutputSnapshotError ? error.reason : stage === "decode" ? "invalid-utf8"
      : error?.code === "ENOENT" ? `${stage}-missing` : error?.code === "ELOOP" ? `${stage}-symlink`
        : stage === "redaction" ? "redaction-failed" : `${stage}-unreadable`;
    return { ...base, status: "unavailable", reason, original, retained: null, fidelity: null };
  }
}

// Children stay in the outer comparison runner's process group. This is a
// bounded trusted-fixture runner, not an OS sandbox for adversarial code.
export async function invoke(cli, args, { cwd, env, timeoutMs = 30000, input, signal }) {
  return new Promise((done, reject) => {
    const child = spawn(process.execPath, [cli, ...args], { cwd, env, stdio: [input === undefined ? "ignore" : "pipe", "pipe", "pipe"] });
    let stdout = "", stderr = "", bytes = 0, truncated = false, timedOut = false, hardStop;
    const terminate = () => { child.kill("SIGTERM"); hardStop ??= setTimeout(() => child.kill("SIGKILL"), 2000); };
    signal?.addEventListener("abort", terminate, { once: true });
    const timeout = setTimeout(() => { timedOut = true; terminate(); }, timeoutMs);
    for (const [stream, name] of [[child.stdout, "stdout"], [child.stderr, "stderr"]]) {
      stream.setEncoding("utf8");
      stream.on("data", text => {
        bytes += Buffer.byteLength(text);
        if (bytes > 524288) { truncated = true; child.kill("SIGKILL"); return; }
        if (name === "stdout") stdout += text; else stderr += text;
      });
    }
    const cleanup = () => { clearTimeout(timeout); clearTimeout(hardStop); signal?.removeEventListener("abort", terminate); };
    child.once("error", error => { cleanup(); reject(error); });
    child.once("close", (exitCode, childSignal) => { cleanup(); done({ exitCode, signal: childSignal, stdout, stderr, truncated, timedOut }); });
    if (input !== undefined) { child.stdin.on("error", () => {}); child.stdin.end(input); }
    if (signal?.aborted) terminate();
  });
}
