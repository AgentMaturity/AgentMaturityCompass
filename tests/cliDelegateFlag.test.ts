import { mkdtempSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { initWorkspace } from "../src/workspace.js";
import { initBudgets } from "../src/budgets/budgets.js";
import { writeRuntimeFirewallPolicy } from "../src/runtime/firewall.js";
import { initToolsConfig, loadToolsConfig } from "../src/toolhub/toolhubValidators.js";
import { registerAgentCommands, type AgentLoopCliIo } from "../src/cli-agent-commands.js";
import { DEFAULT_MAX_DELEGATION_DEPTH } from "../src/agent/delegationIdentity.js";

/**
 * `amc agent-loop run --delegate`, end to end (P6.1a).
 *
 * The kernel grant and the `delegate` tool each have their own tests. This is the
 * flag path itself — the part that was previously exercised only by `tsc` and
 * lint, and the gap named when the CLI surface landed.
 */
const PASS = "cli-delegate-flag-test-passphrase";
let dir = "";
let home = "";
const cwd = process.cwd();

beforeEach(() => {
  process.env["AMC_VAULT_PASSPHRASE"] = PASS;
  dir = realpathSync(mkdtempSync(join(tmpdir(), "amc-cli-delegate-")));
  home = realpathSync(mkdtempSync(join(tmpdir(), "amc-cli-delegate-home-")));
  initWorkspace({ workspacePath: dir, agentId: "default", trustBoundaryMode: "isolated" });
  initBudgets(dir, "default");
  // `--tools workspace` refuses without a signed firewall policy.
  writeRuntimeFirewallPolicy({ workspace: dir, mode: "observe" });
});

afterEach(() => {
  process.chdir(cwd);
  rmSync(dir, { recursive: true, force: true });
  rmSync(home, { recursive: true, force: true });
});

/** The operator half of the two-party grant: a signed allowlist naming `delegate`. */
function permitDelegate(): void {
  const config = loadToolsConfig(dir);
  initToolsConfig(dir, {
    ...config,
    tools: {
      ...config.tools,
      allowedTools: [...config.tools.allowedTools, { name: "delegate", actionClass: "READ_ONLY" }]
    }
  });
}

interface Captured {
  readonly out: string[];
  readonly errors: string[];
  readonly failures: number[];
}

function programWith(): { program: Command; captured: Captured } {
  const out: string[] = [];
  const errors: string[] = [];
  const failures: number[] = [];
  const io: AgentLoopCliIo = {
    log: (line) => out.push(line),
    error: (line) => errors.push(line),
    fail: () => failures.push(1)
  };
  const program = new Command();
  program.exitOverride();
  registerAgentCommands(program, io);
  return { program, captured: { out, errors, failures } };
}

const run = (program: Command, argv: string[]): Promise<unknown> =>
  program.parseAsync(argv, { from: "user" });

const argvFor = (extra: readonly string[]): string[] => [
  "agent-loop",
  "run",
  "hello",
  "--credentials-home",
  home,
  "--tools",
  "workspace",
  ...extra
];

/**
 * The digests of the tool catalogues one run offered the model.
 *
 * `request/tools` meta carries `toolSchemaSha256` — a hash of the exact schema
 * bytes sent — and meta is never spilled. That matters, because the payload IS:
 * the catalogue is large enough that the spill policy writes it out, and spilled
 * payloads are ENCRYPTED AT REST (`AMC_BLOB_V1` plus ciphertext). Two earlier
 * versions of this helper tried to read the tool NAMES out of the payload and
 * both returned an empty list, which looks exactly like "the tool was never
 * offered" rather than "the reader is wrong".
 *
 * Scoped by session, and deliberately not by row order: `id` is a UUID, so
 * `ORDER BY id` is lexicographic and NOT chronological. Two runs against one
 * workspace come back interleaved, and an earlier draft that sliced the combined
 * list positionally compared run A's first request against run B's — and
 * reported a working flag as broken.
 *
 * The digest cannot say WHICH tool changed; `tests/delegateTool.test.ts` does
 * that against the registry. What it can say, end to end and without decrypting
 * anything, is what this run put in front of the model.
 */
function offeredTo(sessionId: string): string[] {
  const db = new Database(join(dir, ".amc", "evidence.sqlite"), { readonly: true });
  try {
    const rows = db
      .prepare(
        "SELECT meta_json FROM evidence_events WHERE event_type = 'request/tools' AND session_id = ?"
      )
      .all(sessionId) as Array<{ meta_json: string | null }>;
    const digests = rows.map((row) => {
      const meta = JSON.parse(row.meta_json ?? "{}") as Record<string, unknown>;
      return typeof meta["toolSchemaSha256"] === "string" ? meta["toolSchemaSha256"] : "";
    });
    return [...new Set(digests.filter((digest) => digest.length > 0))];
  } finally {
    db.close();
  }
}

/** The session the run reported for itself, from its own `--json` summary. */
function sessionIdFrom(captured: Captured): string {
  const summary = JSON.parse(captured.out[captured.out.length - 1] ?? "{}") as { sessionId?: string };
  if (typeof summary.sessionId !== "string" || summary.sessionId.length === 0) {
    throw new Error(`the run reported no session id: ${captured.out.join("\n")}`);
  }
  return summary.sessionId;
}

describe("amc agent-loop run --delegate", () => {
  it("refuses up front when the operator has not permitted the tool", async () => {
    // The two-party grant: passing the flag is the integrator half. Without the
    // signed allowlist the agent would otherwise call `delegate` and be denied
    // once per turn, which reads as broken tools rather than unconfigured policy.
    process.chdir(dir);
    const { program, captured } = programWith();

    await run(program, argvFor(["--delegate"]));

    expect(captured.errors.join("\n")).toContain("signed tool allowlist");
    expect(captured.errors.join("\n"), "names the fix").toContain("amc tools sign");
    expect(captured.out, "no turn ran").toEqual([]);
  });

  it("changes what the model is offered when the flag is passed", async () => {
    // Read back out of the signed rows, not from the toolset in memory: what
    // matters is what the model was actually shown.
    process.chdir(dir);
    permitDelegate();

    const plainRun = programWith();
    await run(plainRun.program, argvFor(["--json"]));
    expect(plainRun.captured.failures).toEqual([]);
    const plain = offeredTo(sessionIdFrom(plainRun.captured));

    const delegateRun = programWith();
    await run(delegateRun.program, argvFor(["--delegate", "--json"]));
    expect(delegateRun.captured.failures).toEqual([]);
    const delegated = offeredTo(sessionIdFrom(delegateRun.captured));

    expect(plain, "the plain run offered a catalogue").toHaveLength(1);
    expect(delegated, "so did the delegating one").toHaveLength(1);
    expect(delegated[0], "--delegate changed the catalogue the model was shown")
      .not.toBe(plain[0]);
  });

  it("offers an identical catalogue on two identical runs", async () => {
    // The control. Without it the test above would pass on any run-to-run
    // variation in the catalogue rather than on the flag.
    process.chdir(dir);
    permitDelegate();

    const first = programWith();
    await run(first.program, argvFor(["--json"]));
    const second = programWith();
    await run(second.program, argvFor(["--json"]));

    expect(offeredTo(sessionIdFrom(second.captured)))
      .toEqual(offeredTo(sessionIdFrom(first.captured)));
  });

  it("reports the delegation bound it actually applied", async () => {
    // The only place the parsed depth becomes observable. Without it the option
    // was decoration: a build that discarded the operator's value and used the
    // default passed every test, which mutation testing confirmed before this
    // line existed.
    process.chdir(dir);
    permitDelegate();

    const tightened = programWith();
    await run(tightened.program, argvFor(["--delegate", "--max-delegation-depth", "1", "--json"]));
    expect(tightened.captured.failures).toEqual([]);
    expect(tightened.captured.out.join("\n")).toContain("bounded to depth 1");

    const defaulted = programWith();
    await run(defaulted.program, argvFor(["--delegate", "--json"]));
    expect(defaulted.captured.out.join("\n"), "and the default when none is given")
      .toContain(`bounded to depth ${DEFAULT_MAX_DELEGATION_DEPTH}`);
  });

  it("refuses a depth that is not a number, rather than silently unbounding it", async () => {
    // `Number.parseInt("deep", 10)` is NaN, and every depth comparison against
    // NaN is false — so the earlier bare parse turned the bound OFF on a typo
    // while the operator believed it was set.
    process.chdir(dir);
    permitDelegate();
    const { program, captured } = programWith();

    await run(program, argvFor(["--delegate", "--max-delegation-depth", "deep", "--json"]));

    expect(captured.errors.join("\n")).toContain("--max-delegation-depth must be a non-negative integer");
    expect(captured.failures, "and it is a failure, not a warning").not.toEqual([]);
  });
});
