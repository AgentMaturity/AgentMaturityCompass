/** In-process Commander contracts only; no target, model, workspace or trust authority is loaded. */
import { Command } from "commander";
import { describe, expect, it, vi } from "vitest";
import {
  executedRerunFlags,
  selectExecutedAssuranceOptions,
  withExecutedAssuranceOptions,
  type AssuranceRunCliOptions
} from "../../../src/assurance/executed/cliOptions.js";
import { STATION_QUESTION_CONVERSIONS } from "../../../src/assurance/executed/registry.js";

const questionIds = STATION_QUESTION_CONVERSIONS.map((row) => row.questionId);

function cli() {
  const handoff = vi.fn();
  const command = withExecutedAssuranceOptions(new Command("run")
    .exitOverride()
    .configureOutput({ writeOut: () => {}, writeErr: () => {} })
    .option("--scope <scope>", "scope", "agent")
    .option("--pack <packId>", "pack")
    .option("--all", "all", false)
    .option("--demo", "demo", false));
  command.action((opts: AssuranceRunCliOptions) => {
    handoff(selectExecutedAssuranceOptions(opts));
  });
  return { command, handoff, parse: (...args: string[]) => command.parseAsync(args, { from: "user" }) };
}

describe("existing assurance-run executed options", () => {
  it("registers both flags and the source-owned question IDs on the same command", () => {
    const { command } = cli();
    expect(command.name()).toBe("run");
    expect(command.commands).toEqual([]);
    expect(command.helpInformation()).toContain("--executed-attempts <1|25>");
    expect(command.helpInformation()).toContain("--station-questions <ids>");
    expect(command.helpInformation()).toContain("experimental unreviewed partial aspects");
    for (const id of questionIds) expect(command.helpInformation()).toContain(id);
  });

  it.each([["1", 1], ["25", 25]] as const)("parses %s as numeric attempt mode %i", async (text, value) => {
    const command = cli();
    await command.parse("--pack", "healthcarePHI", "--executed-attempts", text);
    expect(command.handoff).toHaveBeenCalledExactlyOnceWith({
      executedAttempts: value, stationQuestionIds: undefined, packIds: undefined
    });
  });

  it("preserves the runner's default attempt mode when the flag is omitted", async () => {
    const command = cli();
    await command.parse("--pack", "healthcarePHI");
    expect(command.handoff).toHaveBeenCalledExactlyOnceWith({
      executedAttempts: undefined, stationQuestionIds: undefined, packIds: undefined
    });
    expect(command.command.opts().pack).toBe("healthcarePHI");
  });

  it.each(["0", "2", "24", "26", "01", "25.0", "1e0", "NaN"])("rejects invalid attempt spelling %s before handoff", async (value) => {
    const command = cli();
    await expect(command.parse("--pack", "healthcarePHI", "--executed-attempts", value)).rejects.toMatchObject({ code: "commander.invalidArgument" });
    expect(command.handoff).not.toHaveBeenCalled();
  });

  it("selects only the separate question pack when no legacy pack selector is present", async () => {
    const command = cli();
    await command.parse("--station-questions", questionIds.join(", "), "--executed-attempts", "1");
    expect(command.handoff).toHaveBeenCalledExactlyOnceWith({
      executedAttempts: 1, stationQuestionIds: questionIds, packIds: []
    });
    expect(command.command.opts()).toMatchObject({ all: false, demo: false });
    expect(executedRerunFlags(command.command.opts<AssuranceRunCliOptions>())).toEqual([
      "--executed-attempts 1", `--station-questions ${questionIds.join(",")}`
    ]);
  });

  it.each([["--pack", "healthcarePHI"], ["--all"]])("preserves explicit legacy selection %j alongside question aspects", async (...args) => {
    const command = cli();
    await command.parse(...args, "--station-questions", questionIds[0]!);
    expect(command.handoff).toHaveBeenCalledExactlyOnceWith({
      executedAttempts: undefined, stationQuestionIds: [questionIds[0]!], packIds: undefined
    });
  });

  it.each(["", "UNKNOWN-1", `${questionIds[0]},${questionIds[0]}`, `${questionIds[0]},`])("rejects unavailable, empty or duplicate question input %j", async (value) => {
    const command = cli();
    await expect(command.parse("--station-questions", value)).rejects.toMatchObject({ code: "commander.invalidArgument" });
    expect(command.handoff).not.toHaveBeenCalled();
  });

  it("rejects demo combined with question execution before handoff", async () => {
    const command = cli();
    await expect(command.parse("--demo", "--station-questions", questionIds[0]!))
      .rejects.toThrow("--station-questions cannot be combined with --demo.");
    expect(command.handoff).not.toHaveBeenCalled();
  });

  it.each(["workspace", "node"])("rejects question execution outside agent scope: %s", async (scope) => {
    const command = cli();
    await expect(command.parse("--scope", scope, "--station-questions", questionIds[0]!))
      .rejects.toThrow("--station-questions is only supported for agent-scoped assurance runs.");
    expect(command.handoff).not.toHaveBeenCalled();
  });

  it.each(["workspace", "node"])("rejects an ignored attempt mode outside agent scope: %s", async (scope) => {
    const command = cli();
    await expect(command.parse("--scope", scope, "--executed-attempts", "1"))
      .rejects.toThrow("--executed-attempts is only supported for agent-scoped assurance runs.");
    expect(command.handoff).not.toHaveBeenCalled();
  });

  it("leaves the legacy options object unchanged", () => {
    const opts: AssuranceRunCliOptions = { agent: "a", scope: "agent", id: "id", pack: "healthcarePHI",
      format: "sarif", verbose: true, all: false, demo: false, mode: "supervise", window: "7d",
      windowDays: "7", out: "report.md", model: "fixture-model", sign: false,
      stationQuestions: [questionIds[0]!], executedAttempts: 25 };
    const before = structuredClone(opts);
    expect(selectExecutedAssuranceOptions(opts)).toEqual({
      executedAttempts: 25, stationQuestionIds: [questionIds[0]!], packIds: undefined
    });
    expect(opts).toEqual(before);
  });
});
