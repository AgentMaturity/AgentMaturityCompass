import { connect, type Socket } from "node:net";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
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

async function openIncompleteRequest(port: number): Promise<Socket> {
  const socket = connect(port, "127.0.0.1");
  await new Promise<void>((resolvePromise, rejectPromise) => { socket.once("connect", () => resolvePromise()); socket.once("error", rejectPromise); });
  socket.on("error", () => undefined);
  socket.write("GET /healthz HTTP/1.1\r\nHost: 127.0.0.1\r\n"); // headers never finish, so the server cannot call it idle
  return socket;
}

describe("Studio SIGTERM grace period", () => {
  test("the studio child, started as the smoke starts it, exits on SIGTERM well inside 10 s and records its stop", async () => {
    const root = mkdtempSync(join(tmpdir(), "amc-studio-sigterm-"));
    roots.push(root);
    vi.stubEnv("AMC_HOME", join(root, "home"));
    const workspace = join(root, "workspace");
    const host = "127.0.0.1";
    const [apiPort, gatewayPort, proxyPort, metricsPort, dashboardPort] = [await pickFreePort(host), await pickFreePort(host), await pickFreePort(host), await pickFreePort(host), await pickFreePort(host)];
    const vaultPassphrase = "amc-sigterm-passphrase-12345";
    await runBootstrap({
      workspace, vaultPassphrase, ownerUsername: "owner", ownerPassword: "owner-password", lanMode: false, bind: host, studioPort: apiPort,
      allowedCidrs: ["127.0.0.1/32", "::1/128"], enableNotary: false, notaryBaseUrl: "http://127.0.0.1:4343", notaryRequiredAttestation: "SOFTWARE", notaryAuthSecret: null
    });
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

  test("stop() records STUDIO_RUNTIME_STOPPED before the bounded socket drain, not after it", async () => {
    const workspace = mkdtempSync(join(tmpdir(), "amc-studio-stop-order-"));
    roots.push(workspace);
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
