/**
 * Operator surface for the credentials seam (P3.0): list, describe, set, unset.
 *
 * Two rules shape every line of this file.
 *
 * **No value is ever printed.** Not in the table, not under `--json`, not in an
 * error. The only read the seam offers that returns a secret is `resolve`, and
 * this module never calls it — everything rendered here comes from `describe`,
 * whose return type has no field a value could occupy. A CLI is the single most
 * likely place for a key to escape: its output lands in terminal scrollback, in
 * CI logs, and in the bug report an operator pastes it into.
 *
 * **No value is ever accepted on the command line.** `set` takes a reference,
 * never `set REF <value>`. An argv secret is visible in shell history, in `ps`
 * output to every user on the box, and in the process table a container
 * platform ships to its logging backend. The value arrives on stdin or through
 * a no-echo prompt, and nowhere else.
 *
 * This module also serves the native first-use guide. It lives separately
 * because src/cli.ts is at its line-ratchet floor.
 */
import type { Command } from "commander";
import chalk from "chalk";
import { credentialRef, type CredentialRef } from "./credentials/credentialRef.js";
import type { CredentialDescription } from "./credentials/credentialSources.js";
import { CredentialsError } from "./credentials/credentialsErrors.js";
import type { CredentialsPathsInput } from "./credentials/credentialsPaths.js";
import { LocalCredentialsService } from "./credentials/localCredentialsService.js";

/**
 * The side-effecting edges, injectable so the command wiring itself is testable.
 *
 * Without this a test of "the CLI never prints a secret" would have to spawn the
 * built binary, which is slow enough that it does not get written — and an
 * unwritten secrecy test is how a value reaches a terminal.
 */
export interface CredentialsCliIo {
  readonly log: (line: string) => void;
  readonly error: (line: string) => void;
  /** Marks the run as failed. */
  readonly fail: () => void;
  /** Obtains a secret without echoing it or placing it in argv. */
  readonly readSecret: (ref: CredentialRef) => Promise<string>;
}

interface StoreOptions {
  home?: string;
  file?: string;
  projectDir?: string;
}

interface DescribeRow {
  readonly ref: string;
  readonly configured: boolean;
  readonly source: string | null;
  readonly writable: boolean;
}

/**
 * Reads a secret from stdin when it is piped, and prompts otherwise.
 *
 * The piped branch is what makes `... | amc credentials set REF` work in a
 * deploy script; the prompt branch is what stops an operator at a terminal from
 * reaching for `set REF $KEY` and putting the key in their shell history.
 */
async function readSecretFromStdinOrPrompt(ref: CredentialRef): Promise<string> {
  if (process.stdin.isTTY) {
    const inquirer = (await import("inquirer")).default;
    const answers = await inquirer.prompt<{ value: string }>([
      { type: "password", name: "value", mask: "*", message: `Value for ${ref}:` }
    ]);
    return answers.value;
  }
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string));
  }
  return Buffer.concat(chunks).toString("utf8");
}

const defaultIo: CredentialsCliIo = {
  log: (line) => console.log(line),
  error: (line) => console.error(line),
  // `process.exitCode` rather than `process.exit`: the store holds a write queue
  // and a lock, and exiting mid-drain would leave a lock file behind for the
  // next process to time out on.
  fail: () => {
    process.exitCode = 1;
  },
  readSecret: readSecretFromStdinOrPrompt
};

/** Opens the layered store for one command. Never watches: this process is about to end. */
function openStore(options: StoreOptions): LocalCredentialsService {
  const input: CredentialsPathsInput & { watch: boolean } = {
    watch: false,
    projectDir: options.projectDir ?? process.cwd(),
    ...(options.home ? { homeDir: options.home } : {}),
    ...(options.file ? { path: options.file } : {})
  };
  return new LocalCredentialsService(input);
}

function row(ref: CredentialRef, description: CredentialDescription): DescribeRow {
  return {
    ref: String(ref),
    configured: description.configured,
    source: description.source,
    writable: description.writable
  };
}

/**
 * One row, rendered.
 *
 * Every field here is derived from a source name and two booleans. There is no
 * branch that could reach a value, because no value was ever fetched.
 */
function renderRow(entry: DescribeRow): string {
  const name = entry.ref.padEnd(28);
  if (!entry.configured) {
    return `  ${name} ${chalk.gray("not configured")}`;
  }
  const source = (entry.source ?? "?").padEnd(13);
  const writable = entry.writable
    ? chalk.green("writable")
    : chalk.yellow("read-only (env shadows every writable layer)");
  return `  ${name} ${chalk.cyan(source)} ${writable}`;
}

/**
 * Reports a failure without ever quoting what caused it.
 *
 * The seam's own errors are written to be safe to print — they name references,
 * positions and fix commands, never file content — so they pass through
 * verbatim. Anything else is reduced to its message, which is the same
 * treatment the rest of the CLI gives an unexpected throw.
 */
function reportError(io: CredentialsCliIo, error: unknown): void {
  if (error instanceof CredentialsError) {
    io.error(chalk.red(`${error.code}: ${error.message}`));
  } else {
    io.error(chalk.red(error instanceof Error ? error.message : String(error)));
  }
  io.fail();
}

/** Parses a reference argument, turning a bad one into an operator-readable failure. */
function parseRef(io: CredentialsCliIo, raw: string): CredentialRef | null {
  try {
    return credentialRef(raw);
  } catch (error) {
    reportError(io, error);
    return null;
  }
}

function withStoreOptions(command: Command): Command {
  return command
    .option("--home <path>", "AMC home directory holding .credentials.yaml (default: $AMC_HOME or ~/.config/amc)")
    .option("--file <path>", "credentials file path; overrides --home")
    .option("--project-dir <path>", "workspace supplying the project .env layer (default: cwd)");
}

async function runWithStore(
  io: CredentialsCliIo,
  options: StoreOptions,
  body: (store: LocalCredentialsService) => Promise<void> | void
): Promise<void> {
  let store: LocalCredentialsService;
  try {
    // Construction asserts the store's permissions, so a world-readable file
    // fails here with the chmod that fixes it rather than being listed as fine.
    store = openStore(options);
  } catch (error) {
    reportError(io, error);
    return;
  }
  try {
    await body(store);
  } catch (error) {
    reportError(io, error);
  } finally {
    await store.close();
  }
}

export function registerCredentialsCommands(program: Command, io: CredentialsCliIo = defaultIo): void {
  const credentials = program
    .command("credentials")
    .description(
      "Provider credential references — list, describe, set, unset. Never prints a value"
    );

  withStoreOptions(
    credentials
      .command("list")
      .description("List every reference the file-backed layers configure, plus any named explicitly")
      .argument("[refs...]", "extra references to include (env-supplied ones are not enumerated)")
      .option("--json", "Output as JSON")
  ).action(async (refs: string[], opts: StoreOptions & { json?: boolean }) => {
    await runWithStore(io, opts, (store) => {
      const extra: CredentialRef[] = [];
      for (const raw of refs) {
        const ref = parseRef(io, raw);
        if (ref === null) return;
        extra.push(ref);
      }
      const seen = new Map<string, CredentialRef>();
      for (const ref of [...store.names(), ...extra]) seen.set(String(ref), ref);
      const rows = [...seen.values()]
        .sort((left, right) => String(left).localeCompare(String(right)))
        .map((ref) => row(ref, store.describe(ref)));

      if (opts.json) {
        // Paths and verdicts only. A `describe` cannot carry a value, so this
        // envelope cannot either.
        io.log(
          JSON.stringify(
            {
              file: store.paths.file,
              projectEnvFile: store.paths.projectEnvFile,
              userEnvFile: store.paths.userEnvFile,
              precedence: ["env", "file", "project-env", "user-env"],
              credentials: rows
            },
            null,
            2
          )
        );
        return;
      }

      io.log(chalk.bold("Credential references"));
      io.log(chalk.gray(`  store: ${store.paths.file}`));
      io.log(chalk.gray("  precedence: env > file > project-env > user-env"));
      io.log("");
      if (rows.length === 0) {
        io.log(chalk.gray("  No references configured by the file-backed layers."));
        io.log(chalk.gray("  Environment-supplied references are not enumerated; name one to see it:"));
        io.log(chalk.gray("    amc credentials describe OPENAI_API_KEY"));
        return;
      }
      for (const entry of rows) io.log(renderRow(entry));
    });
  });

  withStoreOptions(
    credentials
      .command("describe")
      .description("Report whether a reference is configured, by which layer, and whether AMC may write it")
      .argument("<ref>", "credential reference, e.g. OPENAI_API_KEY")
      .option("--json", "Output as JSON")
  ).action(async (raw: string, opts: StoreOptions & { json?: boolean }) => {
    await runWithStore(io, opts, (store) => {
      const ref = parseRef(io, raw);
      if (ref === null) return;
      const entry = row(ref, store.describe(ref));
      if (opts.json) {
        io.log(JSON.stringify(entry, null, 2));
      } else {
        io.log(renderRow(entry));
      }
      // Non-zero when nothing configures it, so a deploy script can gate on
      // `amc credentials describe X` without parsing the output.
      if (!entry.configured) io.fail();
    });
  });

  withStoreOptions(
    credentials
      .command("set")
      .description("Store a value for a reference. The value is read from stdin or prompted — never from argv")
      .argument("<ref>", "credential reference, e.g. OPENAI_API_KEY")
      .option("--json", "Output as JSON")
  ).action(async (raw: string, opts: StoreOptions & { json?: boolean }) => {
    await runWithStore(io, opts, async (store) => {
      const ref = parseRef(io, raw);
      if (ref === null) return;
      // Read before the write so a shadowed reference still consumes stdin
      // rather than leaving a pipe half-drained for the next command.
      const value = await io.readSecret(ref);
      await store.set(ref, value);
      const entry = row(ref, store.describe(ref));
      if (opts.json) {
        io.log(JSON.stringify({ ...entry, stored: true }, null, 2));
        return;
      }
      io.log(chalk.green(`Stored ${ref} in ${store.paths.file}`));
      io.log(renderRow(entry));
    });
  });

  withStoreOptions(
    credentials
      .command("unset")
      .description("Remove a reference from the writable layer (refused when the environment supplies it)")
      .argument("<ref>", "credential reference, e.g. OPENAI_API_KEY")
      .option("--json", "Output as JSON")
  ).action(async (raw: string, opts: StoreOptions & { json?: boolean }) => {
    await runWithStore(io, opts, async (store) => {
      const ref = parseRef(io, raw);
      if (ref === null) return;
      const removed = await store.unset(ref);
      const entry = row(ref, store.describe(ref));
      if (opts.json) {
        io.log(JSON.stringify({ ...entry, removed }, null, 2));
        return;
      }
      // "Removed" and "was not there" are reported apart: an operator rotating a
      // key needs to know which one happened.
      io.log(removed ? chalk.green(`Removed ${ref}`) : chalk.yellow(`${ref} was not in the writable layer`));
      io.log(renderRow(entry));
    });
  });
}
