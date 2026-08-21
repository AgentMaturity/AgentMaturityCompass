import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runAssurance } from "../src/assurance/assuranceRunner.js";
import { loadAssuranceRun } from "../src/assurance/assurancePolicyStore.js";
import { initWorkspace } from "../src/workspace.js";
import { startFakeAgentServer, useFakeAgentEnv, type FakeAgentServer } from "./helpers/fakeAgentServer.js";

/**
 * G2-03: assuranceStore, assuranceCertificates and the scheduler all read v1
 * run artifacts, but saveAssuranceRunArtifacts had zero callers — nothing ever
 * wrote them. Certificate issuance therefore failed on every workspace no
 * matter how many scans had run.
 *
 * G5-11: the v1 schema's pack-id enum listed 7 ids while the registry ships
 * 140+, so artifacts for almost every real pack failed validation.
 */
let agent: FakeAgentServer;
let restoreEnv: () => void;
const dirs: string[] = [];

beforeAll(async () => {
  agent = await startFakeAgentServer();
  restoreEnv = useFakeAgentEnv(agent.baseUrl);
});

afterAll(async () => {
  restoreEnv?.();
  await agent?.close();
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

function workspace(): string {
  const dir = mkdtempSync(join(tmpdir(), "amc-v1chain-"));
  dirs.push(dir);
  initWorkspace(dir);
  return dir;
}

describe("assurance v1 artifact chain", () => {
  it("writes v1 run artifacts that the store can read back", async () => {
    const ws = workspace();
    const report = await runAssurance({
      workspace: ws,
      agentId: "default",
      mode: "supervise",
      window: "14d",
      packId: "injection",
      noSign: true
    });

    // The chain's entry point: the store must find what the runner wrote.
    const stored = loadAssuranceRun(ws, report.assuranceRunId);
    expect(stored).not.toBeNull();
    expect(stored?.runId).toBe(report.assuranceRunId);
    expect(stored?.selectedPacks).toContain("injection");
  });

  it("records findings and trace refs alongside the run", async () => {
    const ws = workspace();
    const report = await runAssurance({
      workspace: ws,
      agentId: "default",
      mode: "supervise",
      window: "14d",
      packId: "injection",
      noSign: true
    });

    const runDir = join(ws, ".amc", "assurance", "runs", report.assuranceRunId);
    expect(existsSync(join(runDir, "findings.json"))).toBe(true);
    expect(existsSync(join(runDir, "trace.refs.json"))).toBe(true);

    const refs = JSON.parse(readFileSync(join(runDir, "trace.refs.json"), "utf8")) as {
      refs: Array<{ scenarioId: string; inputHash: string; outputHash: string }>;
    };
    // Every scenario the scan ran should be traceable.
    expect(refs.refs.length).toBeGreaterThan(0);
    expect(refs.refs[0]?.inputHash).toMatch(/^[a-f0-9]{64}$/);
    expect(refs.refs[0]?.outputHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("accepts pack ids beyond the seven the v1 enum listed", async () => {
    const ws = workspace();
    // 'context-leakage' was in the legacy enum; this pack was not.
    const report = await runAssurance({
      workspace: ws,
      agentId: "default",
      mode: "supervise",
      window: "14d",
      packId: "multi-turn-deep-eval",
      noSign: true
    });
    const stored = loadAssuranceRun(ws, report.assuranceRunId);
    expect(stored?.selectedPacks).toContain("multi-turn-deep-eval");
  });
});

describe("certificate issuance over the restored chain", () => {
  it("can issue a certificate from a scan's artifacts", async () => {
    const ws = workspace();
    const report = await runAssurance({
      workspace: ws,
      agentId: "default",
      mode: "supervise",
      window: "14d",
      packId: "injection",
      noSign: true
    });

    // Previously impossible: the store had nothing to read, so issuance threw
    // on every workspace regardless of how many scans had run.
    // Certificates are policy-bound, so the workspace needs its assurance policy.
    const { initAssurancePolicy } = await import("../src/assurance/assurancePolicyStore.js");
    initAssurancePolicy(ws);

    const { issueAssuranceCertificate } = await import("../src/assurance/assuranceCertificates.js");

    // The run artifacts now exist, so issuance reaches its real evidence gate
    // instead of dying because the store had nothing to read. A scan against a
    // direct endpoint has no gateway-captured evidence, so the gate correctly
    // refuses — the point is that it is now the gate talking, not a missing file.
    await expect(
      issueAssuranceCertificate({ workspace: ws, runId: report.assuranceRunId, noSign: true } as never)
    ).rejects.toThrow(/evidence gates failed/i);

    // Specifically: not a "run not found" / "no such file" failure any more.
    await expect(
      issueAssuranceCertificate({ workspace: ws, runId: report.assuranceRunId, noSign: true } as never)
    ).rejects.not.toThrow(/not found|ENOENT/i);
  });
});
