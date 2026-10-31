import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import { AgentResponderUnavailableError } from "../src/assurance/agentResponder.js";
import { runAssurance } from "../src/assurance/assuranceRunner.js";
import { initGatewayConfig, loadGatewayConfig } from "../src/gateway/config.js";
import { deriveTrustSummaryFromRun } from "../src/governor/actionPolicyEngine.js";
import { openLedger } from "../src/ledger/ledger.js";
import { measureProcessConfinement, type ConfinementMeasurement } from "../src/sandbox/processConfinement.js";
import type { DiagnosticReport } from "../src/types.js";
import { initWorkspace } from "../src/workspace.js";
import { observedRunReport } from "./helpers/actionPolicyFixtures.js";

/**
 * Security review 2026-10-31 (probe 1): `amc assurance run` defaults to --mode sandbox and wrote a
 * SANDBOX_EXECUTION_ENABLED row on a workspace with no sandbox at all. That row is what lifts an agent to
 * OBSERVED_HARDENED and satisfies requireSandboxForExecute. Now the row is written only when an OS boundary is measured
 * around the run, carrying the backend and the digest of its confinement receipt, and readers refuse a bare row.
 */
vi.mock("../src/sandbox/processConfinement.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/sandbox/processConfinement.js")>();
  return { ...actual, measureProcessConfinement: vi.fn(actual.measureProcessConfinement) };
});

const dirs: string[] = [];
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  while (dirs.length > 0) rmSync(dirs.pop()!, { recursive: true, force: true });
});

function workspace(): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "amc-sandbox-attest-")));
  dirs.push(dir);
  initWorkspace({ workspacePath: dir, trustBoundaryMode: "isolated" });
  return dir;
}

/** Runs one pack in sandbox mode with no reachable agent: the run aborts after its attestation step, before any pack. */
async function sandboxRun(dir: string): Promise<void> {
  vi.stubEnv("AMC_AGENT_BASE_URL", "http://127.0.0.1:9/unreachable");
  for (const key of ["OPENAI_API_KEY", "ANTHROPIC_API_KEY", "GEMINI_API_KEY", "GOOGLE_API_KEY"]) vi.stubEnv(key, "");
  await expect(runAssurance({ workspace: dir, agentId: "default", packId: "injection", mode: "sandbox", window: "14d", model: "offline-model" }))
    .rejects.toBeInstanceOf(AgentResponderUnavailableError);
}

function sandboxRows(dir: string): Array<Record<string, unknown>> {
  const ledger = openLedger(dir);
  try {
    return ledger.getAllEvents().map((row) => JSON.parse(row.meta_json) as Record<string, unknown>)
      .filter((meta) => meta.auditType === "SANDBOX_EXECUTION_ENABLED");
  } finally {
    ledger.close();
  }
}

const CONFINED: ConfinementMeasurement = {
  verdict: "confined", declaredProbeDir: "/private/var/amc-denied",
  probe: { path: "/private/var/amc-denied/.amc-confinement-probe-1-abc", result: "refused", code: "EPERM" },
  reason: "the OS refused this process's write to /private/var/amc-denied/.amc-confinement-probe-1-abc (EPERM) in a directory it owns and may write by mode"
};

describe("the assurance runner attests a sandbox only when one confined the run", () => {
  test("an unconfined --mode sandbox run writes no SANDBOX_EXECUTION_ENABLED row and says it ran unconfined", async () => {
    const dir = workspace();
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    await sandboxRun(dir);
    expect(sandboxRows(dir)).toEqual([]);
    expect(stderr.mock.calls.map((call) => String(call[0])).join("")).toMatch(/assurance run is unconfined/);
  });

  test("an unconfined run is never labelled OBSERVED_HARDENED, even behind a deny-by-default proxy", async () => {
    const dir = workspace();
    const gateway = loadGatewayConfig(dir);
    initGatewayConfig(dir, { ...gateway, proxy: { ...gateway.proxy, enabled: true, denyByDefault: true } });
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    await sandboxRun(dir);
    const ledger = openLedger(dir);
    try {
      const tiers = ledger.getAllEvents().map((row) => JSON.parse(row.meta_json) as Record<string, unknown>)
        .filter((meta) => meta.auditType === "ASSURANCE_RUN_STARTED").map((meta) => meta.trustTier);
      expect(tiers).toEqual(["OBSERVED"]);
    } finally {
      ledger.close();
    }
  });

  test("a run the OS confines writes the row with its backend and the digest of its confinement receipt", async () => {
    const dir = workspace();
    vi.mocked(measureProcessConfinement).mockReturnValue(CONFINED);
    await sandboxRun(dir);
    const [row, ...rest] = sandboxRows(dir);
    expect(rest).toEqual([]);
    expect(row).toMatchObject({ auditType: "SANDBOX_EXECUTION_ENABLED", sandboxBackend: "process-confinement", confinement: CONFINED });
    expect(row?.confinementReceiptSha256).toMatch(/^[0-9a-f]{64}$/);
    const { isSandboxAttestation } = await import("../src/governor/sandboxEvidence.js");
    expect(isSandboxAttestation(row!)).toBe(true);
  });
});

describe("readers refuse a sandbox row without its backend and receipt digest", () => {
  const fielded = { auditType: "SANDBOX_EXECUTION_ENABLED", sandboxBackend: "docker", confinementReceiptSha256: "a".repeat(64) };

  test("the shared predicate", async () => {
    const { isSandboxAttestation } = await import("../src/governor/sandboxEvidence.js");
    expect(isSandboxAttestation(fielded)).toBe(true);
    expect(isSandboxAttestation({ auditType: "SANDBOX_EXECUTION_ENABLED", severity: "LOW" })).toBe(false);
    expect(isSandboxAttestation({ ...fielded, sandboxBackend: "none" })).toBe(false);
    expect(isSandboxAttestation({ ...fielded, sandboxBackend: "" })).toBe(false);
    expect(isSandboxAttestation({ ...fielded, confinementReceiptSha256: "not-a-digest" })).toBe(false);
    expect(isSandboxAttestation({ ...fielded, auditType: "SANDBOX_NETWORK_CLEANUP_OK" })).toBe(false);
  });

  test("the diagnostic's high-risk L5 cap reads only an attested row", async () => {
    const { hasSandboxAttestation } = await import("../src/diagnostic/runner.js");
    const event = (meta: Record<string, unknown>) => ({ event_type: "audit", meta }) as unknown as Parameters<typeof hasSandboxAttestation>[0][number];
    expect(hasSandboxAttestation([event({ auditType: "SANDBOX_EXECUTION_ENABLED", severity: "LOW" })])).toBe(false);
    expect(hasSandboxAttestation([event(fielded)])).toBe(true);
  });

  // PENDING (integrator): the trust-summary row filter lives in src/governor/actionPolicyEngine.ts, which the
  // trust-rule lane owns. Until `meta.auditType === "SANDBOX_EXECUTION_ENABLED"` there becomes
  // `isSandboxAttestation(meta)`, a bare row still counts; this expected failure flips red when that line lands.
  test("the governor's trust summary ignores a bare row", () => {
    const dir = workspace();
    const run = { ...observedRunReport("default"), windowStartTs: 0, windowEndTs: Date.now() + 60_000 } as DiagnosticReport;
    const ledger = openLedger(dir);
    try {
      ledger.startSession({ sessionId: "bare-sandbox-row", runtime: "unknown", binaryPath: "test", binarySha256: "test" });
      ledger.appendEvidence({ sessionId: "bare-sandbox-row", runtime: "unknown", eventType: "audit", payload: "{}", payloadExt: "json", inline: true,
        meta: { auditType: "SANDBOX_EXECUTION_ENABLED", severity: "LOW", agentId: "default", trustTier: "OBSERVED" } });
      ledger.sealSession("bare-sandbox-row");
    } finally {
      ledger.close();
    }
    expect(deriveTrustSummaryFromRun(dir, "default", run).sandboxEvidence).toBe(false);
  });
});
