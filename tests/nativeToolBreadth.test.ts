import { EventEmitter } from "node:events";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ChildProcess } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import YAML from "yaml";
import { initWorkspace } from "../src/workspace.js";
import { openLedger } from "../src/ledger/ledger.js";
import { initToolsConfig, loadToolsConfig, signToolsConfig, toolsConfigPath } from "../src/toolhub/toolhubValidators.js";
import type { ToolExecution } from "../src/tools/toolTypes.js";
import type { NativeReceipt, NativeReceiptRecorder } from "../src/tools/builtin/nativeToolBreadth/nativeReceipt.js";
import { signRecord } from "../src/tools/builtin/nativeToolBreadth/signedSessionRecords.js";
import { webFetchTool } from "../src/tools/builtin/webFetchTool.js";
import { webSearchTool } from "../src/tools/builtin/webSearchTool.js";
import { searxngSearchProvider } from "../src/tools/builtin/webSearchProviders.js";
import { askUserTool, signAskUserAnswer, type AskUserAnswerer, type AskUserQuestion } from "../src/tools/builtin/askUserTool.js";
import { readSessionTodo, renderSessionLists, todoTool } from "../src/tools/builtin/todoTool.js";
import { planTool } from "../src/tools/builtin/planTool.js";
import { skillLoadTool } from "../src/skills/skillLoadTool.js";
import { workspaceSkillRoots } from "../src/skills/skillTurn.js";
import { createNativeInteractiveAskUser, parseAskUserInput } from "../src/setup/nativeInteractiveAskUser.js";
import { Command } from "commander";
import { initBudgets } from "../src/budgets/budgets.js";
import { writeRuntimeFirewallPolicy } from "../src/runtime/firewall.js";
import { registerAgentCommands, type AgentLoopCliIo } from "../src/cli-agent-commands.js";

/**
 * The P1-43 breadth tools (DXC-27, WP40): web_fetch, web_search, ask_user,
 * todo, plan, and the skill.load tool. Each body is driven directly with a
 * recorder that writes the same raw-ledger rows `agentToolset` writes, so the
 * ledger-bound checks read real signed evidence.
 */

const SESSION = "breadth-session";
let workspace: string;
let server: Server;
let origin: string;
let connections = 0;
const served: string[] = [];

function receiptsTo(ws: string): { record: NativeReceiptRecorder; receipts: NativeReceipt[] } {
  const receipts: NativeReceipt[] = [];
  return {
    receipts,
    record: (execution, receipt) => {
      receipts.push(receipt);
      const meta = { schemaVersion: "2026-10-07", ...receipt, tool: execution.name, sessionId: SESSION, agentId: execution.agentId, callId: execution.callId };
      const ledger = openLedger(ws);
      try { ledger.appendEvidence({ sessionId: SESSION, runtime: "amc", eventType: "audit", payload: JSON.stringify(meta), meta, payloadExt: "json" }); }
      finally { ledger.close(); }
    }
  };
}

let calls = 0;
function exec(name: string, args: Record<string, unknown>, overrides: Partial<ToolExecution> = {}): ToolExecution {
  calls += 1;
  return {
    token: `t${calls}`, callId: `c${calls}`, rootCallId: `c${calls}`, name, agentId: "default", workspace,
    actionClass: "READ_ONLY", requestedMode: "EXECUTE", effectiveMode: "EXECUTE", arguments: args, parentToken: null, ...overrides
  };
}

beforeAll(async () => {
  process.env.AMC_VAULT_PASSPHRASE ??= "native-tool-breadth-pass";
  server = createServer((request, response) => {
    served.push(request.url ?? "");
    const url = new URL(request.url ?? "/", "http://x");
    const q = url.searchParams.get("q") ?? "";
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ results: [{ title: `About ${q}`, url: `https://example.org/${encodeURIComponent(q)}`, content: `snippet for ${q}` }] }));
  });
  server.on("connection", () => { connections += 1; });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  workspace = realpathSync(mkdtempSync(join(tmpdir(), "amc-breadth-")));
  initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
  const ledger = openLedger(workspace);
  ledger.startSession({ sessionId: SESSION, runtime: "amc", binaryPath: "test", binarySha256: "test" });
  ledger.close();
  const tools = YAML.parse(readFileSync(toolsConfigPath(workspace), "utf8")) as { tools: { allowedTools: unknown[] } };
  tools.tools.allowedTools.push(
    { name: "web_fetch", actionClass: "NETWORK_EXTERNAL", allow: { hostAllowlist: ["docs.example.org"] } },
    { name: "web_search", actionClass: "NETWORK_EXTERNAL", allow: { hostAllowlist: [origin, "127.0.0.1"] } }
  );
  writeFileSync(toolsConfigPath(workspace), YAML.stringify(tools));
  signToolsConfig(workspace);
}, 60_000);

afterAll(async () => {
  await new Promise<void>((done) => server.close(() => done()));
  rmSync(workspace, { recursive: true, force: true });
});

describe("egress ordering", () => {
  it("refuses an unlisted origin before any DNS lookup or socket, and leaves a deny receipt", async () => {
    const { record, receipts } = receiptsTo(workspace);
    let resolved = 0;
    const tool = webFetchTool({ record, resolve: async () => { resolved += 1; return ["127.0.0.1"]; } });
    const before = connections;
    await expect(tool.body(exec("web_fetch", { url: `${origin}/secret` }))).rejects.toThrow(/refused/);
    expect(resolved).toBe(0);
    expect(connections).toBe(before);
    expect(receipts.at(-1)).toMatchObject({ auditType: "NATIVE_WEB_FETCH", decision: "deny" });
  });
});

describe("web_search", () => {
  it("refuses with a clear reason when no provider is configured", async () => {
    const { record, receipts } = receiptsTo(workspace);
    await expect(webSearchTool({ record }).body(exec("web_search", { query: "amc" }))).rejects.toThrow(/no search provider is configured/);
    expect(receipts.at(-1)).toMatchObject({ auditType: "NATIVE_WEB_SEARCH", decision: "deny" });
  });

  it("returns labelled results through the SearXNG provider, one request per query, with one allow receipt", async () => {
    const { record, receipts } = receiptsTo(workspace);
    served.length = 0;
    const result = await webSearchTool({ record, provider: searxngSearchProvider(origin) })
      .body(exec("web_search", { queries: ["alpha", "beta"], limit: 3 }));
    expect(result.ok).toBe(true);
    expect(result.output).toContain("About alpha");
    expect(result.output).toContain("## beta");
    expect(served).toHaveLength(2);
    expect(served[0]).toContain("format=json");
    const allows = receipts.filter((one) => one.auditType === "NATIVE_WEB_SEARCH");
    expect(allows).toHaveLength(1);
    expect(allows[0]).toMatchObject({ decision: "allow", provider: "searxng", queryCount: 2, resultCount: 2 });
  });

  it("refuses a provider that requests an origin other than the one it declared", async () => {
    const { record } = receiptsTo(workspace);
    const rogue = { id: "rogue", origin, search: async ({ get }: { get: (url: string) => Promise<unknown> }) => { await get("https://elsewhere.example.org/"); return []; } };
    await expect(webSearchTool({ record, provider: rogue }).body(exec("web_search", { query: "x" }))).rejects.toThrow(/may only request its declared origin/);
  });

  it("refuses a provider origin that is not a bare http(s) origin", () => {
    expect(() => searxngSearchProvider("search.example.org")).toThrow(/http\(s\) origin/);
    expect(() => searxngSearchProvider("https://u:p@search.example.org")).toThrow(/http\(s\) origin/);
  });
});

describe("ask_user signed-answer binding", () => {
  const ask = (answerer: AskUserAnswerer) => askUserTool({ sessionId: SESSION, record: receiptsTo(workspace).record, answerer, timeoutMs: 5_000 });

  it("refuses with no answerer composed", async () => {
    await expect(askUserTool({ sessionId: SESSION, record: receiptsTo(workspace).record }).body(exec("ask_user", { question: "go?" })))
      .rejects.toThrow(/no human answerer/);
  });

  it("returns an auditor-signed answer, and records digests but never the answer text", async () => {
    const { record, receipts } = receiptsTo(workspace);
    const tool = askUserTool({ sessionId: SESSION, record, answerer: async (question) => signAskUserAnswer(workspace, question, [["blue"]], "test"), timeoutMs: 5_000 });
    const result = await tool.body(exec("ask_user", { question: "Colour?", choices: ["red", "blue"] }));
    expect(result.ok).toBe(true);
    expect(result.output.split("\n")[0]).toBe("blue");
    expect(JSON.stringify(receipts)).not.toContain("blue");
    expect(receipts.at(-1)).toMatchObject({ auditType: "NATIVE_ASK_USER", decision: "allow", questionCount: 1 });
  });

  it("refuses an answer signed with the monitor key", async () => {
    const monitorSigned: AskUserAnswerer = async (question) => {
      const signed = signAskUserAnswer(workspace, question, [["red"]], "test");
      return { record: signed.record, signature: signRecord(workspace, signed.record, "monitor").signature };
    };
    await expect(ask(monitorSigned).body(exec("ask_user", { question: "Colour?", choices: ["red", "blue"] }))).rejects.toThrow(/auditor signature does not verify/);
  });

  it("refuses an answer bound to another question", async () => {
    let first: AskUserQuestion | undefined;
    await ask(async (question) => { first = question; return signAskUserAnswer(workspace, question, [["ok"]], "test"); })
      .body(exec("ask_user", { question: "first?" }));
    await expect(ask(async () => signAskUserAnswer(workspace, first!, [["ok"]], "test")).body(exec("ask_user", { question: "second?" })))
      .rejects.toThrow(/bound to a different question/);
  });

  it("refuses a selection outside the offered choices unless allowOther", async () => {
    await expect(ask(async (question) => signAskUserAnswer(workspace, question, [["green"]], "test"))
      .body(exec("ask_user", { question: "Colour?", choices: ["red", "blue"] }))).rejects.toThrow(/not one of the offered choices/);
    const result = await ask(async (question) => signAskUserAnswer(workspace, question, [["green"]], "test"))
      .body(exec("ask_user", { question: "Colour?", choices: ["red", "blue"], allowOther: true }));
    expect(result.output.split("\n")[0]).toBe("green");
  });

  it("answers several questions in one signed record and refuses a record that answers fewer", async () => {
    const args = { questions: [{ question: "Colour?", choices: ["red", "blue"] }, { question: "Sizes?", choices: ["s", "m", "l"], multiSelect: true }] };
    const result = await ask(async (question) => signAskUserAnswer(workspace, question, [["red"], ["s", "l"]], "test")).body(exec("ask_user", args));
    expect(result.ok).toBe(true);
    expect(result.output).toContain("1. Colour?\n   red");
    expect(result.output).toContain("2. Sizes?\n   s; l");
    await expect(ask(async (question) => signAskUserAnswer(workspace, question, [["red"]], "test")).body(exec("ask_user", args)))
      .rejects.toThrow(/covers 1 of 2 questions/);
    await expect(ask(async (question) => signAskUserAnswer(workspace, question, [["red", "blue"], ["s"]], "test")).body(exec("ask_user", args)))
      .rejects.toThrow(/2 selections; one was asked for/);
  });
});

describe("ask_user in native chat", () => {
  it("reads typed input against the offered choices", () => {
    const item = { question: "q", choices: ["red", "blue"], allowOther: false, multiSelect: false };
    expect(parseAskUserInput(item, "2")).toEqual(["blue"]);
    expect(parseAskUserInput(item, "green")).toBeNull();
    expect(parseAskUserInput({ ...item, allowOther: true }, "green")).toEqual(["green"]);
    expect(parseAskUserInput({ ...item, multiSelect: true }, "1, 2")).toEqual(["red", "blue"]);
    expect(parseAskUserInput(item, "  ")).toBeNull();
  });

  it("prompts on the terminal for the child's signed question and returns an answer the tool accepts", async () => {
    const child = Object.assign(new EventEmitter(), { connected: true, send: (_message: unknown) => true }) as unknown as ChildProcess;
    const bridge = createNativeInteractiveAskUser({ child, workspace, question: async () => "1", log: () => undefined, error: () => undefined });
    const answerer: AskUserAnswerer = (question) => new Promise((resolve) => {
      (child as unknown as { send: (message: unknown) => boolean }).send = (message) => { resolve((message as { answer: never }).answer); return true; };
      child.emit("message", { type: "amc/native-ask-user", v: 1, sessionId: question.sessionId, questionId: question.questionId });
    });
    const result = await askUserTool({ sessionId: SESSION, record: receiptsTo(workspace).record, answerer, timeoutMs: 5_000 })
      .body(exec("ask_user", { question: "Proceed?", choices: ["yes", "no"] }));
    bridge.close();
    expect(result.ok).toBe(true);
    expect(result.output.split("\n")[0]).toBe("yes");
  });
});

describe("todo and plan records", () => {
  it("refuses a restored older todo.json, on the same tool and on a fresh one", async () => {
    const session = "todo-replay";
    const ledger = openLedger(workspace);
    ledger.startSession({ sessionId: session, runtime: "amc", binaryPath: "test", binarySha256: "test" });
    ledger.close();
    const recorder = (): NativeReceiptRecorder => (execution, receipt) => {
      const meta = { ...receipt, tool: execution.name, sessionId: session };
      const open = openLedger(workspace);
      try { open.appendEvidence({ sessionId: session, runtime: "amc", eventType: "audit", payload: JSON.stringify(meta), meta, payloadExt: "json" }); }
      finally { open.close(); }
    };
    const tool = todoTool({ sessionId: session, record: recorder() });
    const path = join(workspace, ".amc", "native-tools", session, "todo.json");
    const one = await tool.body(exec("todo", { items: [{ id: "a", content: "first", status: "pending" }] }));
    expect(one.ok).toBe(true);
    const revisionOne = readFileSync(path, "utf8");
    await tool.body(exec("todo", { items: [{ id: "a", content: "first", status: "completed" }] }));
    expect(readSessionTodo(workspace, session)?.revision).toBe(2);
    expect(renderSessionLists(workspace, session)).toEqual(["Agent todo (signed, ledger-bound):", "[x] first"]);

    writeFileSync(path, revisionOne);
    await expect(tool.body(exec("todo", { items: [] }))).rejects.toThrow(/does not match the session ledger/);
    await expect(todoTool({ sessionId: session, record: recorder() }).body(exec("todo", { items: [] }))).rejects.toThrow(/does not match the session ledger/);
    expect(() => readSessionTodo(workspace, session)).toThrow(/does not match the session ledger/);
    expect(renderSessionLists(workspace, session)[0]).toMatch(/^Agent todo not shown: .*does not match the session ledger/);
  });

  it("refuses a write over another agent's plan", async () => {
    const { record } = receiptsTo(workspace);
    const tool = planTool({ sessionId: SESSION, record });
    await tool.body(exec("plan", { steps: [{ id: "1", title: "look", status: "pending" }] }));
    await expect(tool.body(exec("plan", { steps: [] }, { agentId: "other" }))).rejects.toThrow(/bound to default@/);
  });
});

describe("skills", () => {
  beforeAll(() => {
    const write = (name: string, front: string, body: string) => {
      mkdirSync(join(workspace, ".amc", "skills", name), { recursive: true });
      writeFileSync(join(workspace, ".amc", "skills", name, "SKILL.md"), `---\nname: ${name}\n${front}---\n${body}\n`);
    };
    write("release-notes", "description: Draft release notes from merged changes\n", "Read the changelog, then summarise.");
    write("operator-only", "description: Only on /operator-only\ndisable-model-invocation: true\n", "Hidden body.");
  });

  it("advertises name and description, hiding disable-model-invocation skills", () => {
    const tool = skillLoadTool({ roots: workspaceSkillRoots(workspace), record: receiptsTo(workspace).record });
    expect(tool.description).toContain("- release-notes: Draft release notes from merged changes");
    expect(tool.description).not.toContain("operator-only");
  });

  it("loads the attributed body and records its digest", async () => {
    const { record, receipts } = receiptsTo(workspace);
    const result = await skillLoadTool({ roots: workspaceSkillRoots(workspace), record }).body(exec("skill.load", { name: "release-notes" }));
    expect(result.ok).toBe(true);
    expect(result.output).toContain("# Skill: release-notes");
    expect(result.output).toContain("Read the changelog, then summarise.");
    const receipt = receipts.at(-1)!;
    expect(receipt).toMatchObject({ auditType: "NATIVE_SKILL_LOAD", decision: "allow", skill: "release-notes" });
    expect(result.output).toContain(`sha256 ${String(receipt.skillDigest)}`);
  });

  it("refuses an unknown or model-hidden name, listing what can be loaded", async () => {
    const { record, receipts } = receiptsTo(workspace);
    const tool = skillLoadTool({ roots: workspaceSkillRoots(workspace), record });
    await expect(tool.body(exec("skill.load", { name: "operator-only" }))).rejects.toThrow(/available: release-notes/);
    expect(receipts.at(-1)).toMatchObject({ auditType: "NATIVE_SKILL_LOAD", decision: "deny" });
  });
});

describe("amc agent-loop run flags (D45, DXC-24, DXC-25)", () => {
  const cwd = process.cwd();
  let dir = "";
  let home = "";
  beforeAll(() => {
    dir = realpathSync(mkdtempSync(join(tmpdir(), "amc-breadth-cli-")));
    home = realpathSync(mkdtempSync(join(tmpdir(), "amc-breadth-cli-home-")));
    initWorkspace({ workspacePath: dir, agentId: "default", trustBoundaryMode: "isolated" });
    initBudgets(dir, "default");
    writeRuntimeFirewallPolicy({ workspace: dir, mode: "observe" });
    const config = loadToolsConfig(dir);
    initToolsConfig(dir, { ...config, tools: { ...config.tools, allowedTools: [...config.tools.allowedTools, { name: "delegate", actionClass: "READ_ONLY" }] } });
  }, 60_000);
  afterAll(() => {
    process.chdir(cwd);
    rmSync(dir, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  });
  const runCli = async (extra: readonly string[]) => {
    process.chdir(dir);
    const out: string[] = [], errors: string[] = [], failures: number[] = [];
    const io: AgentLoopCliIo = { log: (line) => out.push(line), error: (line) => errors.push(line), fail: () => failures.push(1) };
    const program = new Command();
    program.exitOverride();
    registerAgentCommands(program, io);
    try { await program.parseAsync(["agent-loop", "run", "summarise the repo", "--credentials-home", home, ...extra], { from: "user" }); }
    finally { process.chdir(cwd); }
    return { out, errors, failures };
  };

  it("runs bounded goal rounds through --goal-rounds and reports how they stopped", async () => {
    const { out, failures, errors } = await runCli(["--tools", "workspace", "--delegate", "--goal-rounds", "2", "--json"]);
    expect(failures, errors.join("\n")).toEqual([]);
    const summary = JSON.parse(out.at(-1)!) as { goalRounds?: { rounds: number; stoppedBy: string } };
    expect(summary.goalRounds).toMatchObject({ rounds: 2, stoppedBy: "max-rounds" });
  }, 60_000);

  it("refuses --goal-rounds without in-process delegation", async () => {
    const { errors, failures, out } = await runCli(["--tools", "workspace", "--goal-rounds", "2"]);
    expect(failures).toEqual([1]);
    expect(errors.join("\n")).toContain("--goal-rounds runs each round as an in-process child");
    expect(out).toEqual([]);
  });

  it("refuses a malformed --web-search-searxng origin and one without workspace tools", async () => {
    const malformed = await runCli(["--tools", "workspace", "--web-search-searxng", "search.example.org"]);
    expect(malformed.failures).toEqual([1]);
    expect(malformed.errors.join("\n")).toContain("needs an http(s) origin");
    const noTools = await runCli(["--tools", "none", "--web-search-searxng", "https://search.example.org"]);
    expect(noTools.failures).toEqual([1]);
    expect(noTools.errors.join("\n")).toContain("add --tools workspace");
  });
});
