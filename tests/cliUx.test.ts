import { spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { Command } from "commander";
import {
  buildCommandInventory,
  cliDiscoverabilityFooter,
  flattenCommandPaths,
  generateCompletionScript,
  parseUnknownCommandToken,
  renderCommandInventoryMarkdown,
  suggestCommandPaths
} from "../src/cliUx.js";

describe("cliUx", () => {
  it("flattens nested command paths", () => {
    const program = new Command();
    const adapters = program.command("adapters");
    adapters.command("run");
    adapters.command("list");
    program.command("run");

    expect(flattenCommandPaths(program)).toEqual(["adapters", "adapters run", "adapters list", "run"]);
  });

  it("suggests close command paths", () => {
    const suggestions = suggestCommandPaths("adaptes run", ["run", "adapters run", "adapters list", "verify all"]);
    expect(suggestions[0]).toBe("adapters run");

    const typoSuggestions = suggestCommandPaths("rn", ["run", "loop run", "governor", "verify all"]);
    expect(typoSuggestions[0]).toBe("run");
  });

  it("extracts unknown command token from commander error text", () => {
    expect(parseUnknownCommandToken("error: unknown command 'rn'"))
      .toBe("rn");
    expect(parseUnknownCommandToken("some other error"))
      .toBeNull();
  });

  it("includes practical discoverability tips", () => {
    const footer = cliDiscoverabilityFooter();
    expect(footer).toContain("amc help <command>");
    expect(footer).toContain("amc commands --markdown");
    expect(footer).toContain("amc doctor");
    expect(footer).toContain("amc score");
    expect(footer).toContain("amc resource validate");
    expect(footer).toContain("amc shell");
    expect(footer).toContain("NO_COLOR=1");
    expect(footer).toContain("--no-color");
    expect(footer).toContain("amc agent-loop guide");
    expect(footer).toContain("baseline/assessment");
    expect(footer).not.toContain("Run AMC end to end");
  });

  it("builds a source-of-truth command inventory from Commander", () => {
    const program = new Command();
    program.command("run").description("Run the full lifecycle").option("--json", "json output");
    const resource = program.command("resource").description("Govern resources");
    resource.command("validate").description("Validate resource drift");
    resource.command("apply").alias("accept").description("Accept resource drift");

    const inventory = buildCommandInventory(program);
    expect(inventory.map((entry) => entry.path)).toEqual(["resource", "resource apply", "resource validate", "run"]);
    expect(inventory.find((entry) => entry.path === "resource apply")?.aliases).toEqual(["accept"]);
    expect(inventory.find((entry) => entry.path === "run")?.options).toContain("--json");

    const markdown = renderCommandInventoryMarkdown(inventory);
    expect(markdown).toContain("`amc resource validate`");
    expect(markdown).toContain("Generated from the live Commander command registry");
  });

  it("includes inherited namespace aliases in nested inventory entries", () => {
    const program = new Command();
    const compliance = program.command("compliance").alias("comply");
    compliance.command("risk-classify").description("Classify EU AI Act risk");
    const policy = compliance.command("policy").alias("pol");
    policy.command("print");

    const inventory = buildCommandInventory(program);

    expect(inventory.find((entry) => entry.path === "compliance")?.aliases).toEqual(["comply"]);
    expect(inventory.find((entry) => entry.path === "compliance risk-classify")?.aliases)
      .toEqual(["comply risk-classify"]);
    expect(inventory.find((entry) => entry.path === "compliance policy print")?.aliases)
      .toEqual(["comply policy print", "compliance pol print", "comply pol print"]);
  });

  it("omits internal helper commands unless requested", () => {
    const program = new Command();
    program.command("_daemon");
    program.command("forward", { hidden: true });
    program.command("run");

    expect(buildCommandInventory(program).map((entry) => entry.path)).toEqual(["run"]);
    expect(buildCommandInventory(program, { includeInternal: true }).map((entry) => entry.path))
      .toEqual(["_daemon", "forward", "run"]);
  });
});

describe("the built CLI with an unknown top-level command (run `npm run build` first)", () => {
  const amc = (...args: string[]) => spawnSync(process.execPath, [join(process.cwd(), "dist", "cli.js"), ...args],
    { cwd: mkdtempSync(join(tmpdir(), "amc-unknown-command-")), encoding: "utf8", env: { ...process.env, NO_COLOR: "1" } });

  it.each([["scor", "score"], ["frobnicate", null]])("amc %s names the unknown command, suggests, and exits non-zero", (token, suggestion) => {
    const result = amc(token);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(`unknown command '${token}'`);
    expect(result.stderr).not.toContain("too many arguments");
    if (suggestion) expect(result.stderr).toContain(`amc ${suggestion}`);
  });

  it.each([["evidence", "verify"], ["verify", "all"], ["vault", "unlock"]])("amc %s %s in a directory with no workspace says so and names amc init", (...args) => {
    const result = amc(...args);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("No AMC workspace here");
    expect(result.stderr).toContain("amc init");
  });

  it("amc version suggests --version", () => {
    const result = amc("version");
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("amc --version");
  });
});

describe("shell completion scripts", () => {
  const paths = ["adapters list", "adapters run", "run", "adapters", "run"];

  it("bash completes top-level commands and the children of the typed parent", () => {
    const script = generateCompletionScript("bash", paths);
    expect(script).toContain("complete -F _amc_complete amc");
    const complete = (...words: string[]) => {
      const program = `${script}\nCOMP_WORDS=(${words.map((word) => `'${word}'`).join(" ")}); COMP_CWORD=${words.length - 1}; _amc_complete; printf '%s\\n' "\${COMPREPLY[@]}"`;
      const result = spawnSync("bash", ["-c", program], { encoding: "utf8" });
      expect(result.status, result.stderr).toBe(0);
      return result.stdout.split("\n").filter(Boolean).sort();
    };
    expect(complete("amc", "")).toEqual(["adapters", "run"]);
    expect(complete("amc", "adapters", "r")).toEqual(["run"]);
    expect(complete("amc", "adapters", "")).toEqual(["list", "run"]);
    expect(complete("amc", "nothing", "")).toEqual([]);
  });

  it("zsh lists each command path once under compdef", () => {
    const script = generateCompletionScript("zsh", paths);
    expect(script.startsWith("#compdef amc")).toBe(true);
    expect(script).toContain("compdef _amc_complete amc");
    const listed = script.split("<<'__AMC_COMMANDS__'\n")[1]!.split("\n__AMC_COMMANDS__")[0]!.split("\n");
    expect(listed).toEqual(["adapters", "adapters list", "adapters run", "run"]);
  });

  it("fish completes top-level commands and each parent's children", () => {
    expect(generateCompletionScript("fish", [...paths, "", "adapters run fast"]).split("\n")).toEqual([
      'complete -c amc -f -a "adapters run"',
      'complete -c amc -f -n "__fish_seen_subcommand_from adapters" -a "list run"',
      'complete -c amc -f -n "__fish_seen_subcommand_from adapters run" -a "fast"'
    ]);
  });

  it("suggestions handle an empty query and an empty candidate", () => {
    expect(suggestCommandPaths("  ", ["run"])).toEqual([]);
    expect(suggestCommandPaths("ru", ["", "run", "rub", "ra"]).slice(0, 3)).toEqual(["rub", "run", "ra"]);
  });
});
