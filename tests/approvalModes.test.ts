import { describe, expect, it } from "vitest";
import { ACTION_CLASSES } from "../src/governor/actionCatalog.js";
import { APPROVAL_MODES, approvalModeExemptTools, approvalModeGatedClasses, approvalModeNarrowing, parseApprovalMode } from "../src/approvals/approvalModes.js";
import { isGated } from "../src/agent/approvalGate.js";

/** SH-SANDBOX-04: the mode table is total, only narrows, and has no bypass. */
describe("approval modes", () => {
  it("parses every mode, in the spellings other harnesses use, and refuses bypass modes by name", () => {
    for (const mode of APPROVAL_MODES) expect(parseApprovalMode(mode)).toEqual({ ok: true, mode });
    expect(parseApprovalMode("acceptEdits")).toEqual({ ok: true, mode: "accept-edits" });
    expect(parseApprovalMode("ACCEPT_EDITS")).toEqual({ ok: true, mode: "accept-edits" });
    for (const refused of ["never", "bypass", "bypassPermissions", "yolo", "dontAsk", "auto", "danger-full-access", "on-failure"]) {
      const parsed = parseApprovalMode(refused);
      expect(parsed.ok, refused).toBe(false);
      if (!parsed.ok) expect(parsed.reason).toMatch(/refused|needs the/);
    }
    const unknown = parseApprovalMode("sometimes");
    expect(unknown.ok).toBe(false);
    if (!unknown.ok) expect(unknown.reason).toContain("plan, default, accept-edits, untrusted");
  });

  it("gates by class: plan composes no gate, default asks outside READ_ONLY, accept-edits also skips WRITE_LOW, untrusted asks about everything", () => {
    expect(approvalModeGatedClasses("plan")).toBeNull();
    expect([...approvalModeGatedClasses("default")!].sort()).toEqual(ACTION_CLASSES.filter(cls => cls !== "READ_ONLY").sort());
    expect([...approvalModeGatedClasses("accept-edits")!].sort()).toEqual(ACTION_CLASSES.filter(cls => cls !== "READ_ONLY" && cls !== "WRITE_LOW").sort());
    expect([...approvalModeGatedClasses("untrusted")!].sort()).toEqual([...ACTION_CLASSES].sort());
    expect(approvalModeExemptTools("untrusted")).toEqual(["ask_user"]);
    expect(approvalModeExemptTools("default")).toEqual([]);
  });

  it("plan never produces EXECUTE outside READ_ONLY; no mode widens SIMULATE", () => {
    const plan = approvalModeNarrowing("plan");
    for (const actionClass of ACTION_CLASSES) {
      expect(plan({ actionClass, requestedMode: "EXECUTE" })).toBe(actionClass === "READ_ONLY" ? "EXECUTE" : "SIMULATE");
      expect(plan({ actionClass, requestedMode: "SIMULATE" })).toBe("SIMULATE");
    }
    for (const mode of ["default", "accept-edits", "untrusted"] as const) {
      const narrow = approvalModeNarrowing(mode);
      for (const actionClass of ACTION_CLASSES) {
        expect(narrow({ actionClass, requestedMode: "EXECUTE" })).toBe("EXECUTE");
        expect(narrow({ actionClass, requestedMode: "SIMULATE" })).toBe("SIMULATE");
      }
    }
  });

  it("the gate predicate fails closed on a class nobody can name, honours exemptions and keeps the tool-name narrowing", () => {
    const base = { actionClass: "WRITE_HIGH" as const, riskTier: "high" as const };
    expect(isGated(base, "anything", null)).toBe(true);
    const gated = { ...base, gatesClasses: approvalModeGatedClasses("accept-edits")! };
    expect(isGated(gated, "fs.write", "WRITE_LOW")).toBe(false);
    expect(isGated(gated, "bash", "WRITE_HIGH")).toBe(true);
    expect(isGated(gated, "fs.read", "READ_ONLY")).toBe(false);
    expect(isGated(gated, "mystery", null)).toBe(true);
    const untrusted = { ...base, gatesClasses: approvalModeGatedClasses("untrusted")!, exemptToolNames: approvalModeExemptTools("untrusted") };
    expect(isGated(untrusted, "fs.read", "READ_ONLY")).toBe(true);
    expect(isGated(untrusted, "ask_user", "READ_ONLY")).toBe(false);
    expect(isGated({ ...base, toolNames: ["bash"] }, "fs.write", "WRITE_LOW")).toBe(false);
    expect(isGated({ ...base, toolNames: ["bash"] }, "bash", "WRITE_HIGH")).toBe(true);
  });
});
