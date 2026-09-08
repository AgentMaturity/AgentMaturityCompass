import { createHash } from "node:crypto";
import { closeSync, constants, existsSync, fstatSync, openSync, readSync, readFileSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const VERSION = "2026-09-08";
export const directory = dirname(fileURLToPath(import.meta.url));
export function jsonFile(path, limit = 32 * 1024 * 1024) {
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const before = fstatSync(fd);
    if (!before.isFile() || before.size > limit) throw new Error("Fixture input is nonregular or exceeds its byte limit");
    const bytes = Buffer.alloc(before.size + 1); let offset = 0;
    while (offset < bytes.length) { const count = readSync(fd, bytes, offset, bytes.length - offset, null); if (!count) break; offset += count; }
    if (offset !== before.size || fstatSync(fd).size !== before.size) throw new Error("Fixture input changed during read");
    return JSON.parse(bytes.subarray(0, offset).toString("utf8"));
  } finally { closeSync(fd); }
}
export function filePin(path) {
  const canonical = realpathSync(path), fd = openSync(canonical, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const before = fstatSync(fd);
    if (!before.isFile() || before.size > 512 * 1024 * 1024) throw new Error("Runtime pin must be a bounded regular file");
    const hash = createHash("sha256"), buffer = Buffer.alloc(65536); let offset = 0;
    for (;;) { const count = readSync(fd, buffer, 0, buffer.length, null); if (!count) break; offset += count; if (offset > 512 * 1024 * 1024) throw new Error("Runtime pin grew beyond its bound"); hash.update(buffer.subarray(0, count)); }
    const after = fstatSync(fd);
    if (offset !== before.size || after.size !== before.size || after.mtimeMs !== before.mtimeMs) throw new Error("Runtime pin changed while hashing");
    return { path: canonical, sha256: hash.digest("hex") };
  } finally { closeSync(fd); }
}
export function verifyInventory(path) {
  const inventory = jsonFile(path);
  if (inventory.schemaVersion !== VERSION || !Array.isArray(inventory.files) || inventory.files.length === 0 || inventory.files.length > 50000) throw new Error("Unsupported installed runtime inventory");
  for (const pin of inventory.files) if (filePin(pin.path).sha256 !== pin.sha256) throw new Error("Installed runtime bytes changed from the materialized inventory");
  for (const edge of inventory.resolutions ?? []) if (dependencyRoot(edge.from, edge.name) !== edge.resolved) throw new Error("Installed dependency resolution changed from the materialized inventory");
  return inventory;
}
export function dependencyRoot(from, name) {
  const require = createRequire(join(from, "package.json"));
  for (const searchPath of require.resolve.paths(name) ?? []) {
    const candidate = join(searchPath, name, "package.json");
    if (existsSync(candidate)) {
      const resolved = dirname(realpathSync(candidate)), metadata = jsonFile(join(resolved, "package.json"));
      if (metadata.name === name) return resolved;
    }
  }
  return null;
}
export async function runtime(cli, workspace, passphrase) {
  const root = dirname(dirname(realpathSync(cli)));
  const { runProcess } = await import(pathToFileURL(join(root, "dist/exec/runProcess.js")).href);
  const Database = createRequire(join(root, "package.json"))("better-sqlite3");
  // No ambient provider, signing-disable, proxy, preload, or credential variables.
  const env = { HOME: workspace, USERPROFILE: workspace, XDG_CONFIG_HOME: workspace,
    XDG_CACHE_HOME: workspace, TMPDIR: workspace, TEMP: workspace, TMP: workspace,
    PATH: `${dirname(process.execPath)}:/usr/bin:/bin`, LANG: "C", NO_COLOR: "1", CI: "1",
    AMC_VAULT_PASSPHRASE: passphrase };
  const active = new Set();
  const startProgram = (program, args, timeoutMs = 30000) => {
    const child = runProcess({ argv: [process.execPath, "--import", join(directory, "nativeNoNetwork.mjs"), program, ...args],
      cwd: workspace, env, stdin: "ignore", stdout: "capture", stderr: "capture", maxCaptureBytes: 262144,
      scrubValues: [passphrase], graceMs: 500, timeoutMs });
    active.add(child); child.done.then(() => active.delete(child), () => active.delete(child));
    return child;
  };
  const start = (args, timeoutMs) => startProgram(cli, args, timeoutMs);
  const collect = async (label, args, child) => {
    const outcome = await child.done;
    if (!outcome.treeExitProven) child.terminate("dispose");
    if (!outcome.treeExitProven || outcome.stdout.droppedBytes || outcome.stderr.droppedBytes) throw new Error(`Command ${label} has incomplete capture or unproven process cleanup`);
    let json = null;
    try { json = JSON.parse(outcome.stdout.text); } catch { /* init has human-readable output; oracle requires JSON where applicable. */ }
    return { label, args, ...outcome, json };
  };
  const run = (label, args, timeoutMs) => collect(label, args, start(args, timeoutMs));
  const runSdk = fixture => collect("sdk", ["installed-public-sdk", cli, workspace, fixture],
    startProgram(join(directory, "nativeSdkFixture.mjs"), [cli, workspace, fixture], 60000));
  const rows = (sessionId) => {
    const db = new Database(join(workspace, ".amc/evidence.sqlite"), { readonly: true, fileMustExist: true });
    try { return sessionId === undefined
      ? db.prepare("SELECT * FROM evidence_events ORDER BY rowid").all()
      : db.prepare("SELECT * FROM evidence_events WHERE session_id = ? ORDER BY rowid").all(sessionId); }
    finally { db.close(); }
  };
  return { run, runSdk, start, rows, Database, root,
    async dispose() {
      const pending = [...active]; for (const child of pending) child.terminate("dispose");
      const outcomes = await Promise.allSettled(pending.map(child => child.done));
      if (outcomes.some(row => row.status === "rejected" || !row.value.treeExitProven)) throw new Error("Fixture subprocess cleanup could not be proven");
    } };
}
export function briefRows(rows) { return rows.map(row => ({ id: row.id, hash: row.event_hash, type: row.event_type, signatureSha256: createHash("sha256").update(row.writer_sig).digest("hex") })); }
export function fixturePath(workspace, name) { return resolve(workspace, name); }
export function loadPassphrase(workspace) { return readFileSync(fixturePath(workspace, ".native-vault-fixture"), "utf8"); }
export function requiredJson(command) {
  if (command.exitCode !== 0 || command.json === null) throw new Error(`Native command ${command.label} did not produce successful structured output`);
  return command.json;
}
