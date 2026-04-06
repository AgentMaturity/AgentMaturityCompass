import { describe, expect, test } from "vitest";
import {
  STEER_CLI_COMMANDS,
  STEER_STUDIO_PANELS,
  generateSteerHelp,
  generateCommandHelp,
} from "../src/steer/thermostatCLI.js";

describe("STEER_CLI_COMMANDS", () => {
  test("defines all core steer commands", () => {
    const names = STEER_CLI_COMMANDS.map((c) => c.name);
    expect(names).toContain("steer enable");
    expect(names).toContain("steer disable");
    expect(names).toContain("steer status");
    expect(names).toContain("steer race");
    expect(names).toContain("steer matrix");
    expect(names).toContain("steer micro-score");
    expect(names).toContain("steer privacy");
  });

  test("all commands have descriptions and examples", () => {
    for (const cmd of STEER_CLI_COMMANDS) {
      expect(cmd.description.length).toBeGreaterThan(0);
      expect(cmd.examples.length).toBeGreaterThan(0);
    }
  });
});

describe("STEER_STUDIO_PANELS", () => {
  test("defines studio panels for key features", () => {
    const ids = STEER_STUDIO_PANELS.map((p) => p.id);
    expect(ids).toContain("steer-dashboard");
    expect(ids).toContain("steer-race");
    expect(ids).toContain("steer-matrix");
    expect(ids).toContain("steer-privacy");
  });

  test("all panels have routes under /studio/steer", () => {
    for (const panel of STEER_STUDIO_PANELS) {
      expect(panel.route).toMatch(/^\/studio\/steer/);
    }
  });
});

describe("generateSteerHelp", () => {
  test("generates help text containing all commands", () => {
    const help = generateSteerHelp();
    expect(help).toContain("AMC Steer");
    expect(help).toContain("steer enable");
    expect(help).toContain("steer disable");
    expect(help).toContain("steer race");
  });
});

describe("generateCommandHelp", () => {
  test("generates detailed help for a specific command", () => {
    const help = generateCommandHelp("steer enable");
    expect(help).not.toBeNull();
    expect(help).toContain("--agent");
    expect(help).toContain("--autotune");
    expect(help).toContain("EXAMPLES:");
  });

  test("returns null for unknown commands", () => {
    expect(generateCommandHelp("steer nonexistent")).toBeNull();
  });

  test("works with short command name", () => {
    const help = generateCommandHelp("race");
    expect(help).not.toBeNull();
    expect(help).toContain("--models");
  });
});
