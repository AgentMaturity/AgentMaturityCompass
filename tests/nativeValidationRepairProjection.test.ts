import { rmSync } from "node:fs";
import { afterEach, expect, test, vi } from "vitest";
import { projectNativeValidation } from "../src/agent/nativeValidationProjection.js";
import { loopHarness, textStep, type LoopHarness } from "./helpers/agentLoopHarness.js";

const opened: LoopHarness[] = [];
afterEach(() => {
  for (const f of opened.splice(0)) { f.finish(); f.session.disposeWithoutClosing(); rmSync(f.dir, { recursive: true, force: true }); }
  vi.unstubAllEnvs();
});

test.each(["changed-command", "changed-title", "skipped-round", "prior-pass", "missing-start", "early-start", "late-start", "valid"])("signed repair projection: %s", mode => {
  vi.stubEnv("AMC_VAULT_PASSPHRASE", "synthetic-repair-projection");
  const f = loopHarness({ scripts: [textStep("unused")] }); opened.push(f);
  f.session.startTurn({ trigger: "user" });
  const emit = (phase: string, round: number, extra: Record<string, unknown>) => f.session.recordProjectedEvidence({ eventType: "audit", payload: "", meta: {
    kind: "native-validation", version: 1, phase, turn: 1, configSha256: "a".repeat(64), round, ...extra
  } });
  const run = (round: number, status: "failed" | "passed", title = "Public", args = "b".repeat(64)) => {
    const callId = `check-${round}`;
    emit("requested", round, { checks: [{ id: "public", title }] });
    emit("check-start", round, { checkId: "public", callId, toolName: "bash", argumentsSha256: args });
    const result = { id: "public", title, status, callId, exitCode: status === "passed" ? 0 : 1, timedOut: false,
      reason: status === "passed" ? null : "nonzero-exit" };
    const output = emit("check-result", round, { checkId: "public", ...result, toolOutcome: status === "passed" ? "OK" : "ERROR" });
    emit("finished", round, { status, checks: [{ ...result, outputEventId: output.eventId }] });
  };
  const round = mode === "skipped-round" ? 2 : 1;
  const start = () => f.session.recordProjectedEvidence({ eventType: "audit", payload: "", meta: {
    kind: "native-validation-repair", version: 1, phase: "round-start", turn: 1, configSha256: "a".repeat(64), round
  } });
  if (mode === "early-start") start();
  run(0, mode === "prior-pass" ? "passed" : "failed");
  if (mode !== "missing-start" && mode !== "late-start" && mode !== "early-start") start();
  run(round, "passed", mode === "changed-title" ? "Weaker check" : "Public", mode === "changed-command" ? "c".repeat(64) : "b".repeat(64));
  if (mode === "late-start") start();
  f.session.endTurn({ reason: "complete" }); f.session.sealTurn();
  expect(projectNativeValidation(f.dir, f.events()).status).toBe(mode === "valid" ? "passed" : "unavailable");
});
