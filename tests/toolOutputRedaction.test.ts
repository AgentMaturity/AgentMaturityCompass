import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ToolRegistry, defineTool } from "../src/tools/toolRegistry.js";
import { ToolPipeline } from "../src/tools/toolPipeline.js";
import { fsTools } from "../src/tools/builtin/fsTools.js";
import { ReadBeforeEditLedger } from "../src/tools/builtin/readBeforeEdit.js";
import { containsRedactionPlaceholder, redactionCountsFor, secretRedactionFilter } from "../src/shield/redaction/toolOutputRedaction.js";
import { initWorkspaceWithoutActionPolicy } from "./helpers/actionPolicyFixtures.js";
import { initBudgets } from "../src/budgets/budgets.js";
import { writeRuntimeFirewallPolicy } from "../src/runtime/firewall.js";
import { registerAgentCommands, type AgentLoopCliIo } from "../src/cli-agent-commands.js";
import { openLedger } from "../src/ledger/ledger.js";
import type { AgentRunSummary } from "../src/agent/runReport.js";

/** Synthetic, never real: shaped like the patterns, issued by nobody. */
const AWS = "AKIA" + "SYNTHETICKEY0001";
const GITHUB = "ghp_" + "s".repeat(36);
const WORKSPACE = "/tmp/amc-tool-output-redaction";

describe("the tool-output secret redaction filter (SH-SANDBOX-06)", () => {
  const execution = { name: "bash" } as never;

  it("replaces every recognised secret with a typed placeholder and keeps counts by type, not text", () => {
    const out = secretRedactionFilter(`key=${AWS}\ntoken=${GITHUB}\nagain=${AWS}`, execution);
    expect(out).not.toContain(AWS);
    expect(out).not.toContain(GITHUB);
    expect(out).toBe("key=[AMC_REDACTED:aws_key]\ntoken=[AMC_REDACTED:github_token]\nagain=[AMC_REDACTED:aws_key]");
    expect(redactionCountsFor(execution)).toEqual({ aws_key: 2, github_token: 1 });
    expect(containsRedactionPlaceholder(out)).toBe(true);
  });

  it("keeps a JSON result exact JSON: a key-named credential is redacted inside its string value, not across the member", () => {
    const json = { name: "fs.read" } as never;
    const value = "abcdefghijklmnop1234";
    const out = secretRedactionFilter(JSON.stringify({ api_key: value, apiKey: value, aws_secret_access_key: "A".repeat(40), other: 1, nested: { note: `see ${AWS}` }, list: ["plain-list-entry-16chars"] }), json);
    expect(out).not.toContain(value);
    expect(out).not.toContain(AWS);
    expect(JSON.parse(out)).toEqual({ api_key: "[AMC_REDACTED:generic_api_key]", apiKey: "[AMC_REDACTED:generic_api_key]", aws_secret_access_key: "[AMC_REDACTED:aws_secret]",
      other: 1, nested: { note: "see [AMC_REDACTED:aws_key]" }, list: ["plain-list-entry-16chars"] });
    expect(redactionCountsFor(json)).toEqual({ generic_api_key: 2, aws_secret: 1, aws_key: 1 });
    // A placeholder that already sits inside a string value leaves the flat pass's JSON intact, so the bytes are kept as they were.
    const intact = { name: "fs.read" } as never;
    expect(secretRedactionFilter(`{"note": "key ${AWS} here"}`, intact)).toBe('{"note": "key [AMC_REDACTED:aws_key] here"}');
  });

  it("S22: a secret used as a JSON member name is redacted too, and two names that redact alike stay two members", () => {
    const keyed = { name: "fs.read" } as never;
    const other = "AKIA" + "SYNTHETICKEY0002";
    const out = secretRedactionFilter(`{"${AWS}":{"api_key":"abcdefghijklmnop1234"},"${other}":"second","__proto__":"kept"}`, keyed);
    expect(out).not.toContain(AWS);
    expect(out).not.toContain(other);
    const parsed = JSON.parse(out) as Record<string, unknown>;
    expect(Object.keys(parsed)).toEqual(["[AMC_REDACTED:aws_key]", "[AMC_REDACTED:aws_key]#2", "__proto__"]);
    expect(parsed["[AMC_REDACTED:aws_key]"]).toEqual({ api_key: "[AMC_REDACTED:generic_api_key]" });
    expect(parsed["[AMC_REDACTED:aws_key]#2"]).toBe("second");
    expect(Object.getOwnPropertyDescriptor(parsed, "__proto__")?.value).toBe("kept");
    expect(redactionCountsFor(keyed)).toEqual({ aws_key: 2, generic_api_key: 1 });
  });

  it("S22: a structured pass that finds fewer secrets of a type than the flat pass falls back to the flat text", () => {
    const numeric = { name: "fs.read" } as never;
    // The flat pass reads the number under a key-named member as a key and breaks the JSON; the structured pass leaves
    // numbers alone, so it would miss that one while still finding the token.
    const out = secretRedactionFilter(`{"api_key": 1234567890123456789, "token": "${GITHUB}"}`, numeric);
    expect(out).not.toContain("1234567890123456789");
    expect(out).not.toContain(GITHUB);
    expect(out).toBe('{"[AMC_REDACTED:generic_api_key], "token": "[AMC_REDACTED:github_token]"}');
    expect(redactionCountsFor(numeric)).toEqual({ generic_api_key: 1, github_token: 1 });
  });

  it("JSON nested too deep to walk keeps the flat, redacted text instead of failing the call", () => {
    const deep = { name: "bash" } as never;
    const depth = 200_000;
    const out = secretRedactionFilter(`${"[".repeat(depth)}{"api_key":"abcdefghijklmnop1234"}${"]".repeat(depth)}`, deep);
    expect(out).not.toContain("abcdefghijklmnop1234");
    expect(out).toContain("[AMC_REDACTED:generic_api_key]");
    expect(redactionCountsFor(deep)).toEqual({ generic_api_key: 1 });
  });

  it("fs.edit refuses a replacement carrying a redaction placeholder, before any read-before-edit verdict, and leaves the file alone", async () => {
    const workspace = realpathSync(mkdtempSync(join(tmpdir(), "amc-redaction-edit-")));
    try {
      const registry = new ToolRegistry();
      for (const tool of fsTools({ ledger: new ReadBeforeEditLedger() })) registry.define(tool);
      const pipeline = new ToolPipeline({ registry, workspace });
      writeFileSync(join(workspace, "f.txt"), "key=real\n");
      // No prior fs.read: the placeholder check is an argument check and names itself, not the read-before-edit policy.
      const refused = await pipeline.execute({ name: "fs.edit", agentId: "a", arguments: { path: "f.txt", find: "real", replace: "[AMC_REDACTED:aws_key]" }, requestedMode: "EXECUTE" });
      expect(refused.ok).toBe(false);
      expect(refused.output).toMatch(/fs\.edit refused: the content contains an AMC redaction placeholder/);
      expect(readFileSync(join(workspace, "f.txt"), "utf8")).toBe("key=real\n");
    } finally { rmSync(workspace, { recursive: true, force: true }); }
  });

  it("returns the same string and no counts when nothing matches", () => {
    const clean = { name: "fs.read" } as never;
    const text = "nothing secret here\nline two";
    expect(secretRedactionFilter(text, clean)).toBe(text);
    expect(redactionCountsFor(clean)).toBeNull();
    expect(containsRedactionPlaceholder(text)).toBe(false);
  });

  it("runs over a body's output and over a thrown body's message on the real pipeline", async () => {
    const registry = new ToolRegistry();
    registry.define(defineTool({ name: "leaky", actionClass: "READ_ONLY", description: "prints a key",
      body: () => ({ ok: true, output: `here: ${AWS}` }) }));
    registry.define(defineTool({ name: "thrower", actionClass: "READ_ONLY", description: "throws a key",
      body: () => { throw new Error(`stderr: ${GITHUB}`); } }));
    const pipeline = new ToolPipeline({ registry, workspace: WORKSPACE, filters: [secretRedactionFilter] });
    const leaked = await pipeline.execute({ name: "leaky", agentId: "a", arguments: {}, requestedMode: "EXECUTE" });
    expect(leaked.ok).toBe(true);
    expect(leaked.output).toBe("here: [AMC_REDACTED:aws_key]");
    expect(leaked.bytes).toBe(Buffer.byteLength(leaked.output, "utf8"));
    const thrown = await pipeline.execute({ name: "thrower", agentId: "a", arguments: {}, requestedMode: "EXECUTE" });
    expect(thrown.ok).toBe(false);
    expect(thrown.output).toBe("stderr: [AMC_REDACTED:github_token]");
    expect(thrown.output).not.toContain(GITHUB);
  });
});

describe("through amc agent-loop run with workspace tools", () => {
  const originalCwd = process.cwd();
  let workspace: string;
  let credentialsHome: string;
  let priorPassphrase: string | undefined;
  let priorExitListeners: ReturnType<typeof process.listeners>;

  beforeEach(() => {
    priorPassphrase = process.env.AMC_VAULT_PASSPHRASE;
    process.env.AMC_VAULT_PASSPHRASE = "tool-output-redaction-test";
    workspace = realpathSync(mkdtempSync(join(tmpdir(), "amc-redaction-")));
    credentialsHome = realpathSync(mkdtempSync(join(tmpdir(), "amc-redaction-home-")));
    initWorkspaceWithoutActionPolicy({ workspacePath: workspace, agentId: "default", trustBoundaryMode: "isolated" });
    initBudgets(workspace, "default");
    writeRuntimeFirewallPolicy({ workspace, mode: "observe" });
    priorExitListeners = process.listeners("exit");
    process.chdir(workspace);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    for (const listener of process.listeners("exit")) {
      if (!priorExitListeners.includes(listener)) { process.removeListener("exit", listener); listener(0); }
    }
    if (priorPassphrase === undefined) delete process.env.AMC_VAULT_PASSPHRASE;
    else process.env.AMC_VAULT_PASSPHRASE = priorPassphrase;
    rmSync(workspace, { recursive: true, force: true });
    rmSync(credentialsHome, { recursive: true, force: true });
  });

  async function runCli(prompt: string): Promise<{ errors: string[]; failed: boolean; summary: AgentRunSummary | null }> {
    const out: string[] = []; const errors: string[] = []; let failed = false;
    const program = new Command().exitOverride();
    const io: AgentLoopCliIo = { log: line => out.push(line), error: line => errors.push(line), fail: () => { failed = true; } };
    registerAgentCommands(program, io);
    await program.parseAsync(["agent-loop", "run", prompt, "--provider", "stub", "--credentials-home", credentialsHome, "--json", "--tools", "workspace"], { from: "user" });
    const last = out.at(-1);
    return { errors, failed, summary: failed || last === undefined ? null : JSON.parse(last) as AgentRunSummary };
  }

  function audits(sessionId: string): Array<Record<string, unknown>> {
    const ledger = openLedger(workspace, { readonly: true });
    try {
      return ledger.getAllEvents().filter(row => row.event_type === "audit" && row.session_id === sessionId)
        .map(row => JSON.parse(row.meta_json ?? "{}") as Record<string, unknown>);
    } finally { ledger.close(); }
  }

  it("a file read that contains a key reaches the session redacted, with a TOOL_OUTPUT_REDACTED row carrying counts only", async () => {
    mkdirSync(join(workspace, "workspace"), { recursive: true });
    writeFileSync(join(workspace, "workspace", "notes.txt"), `export AWS_KEY=${AWS}\n`);
    const { errors, failed, summary } = await runCli(JSON.stringify({ tool: "fs.read", arguments: { path: "workspace/notes.txt" } }));
    expect(failed, errors.join("\n")).toBe(false);
    const rows = audits(summary!.sessionId);
    const redacted = rows.find(meta => meta["auditType"] === "TOOL_OUTPUT_REDACTED");
    expect(redacted).toMatchObject({ tool: "fs.read", counts: { aws_key: 1 } });
    expect(JSON.stringify(rows)).not.toContain(AWS);
    const ledger = openLedger(workspace, { readonly: true });
    try {
      // Neither the signed rows nor their metadata hold the key anywhere in this session (payloads are encrypted at
      // rest, so the placeholder text itself is asserted on the pipeline above, not here).
      const everything = ledger.getAllEvents().filter(row => row.session_id === summary!.sessionId).map(row => `${row.meta_json ?? ""}\n${row.payload_inline ?? ""}`).join("\n");
      expect(everything).not.toContain(AWS);
    } finally { ledger.close(); }
  });

  it("fs.write refuses content carrying a redaction placeholder instead of writing it over a real value", async () => {
    const { errors, failed, summary } = await runCli(JSON.stringify({ tool: "fs.write", arguments: { path: "workspace/output/copied.txt", content: "key=[AMC_REDACTED:aws_key]\n" } }));
    expect(failed, errors.join("\n")).toBe(false);
    expect(existsSync(join(workspace, "workspace", "output", "copied.txt"))).toBe(false);
    expect(audits(summary!.sessionId).some(meta => meta["auditType"] === "TOOL_CALL_FAILED" && meta["toolName"] === "fs.write")).toBe(true);
  });
});
