import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { lstatSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, resolve, sep } from "node:path";

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
