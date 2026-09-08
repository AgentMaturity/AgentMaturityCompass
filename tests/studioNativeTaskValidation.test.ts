import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, expect, test, vi } from "vitest";
import { assertNativeTaskValidationPin, inspectNativeTaskValidation, nativeTaskValidationView } from "../src/studio/nativeTaskValidation.js";
import { readNativeTaskProjection } from "../src/studio/nativeTaskProjection.js";
import { NativeValidationTurn, type NativeValidationResult } from "../src/agent/nativeValidation.js";
import { EMPTY_TOOL_SEAM } from "../src/agent/toolSeam.js";
import { SessionService } from "../src/session/sessionService.js";
import { initWorkspace } from "../src/workspace.js";
import { lockVault } from "../src/vault/vault.js";
import { renderTaskValidation, renderTaskValidationSetup } from "../src/console/assets/nativeTasksView.js";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) { lockVault(root); rmSync(root, { recursive: true, force: true }); } vi.unstubAllEnvs(); });
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "amc-studio-public-validation-")); roots.push(root);
  const path = join(root, "operator-checks.json");
  const config = { schemaVersion: 1, checks: [{ id: "public_unit", title: "Public unit checks", command: "operator-private-command-canary", timeoutMs: 2000 }] };
  writeFileSync(path, JSON.stringify(config));
  const bytes = readFileSync(path), configSha256 = createHash("sha256").update(bytes).digest("hex");
  return { root, path, config, bytes, selection: { configSha256, checkIds: ["public_unit"] } };
}
test("public setup returns only catalogue identity and never executes or discloses its operator command", () => {
  const f = fixture();
  expect(inspectNativeTaskValidation(f.path, false)).toMatchObject({ ready: true, configSha256: f.selection.configSha256,
    checks: [{ id: "public_unit", title: "Public unit checks" }] });
  const publicJson = JSON.stringify(inspectNativeTaskValidation(f.path, false));
  expect(publicJson).not.toContain(f.path); expect(publicJson).not.toContain(f.config.checks[0]!.command);
  expect(readFileSync(f.path)).toEqual(f.bytes);
  expect(inspectNativeTaskValidation(f.path, true)).toMatchObject({ ready: false, configSha256: null, checks: [] });
  expect(inspectNativeTaskValidation(undefined, false)).toMatchObject({ ready: false, checks: [] });
});
test("a changed or missing operator file cannot replace the task's selected check", () => {
  const f = fixture();
  expect(() => assertNativeTaskValidationPin(f.path, f.selection)).not.toThrow();
  expect(() => assertNativeTaskValidationPin(f.path, { ...f.selection, checkIds: ["unlisted"] })).toThrow("pinned configuration");
  writeFileSync(f.path, JSON.stringify({ ...f.config, checks: [{ ...f.config.checks[0], command: "different-command-canary" }] }));
  expect(() => assertNativeTaskValidationPin(f.path, f.selection)).toThrow("pinned configuration");
  rmSync(f.path);
  expect(() => assertNativeTaskValidationPin(f.path, f.selection)).toThrow("pinned configuration");
  expect(inspectNativeTaskValidation(f.path, false)).toMatchObject({ ready: false, configSha256: null, checks: [] });
});
test("a prior passing turn, missing evidence or foreign selection never supplies the current validation pass", () => {
  const f = fixture();
  const passed: NativeValidationResult = { status: "passed", turn: 1, configSha256: f.selection.configSha256,
    checks: [{ id: "public_unit", title: "Public unit checks", status: "passed", callId: "actual-call", exitCode: 0, timedOut: false, reason: null, outputEventId: "signed-result" }] };
  expect(nativeTaskValidationView(f.selection, passed, false, false)).toEqual(passed);
  expect(nativeTaskValidationView(f.selection, passed, true, false).status).toBe("pending");
  expect(nativeTaskValidationView(f.selection, passed, false, true).status).toBe("unavailable");
  expect(nativeTaskValidationView(f.selection, undefined, false, false).status).toBe("unavailable");
  expect(nativeTaskValidationView({ ...f.selection, configSha256: "f".repeat(64) }, passed, false, false).status).toBe("unavailable");
  expect(nativeTaskValidationView({ ...f.selection, checkIds: ["different"] }, passed, false, false).status).toBe("unavailable");
  expect(nativeTaskValidationView(undefined, passed, false, false)).toEqual({ status: "not-requested", turn: null, configSha256: null, checks: [] });
});
test("the validation panel distinguishes every outcome and escapes public titles and signed reasons", () => {
  for (const [status, label] of [["not-requested", "Not requested"], ["pending", "Pending"], ["passed", "Selected checks passed"],
    ["failed", "Selected checks failed"], ["unavailable", "Validation unavailable"]]) {
    const html = renderTaskValidation({ validation: { status, turn: null, configSha256: null, checks: [] } });
    expect(html).toContain(label); expect(html).toContain("evidence verification are separate");
  }
  const selected = { configSha256: "a".repeat(64), checkIds: ["public_unit"] };
  const setup = renderTaskValidationSetup({ validation: { ready: true, configSha256: "b".repeat(64),
    checks: [{ id: "public_unit", title: '<img src=x onerror="run()">' }], message: "Operator public checks." } }, selected.checkIds, { validationSelection: selected });
  expect(setup).toContain("operator configuration changed"); expect(setup).toContain("checked");
  expect(setup).not.toContain("<img"); expect(setup).toContain("&lt;img");
  const result = renderTaskValidation({ validation: { status: "unavailable", turn: 1, checks: [{ id: "public_unit", title: "Public unit checks",
    status: "unavailable", exitCode: null, timedOut: true, reason: "<script>bad()</script>", outputEventId: "signed-event-reference" }] } });
  expect(result).toContain("timed out"); expect(result).toContain("signed-event-reference"); expect(result).not.toContain("<script>");
});
test("Studio projects authenticated core results separately from model text and refuses a forged pass", async () => {
  const f = fixture();
  vi.stubEnv("AMC_VAULT_PASSPHRASE", "synthetic-studio-validation-vault");
  initWorkspace({ workspacePath: f.root, agentId: "default", trustBoundaryMode: "isolated" });
  const session = new SessionService(f.root);
  try {
    session.open({ agentId: "default", harnessVersion: "fixture", compositionDigest: "0".repeat(64), policyDigest: "0".repeat(64) });
    const turn = session.startTurn({ trigger: "user" }); session.startStep(); session.recordUserMessage("A public-check fixture.");
    session.recordAssistantBlock({ blockIndex: 0, blockKind: "text", content: "Completed model text.", stopReason: "end_turn" });
    session.endStep({ stopReason: "end_turn", usage: null });
    const secret = `sk-${"A".repeat(48)}`;
    const originalOutput = `private-check-output-canary\n${secret}\n${"x".repeat(18000)}`;
    const validation = new NativeValidationTurn({ session, turn: turn.turn, signal: new AbortController().signal, abandonGraceMs: 10,
      plan: { configSha256: f.selection.configSha256, checks: f.config.checks },
      // Synthetic execution seam; this test establishes signed projection, not OS command execution.
      tools: { ...EMPTY_TOOL_SEAM, execute: async () => ({ outcome: "ERROR", content: originalOutput, exitCode: 1, timedOut: false, denied: false }) } });
    await validation.run(1); session.endTurn({ reason: "complete" }); session.sealTurn(); session.releaseWithoutClosing();
    const projected = readNativeTaskProjection(f.root, session.sessionId, "default");
    expect(projected.ending).toBe("complete"); expect(projected.validation.status).toBe("failed");
    expect(projected.validation.checks[0]).toMatchObject({ exitCode: 1, status: "failed", reason: "nonzero-exit" });
    expect(projected.validation.checks[0]?.outputEventId).toBeTruthy();
    expect(projected.validationOutputs[0]).toMatchObject({ status: "available", redacted: true, truncated: true,
      payloadSha256: createHash("sha256").update(originalOutput).digest("hex"), bytes: Buffer.byteLength(originalOutput) });
    expect(projected.validationOutputs[0]?.text).toContain("<AMC_REDACTED>");
    expect(projected.validationOutputs[0]?.text).not.toContain(secret);
    expect(Buffer.byteLength(projected.validationOutputs[0]?.text ?? "")).toBeLessThanOrEqual(16 * 1024);
    expect(JSON.stringify(projected.events)).not.toContain("private-check-output-canary");
    expect(JSON.stringify(projected)).not.toContain("operator-private-command-canary");
    const db = new Database(join(f.root, ".amc", "evidence.sqlite"));
    try {
      for (const trigger of ["protect_evidence_immutable", "no_delete_evidence", "no_update_evidence"]) db.exec(`DROP TRIGGER IF EXISTS ${trigger}`);
      db.prepare("UPDATE evidence_events SET meta_json = replace(meta_json, 'nonzero-exit', 'forged-success') WHERE id = ?").run(projected.validation.checks[0]!.outputEventId);
    } finally { db.close(); }
    expect(() => readNativeTaskProjection(f.root, session.sessionId, "default")).toThrow();
  } finally { session.disposeWithoutClosing(); }
});
