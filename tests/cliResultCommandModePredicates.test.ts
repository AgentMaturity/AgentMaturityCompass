/**
 * The mode predicates in src/cli/resultCommandRegistry.ts: a command that prints a result only in some modes must
 * require a claim label exactly in those modes.
 */
import { describe, expect, it } from "vitest";
import { NON_RESULT_COMMANDS, RESULT_COMMANDS, RESULT_COMMAND_BY_PATH } from "../src/cli/resultCommandRegistry.js";

function when(path: string) {
  const command = RESULT_COMMAND_BY_PATH.get(path);
  expect(command, path).toBeDefined();
  expect(command!.when, `${path} has a mode predicate`).toBeTypeOf("function");
  return command!.when!;
}

describe("result commands that print a result only in some modes", () => {
  it("exactly four commands carry a mode predicate, and only self-reported ones", () => {
    const withWhen = RESULT_COMMANDS.filter((command) => command.when).map((command) => command.path).sort();
    expect(withWhen).toEqual(["compliance report", "domain apply", "fleet status", "quickstart"]);
    expect(RESULT_COMMANDS.filter((command) => command.when).every((command) => command.defaultKind === "self_reported")).toBe(true);
    expect(RESULT_COMMAND_BY_PATH.get("score")).not.toHaveProperty("when");
  });

  it("quickstart prints a score only without a plan, broken-list, answers file, JSON or minimal mode", () => {
    const quickstart = when("quickstart");
    expect(quickstart({})).toBe(true);
    for (const option of ["startupPlan", "whatBroken", "answersOut", "json", "minimal"]) {
      expect(quickstart({ [option]: true }), option).toBe(false);
    }
  });

  it("fleet status prints health unless it lists inventory, writes CSV or changes a freeze", () => {
    const status = when("fleet status");
    expect(status({})).toBe(true);
    expect(status({ inventory: true })).toBe(false);
    expect(status({ csv: true })).toBe(false);
    expect(status({ freeze: "on" })).toBe(false);
    expect(status({ freeze: undefined })).toBe(true);
  });

  it("domain apply prints a result only for --audit", () => {
    const apply = when("domain apply");
    expect(apply({ audit: true })).toBe(true);
    expect(apply({ audit: "yes" })).toBe(false);
    expect(apply({})).toBe(false);
  });

  it("compliance report prints a result only when a framework is named", () => {
    const report = when("compliance report");
    expect(report({ framework: "EU_AI_ACT" })).toBe(true);
    expect(report({})).toBe(false);
    expect(report({ framework: true })).toBe(false);
  });
});

describe("registry shape", () => {
  it("synthetic producers are labelled synthetic, and no path is both a result and a non-result", () => {
    expect(RESULT_COMMAND_BY_PATH.get("demo run")).toEqual({ path: "demo run", producer: "demo:run", defaultKind: "synthetic_example" });
    const results = new Set(RESULT_COMMANDS.map((command) => command.path));
    expect(NON_RESULT_COMMANDS.filter((command) => results.has(command.path))).toEqual([]);
    expect(RESULT_COMMAND_BY_PATH.size).toBe(RESULT_COMMANDS.length);
    expect(NON_RESULT_COMMANDS.every((command) => command.reason.length > 0)).toBe(true);
  });
});
