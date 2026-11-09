import type { Command } from "commander";
import { NATIVE_BUILTIN_CAPABILITIES, NATIVE_DELEGATION_CAPABILITIES } from "./agent/nativeToolCapabilities.js";
import {
  commandHookMatches, loadNativeCommandHooks, NATIVE_COMMAND_HOOK_DENY_EVENTS, NATIVE_COMMAND_HOOK_EMITTED, NATIVE_COMMAND_HOOK_EVENTS,
  NativeCommandHookError, staleCommandHookReferences, trustNativeCommandHooks, untrustNativeCommandHooks, type NativeCommandHookEvent
} from "./extensions/nativeCommandHookConfig.js";
import { nativeCommandHookInput, runNativeCommandHook } from "./extensions/nativeCommandHooks.js";

/**
 * `amc native-extension hooks inspect | trust | untrust | test` (SH-EXT-01). Inspect never runs anything and shows the
 * parsed handlers, every bound file with its digest and the trust value for an UNTRUSTED file too, so the review
 * happens before acceptance; trust records this machine's acceptance of exactly that value; untrust retires it; test
 * runs the matching handlers of a trusted file with a synthetic input and prints what the loop would have done.
 */

const BUILTIN_NAMES = [...NATIVE_BUILTIN_CAPABILITIES, ...NATIVE_DELEGATION_CAPABILITIES].map(capability => capability.name);

function fail(error: unknown, json: boolean): void {
  const code = error instanceof NativeCommandHookError ? error.code : "HOOKS_OPERATION_FAILED";
  const message = error instanceof Error ? error.message : "The hooks operation failed.";
  if (json) console.log(JSON.stringify({ ok: false, code, message }, null, 2)); else console.error(message);
  process.exitCode = 1;
}

function inspection(workspace: string) {
  const load = loadNativeCommandHooks(workspace);
  const handlers = load.status === "trusted" || load.status === "untrusted" ? load.handlers.map(handler => ({
    event: handler.event, index: handler.index, matcher: handler.matcher || "*", argv: handler.argv, timeoutMs: handler.timeoutMs,
    acceptTruncatedInput: handler.acceptTruncatedInput, emitted: NATIVE_COMMAND_HOOK_EMITTED.includes(handler.event),
    denyCapable: NATIVE_COMMAND_HOOK_DENY_EVENTS.includes(handler.event),
    // Built-in names only: MCP tools are mcp_<server>_<hash> and exist per mount, so a matcher for one is checked at run time.
    matchesBuiltinTools: handler.event === "PreToolUse" || handler.event === "PostToolUse" ? BUILTIN_NAMES.filter(name => commandHookMatches(handler.matcher, name)) : null
  })) : [];
  return { ok: true, ...load, handlers, authority: "Hooks observe, or deny PreToolUse and UserPromptSubmit. They never allow, rewrite arguments, add context or bypass an approval (D55)." };
}

export function registerNativeHookCommands(extension: Command): void {
  const hooks = extension.command("hooks").description("Operator command hooks in .amc/hooks.json: inspect, trust this machine to run them, test one event");
  hooks.command("inspect")
    .description("Show the workspace hooks file, its digest, trust state and resolved handlers without running anything")
    .option("--json", "machine-readable output")
    .action((opts: { json?: boolean }) => {
      try {
        const view = inspection(process.cwd());
        if (opts.json) { console.log(JSON.stringify(view, null, 2)); return; }
        console.log(`Hooks file: ${view.path}\nStatus: ${view.status}${"sha256" in view && view.sha256 ? `\nsha256: ${view.sha256}` : ""}${"reason" in view ? `\n${view.reason}` : ""}`);
        for (const reference of "references" in view ? view.references : []) console.log(`bound workspace file: ${reference.rel} sha256=${reference.sha256}`);
        if ("mark" in view) console.log(`trust value (--sha256): ${view.mark}`);
        for (const handler of view.handlers) {
          const warn = handler.denyCapable && handler.matchesBuiltinTools !== null && handler.matchesBuiltinTools.length === 0 ? " (matches no built-in tool; only an MCP tool of that name would be guarded)" : "";
          console.log(`${handler.event} #${handler.index} matcher=${handler.matcher} ${handler.emitted ? "" : "[not emitted by this build] "}timeout=${handler.timeoutMs}ms: ${handler.argv.join(" ")}${warn}`);
        }
        console.log(view.authority);
      } catch (error) { fail(error, opts.json === true); }
    });
  hooks.command("trust")
    .description("Accept the workspace hooks file's trust value (its digest bound to every file under .amc/hooks/) on this machine; required again after any change")
    .requiredOption("--sha256 <value>", "the trust value printed by hooks inspect, after you reviewed the file and its bound files")
    .option("--json", "machine-readable output")
    .action((opts: { sha256: string; json?: boolean }) => {
      try {
        const result = trustNativeCommandHooks(process.cwd(), opts.sha256);
        if (opts.json) console.log(JSON.stringify({ ok: true, ...result }, null, 2));
        else console.log(`Trusted ${result.path} (sha256 ${result.sha256}, ${result.handlers} handlers${result.references.length === 0 ? "" : `, bound to ${result.references.map(reference => reference.rel).join(", ")}`}) on this machine.`);
      } catch (error) { fail(error, opts.json === true); }
    });
  hooks.command("untrust")
    .description("Retire this machine's acceptance of the workspace hooks file; a present file is untrusted again and a missing one no longer fails closed")
    .option("--json", "machine-readable output")
    .action((opts: { json?: boolean }) => {
      try {
        const result = untrustNativeCommandHooks(process.cwd());
        if (opts.json) console.log(JSON.stringify({ ok: true, ...result }, null, 2));
        else console.log(result.retired ? `Retired this machine's acceptance of ${result.path}.` : `This machine had not accepted ${result.path}; nothing to retire.`);
      } catch (error) { fail(error, opts.json === true); }
    });
  hooks.command("test <event>")
    .description(`Run the trusted handlers for one event with a synthetic input: ${NATIVE_COMMAND_HOOK_EVENTS.join(", ")}`)
    .option("--tool <name>", "tool name for PreToolUse/PostToolUse matchers (default fs.write)")
    .option("--json", "machine-readable output")
    .action(async (eventInput: string, opts: { tool?: string; json?: boolean }) => {
      try {
        const event = NATIVE_COMMAND_HOOK_EVENTS.find(candidate => candidate === eventInput) as NativeCommandHookEvent | undefined;
        if (event === undefined) throw new NativeCommandHookError("EVENT_UNKNOWN", `Unknown hook event ${JSON.stringify(eventInput)}; one of ${NATIVE_COMMAND_HOOK_EVENTS.join(", ")}.`);
        const load = loadNativeCommandHooks(process.cwd());
        if (load.status !== "trusted") throw new NativeCommandHookError(load.status === "absent" ? "HOOKS_ABSENT" : "HOOKS_UNTRUSTED", load.status === "absent" ? `${load.path} does not exist.` : load.reason);
        const tool = opts.tool ?? "fs.write";
        const input = nativeCommandHookInput(event, { sessionId: null, cwd: process.cwd() }, event === "PreToolUse"
          ? { tool_name: tool, tool_use_id: "hooks-test", action_class: "WRITE_LOW", requested_mode: "SIMULATE", tool_input: { path: "hooks-test.txt", content: "" }, tool_input_truncated: false, synthetic: true }
          : event === "PostToolUse" ? { tool_name: tool, tool_use_id: "hooks-test", tool_response: { ok: true, output_sha256: "0".repeat(64), output_bytes: 0 }, synthetic: true }
          : event === "UserPromptSubmit" ? { prompt: "hooks test", prompt_truncated: false, synthetic: true } : { synthetic: true });
        const matching = load.handlers.filter(handler => handler.event === event && (handler.event !== "PreToolUse" && handler.event !== "PostToolUse" || commandHookMatches(handler.matcher, tool)));
        const runs = [];
        for (const handler of matching) {
          const stale = staleCommandHookReferences(process.cwd(), load); // before every spawn, as the loop does
          if (stale !== undefined) throw new NativeCommandHookError("HOOKS_UNTRUSTED", stale);
          const run = await runNativeCommandHook(handler, input, process.cwd(), load.references);
          runs.push({ index: handler.index, matcher: handler.matcher || "*", argv: handler.argv, decision: run.decision, ...(run.reason === undefined ? {} : { reason: run.reason }), exitCode: run.exitCode, terminatedBy: run.terminatedBy, stderr: run.stderr });
        }
        const denied = NATIVE_COMMAND_HOOK_DENY_EVENTS.includes(event) ? runs.find(run => run.decision === "deny") : undefined;
        const result = { ok: true, event, tool, emitted: NATIVE_COMMAND_HOOK_EMITTED.includes(event), denyCapable: NATIVE_COMMAND_HOOK_DENY_EVENTS.includes(event),
          outcome: denied ? "deny" : NATIVE_COMMAND_HOOK_DENY_EVENTS.includes(event) ? "allowed-to-proceed (no hook denied; the loop's own guards still apply)" : "observed", runs };
        if (opts.json) { console.log(JSON.stringify(result, null, 2)); return; }
        console.log(`${event} (${tool}): ${result.outcome}${result.emitted ? "" : " [event not emitted by this build]"}`);
        for (const run of runs) console.log(`#${run.index} ${run.argv.join(" ")}: ${run.decision}${run.reason === undefined ? "" : ` (${run.reason})`} exit=${run.exitCode ?? run.terminatedBy ?? "none"}${run.stderr ? ` stderr: ${run.stderr}` : ""}`);
        if (runs.length === 0) console.log("No handler matched.");
      } catch (error) { fail(error, opts.json === true); }
    });
}
