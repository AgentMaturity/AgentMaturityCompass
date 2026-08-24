import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Command } from "commander";
import {
  registerCredentialsCommands,
  type CredentialsCliIo
} from "../src/cli-credentials-commands.js";

/**
 * P3.0 stage 3 — the operator CLI must never emit a credential value.
 *
 * A CLI is the likeliest place for a secret to escape: its output lands in
 * terminal scrollback, in CI logs, and in the bug report an operator pastes it
 * into. So the assertion here is an *absence* one — every byte the commands
 * emit is searched for the stored value — paired with a presence assertion, so
 * a command that printed nothing at all could not pass by saying nothing.
 *
 * The fixture is a synthetic marker string, not a plausible key. It is never
 * compared for equality anywhere below; it is only ever searched for.
 */
const REF = "AMC_TEST_CLI_KEY";
const SECRET = "SECRET-MARKER-must-never-be-printed";
const SECOND_REF = "AMC_TEST_CLI_OTHER";
const SECOND_SECRET = "SECOND-MARKER-must-never-be-printed";

describe("amc credentials — the CLI never emits a value", () => {
  let home: string;
  let projectDir: string;
  let out: string[];
  let err: string[];
  let failures: number;
  let io: CredentialsCliIo;
  let secretToSupply: string;
  let secretReads: number;

  const run = async (...argv: string[]): Promise<void> => {
    const program = new Command();
    program.exitOverride();
    registerCredentialsCommands(program, io);
    await program.parseAsync(argv, { from: "user" });
  };

  const emitted = (): string => [...out, ...err].join("\n");

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "amc-cred-cli-"));
    projectDir = join(home, "project");
    mkdirSync(projectDir, { recursive: true });
    const file = join(home, ".credentials.yaml");
    writeFileSync(file, `${REF}: ${SECRET}\n`, { mode: 0o600 });
    chmodSync(file, 0o600);
    chmodSync(home, 0o700);

    out = [];
    err = [];
    failures = 0;
    secretToSupply = SECOND_SECRET;
    secretReads = 0;
    io = {
      log: (line) => out.push(line),
      error: (line) => err.push(line),
      fail: () => {
        failures += 1;
      },
      readSecret: async () => {
        secretReads += 1;
        return secretToSupply;
      }
    };
  });

  afterEach(() => {
    rmSync(home, { recursive: true, force: true });
  });

  const base = (): string[] => ["--home", home, "--project-dir", projectDir];

  it("lists a configured reference by name, source and writability — never its value", async () => {
    await run("credentials", "list", ...base());
    // Presence: without this the absence assertion below would pass on silence.
    expect(emitted()).toContain(REF);
    expect(emitted()).toContain("file");
    expect(emitted()).not.toContain(SECRET);
    expect(failures).toBe(0);
  });

  it("keeps the value out of --json output too", async () => {
    await run("credentials", "list", "--json", ...base());
    const payload = JSON.parse(out.join("\n")) as {
      credentials: Array<{ ref: string; configured: boolean; source: string | null; writable: boolean }>;
    };
    expect(payload.credentials).toEqual([{ ref: REF, configured: true, source: "file", writable: true }]);
    // The whole envelope, not just the row: a path or a diagnostic field could
    // carry it just as easily as a value field.
    expect(emitted()).not.toContain(SECRET);
  });

  it("includes an explicitly named env-supplied reference, marked read-only, value withheld", async () => {
    const envRef = "AMC_TEST_CLI_FROM_ENV";
    process.env[envRef] = "ENV-MARKER-must-never-be-printed";
    try {
      // Named explicitly because the environment is never enumerated — the
      // listing would otherwise sweep in PATH, HOME and every other variable.
      await run("credentials", "list", envRef, "--json", ...base());
      const payload = JSON.parse(out.join("\n")) as { credentials: unknown[] };
      expect(payload.credentials).toContainEqual({
        ref: envRef,
        configured: true,
        source: "env",
        writable: false
      });
      expect(emitted()).not.toContain("ENV-MARKER-must-never-be-printed");
    } finally {
      delete process.env[envRef];
    }
  });

  it("describes a reference without reading it", async () => {
    await run("credentials", "describe", REF, "--json", ...base());
    expect(JSON.parse(out.join("\n"))).toEqual({
      ref: REF,
      configured: true,
      source: "file",
      writable: true
    });
    expect(emitted()).not.toContain(SECRET);
    expect(failures).toBe(0);
  });

  it("reports an unconfigured reference as a failure, without inventing a source", async () => {
    await run("credentials", "describe", "AMC_TEST_CLI_ABSENT", "--json", ...base());
    expect(JSON.parse(out.join("\n"))).toEqual({
      ref: "AMC_TEST_CLI_ABSENT",
      configured: false,
      source: null,
      writable: true
    });
    expect(failures).toBe(1);
  });

  it("takes the value from the secret channel, and prints neither it nor a confirmation of it", async () => {
    await run("credentials", "set", SECOND_REF, ...base());

    expect(secretReads).toBe(1);
    const stored = readFileSync(join(home, ".credentials.yaml"), "utf8");
    expect(stored).toContain(SECOND_REF);
    expect(emitted()).toContain(SECOND_REF);
    expect(emitted()).not.toContain(SECOND_SECRET);
    expect(failures).toBe(0);
  });

  it("refuses a value passed as a command-line argument", async () => {
    const argvToken = "ARGV-TOKEN-that-must-not-be-stored";
    // `set` declares exactly one argument, so a value in this position is a
    // parse error rather than a stored key. Without that, every `set` would put
    // a credential into shell history and into `ps` output for every user on
    // the box.
    await expect(run("credentials", "set", SECOND_REF, argvToken, ...base())).rejects.toThrow(
      /too many arguments/
    );
    expect(secretReads).toBe(0);
    expect(readFileSync(join(home, ".credentials.yaml"), "utf8")).not.toContain(argvToken);
  });

  it("removes a reference and distinguishes removed from already-absent", async () => {
    await run("credentials", "unset", REF, "--json", ...base());
    expect(JSON.parse(out.join("\n"))).toEqual({
      ref: REF,
      configured: false,
      source: null,
      writable: true,
      removed: true
    });
    expect(emitted()).not.toContain(SECRET);

    out = [];
    await run("credentials", "unset", REF, "--json", ...base());
    expect((JSON.parse(out.join("\n")) as { removed: boolean }).removed).toBe(false);
  });

  it("refuses a shadowed write loudly, naming the reference and the fix", async () => {
    const shadowed = "AMC_TEST_CLI_SHADOWED";
    process.env[shadowed] = "env-supplied-marker";
    try {
      await run("credentials", "set", shadowed, ...base());
      expect(failures).toBe(1);
      expect(err.join("\n")).toContain("AMC_CREDENTIAL_SHADOWED_WRITE");
      expect(err.join("\n")).toContain(shadowed);
      // The refusal must not disclose what the environment holds, and must not
      // have written anything either — a stored copy would never be read.
      expect(emitted()).not.toContain("env-supplied-marker");
      expect(readFileSync(join(home, ".credentials.yaml"), "utf8")).not.toContain(shadowed);
    } finally {
      delete process.env[shadowed];
    }
  });

  it("withholds the offending text when a reference argument is not a reference", async () => {
    // The likeliest way to reach this is pasting a VALUE where a NAME belongs,
    // so echoing the argument back would turn the guard against the thing it
    // guards.
    await run("credentials", "describe", SECRET, ...base());
    expect(failures).toBe(1);
    expect(err.join("\n")).toContain("AMC_CREDENTIAL_REF_INVALID");
    expect(emitted()).not.toContain(SECRET);
  });

  it("refuses to read a group-readable store, naming the chmod that fixes it", async () => {
    chmodSync(join(home, ".credentials.yaml"), 0o644);
    await run("credentials", "list", ...base());
    expect(failures).toBe(1);
    expect(err.join("\n")).toContain("AMC_CREDENTIAL_FILE_PERMISSIONS");
    expect(err.join("\n")).toContain("chmod 600");
    expect(emitted()).not.toContain(SECRET);
  });
});
