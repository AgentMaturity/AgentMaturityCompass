import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { afterEach, describe, expect, test } from "vitest";
import { initWorkspace } from "../../src/workspace.js";
import { SessionService } from "../../src/session/sessionService.js";

/**
 * P2.2 requires a MEASURED throughput floor for a streaming turn "without
 * unbounded write-queue growth" (plan §P2.2 Verify).
 *
 * The design keeps a per-event Ed25519 signature and chains each session event
 * to the prior event's committed hash — which makes intra-step batching
 * impossible (event N's hashed content commits to event N-1's post-insert
 * hash), so every event is its own transaction. That is a deliberate choice:
 * it gives the TIGHTEST possible crash-loss bound (at most one event), and the
 * measured rate has ample headroom over a real streaming turn (~50-100
 * events/sec).
 *
 * The floors here are set well below the medians measured on the dev machine
 * (~2,000 ev/s control-plane, ~640 ev/s blob-backed content) so the gate proves
 * the property without being flaky on slower CI hardware. Its real job is the
 * second assertion: that throughput does NOT collapse as the session grows,
 * which is what caught the O(n^2) blob-index re-read.
 */
const PASS = "session-spine-perf-passphrase";
const roots: string[] = [];

afterEach(() => {
  while (roots.length > 0) {
    const workspace = roots.pop();
    if (workspace) rmSync(workspace, { recursive: true, force: true });
  }
});

function newWorkspace(): string {
  const prior = process.env["AMC_VAULT_PASSPHRASE"];
  process.env["AMC_VAULT_PASSPHRASE"] = PASS;
  const workspace = mkdtempSync(join(tmpdir(), "amc-spine-perf-"));
  roots.push(workspace);
  initWorkspace({ workspacePath: workspace, agentId: "default", trustBoundaryMode: "isolated" });
  if (prior === undefined) {
    // Leave it set for the duration; afterEach workspaces are torn down and the
    // env is process-local to this test file's run.
  }
  return workspace;
}

function openService(workspace: string): SessionService {
  const svc = new SessionService(workspace);
  svc.open({
    sessionId: "perf",
    agentId: "a",
    harnessVersion: "1",
    compositionDigest: "0".repeat(64),
    policyDigest: "0".repeat(64)
  });
  svc.startTurn({ trigger: "user" });
  svc.startStep();
  return svc;
}

describe("session spine throughput", () => {
  test("blob-backed content events sustain the floor and do not degrade super-linearly", () => {
    const svc = openService(newWorkspace());
    const N = 1500;

    const half = N / 2;
    const t0 = performance.now();
    for (let i = 0; i < half; i += 1) {
      svc.recordAssistantBlock({ blockIndex: i, blockKind: "text", stopReason: null, content: `block ${i}` });
    }
    const firstHalfMs = performance.now() - t0;

    const t1 = performance.now();
    for (let i = half; i < N; i += 1) {
      svc.recordAssistantBlock({ blockIndex: i, blockKind: "text", stopReason: null, content: `block ${i}` });
    }
    const secondHalfMs = performance.now() - t1;

    const totalPerSec = (N / (firstHalfMs + secondHalfMs)) * 1000;

    // Floor: comfortably below the ~640 ev/s measured, so CI variance does not
    // make it flaky, but far above a streaming turn's ~50-100 ev/s.
    expect(totalPerSec, `content throughput ${totalPerSec.toFixed(0)} ev/s`).toBeGreaterThan(150);

    // No unbounded growth: with the O(n) blob-index fix, the second half must not
    // be dramatically slower than the first. Before the fix this ratio grew with
    // n (O(n^2)); 3x is generous headroom against noise while still catching a
    // regression back to super-linear.
    expect(
      secondHalfMs,
      `second half ${secondHalfMs.toFixed(0)}ms vs first ${firstHalfMs.toFixed(0)}ms`
    ).toBeLessThan(firstHalfMs * 3);
  });

  test("control-plane events (no blob) sustain the floor and do not degrade super-linearly", () => {
    const svc = openService(newWorkspace());
    const N = 1500;
    const step = (): void => {
      // step markers are inline control-plane events, no blob write.
      svc.startStep();
      svc.endStep({ stopReason: null, usage: { inputTokens: 0, outputTokens: 0, cacheRead: 0, cacheWrite: 0 } });
    };
    const half = N / 2;
    const t0 = performance.now();
    for (let i = 0; i < half; i += 1) step();
    const firstHalfMs = performance.now() - t0;
    const t1 = performance.now();
    for (let i = half; i < N; i += 1) step();
    const secondHalfMs = performance.now() - t1;
    const perSec = ((N * 2) / (firstHalfMs + secondHalfMs)) * 1000;

    // The requirement is headroom over a streaming turn (~50-100 ev/s), not the dev machine's ~2,000 ev/s:
    // a 500 ev/s floor failed on hosted runners at 247-496 ev/s with no code change. Growth is the regression signal.
    expect(perSec, `control throughput ${perSec.toFixed(0)} ev/s`).toBeGreaterThan(150);
    expect(
      secondHalfMs,
      `second half ${secondHalfMs.toFixed(0)}ms vs first ${firstHalfMs.toFixed(0)}ms`
    ).toBeLessThan(firstHalfMs * 3);
  });
});
