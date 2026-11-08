import { connect, type Socket } from "node:net";
import Database from "better-sqlite3";
import { chmodSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from "vitest";
import { runBootstrap } from "../src/bootstrap/bootstrap.js";
import { httpGetJson, pickFreePort, startStudioChildProcess } from "../src/e2e/smokeSteps.js";
import { highWaterPath } from "../src/keys/highWater.js";
import { openLedger } from "../src/ledger/ledger.js";
import { runStudioForeground } from "../src/studio/studioSupervisor.js";
import { canonicalize } from "../src/utils/json.js";
import { initWorkspace } from "../src/workspace.js";

// GAP studiostop: `amc e2e smoke` sends SIGTERM and SIGKILLs 10 s later, like a compose or Kubernetes rollout. Studio
// must observe the signal and write STUDIO_RUNTIME_STOPPED inside that window.
const roots: string[] = [];
afterEach(() => {
  vi.unstubAllEnvs();
  while (roots.length > 0) rmSync(roots.pop()!, { recursive: true, force: true });
});

// Every path AMC derives from the user's home or an operator override points into a fresh temporary root, so the
// smoke reproduces on a clean CI runner and never reads or writes the developer's real AMC home, vault or
// checkpoints. The studio child inherits this environment.
const HOME_OVERRIDES = ["AMC_CONTROL_CHECKPOINT_DIR", "AMC_CREDENTIALS_FILE", "AMC_HOST_DIR", "AMC_ROOT", "AMC_VAULT_PASSPHRASE_FILE",
  "AMC_VAULT_REMEMBER_FILE", "XDG_CONFIG_HOME", "XDG_CACHE_HOME"];
// Guard on the isolation itself: the suite's own HOME and AMC_HOME point at an empty sentinel, so a case that stops
// isolating, or product code that grows a new home-derived path, writes there and fails the suite in afterAll.
const sentinel = mkdtempSync(join(tmpdir(), "amc-studio-sentinel-"));
const outerEnv = { HOME: process.env.HOME, AMC_HOME: process.env.AMC_HOME };
function restoreOuterEnv(name: "HOME" | "AMC_HOME"): void {
  if (outerEnv[name] === undefined) delete process.env[name];
  else process.env[name] = outerEnv[name];
}
beforeAll(() => {
  process.env.HOME = join(sentinel, "home");
  process.env.AMC_HOME = join(sentinel, "amc-home");
});
afterAll(() => {
  restoreOuterEnv("HOME");
  restoreOuterEnv("AMC_HOME");
  const leaked = readdirSync(sentinel);
  rmSync(sentinel, { recursive: true, force: true });
  expect(leaked).toEqual([]);
});

function isolatedRoot(prefix: string): string {
  const root = mkdtempSync(join(tmpdir(), prefix));
  roots.push(root);
  const home = join(root, "user-home");
  mkdirSync(home);
  vi.stubEnv("HOME", home);
  vi.stubEnv("USERPROFILE", home);
  vi.stubEnv("AMC_HOME", join(root, "amc-home"));
  for (const name of HOME_OVERRIDES) vi.stubEnv(name, undefined);
  return root;
}

function stopRecorded(workspace: string): boolean {
  const ledger = openLedger(workspace);
  try {
    return ledger.getAllEvents().some((event) => {
      try { return (JSON.parse(event.meta_json) as { auditType?: unknown }).auditType === "STUDIO_RUNTIME_STOPPED"; } catch { return false; }
    });
  } finally {
    ledger.close();
  }
}

/** A long-lived machine's high-water file: the real marks plus `count` more (3.2 MB at 19k on the machine that hung). */
function growHighWater(count: number): void {
  const path = highWaterPath();
  const file = JSON.parse(readFileSync(path, "utf8")) as { entries: Record<string, unknown> };
  const seenAt = new Date().toISOString();
  for (let i = 0; i < count; i += 1) file.entries[`key-history:filler-${i}@${i.toString(16).padStart(16, "0")}`] = { sequence: 1, sha256: "c".repeat(64), seenAt };
  writeFileSync(path, canonicalize(file));
  chmodSync(path, 0o600);
}

/** The newest gateway session: sealed, ended, and sealed at the hash of its own last event. */
function gatewaySeal(workspace: string): { sealed: boolean; ended: boolean; finalIsLastEvent: boolean } {
  const db = new Database(join(workspace, ".amc", "evidence.sqlite"), { readonly: true });
  try {
    const row = db.prepare("SELECT session_id, ended_ts, session_final_event_hash, session_seal_sig FROM sessions WHERE runtime = 'gateway' ORDER BY started_ts DESC LIMIT 1")
      .get() as { session_id: string; ended_ts: number | null; session_final_event_hash: string | null; session_seal_sig: string | null };
    const last = db.prepare("SELECT event_hash FROM evidence_events WHERE session_id = ? ORDER BY rowid DESC LIMIT 1").get(row.session_id) as { event_hash: string };
    return { sealed: row.session_seal_sig !== null, ended: row.ended_ts !== null, finalIsLastEvent: row.session_final_event_hash === last.event_hash };
  } finally {
    db.close();
  }
}

async function openIncompleteRequest(port: number): Promise<Socket> {
  const socket = connect(port, "127.0.0.1");
  await new Promise<void>((resolvePromise, rejectPromise) => { socket.once("connect", () => resolvePromise()); socket.once("error", rejectPromise); });
  socket.on("error", () => undefined);
  socket.write("GET /healthz HTTP/1.1\r\nHost: 127.0.0.1\r\n"); // headers never finish, so the server cannot call it idle
  return socket;
}

describe("Studio SIGTERM grace period", () => {
  test("the studio child, started as the smoke starts it, exits on SIGTERM well inside 10 s and records its stop", async () => {
    const root = isolatedRoot("amc-studio-sigterm-");
    const workspace = join(root, "workspace");
    const host = "127.0.0.1";
    const [apiPort, gatewayPort, proxyPort, metricsPort, dashboardPort] = [await pickFreePort(host), await pickFreePort(host), await pickFreePort(host), await pickFreePort(host), await pickFreePort(host)];
    const vaultPassphrase = "amc-sigterm-passphrase-12345";
    await runBootstrap({
      workspace, vaultPassphrase, ownerUsername: "owner", ownerPassword: "owner-password", lanMode: false, bind: host, studioPort: apiPort,
      allowedCidrs: ["127.0.0.1/32", "::1/128"], enableNotary: false, notaryBaseUrl: "http://127.0.0.1:4343", notaryRequiredAttestation: "SOFTWARE", notaryAuthSecret: null
    });
    expect(highWaterPath().startsWith(root)).toBe(true);
    growHighWater(20_000);
    const studio = await startStudioChildProcess({ repoRoot: process.cwd(), workspace, host, apiPort, dashboardPort, gatewayPort, proxyPort, metricsPort, vaultPassphrase });
    // Signature-heavy work in flight when the signal lands, as the scheduler tick or a ToolHub intent would be.
    const busy = Array.from({ length: 4 }, () => httpGetJson(`http://${host}:${apiPort}/readyz`));
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 200));
    const started = Date.now();
    await studio.close();
    const elapsed = Date.now() - started;
    await Promise.all(busy);
    expect(studio.child.signalCode).toBeNull();
    expect(studio.child.exitCode).toBe(0);
    expect(elapsed).toBeLessThan(5_000);
    expect(stopRecorded(workspace)).toBe(true);
  }, 180_000);

  // LIVE-RUNTIME-02: a second SIGTERM during shutdown (a double Ctrl+C, an impatient supervisor) no longer kills the
  // process mid-stop; it is absorbed, the stop finishes and seals the gateway session, and the exit is 0.
  test("a second SIGTERM during shutdown is absorbed: exit 0 and the gateway session sealed at its last event", async () => {
    const root = isolatedRoot("amc-studio-double-sigterm-");
    const workspace = join(root, "workspace");
    const host = "127.0.0.1";
    const [apiPort, gatewayPort, proxyPort, metricsPort, dashboardPort] = [await pickFreePort(host), await pickFreePort(host), await pickFreePort(host), await pickFreePort(host), await pickFreePort(host)];
    const vaultPassphrase = "amc-double-sigterm-passphrase-12345";
    await runBootstrap({
      workspace, vaultPassphrase, ownerUsername: "owner", ownerPassword: "owner-password", lanMode: false, bind: host, studioPort: apiPort,
      allowedCidrs: ["127.0.0.1/32", "::1/128"], enableNotary: false, notaryBaseUrl: "http://127.0.0.1:4343", notaryRequiredAttestation: "SOFTWARE", notaryAuthSecret: null
    });
    const studio = await startStudioChildProcess({ repoRoot: process.cwd(), workspace, host, apiPort, dashboardPort, gatewayPort, proxyPort, metricsPort, vaultPassphrase });
    const exited = new Promise<void>((resolvePromise) => studio.child.once("exit", () => resolvePromise()));
    const started = Date.now();
    studio.child.kill("SIGTERM");
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 50)); // well inside the stop: it seals and closes the ledger
    studio.child.kill("SIGTERM");
    await Promise.race([exited, new Promise((resolvePromise) => setTimeout(resolvePromise, 15_000))]);
    const elapsed = Date.now() - started;
    if (studio.child.exitCode === null && studio.child.signalCode === null) studio.child.kill("SIGKILL");
    expect(studio.child.signalCode, "the second signal did not kill the process").toBeNull();
    expect(studio.child.exitCode).toBe(0);
    expect(elapsed).toBeLessThan(6_000);
    expect(gatewaySeal(workspace)).toEqual({ sealed: true, ended: true, finalIsLastEvent: true });
  }, 180_000);

  // LIVE-RUNTIME-02: stop() closes the servers concurrently, so the API's bounded drain (8 s for a stuck socket) no
  // longer holds the gateway's seal behind it.
  test("stop() seals the gateway session while the API is still draining", async () => {
    const root = isolatedRoot("amc-studio-parallel-stop-");
    const workspace = join(root, "workspace");
    mkdirSync(workspace);
    vi.stubEnv("AMC_VAULT_PASSPHRASE", "parallel-stop-passphrase");
    initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
    const runtime = await runStudioForeground({ workspace, apiPort: 0, gatewayPort: 0, proxyPort: 0, dashboardPort: 0, metricsPort: 0 });
    const socket = await openIncompleteRequest(runtime.state.apiPort);
    try {
      const stopping = runtime.stop();
      const deadline = Date.now() + 3_000;
      let sealed = false;
      while (!sealed && Date.now() < deadline) {
        await new Promise((resolvePromise) => setTimeout(resolvePromise, 100));
        sealed = gatewaySeal(workspace).sealed;
      }
      expect(sealed, "the gateway sealed before the API's drain ended").toBe(true);
      await stopping;
      expect(gatewaySeal(workspace)).toEqual({ sealed: true, ended: true, finalIsLastEvent: true });
    } finally {
      socket.destroy();
    }
  }, 60_000);

  test("stop() records STUDIO_RUNTIME_STOPPED before the bounded socket drain, not after it", async () => {
    const root = isolatedRoot("amc-studio-stop-order-");
    expect(highWaterPath().startsWith(root)).toBe(true);
    const workspace = join(root, "workspace");
    mkdirSync(workspace);
    vi.stubEnv("AMC_VAULT_PASSPHRASE", "stop-order-passphrase");
    initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
    const runtime = await runStudioForeground({ workspace, apiPort: 0, gatewayPort: 0, proxyPort: 0, dashboardPort: 0, metricsPort: 0 });
    const socket = await openIncompleteRequest(runtime.state.apiPort);
    try {
      const stopping = runtime.stop();
      const deadline = Date.now() + 2_000; // the drain alone waits 8 s for this socket
      let recorded = false;
      while (!recorded && Date.now() < deadline) {
        await new Promise((resolvePromise) => setTimeout(resolvePromise, 100));
        recorded = stopRecorded(workspace);
      }
      expect(recorded).toBe(true);
      await stopping;
    } finally {
      socket.destroy();
    }
  }, 60_000);
});
