/**
 * The untrusted-input guard: the preset `untrusted-input-guard` (Rule of Two), switched on with
 * `amc guardrails profile untrusted-input-guard` (docs/runbooks/GUARDRAIL_CONTROL_STATE.md, "Untrusted-input guard").
 *
 * Every hook decision row records what its call reads, by the table in {@link classifyCall}: untrusted input (a web page,
 * an MCP tool, a file outside the project, a shell command that is not on the short local list, any tool AMC has no
 * entry for) and private data (secret files, tools with protected fields or the `private-data` label). A session's
 * labels are derived from those rows alone, for calls AMC allowed, so they only go up: nothing a tool returns, a file
 * says or the agent writes can lower them, and no command clears them for a running session. A new session starts clean.
 *
 * With the guard on, two rules run after today's policy and can only tighten it (allow < ask < deny):
 * an untrusted session plus a consequential call asks a person; untrusted plus private plus an outbound send is denied.
 * Providers without ask get a deny with the same words. When the labels cannot be read, a consequential call asks.
 * In log-only mode no decision changes; the row says what the guard would have done.
 *
 * What it may claim: in Claude Code and Gemini CLI sessions that AMC's hooks govern, AMC asks for approval before (or
 * blocks) consequential calls made after untrusted input. It does not stop prompt injection, and a call made through a
 * tool AMC cannot see is outside the claim.
 * ponytail: two calls a provider starts at the same moment can both be decided before either row is written; a
 * per-session lock across decide-and-record is the upgrade. Deleting ledger rows lowers labels: ledger chain checks own that.
 */
import { lstatSync, realpathSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { z } from "zod";
import { parseShellCommandPlan } from "./shellCommandPlan.js";
import { openLedger } from "../ledger/ledger.js";
import { readEventPayload } from "../session/eventPayload.js";
import { nativeMcpToolName } from "../mcp/nativeMcpClient.js";
import { HOME_SECRET_PATHS, shellSecretPaths } from "../sandbox/shellSecretPaths.js";
import type { ToolDefinition, ToolsConfig } from "../toolhub/toolsSchema.js";
import type { ActionClass, EvidenceEvent } from "../types.js";
import { sha256Hex } from "../utils/hash.js";
import { inspectGuardrailControlStateReadOnly } from "./guardrailControlState.js";
import type { InputGuardMode } from "./inputGuardProfile.js";

type Outcome = "allow" | "ask" | "steer" | "deny";
const RANK: Record<Outcome, number> = { allow: 0, ask: 1, steer: 2, deny: 3 };

/** Calls that change state or communicate outside: asked about once the session has read untrusted input. */
const CONSEQUENTIAL: ReadonlySet<ActionClass> = new Set(["NETWORK_EXTERNAL", "DATA_EXPORT", "WRITE_HIGH", "DEPLOY", "FINANCIAL", "IDENTITY", "SECURITY"]);
/**
 * Programs that read and write only what their arguments name and open no network connection, each with the options it may
 * carry: single letters (combinable, `-la`) and whole long options. A call is local only when its program is listed AND
 * every argument is recognised (a plain word or path, `-`, `--`, or a listed option); anything else, a joined value
 * (`--pre=x`, `-f/etc/x`) included, makes it an unknown program. rg, find, sort and jq are left out: they have options
 * that run another program or read the environment.
 */
// No grep -R or -d (-d dereference-recurse), diff -r or cp -r: they follow symlinks inside the folders they walk, which
// no argument names. diff given a folder follows them even without -r, so classifyCall counts that as reaching outside.
const GREP = { short: "0123456789ABCEFHLchilnoqrsvwx" };
const LOCAL_PROGRAMS: Record<string, { short: string; long?: readonly string[] }> = {
  ls: { short: "1ACFRSadhlrtu" }, cat: { short: "benstuv" }, head: { short: "0123456789cn" }, tail: { short: "0123456789Ffcnr" },
  wc: { short: "clmw" }, grep: GREP, egrep: GREP, fgrep: GREP, echo: { short: "Een" }, printf: { short: "" }, pwd: { short: "LP" },
  uniq: { short: "cdiu" }, cut: { short: "bcdfs" }, tr: { short: "Ccds" }, diff: { short: "BNbiquw" }, cmp: { short: "ls" },
  file: { short: "Lbi" }, stat: { short: "L" }, du: { short: "0123456789achks" }, df: { short: "hkP" }, date: { short: "u" },
  true: { short: "" }, false: { short: "" }, test: { short: "LSabcdefgklnopqrstuwxz" }, which: { short: "as" },
  basename: { short: "a" }, dirname: { short: "" }, realpath: { short: "e" }, readlink: { short: "fn" }, tee: { short: "a" },
  touch: { short: "c" }, mkdir: { short: "pv" }, cp: { short: "RafinpPv" }, mv: { short: "finv" }, rm: { short: "Rdfirv" },
  ln: { short: "fnsv" }, chmod: { short: "Rv" },
};
/** `git status` and `git commit` with the subcommand first (no global option such as -C, -c or --git-dir) and these options. */
const GIT_LOCAL: Record<string, { short: string; long?: readonly string[] }> = {
  "git.status": { short: "bsuz", long: ["--short", "--porcelain", "--branch", "--long"] },
  "git.commit": { short: "amqsv", long: ["--all", "--amend", "--no-edit", "--quiet", "--signoff", "--verbose", "--message"] },
};
const SECRET_NAME = /^(\.env|id_(rsa|dsa|ecdsa|ed25519)|\.?(npmrc|netrc|pypirc|git-credentials)$|credentials)|\.(pem|key|p12|pfx|jks|keystore)(\.|$)/;
const READS = new Set(["fs.read", "glob", "grep", "ls"]);
const LOCAL_TOOLS = new Set(["fs.write", "fs.edit", "apply_patch", "git.status", "git.commit"]);

export interface CallLabels {
  tool: string;
  untrusted: string | null;
  private: string | null;
  outbound: boolean;
  actionClass: ActionClass | null;
}
interface GuardRequest { name: string; args: Record<string, unknown>; segment?: { binary: string; argv: readonly string[] } | null }

const programName = (binary: unknown) => {
  const name = typeof binary === "string" ? basename(binary) : "";
  return /^[A-Za-z0-9._+-]{1,40}$/.test(name) ? name : "a program";
};
/** Where a system program lives; a program named by a path elsewhere (`./cat`, `/tmp/cat`) is the workspace's own, not cat. */
const SYSTEM_DIRS = new Set(["/bin", "/usr/bin", "/sbin", "/usr/sbin", "/usr/local/bin", "/opt/homebrew/bin"]);
/** Whether every argument is a plain word or path, `-`, `--`, or an option the spec lists; after `--` everything is a word. */
function argumentsRecognised(spec: { short: string; long?: readonly string[] }, argv: readonly unknown[]): boolean {
  let words = false;
  return argv.every((raw) => {
    const arg = String(raw);
    if (words || arg === "-" || !arg.startsWith("-")) return true;
    if (arg === "--") { words = true; return true; }
    if (arg.startsWith("--")) return spec.long?.includes(arg) ?? false;
    return arg.slice(1).split("").every((letter) => spec.short.includes(letter));
  });
}
/** A program on the local list, named bare or by its system path, with only arguments the list recognises. */
function localProgram(binary: unknown, argv: readonly unknown[]): boolean {
  if (typeof binary !== "string" || (binary.includes("/") && !SYSTEM_DIRS.has(dirname(binary)))) return false;
  const spec = Object.hasOwn(LOCAL_PROGRAMS, basename(binary)) ? LOCAL_PROGRAMS[basename(binary)] : undefined;
  return spec !== undefined && argumentsRecognised(spec, argv);
}

/**
 * Where `path` really is: symlinks followed (the nearest existing ancestor's real path plus the rest when it does not
 * exist yet), or null when it cannot be told (a dangling link, an unreadable folder): such a path counts as outside.
 */
function realPath(path: string): string | null {
  const absolute = resolve(path);
  try { return realpathSync.native(absolute); } catch { /* resolved below */ }
  try { lstatSync(absolute); return null; } catch { /* does not exist: walk up */ }
  const parent = dirname(absolute);
  if (parent === absolute) return null;
  const base = realPath(parent);
  return base === null ? null : join(base, basename(absolute));
}
function roots(workspace: string): string[] {
  const real = realPath(workspace);
  return real === null ? [resolve(workspace)] : [resolve(workspace), real];
}
const inside = (root: string, path: string) => { const rel = relative(root, path); return rel === "" || !(rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)); };
/** Whether `path`, followed through any symlink, lies in the project. */
const inProject = (workspace: string, path: string) => { const real = realPath(path); return real !== null && roots(workspace).some((root) => inside(root, real)); };

/**
 * Whether `path` is private data: a secret file by name, a credential store in the home folder, AMC's own authority
 * (its home and this project's AMC folder), checked both as written and where it really points.
 */
function secretPath(workspace: string, path: string): boolean {
  const resolved = resolve(path), real = realPath(path), home = homedir();
  const stores = [...HOME_SECRET_PATHS.map((entry) => resolve(home, entry)), ...shellSecretPaths(), join(resolve(workspace), ".amc")];
  const storeRoots = stores.flatMap((store) => { const r = realPath(store); return r === null || r === store ? [store] : [store, r]; });
  return [resolved, ...(real === null ? [] : [real])].some((candidate) => SECRET_NAME.test(basename(candidate).toLowerCase())
    || storeRoots.some((store) => inside(store, candidate)));
}

/** What the arguments of a shell program reach: a URL, a path outside the workspace, a secret, or something AMC cannot read. */
function argumentReach(workspace: string, argv: readonly unknown[]): { outside: boolean; secret: boolean; folder: boolean } {
  let outside = false, secret = false, folder = false, words = false;
  for (const raw of argv) {
    const token = String(raw), option = !words && token.startsWith("-") && token !== "-";
    if (!words && token === "--") { words = true; continue; }
    if (option && !token.includes("=")) continue;
    // After `--` every token is a path, even one that starts with a dash.
    const value = option ? token.slice(token.indexOf("=") + 1) : token;
    if (/:\/\/|[$`]/.test(value)) { outside = true; continue; }
    if (value === "") continue;
    const path = value.startsWith("~") ? resolve(homedir(), value.slice(value.startsWith("~/") ? 2 : 1)) : resolve(workspace, value);
    if (!inProject(workspace, path)) outside = true;
    if (secretPath(workspace, path)) secret = true;
    // A path that is not there yet may be a folder by the time the program runs (an earlier part of the same command can
    // create it), so it counts as one: only an existing file that is not a folder is known not to be.
    try { folder ||= statSync(path).isDirectory(); } catch { folder = true; }
  }
  return { outside, secret, folder };
}

/**
 * The classification table (default-deny). Untrusted input: a ToolHub `untrusted-input` label, any MCP tool, `http.fetch`,
 * `git.push` and git subcommands AMC maps to it, a read outside the workspace, a shell program not on the local list (or
 * one with an argument outside the workspace, a URL or an expansion), and any tool not in this table. Private data: a
 * `private-data` label, `protectedFields`, or a secret path. Outbound send: NETWORK_EXTERNAL or DATA_EXPORT, `http.fetch`,
 * `git.push`, any MCP tool, a shell program not on the local list, and any tool not in this table.
 */
export function classifyCall(workspace: string, request: GuardRequest, def: ToolDefinition | null, shownAs: string,
  actionClass: ActionClass | null = def?.actionClass ?? null): CallLabels {
  const { name, args } = request;
  const labels = new Set(def?.labels ?? []);
  let untrusted: string | null = labels.has("untrusted-input") ? `a tool marked as untrusted input (${shownAs})` : null;
  let priv: string | null = labels.has("private-data") || Object.keys(def?.protectedFields ?? {}).length > 0 ? `a tool that returns private data (${shownAs})` : null;
  let outbound = actionClass === "NETWORK_EXTERNAL" || actionClass === "DATA_EXPORT";
  const program = name === "process.spawn" ? programName(args.binary) : null;
  if (def?.context?.kind === "mcp") { untrusted ??= `an MCP tool (${shownAs})`; outbound = true; }
  else if (name === "http.fetch") { untrusted ??= `a web page (${shownAs})`; outbound = true; }
  else if (name === "git.push") { untrusted ??= `a remote git server (${shownAs})`; outbound = true; }
  else if (READS.has(name)) {
    const path = resolve(workspace, typeof args.path === "string" ? args.path : workspace);
    if (!inProject(workspace, path)) untrusted ??= `a file outside this project (${shownAs})`;
    if (secretPath(workspace, path)) priv ??= `a secret file (${shownAs})`;
  } else if (program !== null) {
    const argv = Array.isArray(args.argv) ? args.argv : [];
    const reach = argumentReach(workspace, argv);
    if (!localProgram(args.binary, argv) || (program === "diff" && reach.folder)) { untrusted ??= `the output of a program that can reach outside this project (${shownAs}: ${program})`; outbound = true; }
    else if (reach.outside) untrusted ??= `a file outside this project (${shownAs}: ${program})`;
    if (reach.secret) priv ??= `a secret file (${shownAs}: ${program})`;
  } else if (Object.hasOwn(GIT_LOCAL, name) && request.segment) {
    const [subcommand, ...rest] = request.segment.argv;
    const reach = argumentReach(workspace, rest);
    if (subcommand !== name.slice(4) || !argumentsRecognised(GIT_LOCAL[name]!, rest)) {
      untrusted ??= `the output of a program that can reach outside this project (${shownAs}: git)`; outbound = true;
    } else if (reach.outside) untrusted ??= `a file outside this project (${shownAs}: git)`;
    if (reach.secret) priv ??= `a secret file (${shownAs}: git)`;
  } else if (!LOCAL_TOOLS.has(name)) { untrusted ??= `a tool AMC has no entry for (${shownAs})`; outbound = true; }
  return { tool: program ? `${shownAs}: ${program}` : shownAs, untrusted, private: priv, outbound, actionClass };
}

/** {@link classifyCall}, or every label when it fails: a call AMC cannot classify never lowers anything. */
function safeClassify(workspace: string, request: GuardRequest, def: ToolDefinition | null, shownAs: string, actionClass: ActionClass | null): CallLabels {
  try { return classifyCall(workspace, request, def, shownAs, actionClass); }
  catch { return { tool: shownAs, untrusted: `a call AMC could not classify (${shownAs})`, private: `a call AMC could not classify (${shownAs})`, outbound: true, actionClass }; }
}

const consequential = (call: CallLabels) => call.outbound || (call.actionClass !== null && CONSEQUENTIAL.has(call.actionClass));
function actionWords(call: CallLabels): string {
  const what = call.outbound ? "send data out of this computer" : call.actionClass === "DEPLOY" ? "deploy or publish"
    : call.actionClass === "FINANCIAL" ? "move money" : call.actionClass === "IDENTITY" ? "change accounts or permissions"
      : call.actionClass === "SECURITY" ? "change security settings" : "make a high-impact change";
  return `${what} (${call.tool})`;
}

/** The guard's setting. A setting AMC cannot read counts as on (enforce), so a broken file never loosens anything. */
function inputGuardMode(workspace: string): { mode: InputGuardMode; unreadable: boolean } {
  const snapshot = inspectGuardrailControlStateReadOnly(workspace);
  if (snapshot.integrity === "invalid") return { mode: "enforce", unreadable: true };
  return { mode: snapshot.state?.untrustedInputGuard ?? "off", unreadable: false };
}

const inputGuardSessionKey = (provider: string, agentId: string, sessionId: string) =>
  sha256Hex(`amc-input-guard\0${provider}\0${agentId}\0${sessionId}`);

const rowSchema = z.object({
  decision: z.string().optional(),
  inputGuard: z.object({ v: z.literal(1), sessionKey: z.string(), untrusted: z.string().nullable(), private: z.string().nullable(),
    tools: z.array(z.string()), observed: z.boolean().optional() }).passthrough(),
}).passthrough();
type Ledger = ReturnType<typeof openLedger>;

/** The rows AMC recorded for calls that ran (an allow decision, or a Codex observation), oldest first; malformed throws. */
function ranRows(ledger: Ledger, needle: string, since = 0): Array<z.infer<typeof rowSchema>> {
  const rows = ledger.db.prepare("SELECT meta_json FROM evidence_events WHERE event_type = 'audit' AND ts > ? AND instr(meta_json, ?) > 0 ORDER BY ts")
    .all(since, needle) as Array<{ meta_json: string }>;
  return rows.map((row) => rowSchema.parse(JSON.parse(row.meta_json)))
    .filter((row) => row.decision === "allow" || (row.decision === undefined && row.inputGuard.observed === true));
}

type SessionLabels = { ok: true; untrusted: string | null; private: string | null } | { ok: false; why: string };
/** A session's labels from its recorded rows alone: the first untrusted source and the first private source, or why not readable. */
function readSessionLabels(workspace: string, sessionKey: string | null): SessionLabels {
  if (sessionKey === null) return { ok: false, why: "the agent's tool named no session" };
  let ledger: Ledger | null = null;
  try {
    ledger = openLedger(workspace);
    const rows = ranRows(ledger, sessionKey).filter((row) => row.inputGuard.sessionKey === sessionKey);
    return { ok: true, untrusted: rows.find((row) => row.inputGuard.untrusted)?.inputGuard.untrusted ?? null,
      private: rows.find((row) => row.inputGuard.private)?.inputGuard.private ?? null };
  } catch {
    return { ok: false, why: "AMC's records for this session could not be read" };
  } finally {
    ledger?.close();
  }
}

export const MCP_HASHES_AUDIT = "MCP_TOOL_HASHES_RECORDED";
const scanPayloadSchema = z.object({
  auditType: z.literal(MCP_HASHES_AUDIT),
  servers: z.array(z.object({ path: z.string(), serverName: z.string().nullable(),
    tools: z.array(z.object({ name: z.string(), descriptionSha256: z.string(), schemaSha256: z.string() }).passthrough()) }).passthrough()),
  changedTools: z.array(z.object({ server: z.string(), tool: z.string() }).passthrough()),
}).passthrough();
export type McpHashScan = z.infer<typeof scanPayloadSchema> & { ts: number };

/**
 * The MCP hash scans `amc shield mcp-ledger` recorded, oldest first (only the newest with `newestOnly`), found by the row's
 * exact audit type and source (never by text that any row's metadata may contain). A scan whose payload retention removed
 * is skipped; an encrypted one is opened. Throws when a scan that should be there cannot be read: callers count every tool
 * as changed.
 */
export function recordedMcpHashScans(workspace: string, ledger: Ledger, newestOnly = false): McpHashScan[] {
  const rows = ledger.db.prepare("SELECT * FROM evidence_events WHERE event_type = 'audit' AND payload_pruned = 0 "
    + "AND json_extract(meta_json, '$.auditType') = ? AND json_extract(meta_json, '$.source') = 'ops' ORDER BY ts, rowid")
    .all(MCP_HASHES_AUDIT) as EvidenceEvent[];
  return (newestOnly ? rows.slice(-1) : rows).map((row) => {
    const read = readEventPayload(workspace, row);
    if (read.status !== "ok") throw new Error(read.status === "missing" ? read.detail : `scan ${row.id} was pruned`);
    return { ...scanPayloadSchema.parse(JSON.parse(read.bytes.toString("utf8"))), ts: row.ts };
  });
}

/** MCP tools whose recorded description or schema changed (shield mcp-ledger) and that no call has run since, as ToolHub names. */
function changedMcpTools(workspace: string, defs: readonly ToolDefinition[]): Set<string> {
  const mcp = defs.filter((def) => def.context?.kind === "mcp");
  if (mcp.length === 0) return new Set();
  const ledger = openLedger(workspace);
  try {
    const flagged = new Set<string>();
    for (const scan of recordedMcpHashScans(workspace, ledger)) {
      for (const { server, tool } of scan.changedTools) {
        for (const def of mcp) {
          const context = def.context?.kind === "mcp" ? def.context.server : null;
          if (!context || (context.id !== server && context.name !== server)) continue;
          let name: string;
          try { name = nativeMcpToolName(context.id, tool); } catch { name = tool; }
          if ((def.name === name || def.name === tool) && ranRows(ledger, def.name, scan.ts).every((ran) => !ran.inputGuard.tools.includes(def.name))) flagged.add(def.name);
        }
      }
    }
    return flagged;
  } finally {
    ledger.close();
  }
}

export interface InputGuardRecord {
  v: 1;
  mode: InputGuardMode;
  sessionKey: string | null;
  untrusted: string | null;
  private: string | null;
  tools: string[];
  /** What the guard decided (enforce) or would have decided (log_only); null when it changed nothing. */
  verdict: "ask" | "deny" | null;
  note: string | null;
}
interface Verdict { decision: "allow" | "ask" | "deny"; reason: string; targets: Array<{ toolName: string; actionClass: ActionClass }> }

/** The two rules (and the fail-closed and MCP-change asks) for one call's canonical requests, in order. */
function verdictFor(calls: CallLabels[], names: string[], session: SessionLabels, changed: ReadonlySet<string>): Verdict {
  let verdict: Verdict = { decision: "allow", reason: "", targets: [] };
  const privateAny = session.ok ? session.private ?? calls.find((call) => call.private)?.private ?? null : null;
  let untrustedBefore = session.ok ? session.untrusted : null;
  calls.forEach((call, index) => {
    if (consequential(call)) {
      const action = actionWords(call);
      const target = call.actionClass ? [{ toolName: names[index]!, actionClass: call.actionClass }] : [];
      const ask = (reason: string) => { if (verdict.decision === "allow") verdict = { decision: "ask", reason, targets: [] }; verdict.targets.push(...target); };
      if (!session.ok) ask(`AMC could not read what this session has read before (${session.why}), so a person must approve before the agent can ${action}.`);
      else if (untrustedBefore && privateAny && call.outbound) {
        verdict = { decision: "deny", targets: [], reason: `This session read ${untrustedBefore}, which AMC cannot vouch for, and private data from `
          + `${privateAny}. AMC blocks the agent from trying to ${action} in the same session. Start a new session for the send, or send it from a session that has not read untrusted content.` };
      } else if (untrustedBefore) ask(`This session earlier read ${untrustedBefore}, which AMC cannot vouch for, so a person must approve before the agent can ${action}.`);
      else if (changed.has(names[index]!)) ask(`The description or input schema of MCP tool ${names[index]} changed since AMC last recorded it, so a person must approve before the agent can ${action}.`);
    }
    untrustedBefore ??= call.untrusted;
  });
  return verdict;
}

interface Guarded { decision: Outcome; reason: string; approvals?: Array<{ toolName: string; actionClass: ActionClass; quorumFloor?: { requiredApprovals: number } }> }

/**
 * Today's decision with the guard applied. Off: unchanged, with this call's labels recorded for later. Log-only: unchanged,
 * with what the guard would have done. Enforce: the stricter of today's decision and the guard's; an ask adds each
 * consequential call as an approval target that needs at least one person.
 */
export function applyInputGuard<D extends Guarded>(input: { workspace: string; agentId: string; provider: string; sessionId: string | null;
  shownAs: string; requests: readonly GuardRequest[]; tools: ToolsConfig; today: D }): D & { inputGuard: InputGuardRecord } {
  const defs = input.tools.tools.allowedTools;
  const calls = input.requests.map((request) => {
    const def = defs.find((candidate) => candidate.name === request.name) ?? null;
    return safeClassify(input.workspace, request, def, input.shownAs, def?.actionClass ?? null);
  });
  const setting = inputGuardMode(input.workspace);
  const sessionKey = input.sessionId ? inputGuardSessionKey(input.provider, input.agentId, input.sessionId) : null;
  const record: InputGuardRecord = { v: 1, mode: setting.mode, sessionKey, untrusted: calls.find((call) => call.untrusted)?.untrusted ?? null,
    private: calls.find((call) => call.private)?.private ?? null, tools: input.requests.map((request) => request.name), verdict: null, note: null };
  if (setting.mode === "off") return { ...input.today, inputGuard: record };
  const names = input.requests.map((request) => request.name);
  let changed: ReadonlySet<string> = new Set();
  try { changed = changedMcpTools(input.workspace, defs); } catch { changed = new Set(names.filter((name) => defs.find((def) => def.name === name)?.context?.kind === "mcp")); }
  const verdict = verdictFor(calls, names, readSessionLabels(input.workspace, sessionKey), changed);
  if (verdict.decision === "allow") return { ...input.today, inputGuard: record };
  const setNote = setting.unreadable ? " AMC could not read the guard's setting, so it treats the guard as on." : "";
  if (setting.mode === "log_only") {
    const note = `Log only, nothing was changed: with the untrusted-input guard on, AMC would have ${verdict.decision === "deny" ? "blocked" : "asked about"} this call. ${verdict.reason}`;
    return { ...input.today, inputGuard: { ...record, verdict: verdict.decision, note } };
  }
  const floor = verdict.targets.map((target) => ({ ...target, quorumFloor: { requiredApprovals: 1 } }));
  const approvals = [...floor, ...(input.today.approvals ?? []).filter((today) => !floor.some((target) => target.toolName === today.toolName && target.actionClass === today.actionClass))];
  const guarded = { ...record, verdict: verdict.decision, note: `${verdict.reason}${setNote}` };
  if (RANK[verdict.decision] < RANK[input.today.decision]) return { ...input.today, inputGuard: guarded };
  const reason = verdict.decision === input.today.decision ? `${verdict.reason}${setNote} ${input.today.reason}` : `${verdict.reason}${setNote}`;
  return { ...input.today, decision: verdict.decision, reason, approvals: verdict.decision === "ask" ? approvals : input.today.approvals, inputGuard: guarded };
}

const CODEX_SHELLS = new Set(["Bash", "shell", "exec_command", "local_shell", "container.exec", "unified_exec"]);
/** A Codex call in the guard's terms: shell programs (WRITE_HIGH, as ToolHub classes them), patches, reads; any other tool is unknown. */
function codexRequests(toolName: string, toolInput: unknown, workspace: string): Array<GuardRequest & { actionClass: ActionClass | null }> {
  const input = (toolInput && typeof toolInput === "object" ? toolInput : {}) as Record<string, unknown>;
  if (toolName === "apply_patch") return [{ name: "fs.write", args: {}, actionClass: "WRITE_LOW" }];
  if (toolName === "read_file" || toolName === "view_image") return [{ name: "fs.read", args: { path: String(input.path ?? workspace) }, actionClass: "READ_ONLY" }];
  if (!CODEX_SHELLS.has(toolName)) return [{ name: `codex:${toolName}`, args: {}, actionClass: null }];
  const command = input.command ?? input.cmd;
  const argv = Array.isArray(command) ? command.map(String) : null;
  const script = argv && argv.length >= 3 && /^(ba|z)?sh$/.test(basename(argv[0]!)) && /^-l?c$/.test(argv[1]!) ? argv[2]! : typeof command === "string" ? command : null;
  const plan = script === null ? null : parseShellCommandPlan(script);
  const segments = plan?.status === "parsed" ? plan.segments.map((segment) => ({ binary: segment.binary, argv: segment.argv }))
    : argv && script === null ? [{ binary: argv[0] ?? "", argv: argv.slice(1) }] : [{ binary: "", argv: [] }];
  return segments.map((segment) => ({ name: "process.spawn", args: segment, actionClass: "WRITE_HIGH" as const }));
}

/**
 * Codex is observed only (its PreToolUse fails open): the call already ran. Its observation row records the call's labels
 * and, with the guard on, what the guard would have done; nothing is enforced.
 */
export function codexInputGuard(input: { workspace: string; agentId: string; sessionId: string; toolName: string; toolInput: unknown }):
  InputGuardRecord & { observed: true } {
  const shownAs = /^[A-Za-z0-9._:-]{1,64}$/.test(input.toolName) ? `Codex ${input.toolName}` : "a Codex tool";
  let requests: ReturnType<typeof codexRequests>;
  try { requests = codexRequests(input.toolName, input.toolInput, input.workspace); }
  catch { requests = [{ name: `codex:${input.toolName}`, args: {}, actionClass: null }]; }
  const calls = requests.map((request) => safeClassify(input.workspace, request, null, shownAs, request.actionClass));
  const setting = inputGuardMode(input.workspace);
  const sessionKey = inputGuardSessionKey("codex", input.agentId, input.sessionId);
  const record = { v: 1 as const, mode: setting.mode, sessionKey, untrusted: calls.find((call) => call.untrusted)?.untrusted ?? null,
    private: calls.find((call) => call.private)?.private ?? null, tools: requests.map((request) => request.name), verdict: null, note: null, observed: true as const };
  if (setting.mode === "off") return record;
  const verdict = verdictFor(calls, record.tools, readSessionLabels(input.workspace, sessionKey), new Set());
  return verdict.decision === "allow" ? record : { ...record, verdict: verdict.decision,
    note: `Codex is observed only and the call already ran. With the untrusted-input guard on, AMC would have ${verdict.decision === "deny" ? "blocked" : "asked about"} it. ${verdict.reason}` };
}
