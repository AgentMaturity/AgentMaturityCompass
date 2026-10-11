/**
 * `amc a4 …` (P1-65; design §12.2): the A4 Forge command tree, behind AMC_A4_PREVIEW=1 like every A4 route (each leaf
 * refuses A4_PREVIEW_DISABLED without it; the tree stays registered so the command inventory does not depend on the
 * environment). Every leaf but `verify` and `export` runs the API's own route in process through `serveA4`
 * (src/a4/a4Router.ts): the same body schemas, refusals, gate functions, SoD, quorum, request dedupe, audits and effects.
 * Only the identity differs, and it never comes from a flag: `--session-token-file` names an `amc approvals login` token,
 * re-resolved from the signed users.yaml (src/a4/a4Identity.ts, admission native_login_token). Writes need one; reads
 * without one answer as the admin token does (every project, reads only). `--username`, `--roles` and `--user-id` are
 * refused. `verify` is the one surface where the caller names a trust list (`--trust-list`); `export` is `amc bundle
 * export` scoped to a project's agent. Results print their claim label; a refusal exits 1, verify exits by verdict.
 */
import { randomBytes } from "node:crypto";
import { lstatSync, readFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { resolve } from "node:path";
import { Readable } from "node:stream";
import { InvalidArgumentError, Option, type Command } from "commander";
import { A4_API_PREFIX, serveA4, unboundClaim } from "./a4/a4Router.js";
import { pendingExecutors } from "./a4/a4Gates.js";
import { resolveA4LoginPrincipal } from "./a4/a4Identity.js";
import { A4_PROJECT_ROLES, A4_STAGES, A4_STEPS, a4PreviewEnabled, type A4Principal } from "./a4/a4Schema.js";
import { readOnlyNow } from "./a4/a4Store.js";
import { verifyA4Bundle, verifyA4Chain } from "./a4/a4Verify.js";
import { exportEvidenceBundle } from "./bundles/bundle.js";
import { envelopeForUnboundResult } from "./claims/eligibility/adapters.js";
import type { ClaimEnvelope } from "./claims/eligibility/types.js";
import { finishVerify, trustFromFlags, withTrustFlags, type TrustFlags } from "./cli-trust-flags.js";
import { emitClaimResult, printClaimResult, runIdClaim, withClaimFields } from "./cli/claimOutput.js";
import { openLedger } from "./ledger/ledger.js";
import { assertOwnerMode } from "./mode/mode.js";
import { readNativeApprovalActor } from "./setup/nativeApprovalIdentity.js";
import { containedPath, safeIdSchema } from "./utils/pathSafety.js";

const PROJECT_ID = /^a4p_[0-9a-f]{32}$/;
const GATE_ID = /^a4gate_[0-9a-f]{32}$/;
const RELEASE_ID = /^a4r_[0-9a-f]{32}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const INPUT_FILE_LIMIT = 256 * 1024;
const TEXT_ROWS = 50;
const BOUNDARY = "A4 records are self-reported: a gate decision is an acknowledgement, never an independent review, and no A4 output "
  + "states that the agent is safe, correct or lawful.";

type Data = Record<string, unknown>;
interface Base { json?: boolean; sessionTokenFile?: string; username?: string; roles?: string; userId?: string }
interface Write extends Base { sessionTokenFile: string; requestId?: string }
interface HeadWrite extends Write { expectHeadSeq: number }

/** A refusal as the API states it: HTTP status, code, message. */
class A4Refusal extends Error {
  constructor(readonly status: number, readonly code: string, message: string, readonly detail?: unknown) {
    super(message);
  }
}
const invalid = (message: string): A4Refusal => new A4Refusal(400, "INPUT_INVALID", message);

const seqArg = (value: string): number => {
  if (!/^(0|[1-9][0-9]{0,14})$/.test(value)) throw new InvalidArgumentError("Expected a nonnegative integer.");
  return Number(value);
};
const idArg = (pattern: RegExp, what: string) => (value: string): string => {
  if (!pattern.test(value)) throw new InvalidArgumentError(`Expected ${what}.`);
  return value;
};
const projectArg = idArg(PROJECT_ID, "an A4 project id (a4p_ and 32 hex characters)");
const gateArg = idArg(GATE_ID, "an A4 gate id (a4gate_ and 32 hex characters)");
const releaseArg = idArg(RELEASE_ID, "an A4 release id (a4r_ and 32 hex characters)");
const shaArg = idArg(SHA256, "a sha256 (64 lowercase hex characters)");
/** A run id names a file under the agent's runs directory: one safe path segment. */
const runArg = (value: string): string => {
  if (!safeIdSchema.safeParse(value).success) throw new InvalidArgumentError("Expected a run id (one path segment of letters, digits, dot, _ or -).");
  return value;
};
const choice = (values: readonly string[]) => (value: string): string => {
  if (!values.includes(value)) throw new InvalidArgumentError(`Choose one of ${values.join(", ")}.`);
  return value;
};
const collect = (value: string, previous: string[] = []): string[] => [...previous, value];

/** A local regular file the operator names (never a symbolic link), at most 256 KiB of JSON object. */
function readJsonFile(path: string, what: string): Data {
  let value: unknown;
  try {
    const stat = lstatSync(path);
    if (!stat.isFile() || stat.size > INPUT_FILE_LIMIT) throw new Error("not a regular file of at most 256 KiB");
    value = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw invalid(`${what} ${path} could not be read: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw invalid(`${what} must be a JSON object.`);
  return value as Data;
}

/** The login token's user for `pathname`, live; never a flag. The file is the token itself: a regular, private (0600) file. */
function loginPrincipal(workspace: string, tokenFile: string, pathname: string, method: string): A4Principal {
  let actor: ReturnType<typeof readNativeApprovalActor>;
  try {
    if (lstatSync(tokenFile).isSymbolicLink()) throw new Error("The session token file must not be a symbolic link");
    actor = readNativeApprovalActor(workspace, tokenFile);
  } catch (error) {
    // An open error would name the path; only the token checks' own messages pass through.
    const reason = error instanceof Error && (error as NodeJS.ErrnoException).code === undefined ? error.message : "The session token file could not be opened";
    throw new A4Refusal(401, "A4_SESSION_REQUIRED", `${reason}. Run \`amc approvals login\` for a new token file.`);
  }
  const resolved = resolveA4LoginPrincipal({ workspace, actor, pathname, method });
  if (!resolved.ok) throw new A4Refusal(resolved.status, resolved.code, resolved.message);
  if (resolved.principal === null) throw new A4Refusal(401, "A4_SESSION_REQUIRED", "A login token names a user.");
  return resolved.principal;
}

/**
 * One API route, run in this process through the router behind admission. A write needs a login token and a workspace
 * that is not read-only (Studio's NATIVE_READ_ONLY rule; unreadable counts as read-only). A refusal throws.
 */
async function route(tokenFile: string | undefined, method: "GET" | "POST", path: string, body?: Data, query: Record<string, string> = {}): Promise<Data> {
  const workspace = process.cwd();
  const pathname = `${A4_API_PREFIX}${path}`;
  const principal = tokenFile === undefined ? null : loginPrincipal(workspace, tokenFile, pathname, method);
  if (method === "POST") {
    if (principal === null) throw new A4Refusal(401, "A4_SESSION_REQUIRED", "Writes need --session-token-file (an `amc approvals login` token).");
    if (readOnlyNow(workspace) !== false) throw new A4Refusal(403, "NATIVE_READ_ONLY", "The workspace is read-only until its users and trust signatures verify.");
  }
  const text = body === undefined ? null : JSON.stringify(body);
  let status = 0;
  let out = "";
  const res = {
    get headersSent() { return status !== 0; },
    setHeader: () => undefined,
    writeHead: (code: number) => { status = code; },
    end: (chunk?: string) => { out += chunk ?? ""; }
  };
  const req = Object.assign(Readable.from(text === null ? [] : [Buffer.from(text, "utf8")]), { headers: {}, url: pathname });
  await serveA4({ workspace, principal, pathname, method, params: new URLSearchParams(query),
    req: req as unknown as IncomingMessage, res: res as unknown as ServerResponse });
  let reply: { ok?: unknown; data?: unknown; error?: unknown; code?: unknown; detail?: unknown } = {};
  try {
    reply = JSON.parse(out) as typeof reply;
  } catch {
    // An empty or broken answer is a refusal below, never a success.
  }
  if (status >= 200 && status < 300 && reply.ok === true && reply.data !== null && typeof reply.data === "object") return reply.data as Data;
  throw new A4Refusal(status || 500, typeof reply.code === "string" ? reply.code : `HTTP_${status}`,
    typeof reply.error === "string" ? reply.error : "The A4 route answered without a result.", reply.detail);
}

function refused(name: string, error: unknown, json: boolean): void {
  const tagged = error as { status?: unknown; code?: unknown; detail?: unknown } | null;
  const status = typeof tagged?.status === "number" ? ` (${tagged.status})` : "";
  // An untagged error (a run that does not exist, a locked vault) keeps its own message under one code.
  const code = typeof tagged?.code === "string" && /^[A-Z][A-Z0-9_]{1,63}$/.test(tagged.code) ? tagged.code : "A4_CLI_FAILED";
  const message = error instanceof Error ? error.message : String(error);
  if (json) console.log(JSON.stringify({ ok: false, error: message, code, ...(tagged?.detail === undefined ? {} : { detail: tagged.detail }) }, null, 2));
  else console.error(`amc a4 ${name} refused${status}: ${message.startsWith(`${code}: `) ? message : `${code}: ${message}`}`);
  process.exitCode = 1;
}

/** Every leaf: the preview gate and the identity-flag refusal first; any refusal exits 1. */
async function run(name: string, opts: Base, body: () => Promise<void>): Promise<void> {
  try {
    if (!a4PreviewEnabled()) throw new A4Refusal(404, "A4_PREVIEW_DISABLED", "A4 Forge is not enabled in this workspace; set AMC_A4_PREVIEW=1.");
    const named = (["username", "roles", "userId"] as const).find((flag) => opts[flag] !== undefined);
    if (named !== undefined) {
      throw new A4Refusal(400, "IDENTITY_FLAG_REFUSED", `--${named === "userId" ? "user-id" : named} is refused: identity comes only from --session-token-file.`);
    }
    await body();
  } catch (error) {
    refused(name, error, opts.json === true);
  }
}

function leaf(parent: Command, name: string, description: string): Command {
  const command = parent.command(name).description(description);
  for (const flag of ["--username <name>", "--roles <roles>", "--user-id <id>"]) command.addOption(new Option(flag).hideHelp());
  return command.option("--json", "print the API's JSON answer");
}
const reader = (command: Command): Command =>
  command.option("--session-token-file <file>", "read as this `amc approvals login` user (default: every project, reads only)");
const writer = (command: Command, head = true): Command => {
  command.requiredOption("--session-token-file <file>", "the `amc approvals login` token file that names who acts (0600)")
    .option("--request-id <id>", "idempotency key: a retry with the same id answers the recorded result (default: random)");
  return head ? command.requiredOption("--expect-head-seq <n>", "the project head seq you reviewed; refused if it moved", seqArg) : command;
};

/** Executors that run after the route answered (as Studio runs them after its response) finish before the command does. */
async function drained(): Promise<void> {
  // ponytail: polls this process's pending executors every 50 ms; an effect that never settles keeps the command waiting.
  while (pendingExecutors.size > 0) await new Promise((done) => setTimeout(done, 50));
}

/** A POST with its request key; owner mode is asserted here too (the governed functions assert it again). */
async function write(name: string, opts: Write, path: string, body: Data): Promise<Data> {
  assertOwnerMode(process.cwd(), `a4 ${name}`);
  const data = await route(opts.sessionTokenFile, "POST", path, { ...body, clientRequestId: opts.requestId ?? randomBytes(16).toString("hex") });
  await drained();
  return data;
}

/**
 * An effect the route started and left running: its recorded outcome, or why it is not a success. A replay is looked up
 * too: its stored row names the attempt and seq, and the server checks only an inline effect's outcome on replay.
 */
async function effectFailure(opts: Write, projectId: string, data: Data): Promise<string | null> {
  if (typeof data.attemptId !== "string" || data.effect !== undefined) return null;
  const { transitions } = await route(opts.sessionTokenFile, "GET", `/projects/${projectId}/transitions`, undefined, { cursor: String(data.seq ?? 0) });
  const outcome = (transitions as Array<{ kind: string; body: Data }>).find((link) => (link.kind === "EFFECT_FINISHED" || link.kind === "EFFECT_FAILED")
    && link.body.effectId === data.attemptId);
  return outcome?.kind === "EFFECT_FINISHED" ? null : String(outcome?.body.error ?? "EFFECT_NOT_SETTLED");
}

function printWrite(data: Data, json: boolean): void {
  if (json) {
    console.log(JSON.stringify(data, null, 2));
    return;
  }
  const { projectId, seq, kind, bodyDigest: _bodyDigest, replay, ...rest } = data;
  console.log(`Recorded ${String(kind)} on ${String(projectId)} at seq ${String(seq)}${replay === true ? " (the answer to an earlier request with this request id)" : ""}.`);
  for (const [key, value] of Object.entries(rest)) {
    console.log(`  ${key}: ${typeof value === "string" ? value : JSON.stringify(value)}${key === "token" && typeof value === "string" ? "  (shown once; AMC keeps no copy)" : ""}`);
  }
}

/** A write's answer and, for an effect it left running, its outcome: a failed effect exits 1 though the transition stands. */
async function finishWrite(opts: Write, projectId: string, data: Data, print: () => void = () => printWrite(data, opts.json === true)): Promise<void> {
  print();
  const failure = await effectFailure(opts, projectId, data);
  if (failure === null) return;
  console.error(`The effect of attempt ${String(data.attemptId)} did not finish: ${failure}. The gate stays consumed; retry the effect from Studio`
    + `${data.replay === true ? " (a retry records its own attempt id, so this request keeps answering this attempt)" : ""}.`);
  process.exitCode = 1;
}

/** Readiness items worth reading in text: the mandatory ones not READY or COMPLETE, at most TEXT_ROWS. */
function printOpenItems(readiness: Data): void {
  const items = (readiness.items as Array<{ id: string; status: string; mandatory: boolean; reasonCodes: string[] }> | undefined) ?? [];
  const open = items.filter((item) => item.mandatory && item.status !== "READY" && item.status !== "COMPLETE");
  for (const item of open.slice(0, TEXT_ROWS)) console.log(`- ${item.id}: ${item.status}${item.reasonCodes.length > 0 ? ` (${item.reasonCodes.join(", ")})` : ""}`);
  if (open.length > TEXT_ROWS) console.log(`… ${open.length - TEXT_ROWS} more (--json prints them all)`);
  const next = readiness.nextAction as { label?: string } | null | undefined;
  if (next?.label) console.log(`Next: ${next.label}`);
}

/**
 * Every PENDING gate of a project with the pins a decision binds: its binding digest (…/gates) and the seq of its
 * GATE_REQUESTED transition (…/transitions, paged), never a head seq.
 */
async function openGatePins(tokenFile: string | undefined, projectId: string, readinessDigest: string | null) {
  const { gates } = await route(tokenFile, "GET", `/projects/${projectId}/gates`);
  const open = (gates as Array<{ gateId: string; gate: string; stage: string; status: string; bindingDigest: string }>).filter((gate) => gate.status === "PENDING");
  const seqs = new Map<string, number>();
  for (let cursor = 0; seqs.size < open.length;) {
    const page = await route(tokenFile, "GET", `/projects/${projectId}/transitions`, undefined, { cursor: String(cursor) });
    const links = page.transitions as Array<{ seq: number; kind: string; body: Data }>;
    for (const link of links) {
      if (link.kind === "GATE_REQUESTED" && open.some((gate) => gate.gateId === link.body.gateId)) seqs.set(String(link.body.gateId), link.seq);
    }
    if (links.length === 0) break;
    cursor = Number(page.nextCursor);
  }
  return open.map((gate) => ({ gateId: gate.gateId, gate: gate.gate, stage: gate.stage, expectedGateSeq: seqs.get(gate.gateId) ?? null,
    expectedBindingDigest: gate.bindingDigest, expectedReadinessDigest: readinessDigest }));
}

function registerReads(a4: Command): void {
  reader(leaf(a4, "guide", "Print the A4 stage model and, for a project, its next action and the pins a gate decision needs"))
    .argument("[projectId]", "an A4 project id", projectArg)
    .action((projectId: string | undefined, opts: Base) => run("guide", opts, async () => {
      const model = { stages: A4_STAGES, steps: A4_STEPS, boundary: BOUNDARY };
      if (projectId === undefined) {
        if (opts.json) console.log(JSON.stringify({ ...model, project: null, nextAction: null, openGates: [] }, null, 2));
        else console.log([`A4 Forge stages: ${A4_STAGES.join(" → ")}`, `Steps in each stage: ${A4_STEPS.join(" → ")}`, BOUNDARY,
          "Next: `amc a4 list`, then `amc a4 guide <projectId>`. Projects are created and built in Studio."].join("\n"));
        return;
      }
      const project = await route(opts.sessionTokenFile, "GET", `/projects/${projectId}`);
      const readiness = await route(opts.sessionTokenFile, "GET", `/projects/${projectId}/readiness`);
      const openGates = await openGatePins(opts.sessionTokenFile, projectId, (project.readiness as { bindingDigest?: string }).bindingDigest ?? null);
      const nextAction = readiness.nextAction ?? null;
      if (opts.json) {
        console.log(JSON.stringify({ ...model, project: { projectId, name: project.name, stage: project.stage, step: project.step, headSeq: project.headSeq,
          hold: project.hold }, nextAction, openGates }, null, 2));
        return;
      }
      console.log(`A4 project ${String(project.name)} (${projectId}): ${String(project.stage)}, step ${String(project.step)}, head seq ${String(project.headSeq)}`
        + `${project.hold === true ? ", on hold" : ""}`);
      console.log(`Stages: ${A4_STAGES.join(" → ")}; steps: ${A4_STEPS.join(" → ")}`);
      console.log(`Next: ${(nextAction as { label?: string } | null)?.label ?? "nothing is waiting on this stage"}`);
      for (const gate of openGates) {
        console.log(`Open ${gate.stage} ${gate.gate} gate ${gate.gateId}. To decide it after reviewing it:\n  amc a4 approve --gate ${gate.gateId}`
          + ` --expect-gate-seq ${gate.expectedGateSeq ?? "<not found>"} --expect-binding-digest ${gate.expectedBindingDigest}`
          + ` --expect-readiness-digest ${gate.expectedReadinessDigest ?? "<not published>"} --reason "…" --session-token-file <file>`);
      }
      console.log(BOUNDARY);
    }));

  reader(leaf(a4, "list", "List the A4 projects this identity may read"))
    .action((opts: Base) => run("list", opts, async () => {
      const projects = (await route(opts.sessionTokenFile, "GET", "/projects")).projects as Array<{ projectId: string; name: string; stage: string; step: string; hold: boolean }>;
      const claim = envelopeForUnboundResult({ producer: "a4:list", method: "human_review", regulated: false, now: Date.now() });
      if (emitClaimResult(`A4 projects: ${projects.length}`, { projects }, claim, opts)) return;
      for (const p of projects.slice(0, TEXT_ROWS * 4)) console.log(`- ${p.name} (${p.projectId}): ${p.stage}, ${p.step}${p.hold ? ", on hold" : ""}`);
      if (projects.length > TEXT_ROWS * 4) console.log(`… ${projects.length - TEXT_ROWS * 4} more (--json prints them all)`);
    }));

  reader(leaf(a4, "show", "Show one A4 project: head, members, current revision, gates and readiness status"))
    .argument("<projectId>", "an A4 project id", projectArg)
    .action((projectId: string, opts: Base) => run("show", opts, async () => {
      const data = await route(opts.sessionTokenFile, "GET", `/projects/${projectId}`);
      const readiness = data.readiness as { status?: string } | null;
      if (emitClaimResult(`A4 project ${String(data.name)} (${projectId})`, data, data.claim as ClaimEnvelope, opts)) return;
      console.log(`Stage ${String(data.stage)}, step ${String(data.step)}; revision ${String(data.revisionNo)}; head seq ${String(data.headSeq)}`
        + `${data.hold === true ? `; on hold (${String(data.holdReason)})` : ""}`);
      console.log(`Readiness: ${readiness?.status ?? "not_evaluated"}; members: ${(data.members as unknown[]).length}`);
      for (const view of Object.values(data.gates as Record<string, Data | null>)) {
        if (view) console.log(`Gate ${String(view.gate)} ${String(view.gateId)}: ${String(view.status)}, ${String(view.approvals)}/${String(view.required)} approvals, requested at seq ${String(view.requestedSeq)}`);
      }
    }));

  reader(leaf(a4, "readiness", "Evaluate a project's readiness (the API's readiness object, with its claim)"))
    .argument("<projectId>", "an A4 project id", projectArg)
    .option("--stage <stage>", "stage to evaluate (default: the project's head stage)", choice(A4_STAGES))
    .action((projectId: string, opts: Base & { stage?: string }) => run("readiness", opts, async () => {
      const data = await route(opts.sessionTokenFile, "GET", `/projects/${projectId}/readiness`, undefined, opts.stage ? { stage: opts.stage } : {});
      if (emitClaimResult(`A4 readiness for ${projectId}${opts.stage ? ` at ${opts.stage}` : ""}: ${String(data.status)}`, data, data.claim as ClaimEnvelope, opts)) return;
      printOpenItems(data);
    }));

  withTrustFlags(leaf(a4, "verify", "Verify a project's chain, or an exported .amcbundle or amc.a4-record/v1 file, under your trust list")
    .argument("<target>", "an A4 project id of this workspace, or a file path"), {})
    .action((target: string, opts: Base & TrustFlags) => run("verify", opts, async () => {
      const trust = trustFromFlags(opts, []);
      let report;
      if (PROJECT_ID.test(target)) {
        const ledger = openLedger(process.cwd(), { readonly: true });
        try {
          report = verifyA4Chain(ledger, target, trust);
        } finally {
          ledger.close();
        }
      } else {
        report = await verifyA4Bundle(resolve(process.cwd(), target), trust);
      }
      const claim = unboundClaim(PROJECT_ID.test(target) ? target : "record", "verify", false);
      // --json prints the VerifierReportV1 itself with its claim fields: integrity of bytes under the trust you pinned, not evidence about the agent.
      finishVerify("A4 record", report, { json: opts.json, claim, details: [`integrity: ${report.integrity.status} (bytes under the trust you pinned; not evidence about the agent)`] });
    }));
}

function registerDecisions(a4: Command): void {
  /**
   * The project a gate's row names. Routing only: the route then loads that project's verified chain and refuses a gate
   * it does not hold, and the decision binds the digest you pinned, so an edited row can only make the command refuse.
   */
  const projectOfGate = (gateId: string): string => {
    const ledger = openLedger(process.cwd(), { readonly: true });
    try {
      const row = ledger.db.prepare("SELECT project_id FROM a4_gates WHERE gate_id = ?").get(gateId) as { project_id?: unknown } | undefined;
      if (typeof row?.project_id !== "string" || !PROJECT_ID.test(row.project_id)) throw new A4Refusal(404, "A4_GATE_NOT_FOUND", `no A4 gate ${gateId}`);
      return row.project_id;
    } finally {
      ledger.close();
    }
  };
  type Decide = Write & { gate: string; reason: string; expectBindingDigest: string; expectGateSeq: number; expectReadinessDigest?: string; finding?: string[] };
  const decision = (name: "approve" | "deny" | "request-changes", description: string): Command => writer(leaf(a4, name, description), false)
    .requiredOption("--gate <gateId>", "the gate you reviewed", gateArg)
    .requiredOption("--reason <text>", "why (recorded with the decision)")
    .requiredOption("--expect-binding-digest <sha256>", "the gate's binding digest you reviewed; refused if it differs", shaArg)
    .requiredOption("--expect-gate-seq <n>", "the seq the gate was requested at; refused if it differs", seqArg);

  for (const verdict of ["approve", "deny"] as const) {
    decision(verdict, verdict === "approve" ? "Approve an A4 gate you reviewed (bound to its digests)" : "Deny an A4 gate you reviewed (bound to its digests)")
      .option("--expect-readiness-digest <sha256>", "the readiness binding digest you reviewed; refused if readiness moved", shaArg)
      .action((opts: Decide) => run(verdict, opts, async () => {
        const projectId = projectOfGate(opts.gate);
        printWrite(await write(verdict, opts, `/projects/${projectId}/gates/${opts.gate}/${verdict}`, { reason: opts.reason,
          expectedRequestDigestSha256: opts.expectBindingDigest, expectedGateSeq: opts.expectGateSeq,
          ...(opts.expectReadinessDigest === undefined ? {} : { expectedReadinessBindingDigest: opts.expectReadinessDigest }) }), opts.json === true);
      }));
  }

  decision("request-changes", "Request changes on an A4 gate you reviewed (bound to its digests)")
    .option("--finding <severity:text>", "a finding, e.g. \"high: the brief names no data owner\" (repeatable)", collect)
    .action((opts: Decide) => run("request-changes", opts, async () => {
      const projectId = projectOfGate(opts.gate);
      const findings = (opts.finding ?? []).map((entry) => {
        const match = /^(info|low|medium|high|critical):\s*(.+)$/s.exec(entry);
        if (match === null) throw invalid(`--finding "${entry.slice(0, 40)}": write <info|low|medium|high|critical>: <text>`);
        return { severity: match[1], message: match[2]!.trim() };
      });
      // The route takes no binding digest; a gate's digest never changes, so the gate you reviewed is checked here.
      const { gates } = await route(opts.sessionTokenFile, "GET", `/projects/${projectId}/gates`);
      const gate = (gates as Array<{ gateId: string; bindingDigest: string }>).find((entry) => entry.gateId === opts.gate);
      if (gate?.bindingDigest !== opts.expectBindingDigest) throw new A4Refusal(409, "A4_GATE_STALE", "That is not this gate's binding digest.", { moved: ["request"] });
      printWrite(await write("request-changes", opts, `/projects/${projectId}/gates/${opts.gate}/request-changes`,
        { reason: opts.reason, expectedGateSeq: opts.expectGateSeq, findings }), opts.json === true);
    }));
}

function registerProjectWrites(a4: Command): void {
  const project = (name: string, description: string): Command => writer(leaf(a4, name, description)).argument("<projectId>", "an A4 project id", projectArg);
  const reasoned = (name: string, description: string): Command => project(name, description).requiredOption("--reason <text>", "why (recorded)");

  project("complete", "Consume an approved gate and run the effect it starts (the API's complete)")
    .requiredOption("--stage <stage>", "the stage the gate belongs to", choice(A4_STAGES))
    .requiredOption("--gate <gateId>", "the approved gate", gateArg)
    .action((projectId: string, opts: HeadWrite & { stage: string; gate: string }) => run("complete", opts, async () => {
      await finishWrite(opts, projectId, await write("complete", opts, `/projects/${projectId}/stages/${opts.stage}/complete`,
        { gateId: opts.gate, expectedHeadSeq: opts.expectHeadSeq }));
    }));

  for (const name of ["hold", "resume"] as const) {
    reasoned(name, name === "hold" ? "Hold an A4 project (owner)" : "Resume a held A4 project (owner)")
      .action((projectId: string, opts: HeadWrite & { reason: string }) => run(name, opts, async () => {
        printWrite(await write(name, opts, `/projects/${projectId}/${name}`, { reason: opts.reason, expectedHeadSeq: opts.expectHeadSeq }), opts.json === true);
      }));
  }

  reasoned("reopen", "Reopen an earlier stage of an A4 project (owner)")
    .requiredOption("--to-stage <stage>", "the stage to reopen", choice(A4_STAGES))
    .action((projectId: string, opts: HeadWrite & { reason: string; toStage: string }) => run("reopen", opts, async () => {
      printWrite(await write("reopen", opts, `/projects/${projectId}/reopen`, { reason: opts.reason, toStage: opts.toStage, expectedHeadSeq: opts.expectHeadSeq }),
        opts.json === true);
    }));

  reasoned("tune", "Tune a released A4 project (owner)")
    .option("--capability-change", "the tuning changes what the agent can do")
    .option("--mechanic-plan <id>", "the mechanic plan this tuning follows")
    .action((projectId: string, opts: HeadWrite & { reason: string; capabilityChange?: boolean; mechanicPlan?: string }) => run("tune", opts, async () => {
      printWrite(await write("tune", opts, `/projects/${projectId}/tune`, { reason: opts.reason, capabilityChange: opts.capabilityChange === true,
        ...(opts.mechanicPlan === undefined ? {} : { mechanicPlanId: opts.mechanicPlan }), expectedHeadSeq: opts.expectHeadSeq }), opts.json === true);
    }));

  reasoned("retire", "Retire an A4 project (owner)")
    .option("--acceptance-note <text>", "the owner's acceptance note")
    .action((projectId: string, opts: HeadWrite & { reason: string; acceptanceNote?: string }) => run("retire", opts, async () => {
      printWrite(await write("retire", opts, `/projects/${projectId}/retire`, { reason: opts.reason,
        ...(opts.acceptanceNote === undefined ? {} : { acceptanceNote: opts.acceptanceNote }), expectedHeadSeq: opts.expectHeadSeq }), opts.json === true);
    }));

  project("members", "Add a member, change their project roles, or remove them (owner)")
    .requiredOption("--member <principalKey>", "LOCAL_USER:<userId> or WORKSPACE_ROUTER:<userId>")
    .option("--project-role <role>", `a project role: ${A4_PROJECT_ROLES.join(", ")} (repeatable)`, collect)
    .option("--event <event>", "added, roles_changed or removed", choice(["added", "roles_changed", "removed"]), "added")
    .action((projectId: string, opts: HeadWrite & { member: string; projectRole?: string[]; event: string }) => run("members", opts, async () => {
      printWrite(await write("members", opts, `/projects/${projectId}/members`, { event: opts.event, principalKey: opts.member,
        projectRoles: opts.projectRole ?? [], expectedHeadSeq: opts.expectHeadSeq }), opts.json === true);
    }));

  project("gate-policy", "Propose a gate policy (opens the policy gate), or apply a decided proposal (owner)")
    .option("--propose <file>", "an amc.a4-gate-policy/v1 JSON file")
    .option("--apply <gateId>", "the decided policy gate", gateArg)
    .action((projectId: string, opts: HeadWrite & { propose?: string; apply?: string }) => run("gate-policy", opts, async () => {
      if ((opts.propose === undefined) === (opts.apply === undefined)) throw invalid("Give exactly one of --propose <file> and --apply <gateId>.");
      const body = opts.apply !== undefined ? { gateId: opts.apply } : { proposedGatePolicy: readJsonFile(resolve(opts.propose!), "The gate policy") };
      printWrite(await write("gate-policy", opts, `/projects/${projectId}/gate-policy`, { ...body, expectedHeadSeq: opts.expectHeadSeq }), opts.json === true);
    }));
}

function registerReleases(a4: Command): void {
  const releaseCommand = (parent: Command, name: string, description: string): Command => writer(leaf(parent, name, description))
    .argument("<projectId>", "an A4 project id", projectArg).argument("<releaseId>", "an A4 release id", releaseArg);
  const environment = (command: Command): Command =>
    command.requiredOption("--environment <environment>", "staging or production", choice(["staging", "production"]));

  writer(leaf(a4, "release", "Consume Activate's release approval and build the release (prints the staging lease token once)"))
    .argument("<projectId>", "an A4 project id", projectArg)
    .requiredOption("--gate <gateId>", "Activate's approved direction gate (the release approval)", gateArg)
    .action((projectId: string, opts: HeadWrite & { gate: string }) => run("release", opts, async () => {
      const data = await write("release", opts, `/projects/${projectId}/releases`, { gateId: opts.gate, expectedHeadSeq: opts.expectHeadSeq });
      await finishWrite(opts, projectId, data, () => {
        if (emitClaimResult(`A4 release on ${projectId}: ${String(data.kind)} at seq ${String(data.seq)}`, data, unboundClaim(projectId, "releases", false), opts)) return;
        printWrite(data, false);
      });
    }));

  const deploy = a4.command("deploy").description("A release's prepared deployment, the operator's receipt and AMC's check");
  reader(leaf(deploy, "prepare", "Print the signed deployment plan AMC prepared for a release (AMC never runs it)"))
    .argument("<projectId>", "an A4 project id", projectArg).argument("<releaseId>", "an A4 release id", releaseArg)
    .action((projectId: string, releaseId: string, opts: Base) => run("deploy prepare", opts, async () => {
      const view = await route(opts.sessionTokenFile, "GET", `/projects/${projectId}/releases/${releaseId}`);
      const prepared = view.deployPlan as { signatureValid: boolean; reason: string | null; plan: { steps?: Array<{ phase: string; command: string | null; note: string }> } | null };
      if (prepared.plan === null) throw new A4Refusal(409, prepared.reason?.split(":")[0] ?? "PLAN_UNAVAILABLE", prepared.reason ?? "No verified plan.");
      if (opts.json) {
        console.log(JSON.stringify({ projectId, releaseId, deployPlan: prepared, boundary: view.boundary }, null, 2));
        return;
      }
      console.log(`Deployment plan for release ${releaseId} (signature verified now; AMC never runs these commands):`);
      for (const step of (prepared.plan.steps ?? []).slice(0, TEXT_ROWS)) console.log(`- [${step.phase}] ${step.command ?? "(no command)"}  # ${step.note}`);
      console.log("Then record the operator's receipt: amc a4 deploy record <projectId> <releaseId> --receipt <file> (the plan's receiptForm body).");
    }));

  releaseCommand(deploy, "record", "Record the operator's deployment receipt for a release (owner; self-reported)")
    .requiredOption("--receipt <file>", "JSON file with the receipt body (deploy/plan.json's receiptForm)")
    .action((projectId: string, releaseId: string, opts: HeadWrite & { receipt: string }) => run("deploy record", opts, async () => {
      const { expectedHeadSeq: _seq, clientRequestId: _id, ...receipt } = readJsonFile(resolve(opts.receipt), "The receipt");
      printWrite(await write("deploy record", opts, `/projects/${projectId}/releases/${releaseId}/deployments`,
        { ...receipt, expectedHeadSeq: opts.expectHeadSeq }), opts.json === true);
    }));

  environment(releaseCommand(deploy, "verify", "Run AMC's own token-less check of the recorded destination (owner)"))
    .action((projectId: string, releaseId: string, opts: HeadWrite & { environment: string }) => run("deploy verify", opts, async () => {
      const data = await write("deploy verify", opts, `/projects/${projectId}/releases/${releaseId}/verify`,
        { environment: opts.environment, expectedHeadSeq: opts.expectHeadSeq });
      if (emitClaimResult(`AMC's check of release ${releaseId} (${opts.environment}): ${String(data.amcCheckStatus)}`, data,
        unboundClaim(projectId, `releases:${releaseId}:verify`, false), opts)) return;
      printWrite(data, false);
    }));

  environment(releaseCommand(a4, "rollback", "Preview a release's rollback (opens its effect gate), or confirm it (owner)"))
    .option("--preview", "preview the rollback and open its effect gate")
    .option("--reason <text>", "why (required to confirm)")
    .option("--to-release <releaseId>", "the release the preview named as the target", releaseArg)
    .option("--confirm-manifest <id>", "the Enforce manifest id the preview named")
    .action((projectId: string, releaseId: string, opts: HeadWrite & { environment: string; preview?: boolean; reason?: string; toRelease?: string;
      confirmManifest?: string }) => run("rollback", opts, async () => {
      const base = { environment: opts.environment, expectedHeadSeq: opts.expectHeadSeq };
      if (opts.preview) {
        printWrite(await write("rollback", opts, `/projects/${projectId}/releases/${releaseId}/rollback/preview`, base), opts.json === true);
        return;
      }
      if (opts.reason === undefined) throw invalid("Confirming a rollback needs --reason (or run --preview first).");
      const data = await write("rollback", opts, `/projects/${projectId}/releases/${releaseId}/rollback`, { ...base, reason: opts.reason,
        toReleaseId: opts.toRelease ?? null, confirmManifestId: opts.confirmManifest ?? null });
      await finishWrite(opts, projectId, data);
    }));

  leaf(a4, "export", "Export the run bundle of a project's agent with its A4 records (amc bundle export, scoped to the project)")
    .argument("<projectId>", "an A4 project id", projectArg)
    .requiredOption("--run <runId>", "the diagnostic run the bundle carries", runArg)
    .requiredOption("--out <file>", "output .amcbundle file inside this workspace")
    .action((projectId: string, opts: Base & { run: string; out: string }) => run("export", opts, async () => {
      const workspace = process.cwd();
      assertOwnerMode(workspace, "a4 export");
      const outFile = containedPath(workspace, "the workspace", opts.out);
      let link = false;
      try {
        link = lstatSync(outFile).isSymbolicLink();
      } catch {
        // Absent: the export creates it.
      }
      if (link) throw invalid("--out names a symbolic link; name a new or regular file.");
      // The project route verifies the chain and names the agent; the bundle's A4 slice verifies every project again.
      const agentId = String((await route(undefined, "GET", `/projects/${projectId}`)).agentId);
      const result = exportEvidenceBundle({ workspace, runId: opts.run, outFile, agentId });
      const claim = runIdClaim(opts.run, agentId);
      const summary = { projectId, agentId, outFile: result.outFile, fileCount: result.fileCount, eventCount: result.eventCount, sessionCount: result.sessionCount };
      if (opts.json) {
        console.log(JSON.stringify(withClaimFields(summary, claim), null, 2));
        return;
      }
      console.log(`Bundle exported: ${result.outFile}`);
      printClaimResult(claim, {});
      console.log(`Agent ${agentId}; files: ${result.fileCount}, events: ${result.eventCount}, sessions: ${result.sessionCount}. Verify it: amc a4 verify ${opts.out} --trust-list <file>`);
    }));
}

/** `amc a4 …`: 22 leaves (src/mode/mode.ts blocks the owner-gated ones in agent mode). */
export function registerA4Commands(program: Command): void {
  const a4 = program.command("a4").description("A4 Forge (preview, AMC_A4_PREVIEW=1): projects, gates, releases and deployments, through the API's own routes");
  registerReads(a4);
  registerDecisions(a4);
  registerProjectWrites(a4);
  registerReleases(a4);
}
