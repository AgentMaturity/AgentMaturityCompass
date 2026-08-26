import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  deprecatedCommandMessage,
  resetDeprecationNoticesForTest,
  supersededCommandNames,
  warnDeprecatedCommand,
  warnSupersededCommand
} from "../src/cli/deprecatedCommand.js";

/**
 * Runtime deprecation notices for superseded CLI commands (P5.3).
 *
 * `amc wrap` and `amc supervise` are earlier generations of `amc adapters run`,
 * and both already said so — in their `--help` description, the one place a user
 * running them from a script or CI step never looks. The deprecation had been
 * announced to nobody.
 */
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

afterEach(() => {
  resetDeprecationNoticesForTest();
  vi.restoreAllMocks();
});

describe("the notice goes to stderr", () => {
  it("never writes to stdout", () => {
    // These commands WRAP another process and relay its output. A notice on
    // stdout lands inside the wrapped agent's own stream, where a consumer
    // parsing it reads the deprecation as agent data. A warning that corrupts
    // the thing it is attached to is worse than no warning.
    const stderr = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    const stdout = vi.spyOn(process.stdout, "write").mockReturnValue(true);

    warnDeprecatedCommand({ used: "amc wrap", prefer: "amc adapters run", because: "reasons" });

    expect(stderr).toHaveBeenCalledOnce();
    expect(stdout, "stdout belongs to the wrapped process").not.toHaveBeenCalled();
  });

  it("names what to use instead and why", () => {
    const message = deprecatedCommandMessage({
      used: "amc supervise",
      prefer: "amc adapters run",
      because: "supervise injects routing env vars without a lease, so its evidence is not OBSERVED."
    });

    expect(message).toContain("amc supervise is deprecated");
    expect(message).toContain("Use amc adapters run instead");
    expect(message, "a deprecation with no reason reads as churn").toContain("not OBSERVED");
  });
});

describe("it announces once per process", () => {
  it("suppresses a repeat of the same command", () => {
    // A wrapped run can reach the same path repeatedly; repeating the notice
    // trains the reader to filter it out.
    vi.spyOn(process.stderr, "write").mockReturnValue(true);
    const notice = { used: "amc wrap", prefer: "amc adapters run", because: "x" };

    expect(warnDeprecatedCommand(notice), "first call announces").toBe(true);
    expect(warnDeprecatedCommand(notice), "second is suppressed").toBe(false);
  });

  it("still announces a different command", () => {
    vi.spyOn(process.stderr, "write").mockReturnValue(true);

    expect(warnDeprecatedCommand({ used: "amc wrap", prefer: "p", because: "b" })).toBe(true);
    expect(warnDeprecatedCommand({ used: "amc supervise", prefer: "p", because: "b" })).toBe(true);
  });
});

describe("the keyed notices", () => {
  it("knows exactly the two superseded commands", () => {
    expect(supersededCommandNames().sort()).toEqual(["amc supervise", "amc wrap"]);
  });

  it("announces a known command and returns false for an unknown one", () => {
    // A silent no-op on a typo would make a miswired call site look wired.
    vi.spyOn(process.stderr, "write").mockReturnValue(true);

    expect(warnSupersededCommand("amc wrap")).toBe(true);
    expect(warnSupersededCommand("amc nonexistent"), "unknown names announce nothing").toBe(false);
  });

  it("carries a reason for each, not just a redirect", () => {
    for (const name of supersededCommandNames()) {
      const stderr = vi.spyOn(process.stderr, "write").mockReturnValue(true);
      resetDeprecationNoticesForTest();
      warnSupersededCommand(name);
      const written = String(stderr.mock.calls[0]?.[0] ?? "");
      expect(written, `${name} should say why`).toContain("OBSERVED");
      stderr.mockRestore();
    }
  });
});

describe("no command is documented as legacy while staying silent", () => {
  /**
   * The invariant, not just the two cases.
   *
   * `wrap` and `supervise` carried "legacy" and "preferred over" in their
   * descriptions for some time without ever telling a running user. This makes
   * that state impossible to reach again: if a command's description says it is
   * superseded, its action has to say so at runtime too.
   */
  const source = readFileSync(join(repoRoot, "src/cli.ts"), "utf8");

  /** Command blocks whose description advertises a preferred replacement. */
  function legacyCommands(): string[] {
    const found: string[] = [];
    const pattern = /\.command\("([a-z-]+)"\)\s*\n\s*\.description\("([^"]*)"\)/g;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(source)) !== null) {
      const [, name, description] = match;
      if (/\blegacy\b|\bdeprecated\b|prefer '/i.test(description ?? "")) {
        found.push(name!);
      }
    }
    return found;
  }

  it("finds the commands that advertise a replacement", () => {
    // If this ever returned nothing the invariant below would pass vacuously.
    const names = legacyCommands();
    expect(names, "wrap and supervise are the known cases").toEqual(
      expect.arrayContaining(["wrap", "supervise"])
    );
  });

  it("does not flag the successor for naming the commands it replaces", () => {
    // `adapters run` says it is "preferred over 'amc wrap' and 'amc supervise'".
    // A detector that keyed on the word "prefer" alone would demand that the
    // REPLACEMENT warn about itself — the invariant would then be satisfied by
    // making the successor apologise for existing.
    expect(legacyCommands(), "the replacement is not deprecated").not.toContain("run");
  });

  it("every one of them warns at runtime", () => {
    for (const name of legacyCommands()) {
      const start = source.indexOf(`.command("${name}")`);
      // The action body runs to the next top-level command declaration.
      const nextCommand = source.indexOf('.command("', start + 12);
      const block = source.slice(start, nextCommand === -1 ? undefined : nextCommand);
      expect(block, `${name} is documented as superseded but never says so at runtime`)
        .toContain("warnSupersededCommand");
    }
  });
});
