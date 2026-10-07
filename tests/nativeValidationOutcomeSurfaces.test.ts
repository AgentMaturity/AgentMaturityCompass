import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { tmpdir } from "node:os";
import { afterEach, expect, test, vi } from "vitest";
import { lockVault } from "../src/vault/vault.js";
import { readAgentRunSummary, verifyAgentRun, type AgentRunSummary } from "../src/agent/runReport.js";
import { loadSessionEventHistory } from "../src/sdk/nativeAgentClient.js";
import { readNativeTaskProjection } from "../src/studio/nativeTaskProjection.js";
import { renderTaskValidation } from "../src/console/assets/nativeTasksView.js";
import type { NativeTaskView } from "../src/studio/nativeTaskTypes.js";
import { observeFixtureApprovals, validationOperatorFixture } from "./helpers/nativeValidationOperator.js";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) { lockVault(join(root, "workspace")); rmSync(root, { recursive: true, force: true }); } vi.unstubAllEnvs(); });
const cases = (["CLI", "SDK", "Studio"] as const).flatMap(surface =>
  (["success", "nonzero", "denied", "budget"] as const).map(mode => ({ surface, mode })));

// Darwin-only source coverage of the shipped shell path, not confinement proof.
// Other OSes need their separately pinned actual launchers; no simulated Linux
// permit or successful fallback is introduced by this fixture.
test.runIf(process.platform === "darwin").each(cases)("Darwin $surface public validation reports $mode, preserves its actual output reference and survives cold inspection", async ({ surface, mode }) => {
  const base = realpathSync(mkdtempSync(join(tmpdir(), "amc-validation-outcome-"))); roots.push(base);
  const workspace = join(base, "workspace"), home = join(base, "home"); mkdirSync(home, { mode: 0o700 });
  const pass = "synthetic-public-validation-outcome-vault";
  vi.stubEnv("AMC_VAULT_PASSPHRASE", pass); vi.stubEnv("AMC_CONTROL_CHECKPOINT_DIR", join(base, "checkpoints"));
  for (const key of ["AMC_SESSION_STORE", "AMC_EXPECTED_MONITOR_FINGERPRINT", "AMC_NO_SIGN"]) vi.stubEnv(key, undefined);
  const f = validationOperatorFixture(workspace, mode);
  const env = { HOME: home, PATH: process.env.PATH, AMC_VAULT_PASSPHRASE: pass, AMC_CONTROL_CHECKPOINT_DIR: join(base, "checkpoints"), NO_COLOR: "1" };
  const approvals = observeFixtureApprovals(workspace, mode);
  let summary: AgentRunSummary;
  let observerReceipt: ReturnType<typeof approvals.stop>;
  try {
    if (surface === "CLI") {
      const result = await new Promise<{ stdout: string; stderr: string; code: number | null }>((done, reject) => {
        const child = spawn(process.execPath, [resolve("dist/cli.js"), "agent-loop", "run", "Record this synthetic public validation fixture.",
          "--provider", "stub", "--tools", "workspace", "--approve-tools", "WRITE_HIGH", "--approve-risk", "high", "--json",
          "--validation-config", f.checks, "--validation-config-sha256", f.sha256, "--validate", "public", "--unsafe-unconfined-shell"], { cwd: workspace, env, stdio: ["ignore", "pipe", "pipe"] });
        let stdout = "", stderr = "";
        const term = setTimeout(() => child.kill("SIGTERM"), 30000), kill = setTimeout(() => child.kill("SIGKILL"), 33000);
        child.stdout.setEncoding("utf8"); child.stderr.setEncoding("utf8");
        child.stdout.on("data", (text: string) => { stdout += text; if (stdout.length > 1_000_000) child.kill("SIGKILL"); });
        child.stderr.on("data", (text: string) => { stderr += text; if (stderr.length > 1_000_000) child.kill("SIGKILL"); });
        child.once("error", error => { clearTimeout(term); clearTimeout(kill); reject(error); });
        child.once("close", code => { clearTimeout(term); clearTimeout(kill); done({ stdout, stderr, code }); });
      });
      expect(result.code, result.stderr).toBe(mode === "success" ? 0 : 1);
      summary = JSON.parse(result.stdout) as AgentRunSummary;
    } else if (surface === "SDK") {
      const { AMCNativeClient } = await import(pathToFileURL(resolve("dist/sdk/nativeAgentClient.js")).href) as typeof import("../src/sdk/nativeAgentClient.js");
      const client = await AMCNativeClient.start({ workspace, provider: "stub", tools: "workspace", approveTools: "WRITE_HIGH", approveRisk: "high",
        validationConfig: f.checks, validationConfigSha256: f.sha256, validate: ["public"], env, timeoutMs: 30000, allowUnconfinedShell: true });
      try {
        const session = await client.newSession(), result = await session.prompt("Record this synthetic public validation fixture.").result;
        expect(result.state).toBe("completed"); expect(result.stopReason).toBe("end_turn"); expect(result.verification).toBe("not-verified");
        await client.close(); summary = readAgentRunSummary(workspace, session.sessionId, "idle");
        expect(result.validation).toEqual(summary.validation);
      } finally { await client.close(); }
    } else {
      const { createNativeTaskService } = await import(pathToFileURL(resolve("dist/studio/nativeTaskService.js")).href) as typeof import("../src/studio/nativeTaskService.js");
      const service = createNativeTaskService({ workspace, validationConfig: f.checks, environment: { ...env, AMC_UNSAFE_UNCONFINED_SHELL: "1" }, credentialsHome: home });
      const actor = { principalId: "automated-validation-fixture", agentId: "default", demo: false };
      let task: NativeTaskView;
      try {
        task = await service.start(actor, { clientRequestId: randomUUID(), agentId: "default", provider: "stub", tools: "workspace",
          toolsDigest: f.toolsDigest, validation: { configSha256: f.sha256, checkIds: ["public"] }, prompt: "Record this synthetic public validation fixture." });
        const deadline = Date.now() + 30000;
        do {
          if (Date.now() > deadline) throw new Error("Managed validation did not settle within the fixture deadline.");
          await new Promise(done => setTimeout(done, 50)); task = service.poll(actor, task.taskId).task;
        } while (!["idle", "failed"].includes(task.state));
        expect(task.error).toBeNull(); expect(task.state).toBe("idle"); expect(task.verification).toBe("not-verified");
        const verified = await service.verify(actor, task.taskId, task.revision);
        // No operator pin admits the workspace's monitor key: intact but untrusted, never verified (P0-51).
        expect(verified).toMatchObject({ verification: "failed", error: expect.stringContaining("UNTRUSTED: the recorded evidence is internally consistent") });
        summary = readAgentRunSummary(workspace, task.sessionId!, "idle"); expect(verified.validation).toEqual(summary.validation);
      } finally { await service.close(); }
      const cold = createNativeTaskService({ workspace, validationConfig: f.checks, environment: env, credentialsHome: home });
      try { expect(cold.poll(actor, task!.taskId).task.validation).toEqual(summary.validation); } finally { await cold.close(); }
    }
  } finally { observerReceipt = approvals.stop(); }
  // The real stub adapter asks for the first offered tool with {text: prompt}
  // once, before its text completion. That separate, invalid bash request is
  // also governed. Do not erase it or pretend validation was a model tool call.
  expect(observerReceipt.errors).toEqual([]); expect(observerReceipt.requests).toBe(2);
  expect(observerReceipt.decisions).toBe(mode === "denied" ? 2 : 4);
  const status = mode === "success" ? "passed" : mode === "nonzero" ? "failed" : "unavailable";
  expect(summary.endings.at(-1)?.reason).toBe("complete");
  expect(summary.validation).toMatchObject({ status, configSha256: f.sha256, turn: 1, checks: [{ id: "public", status,
    exitCode: mode === "success" ? 0 : mode === "nonzero" ? 7 : null, reason: mode === "success" ? null : mode === "nonzero" ? "nonzero-exit" : "execution-denied" }] });
  expect(summary.toolCalls).toBe(1);
  expect(f.effect()).toBe(mode === "success" || mode === "nonzero" ? "validation-outcome" : null);
  const history = loadSessionEventHistory({ workspace, sessionId: summary.sessionId, agentId: "default", requireSealed: true });
  const outputId = summary.validation.checks[0]!.outputEventId;
  const checkCallId = summary.validation.checks[0]!.callId;
  const modelCalls = history.events.filter(row => row.event_type === "tool/call").map(row => JSON.parse(row.meta_json));
  expect(modelCalls).toHaveLength(1); expect(modelCalls[0].toolCallId).toMatch(/^stub-call-/);
  expect(modelCalls.some(meta => meta.toolCallId === checkCallId)).toBe(false);
  const approvalsForCheck = history.events.filter(row => row.event_type === "approval/request" && JSON.parse(row.meta_json).toolCallId === checkCallId);
  expect(approvalsForCheck).toHaveLength(1);
  expect(history.events.some(row => row.id === outputId && row.event_type === "audit")).toBe(true);
  const projection = readNativeTaskProjection(workspace, summary.sessionId, "default");
  expect(projection.validation).toEqual(summary.validation);
  expect(projection.validationOutputs[0]?.text).toContain(mode === "budget" ? "daily tool budget exhausted" : mode === "denied" ? "not approved" : "validation-outcome");
  expect(renderTaskValidation({ validation: projection.validation })).toContain(status === "passed" ? "Selected checks passed" : status === "failed" ? "Selected checks failed" : "Validation unavailable");
  const verified = await verifyAgentRun(workspace, summary.sessionId); expect(verified.ok, JSON.stringify(verified)).toBe(true);
}, 45000);

test.runIf(process.platform === "darwin")("Studio refuses a non-private operator credential directory before opening a native session", async () => {
  const base = realpathSync(mkdtempSync(join(tmpdir(), "amc-validation-unsafe-home-"))); roots.push(base);
  const workspace = join(base, "workspace"), home = join(base, "home"); mkdirSync(home, { mode: 0o755 });
  const pass = "synthetic-public-validation-unsafe-home";
  vi.stubEnv("AMC_VAULT_PASSPHRASE", pass); vi.stubEnv("AMC_CONTROL_CHECKPOINT_DIR", join(base, "checkpoints"));
  const f = validationOperatorFixture(workspace, "success");
  const { createNativeTaskService } = await import(pathToFileURL(resolve("dist/studio/nativeTaskService.js")).href) as typeof import("../src/studio/nativeTaskService.js");
  const service = createNativeTaskService({ workspace, validationConfig: f.checks, credentialsHome: home,
    environment: { HOME: home, PATH: process.env.PATH, AMC_VAULT_PASSPHRASE: pass, AMC_CONTROL_CHECKPOINT_DIR: join(base, "checkpoints") } });
  const actor = { principalId: "unsafe-home-fixture", agentId: "default", demo: false };
  try {
    await expect(service.configuration(actor)).rejects.toMatchObject({ name: "CredentialsFilePermissionsError", kind: "directory", mode: 0o755 });
    const task = await service.start(actor, { clientRequestId: randomUUID(), agentId: "default", provider: "stub", tools: "workspace",
      toolsDigest: f.toolsDigest, validation: { configSha256: f.sha256, checkIds: ["public"] }, prompt: "Do not start with unsafe credentials." });
    expect(task).toMatchObject({ state: "failed", sessionId: null, verification: "not-verified" });
    expect(task.error).toContain("No model request was automatically retried");
    expect(f.effect()).toBeNull();
  } finally { await service.close(); }
}, 15000);
