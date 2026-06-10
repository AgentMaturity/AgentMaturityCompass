import { describe, expect, it } from "vitest";
import { Command } from "commander";
import {
  buildCommandInventory,
  cliDiscoverabilityFooter,
  flattenCommandPaths,
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

  it("omits internal helper commands unless requested", () => {
    const program = new Command();
    program.command("_daemon");
    program.command("run");

    expect(buildCommandInventory(program).map((entry) => entry.path)).toEqual(["run"]);
    expect(buildCommandInventory(program, { includeInternal: true }).map((entry) => entry.path)).toEqual(["_daemon", "run"]);
  });
});
