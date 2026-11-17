/** Switching the untrusted-input guard: the mode argument, who may switch it, the next state and its audit row. */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { GuardrailControlState } from "../src/enforce/guardrailControlState.js";

const audit = vi.hoisted(() => ({ append: vi.fn() }));
vi.mock("../src/ops/audit.js", () => ({ appendOpsAuditEvent: audit.append }));
const { assertInputGuardAuthority, auditInputGuardChange, inputGuardModeArg, inputGuardState } = await import("../src/enforce/inputGuardProfile.js");

let workspace: string;
beforeEach(() => { workspace = mkdtempSync(join(tmpdir(), "amc-input-guard-")); audit.append.mockReset(); });
afterEach(() => { vi.restoreAllMocks(); rmSync(workspace, { recursive: true, force: true }); });

describe("inputGuardModeArg", () => {
  test.each([[undefined, "enforce"], ["enforce", "enforce"], [" Log-Only ", "log_only"], ["log_only", "log_only"], ["OFF", "off"]] as const)(
    "%j reads as %s", (raw, mode) => { expect(inputGuardModeArg(raw)).toBe(mode); });
  test("an unknown mode is refused with the choices", () => {
    expect(() => inputGuardModeArg("strict")).toThrow('Unknown mode "strict". Use one of: enforce, log-only, off.');
  });
});

describe("assertInputGuardAuthority", () => {
  test("a person's own shell in an owner workspace may switch it; the same shell with an agent marker may not", () => {
    expect(() => assertInputGuardAuthority(workspace, "cli", { PATH: "/usr/bin" })).not.toThrow();
    expect(() => assertInputGuardAuthority(workspace, "cli", { PATH: "/usr/bin", CLAUDECODE: "1" })).toThrow(/agent marker CLAUDECODE/);
  });
  test("a shell carrying an agent marker may not, and the marker is named", () => {
    expect(() => assertInputGuardAuthority(workspace, "cli", { GEMINI_CLI: "1" }))
      .toThrow("An agent session cannot change the untrusted-input guard (this shell carries the agent marker GEMINI_CLI). A person changes it from their own terminal.");
  });
  test("a workspace in agent mode may not, even without a marker", () => {
    mkdirSync(join(workspace, ".amc"));
    writeFileSync(join(workspace, ".amc", "mode.json"), JSON.stringify({ mode: "agent" }));
    let caught: unknown;
    try { assertInputGuardAuthority(workspace, "cli", {}); } catch (error) { caught = error; }
    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toContain("(this workspace is in agent mode)");
    expect((caught as { code?: string }).code).toBe("AUTHORIZATION");
  });
  test("a change from the console or the API is checked elsewhere, not here, though the same marker refuses the CLI", () => {
    expect(() => assertInputGuardAuthority(workspace, "cli", { CLAUDECODE: "1" })).toThrow(/agent marker CLAUDECODE/);
    expect(() => assertInputGuardAuthority(workspace, "studio", { CLAUDECODE: "1" })).not.toThrow();
    expect(() => assertInputGuardAuthority(workspace, "api", { CLAUDECODE: "1" })).not.toThrow();
  });
});

const current = { schemaVersion: 1, revision: 4, requestedGuardrails: ["a"], activeProfile: null, untrustedInputGuard: "enforce",
  updatedAt: "2026-01-01T00:00:00.000Z", updatedBy: { source: "cli", actor: "old" } } as unknown as GuardrailControlState;

describe("inputGuardState", () => {
  test("off removes the guard and bumps the revision; everything else stays", () => {
    const next = inputGuardState(current, "off", "cli", "  ");
    expect(next).not.toHaveProperty("untrustedInputGuard");
    expect(next.revision).toBe(5);
    expect(next.requestedGuardrails).toEqual(["a"]);
    expect(next.updatedBy).toEqual({ source: "cli", actor: "local-user" });
    expect(next.updatedAt).not.toBe(current.updatedAt);
    expect(current.untrustedInputGuard).toBe("enforce");
  });
  test("log_only sets the guard and keeps the named actor", () => {
    const next = inputGuardState(current, "log_only", "studio", " sid ");
    expect(next.untrustedInputGuard).toBe("log_only");
    expect(next.updatedBy).toEqual({ source: "studio", actor: "sid" });
  });
});

describe("auditInputGuardChange", () => {
  test("switching off is a HIGH row and switching on a MEDIUM row, with from, to and who", () => {
    auditInputGuardChange(workspace, "enforce", inputGuardState(current, "off", "cli", "sid"));
    auditInputGuardChange(workspace, "off", inputGuardState(current, "enforce", "api", "bot"));
    expect(audit.append.mock.calls.map(([row]) => row)).toEqual([
      { workspace, auditType: "UNTRUSTED_INPUT_GUARD_CHANGED", severity: "HIGH",
        payload: { from: "enforce", to: "off", revision: 5, source: "cli", actor: "sid" } },
      { workspace, auditType: "UNTRUSTED_INPUT_GUARD_CHANGED", severity: "MEDIUM",
        payload: { from: "off", to: "enforce", revision: 5, source: "api", actor: "bot" } }
    ]);
  });
  test("a row that cannot be written is reported as a warning, not thrown", () => {
    const warn = vi.spyOn(process, "emitWarning").mockImplementation(() => {});
    audit.append.mockImplementationOnce(() => { throw new Error("ledger locked"); }).mockImplementationOnce(() => { throw "disk gone"; });
    const state = inputGuardState(current, "log_only", "cli", "sid");
    expect(() => auditInputGuardChange(workspace, "enforce", state)).not.toThrow();
    expect(() => auditInputGuardChange(workspace, "enforce", state)).not.toThrow();
    expect(warn.mock.calls.map(([message]) => message)).toEqual([
      "The untrusted-input guard change is signed (revision 5), but its audit row could not be written: ledger locked",
      "The untrusted-input guard change is signed (revision 5), but its audit row could not be written: disk gone"
    ]);
  });
});
