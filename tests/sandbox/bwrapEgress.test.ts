/**
 * The Linux egress relay's parts that run on any OS: the relay script and the proxy's Unix-socket mode end to end
 * (no Bubblewrap, no namespace, so this is NOT Linux confinement evidence), and the socket-file refusal.
 * The generated Bubblewrap arguments and socket filter are compared in confinementNoLooser.test.ts.
 */
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { createServer as createSocketServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { RELAY_NODE, RELAY_SOURCE, prepareRelayDirectory, refuseSocketFiles, relayCommand } from "../../src/sandbox/bwrapEgress.js";
import { startPolicyEgress } from "../../src/sandbox/egress/sessionEgress.js";
import { initWorkspace } from "../../src/workspace.js";

let root: string, workspace: string, origin: Server, port: number;
beforeEach(async () => {
  root = realpathSync(mkdtempSync(join(tmpdir(), "amc-relay-")));
  vi.stubEnv("AMC_CONTROL_CHECKPOINT_DIR", join(root, "checkpoints"));
  workspace = join(root, "workspace");
  initWorkspace({ workspacePath: workspace, agentId: "default", trustBoundaryMode: "isolated" });
  origin = createServer((req, res) => { req.resume(); res.writeHead(200).end("relayed"); });
  await new Promise<void>(done => origin.listen(0, "127.0.0.1", done));
  port = (origin.address() as { port: number }).port;
});
afterEach(async () => {
  origin.closeAllConnections();
  await new Promise<void>(done => origin.close(() => done()));
  vi.unstubAllEnvs();
  rmSync(root, { recursive: true, force: true });
});

test("the relay forwards to the proxy's Unix socket and runs the command with the proxy set", async () => {
  const dir = join(root, "egress");
  mkdirSync(dir, { mode: 0o700 });
  const rows: unknown[] = [];
  const proxy = (await startPolicyEgress({ writableRoots: [], timeoutMs: 5_000, allowHosts: [`127.0.0.1:${port}`],
    onEgress: row => rows.push(row), egressScope: { workspace, agentId: "default" } }, join(dir, "proxy.sock")))!;
  try {
    expect(proxy.url).toBeNull();
    writeFileSync(join(dir, "relay.mjs"), RELAY_SOURCE);
    const program = `fetch("http://127.0.0.1:${port}/x").then(async r=>{console.log(r.status,await r.text());return fetch("http://127.0.0.1:${port + 1}/y")}).then(r=>console.log("second",r.status),e=>console.log("second failed"));`;
    // relayCommand names the in-sandbox mount; here the same arguments point at the local directory.
    const argv = relayCommand([process.execPath, "-e", program]).map(arg => arg.replace("/amc-egress/node", process.execPath).replace("/amc-egress", dir));
    const run = await new Promise<{ status: number | null; stdout: string }>(done => {
      // Async spawn: the proxy in this process must keep answering while the relay runs.
      const child = spawn(argv[0]!, argv.slice(1), { env: { PATH: process.env.PATH ?? "", AMC_EGRESS_TOKEN: proxy.token } });
      let stdout = ""; child.stdout.on("data", chunk => { stdout += chunk; });
      child.on("exit", status => done({ status, stdout }));
    });
    expect(run.stdout).toContain("200 relayed");
    // Node's fetch tunnels http:// through CONNECT too, so the refusal ends that request.
    expect(run.stdout).toContain("second failed");
    expect(run.status).toBe(0);
    expect(proxy.refusals()).toEqual([expect.stringContaining(`blocked a network connection to 127.0.0.1 port ${port + 1}`)]);
  } finally { proxy.close(); }
});

test("the relay passes the command's exit status through", () => {
  const dir = mkdtempSync(join(root, "relay-"));
  writeFileSync(join(dir, "relay.mjs"), RELAY_SOURCE);
  const run = spawnSync(process.execPath, [join(dir, "relay.mjs"), join(dir, "absent.sock"), "/bin/sh", "-c", "exit 7"], { encoding: "utf8" });
  expect(run.status).toBe(7);
});

test("a workspace holding a socket file is refused; links are not followed", async () => {
  const tree = join(root, "tree");
  mkdirSync(join(tree, "a", "b"), { recursive: true });
  writeFileSync(join(tree, "a", "file.txt"), "x");
  symlinkSync("/var/run", join(tree, "a", "outside-link"));
  expect(() => refuseSocketFiles(tree)).not.toThrow();
  const server = createSocketServer();
  await new Promise<void>(done => server.listen(join(tree, "a", "b", "s.sock"), done));
  try {
    expect(() => refuseSocketFiles(tree)).toThrow(/holds a socket file/);
  } finally { server.close(); }
  expect(() => refuseSocketFiles(tree, 3)).toThrow(/too many files/);
});

test("the relay folder holds the script and an empty mount point for Node; Node itself is bound, never copied", () => {
  const dir = join(root, "relay-dir");
  mkdirSync(dir, { mode: 0o700 });
  prepareRelayDirectory(dir);
  expect(statSync(join(dir, "node")).size).toBe(0);
  expect(statSync(join(dir, "node")).mode & 0o777).toBe(0o400);
  expect(readFileSync(join(dir, "relay.mjs"), "utf8")).toBe(RELAY_SOURCE);
  expect(relayCommand(["/bin/true"])[0]).toBe(RELAY_NODE);
});
