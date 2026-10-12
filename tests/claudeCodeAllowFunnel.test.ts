/**
 * P1-23 review (authorization bypass, structural): AMC's forwarder answers Claude Code with an allow only through
 * claudeAllow (src/adapters/hookProviders/claudeAllow.ts). Every hook event name of the pinned release's hooks reference,
 * sent to every handler AMC installs (and to one naming no event), every permission mode and some that are not, and
 * fuzzed payloads: whenever an answer would let a tool run, claudeAllow must have returned an allow for those exact bytes.
 */
import { createHash } from "node:crypto";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { runHookForward, type HookForwardOptions } from "../src/adapters/hookForwarder.js";
import { startBridgeServer } from "../src/bridge/bridgeServer.js";
import { agentId, claudeWorkspace, recorded } from "./helpers/claudeCodeHookFixtures.js";
import { freePort, removeFixtureWorkspaces } from "./helpers/piHookFixtures.js";

const allows = vi.hoisted(() => [] as Array<string | null>);
vi.mock("../src/adapters/hookProviders/claudeAllow.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/adapters/hookProviders/claudeAllow.js")>();
  return { ...actual, claudeAllow: (input: Parameters<typeof actual.claudeAllow>[0]) => {
    const allowed = actual.claudeAllow(input);
    allows.push(allowed?.payloadSha256 ?? null);
    return allowed;
  } };
});

/** Every hook event of the pinned hooks reference (docs/source-reviews/P1-23-claude-code-hooks.md). */
const EVENTS = ["SessionStart", "Setup", "UserPromptSubmit", "UserPromptExpansion", "PreToolUse", "PermissionRequest", "PermissionDenied", "PostToolUse",
  "PostToolUseFailure", "PostToolBatch", "Notification", "MessageDisplay", "SubagentStart", "SubagentStop", "TaskCreated", "TaskCompleted", "Stop",
  "StopFailure", "TeammateIdle", "InstructionsLoaded", "ConfigChange", "CwdChanged", "DirectoryAdded", "FileChanged", "WorktreeCreate", "WorktreeRemove",
  "PreCompact", "PostCompact", "PreModelSwitch", "PostModelSwitch", "Elicitation", "ElicitationResult", "SessionEnd"];
const HANDLERS = ["PreToolUse", "PostToolUse", "PostToolUseFailure", "SessionStart", "Stop", "UserPromptSubmit", undefined];
const MODES: unknown[] = ["default", "plan", "acceptEdits", "auto", "dontAsk", "bypassPermissions", "BypassPermissions", "bypass", "", "yolo", null, 1, undefined];

const sha256 = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
let workspace = "";
let bridgeBase = "";
let close: () => Promise<void> = async () => {};
let ids = 0;
let allowed = 0;

beforeAll(async () => {
  const port = await freePort();
  bridgeBase = `http://127.0.0.1:${port}`;
  workspace = claudeWorkspace({ bridgeBase });
  const bridge = await startBridgeServer({ workspace, host: "127.0.0.1", port, gatewayBaseUrl: "http://127.0.0.1:1" });
  close = () => bridge.close();
});
afterAll(async () => {
  await close();
  removeFixtureWorkspaces();
});

/** An allowed Read in the registered session, under a fresh tool_use_id. */
function allowedRead(): Record<string, unknown> {
  ids += 1;
  const read = recorded("PreToolUse-read", workspace);
  return { ...read, tool_use_id: `toolu_funnel_${ids}`, tool_input: { file_path: join(String(read.cwd), "workspace", "public.txt") } };
}

/** Run one payload through the forwarder as `handler`; fail if anything that lets a tool run did not come from claudeAllow for these bytes. */
async function run(handler: string | undefined, bytes: Buffer): Promise<boolean> {
  const before = allows.length;
  const opts: HookForwardOptions = { provider: "claude-code", mode: "control", agent: agentId, tokenFile: ".amc/hooks/claude-code.lease", bridgeUrl: bridgeBase,
    ...(handler ? { event: handler } : {}) };
  const out = await runHookForward(opts, async () => bytes, workspace, 5_000);
  const allowLike = (handler === "PreToolUse" && out.exitCode === 0) || /"permissionDecision"\s*:\s*"allow"|"decision"\s*:\s*"approve"|"continue"\s*:\s*true/.test(out.stdout);
  const vouched = allows.slice(before).some((digest) => digest === sha256(bytes));
  expect(allowLike, `${handler}: ${out.stdout}`).toBe(vouched);
  if (handler === undefined) expect(out.exitCode).toBe(2);
  if (allowLike) allowed += 1;
  return allowLike;
}

// A seeded generator, so a failing fuzz case reproduces.
function prng(seed: number): () => number {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function mutate(random: () => number): Buffer {
  const payload = allowedRead();
  const keys = Object.keys(payload);
  const key = keys[Math.floor(random() * keys.length)]!;
  const values: unknown[] = [null, 0, -1, true, "", "Read", "x".repeat(300), [], {}, { file_path: "/etc/passwd" }, "\u0000", "Réad"];
  const text = JSON.stringify(payload);
  switch (Math.floor(random() * 12)) {
    case 0: { const copy: Record<string, unknown> = { ...payload }; delete copy[key]; return Buffer.from(JSON.stringify(copy)); }
    case 1: return Buffer.from(JSON.stringify({ ...payload, [key]: values[Math.floor(random() * values.length)] }));
    case 2: return Buffer.from(JSON.stringify({ ...payload, extra_field: 1 }));
    case 3: return Buffer.from(JSON.stringify({ ...payload, tool_name: ["read", "READ", "Read ", "Bash", "mcp__x__read", "Write", "MultiEdit", "Agent"][Math.floor(random() * 8)] }));
    case 4: return Buffer.from(JSON.stringify({ ...payload, tool_input: { file_path: ["workspace/public.txt", "/tmp/../etc/passwd", `${String((payload.tool_input as { file_path: string }).file_path)}/`,
      String((payload.tool_input as { file_path: string }).file_path).normalize("NFD").replace("public", "públic")][Math.floor(random() * 4)] } }));
    case 5: return Buffer.from(JSON.stringify({ ...payload, session_id: `${String(payload.session_id)}x` }));
    case 6: return Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(text)]);
    case 7: return Buffer.from(text.replace('"tool_name":"Read"', '"tool_name":"Read","tool_name":"Read"'));
    case 8: return Buffer.from(text).subarray(0, Math.floor(random() * text.length));
    case 9: return Buffer.from(Array.from({ length: 64 }, () => Math.floor(random() * 256)));
    case 10: return Buffer.from(JSON.stringify({ ...payload, tool_input: { ...(payload.tool_input as object), updatedInput: { file_path: "/etc/passwd" } } }));
    default: return Buffer.from(JSON.stringify({ ...payload, hook_event_name: EVENTS[Math.floor(random() * EVENTS.length)] }));
  }
}

describe("an allow only ever comes out of claudeAllow", () => {
  test("every pinned hook event, sent to every handler and to one naming no event", async () => {
    for (const handler of HANDLERS) {
      for (const event of EVENTS) await run(handler, Buffer.from(JSON.stringify({ ...allowedRead(), hook_event_name: event })));
    }
    expect(allowed).toBeGreaterThan(0);
  }, 600_000);

  test("every permission mode, and values that are not one, never weaken a deny", async () => {
    for (const mode of MODES) {
      const read = allowedRead();
      const withMode = mode === undefined ? (({ permission_mode: _drop, ...rest }) => rest)(read) : { ...read, permission_mode: mode };
      const valid = typeof mode === "string" && ["default", "plan", "acceptEdits", "auto", "dontAsk", "bypassPermissions"].includes(mode);
      expect(await run("PreToolUse", Buffer.from(JSON.stringify(withMode))), String(mode)).toBe(valid || mode === undefined);
      for (const [tool, input] of [["Bash", { command: "rm -rf ~", description: "x" }], ["Write", { file_path: join(String(read.cwd), ".claude", "settings.json"), content: "{}" }],
        ["mcp__amcprobe__echo", { text: "x" }], ["NotebookEdit", { notebook_path: "/x.ipynb", new_source: "" }]] as const) {
        ids += 1;
        expect(await run("PreToolUse", Buffer.from(JSON.stringify({ ...withMode, tool_name: tool, tool_input: input, tool_use_id: `toolu_funnel_${ids}` }))), `${tool} ${String(mode)}`).toBe(false);
      }
    }
  }, 600_000);

  test("fuzzed payloads", async () => {
    const random = prng(0x5eed_1023);
    for (let i = 0; i < 150; i += 1) await run("PreToolUse", mutate(random));
  }, 600_000);
});
