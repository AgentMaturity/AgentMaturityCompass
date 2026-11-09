import { describe, expect, it } from "vitest";
import { ACTION_CLASSES } from "../src/governor/actionCatalog.js";
import { APPROVAL_MODES, approvalModeExemptTools, approvalModeGatedClasses, approvalModeNarrowing, parseApprovalMode } from "../src/approvals/approvalModes.js";
import { isGated } from "../src/agent/approvalGate.js";
import { nativePresetCompositionSources } from "../src/cli/agentCompositionSources.js";
import { compositionSource } from "../src/prompt/context/compositionProvenance.js";
import { runComposedTurn } from "../src/kernel/agentLoopRunner.js";
import { compositionDigestOf } from "../src/kernel/composedTurnIdentity.js";
import type { AgentPreset } from "../src/presets/agentPresets.js";

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

  it("a preset's approveTools is recorded as replaced, and the mode as an override, when --approval-mode is explicit", () => {
    const preset = { id: "p", description: "d", providerId: "stub", model: "fixed", approveTools: "WRITE_HIGH" } as unknown as AgentPreset;
    const effective = { providerId: "stub", model: "fixed", maxTokens: 1, maxSteps: 1, tools: "none", toolMode: "native", delegateEnabled: false, maxDelegationDepth: 1, delegateTimeout: 0, delegateStops: [] };
    const sources = nativePresetCompositionSources(preset, new Set(["approvalMode"]), {}, { ...effective, approveTools: undefined, approvalMode: "default" })!;
    expect(sources.map(source => source.id)).toEqual(["p", "p:approveTools", "p:approvalMode"]);
    expect(sources[1]).toEqual(compositionSource("override", "p:approveTools", { presetValue: "WRITE_HIGH", effectiveValue: null }));
    expect(sources[2]).toEqual(compositionSource("override", "p:approvalMode", { presetValue: null, effectiveValue: "default" }));
    // Without the explicit mode the preset's gate stands and nothing is recorded as overridden.
    expect(nativePresetCompositionSources(preset, new Set(), {}, { ...effective, approveTools: "WRITE_HIGH" })!.map(source => source.id)).toEqual(["p"]);
  });

  it("the composition digest changes with the gate's gated classes and exempt tools on their own", () => {
    const profile = { sections: [], contextPlugins: [], variables: {} } as unknown as Parameters<typeof compositionDigestOf>[1];
    const digest = (gate: Record<string, unknown>) => compositionDigestOf({ workspace: "/w", agentId: "a", prompt: "", routes: [], route: { providerId: "stub", model: "fixed", params: {} },
      approvalGate: { actionClass: "WRITE_HIGH", riskTier: "high", ...gate } } as unknown as Parameters<typeof compositionDigestOf>[0], profile);
    const plain = digest({});
    const edits = digest({ gatesClasses: approvalModeGatedClasses("accept-edits")! });
    const asked = digest({ gatesClasses: approvalModeGatedClasses("default")! });
    expect(new Set([plain, edits, asked]).size).toBe(3);
    expect(digest({ gatesClasses: approvalModeGatedClasses("accept-edits")! })).toBe(edits);
    expect(digest({ gatesClasses: approvalModeGatedClasses("untrusted")! })).not.toBe(digest({ gatesClasses: approvalModeGatedClasses("untrusted")!, exemptToolNames: ["ask_user"] }));
  });

  it("a native schedule pass refuses a class-narrowed gate as it refuses a tool-narrowed one", async () => {
    const base = { workspace: "/nonexistent", agentId: "default", sessionId: "s", systemPrompt: "x", prompt: "", route: { providerId: "stub", model: "fixed", params: {} },
      schedulePass: { now: 1, scheduleDigest: "0".repeat(64), toolsDigest: "0".repeat(64) } } as unknown as Parameters<typeof runComposedTurn>[0];
    for (const gate of [{ gatesClasses: approvalModeGatedClasses("default")! }, { exemptToolNames: ["ask_user"] }, { toolNames: ["bash"] }]) {
      await expect(runComposedTurn({ ...base, approvalGate: { actionClass: "WRITE_HIGH", riskTier: "high", ...gate } })).rejects.toThrow(/actual all-tools signed approval gate/);
    }
  });
});
