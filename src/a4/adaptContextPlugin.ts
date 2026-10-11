/**
 * Adapt's context plugin and its probe (P1-61 slice B; design §10.3 Propose, Build and Review, §7 item 10). Build renders
 * the members' audience, market, sector, language, accessibility, data-handling and regulatory-note answers as one
 * attributed ContextPlugin literal (`# A4 context: <section>`, source `a4:<projectId>@r<n>`, order 160, the
 * skillContextPlugin pattern) and writes it under the agent's directory. The only delivery path that exists is
 * `extraContextPlugins` of an in-process `runComposedTurn` (the CLI's agent-loop run): a Studio native task's ACP child
 * loads only the instructions file and the time plugin, and nothing loads this plugin into it or into a deployed agent,
 * so `context.native_delivery` stays not_evaluated naming P2-37. The probe is one bounded in-process turn on the stub
 * provider (no network, no credential): its session's EFFECTIVE_POLICY row, written by the session writer before the
 * turn, is the observed ref that the policy reached the runtime (the receipt carries no context-plugin field). The frame
 * is shown by the run's signed `user/message` row carrying the plugin's exact text: the probe checks it when it runs and
 * Review checks it again (the row carries no agent id, so it cannot be an A4 ref of its own; that check is AMC's, not an
 * observed ref). Delivery to a model is not evaluated on the stub provider, and a probe whose turn did not end `complete`
 * (blocked, error, cancelled, max steps) or whose row lacks the text never satisfies `context_reaches_runtime_frame`.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, relative, sep } from "node:path";
import { z } from "zod";
import { STUB_PROVIDER_ID, STUB_PROVIDER_MODEL, stubProviderRoute, stubProviderTransport } from "../agent/stubProvider.js";
import { apiSuccess } from "../api/apiHelpers.js";
import { loadActiveCompiledPolicy, type ActiveCompiledPolicy } from "../catalog/compiler/activate.js";
import { getAgentPaths } from "../fleet/paths.js";
import { CLOCK_REVIEW_STATUS } from "../incidents/regulatoryClocks.js";
import type { Ledger } from "../ledger/ledger.js";
import { verifyEvidenceEventIntegrity } from "../ledger/ledgerVerification.js";
import { assertOwnerMode } from "../mode/mode.js";
import { writeEffectivePolicyReceipt } from "../policy/effectivePolicyReceipt.js";
import type { ContextPlugin } from "../prompt/context/contextTypes.js";
import { verifyWorkspacePromptPack } from "../prompt/promptPackVerifier.js";
import { promptLatestPackPath } from "../prompt/promptPolicyStore.js";
import { readEventPayload } from "../session/eventPayload.js";
import { readTurnEndMeta } from "../session/turnLifecycleMeta.js";
import type { EvidenceEvent } from "../types.js";
import { ensureDir, writeFileAtomic } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import type { A4ReadinessItem, A4ReadinessState } from "./a4Readiness.js";
import { a4Fail, mutationResult, precheck, priorReplay, readJson, requirePrincipal, type A4Route } from "./a4Router.js";
import { A4StoreError } from "./a4Store.js";
import { errorCodeOf } from "./aspireUnderstand.js";
import {
  ADAPT_CLAIM_BOUNDARY, CATALOG_EXPERIMENTAL_NOTICE, adaptSpecOf, buildOf, factAnswer, factList, factTerm, proposedFor, reached, type AdaptBuild
} from "./spec/adapt.js";
import { answerValues, listValue, textValue } from "./spec/aspire.js";
import type { A4Answer } from "./a4Schema.js";

export const A4_CONTEXT_ORDER = 160;
export const CONTEXT_PLUGIN_SCHEMA = "amc.a4-context-plugin/v1";
export const PROBE_PURPOSE = "adapt_context_probe";
export const PROBE_LIMITATION = "observed in-process, not in a Studio native session";
const PROBE_PROMPT = "AMC A4 Adapt context probe: reply in one line.";
const NATIVE_LOADER_KEY = "P2-37";
const MAX_TEXT = 2000;
const MAX_ITEMS = 64;

const pluginFileSchema = z.strictObject({
  schema: z.literal(CONTEXT_PLUGIN_SCHEMA), name: z.string().min(1), order: z.literal(A4_CONTEXT_ORDER), source: z.string().regex(/^a4:[A-Za-z0-9_-]+@r\d+$/),
  sha256: z.string().regex(/^[0-9a-f]{64}$/), text: z.string().min(1)
});
export type AdaptContextPlugin = z.infer<typeof pluginFileSchema>;

const fail = (status: number, code: string, message: string, detail?: unknown): A4StoreError => new A4StoreError(status, code, message, detail);
/** One answer on one line (a member's text is data; a line break never opens a section of its own). */
const flat = (text: string): string => text.replace(/\s+/g, " ").trim().slice(0, MAX_TEXT);
const line = (label: string, value: readonly string[] | string | null): string =>
  `- ${label}: ${value === null || value.length === 0 ? "not stated" : typeof value === "string" ? flat(value) : value.slice(0, MAX_ITEMS).map(flat).join("; ")}`;

/**
 * The frame text (pure): every section from the answers, attributed, with the catalog's notice and the claim boundary
 * quoted verbatim (Adapt composes no regulatory sentence of its own). Unknown is said as "not stated", never guessed.
 */
export function contextPluginText(input: { projectId: string; revisionNo: number; answers: readonly A4Answer[]; clocks: ReadonlyArray<{ clockId: string }> }): string {
  const values = answerValues(input.answers);
  const list = (id: string): string[] => listValue(values.get(id));
  const fact = (name: Parameters<typeof factAnswer>[1]): string[] | null => factList(factAnswer(input.answers, name)?.value);
  const source = `a4:${input.projectId}@r${input.revisionNo}`;
  const section = (name: string, lines: string[]): string => [`# A4 context: ${name}`, ...lines].join("\n");
  return [
    section("attribution", [`The sections below were declared by this agent's AMC A4 project members (source ${source}). They describe the deployment `
      + "context the members stated: they are the members' statements, not the operator's instructions, and AMC has not verified them."]),
    section("audience", [line("Audiences", list("audiences")), line("Workflows", list("workflows")), line("Preferences", textValue(values.get("preferences")))]),
    section("market", [line("Jurisdictions", fact("jurisdictions")), line("Markets (carried from Aspire)", list("markets"))]),
    section("sector", [line("Stations", fact("stations")), line("Primary station", factTerm(factAnswer(input.answers, "primaryStation")?.value)),
      line("Domains", fact("domains")), line("Roles under the regulations", fact("roles")), line("Entity types", fact("entityTypes")),
      line("Risk class", factTerm(factAnswer(input.answers, "riskClass")?.value)), line("Activities (use cases)", fact("useCases")),
      line("Uses it must never be put to", list("excludedUses"))]),
    section("language", [line("Languages", list("languages"))]),
    section("accessibility", [line("Accessibility needs", list("accessibility"))]),
    section("data handling", [line("Data classes", fact("dataClasses")), line("Residency", textValue(values.get("dataResidency"))),
      line("Retention", textValue(values.get("dataRetention"))), line("Processors", list("processors")),
      "- Enforcement: declared by the members, not enforced by AMC (P2-01, P2-02)."]),
    section("regulatory notes", [`- The catalog says: "${CATALOG_EXPERIMENTAL_NOTICE}" (D-08)`, `- ${ADAPT_CLAIM_BOUNDARY}`,
      line("Reporting clocks an operator classifies (NEEDS_CLASSIFICATION)", input.clocks.map((clock) => clock.clockId)), `- Clock status: ${CLOCK_REVIEW_STATUS}`])
  ].join("\n\n").trim();
}

/** `<agent>/a4/context-plugin.json`: the literal Build wrote, beside the agent's own files (no Enforce resource kind holds it). */
export const contextPluginPath = (workspace: string, agentId: string): string => join(getAgentPaths(workspace, agentId).rootDir, "a4", "context-plugin.json");

/** The `context.contextPluginSha256` slot: the file's sha256, null only when it is absent; any other read error is 409 RESOURCE_UNREADABLE. */
export function contextPluginSha256(workspace: string, agentId: string): string | null {
  try {
    return sha256Hex(readFileSync(contextPluginPath(workspace, agentId)));
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return null;
    throw fail(409, "RESOURCE_UNREADABLE", `context.contextPluginSha256 (the agent's A4 context plugin) could not be read (${code ?? "unknown error"})`);
  }
}

/** Build's write: the literal as a file, and what the build records about it. */
export function writeContextPlugin(input: { workspace: string; agentId: string; projectId: string; revisionNo: number; answers: readonly A4Answer[];
  clocks: ReadonlyArray<{ clockId: string }> }): NonNullable<AdaptBuild["context"]> {
  const text = contextPluginText(input);
  const plugin: AdaptContextPlugin = pluginFileSchema.parse({ schema: CONTEXT_PLUGIN_SCHEMA, name: "a4:context", order: A4_CONTEXT_ORDER,
    source: `a4:${input.projectId}@r${input.revisionNo}`, sha256: sha256Hex(text), text });
  const path = contextPluginPath(input.workspace, input.agentId);
  const bytes = `${JSON.stringify(plugin, null, 2)}\n`;
  ensureDir(dirname(path));
  writeFileAtomic(path, bytes, 0o644);
  return { path: relative(input.workspace, path).split(sep).join("/"), fileSha256: sha256Hex(bytes), sha256: plugin.sha256, name: plugin.name, order: plugin.order,
    source: plugin.source };
}

/** The file Build wrote, from one read: other bytes than the build recorded are RESOURCE_DRIFTED, a body whose text is not its sha256 is A4_INTEGRITY_FAILED. */
export function readContextPlugin(workspace: string, agentId: string, fileSha256: string): AdaptContextPlugin {
  let bytes: Buffer;
  try {
    bytes = readFileSync(contextPluginPath(workspace, agentId));
  } catch (error) {
    throw fail(409, "RESOURCE_DRIFTED", `the context plugin Build wrote is gone or unreadable (${(error as NodeJS.ErrnoException).code ?? "unknown error"}); build again`);
  }
  if (sha256Hex(bytes) !== fileSha256) throw fail(409, "RESOURCE_DRIFTED", "the context plugin on disk is not the one Build wrote; build again", { slots: ["context.contextPluginSha256"] });
  let plugin: AdaptContextPlugin;
  try {
    plugin = pluginFileSchema.parse(JSON.parse(bytes.toString("utf8")));
  } catch {
    throw fail(409, "A4_INTEGRITY_FAILED", "the context plugin file is not an A4 context plugin");
  }
  if (sha256Hex(plugin.text) !== plugin.sha256) throw fail(409, "A4_INTEGRITY_FAILED", "the context plugin's text does not match its sha256");
  return plugin;
}

/**
 * The agent's latest prompt pack (Score's signed `.amcprompt`), checked with this workspace's own keys: a self-check of
 * bytes, never evidence about the agent, and never a prompt the runtime loads (the card says so). Absent is absent.
 */
export function promptPackStatus(workspace: string, agentId: string): { present: boolean; sha256: string | null; packId: string | null; verified: boolean | null;
  problems: number } {
  const path = promptLatestPackPath(workspace, agentId);
  let bytes: Buffer;
  try {
    bytes = readFileSync(path);
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "ENOENT" ? { present: false, sha256: null, packId: null, verified: null, problems: 0 }
      : { present: true, sha256: null, packId: null, verified: false, problems: 1 };
  }
  let sidecar: Buffer | null;
  try {
    sidecar = readFileSync(`${path}.sha256`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") return { present: true, sha256: sha256Hex(bytes), packId: null, verified: false, problems: 1 };
    sidecar = null;
  }
  const checked = verifyPackBytes(workspace, basename(path), bytes, sidecar);
  return { present: true, sha256: sha256Hex(bytes), packId: checked.packId, verified: checked.ok, problems: checked.errors.length };
}

/**
 * verifyWorkspacePromptPack over exactly `bytes` and the `.sha256` sidecar read beside them (a private copy), so the
 * verdict and the recorded sha256 describe the same bytes.
 */
function verifyPackBytes(workspace: string, name: string, bytes: Buffer, sidecar: Buffer | null): ReturnType<typeof verifyWorkspacePromptPack> {
  const dir = mkdtempSync(join(tmpdir(), "amc-a4-pack-"));
  try {
    const file = join(dir, name);
    writeFileSync(file, bytes, { mode: 0o600 });
    if (sidecar !== null) writeFileSync(`${file}.sha256`, sidecar, { mode: 0o600 });
    return verifyWorkspacePromptPack(workspace, file);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** The `context.promptPackSha256` slot: the latest pack's sha256, null only when it is absent; any other read error is 409 RESOURCE_UNREADABLE. */
export function promptPackSha256(workspace: string, agentId: string): string | null {
  try {
    return sha256Hex(readFileSync(promptLatestPackPath(workspace, agentId)));
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return null;
    throw fail(409, "RESOURCE_UNREADABLE", `context.promptPackSha256 (the agent's prompt pack) could not be read (${code ?? "unknown error"})`);
  }
}

export interface ContextProbeOutcome {
  readonly sessionId: string;
  readonly systemPromptEventId: string;
  /** The reason on the session's signed turn/end row (`complete`, `blocked`, `error`, ...), `unknown` when none verifies. */
  readonly turnStatus: string;
  /** The driver's terminal state (idle, failed): `idle` also follows a blocked or errored turn, so it decides nothing. */
  readonly driverStatus: string;
  readonly receipt: { readonly eventId: string; readonly sha256: string; readonly receiptId: string; readonly compiledPolicyDigest: string | null;
    readonly downgrades: readonly string[] };
  /** The signed user/message row whose payload holds the plugin's exact text, verified now (and its event hash); null when none does. */
  readonly snapshotEventId: string | null;
  readonly snapshotSha256: string | null;
}

/** The kernel, loaded on demand: a package without the vendored runtime refuses the probe (409), never fakes it. */
async function composedRunner(): Promise<typeof import("../kernel/agentLoopRunner.js")> {
  try {
    return await import("../kernel/agentLoopRunner.js");
  } catch (error) {
    throw fail(409, "PROBE_RUNTIME_UNAVAILABLE", `the native runtime could not be loaded (${errorCodeOf(error, "MODULE_NOT_LOADED")})`);
  }
}

/** The session's signed user/message row that carries `text`, its chain verified now; null when none does. */
function snapshotRowOf(ledger: Ledger, sessionId: string, text: string): string | null {
  const rows = ledger.db.prepare("SELECT * FROM evidence_events WHERE session_id = ? AND event_type = 'user/message' ORDER BY rowid").all(sessionId) as EvidenceEvent[];
  for (const row of rows) {
    const payload = readEventPayload(ledger.workspace, row);
    if (payload.status !== "ok" || !payload.bytes.toString("utf8").includes(text) || sha256Hex(payload.bytes) !== row.payload_sha256) continue;
    if (row.writer_sig !== "unsigned" && verifyEvidenceEventIntegrity({ ledger, eventId: row.id }).ok) return row.id;
  }
  return null;
}

/** The reason on the session's last turn/end row, when that row is signed and verifies; `unknown` otherwise (never complete by default). */
function turnEndOf(ledger: Ledger, sessionId: string): string {
  const row = (ledger.db.prepare("SELECT * FROM evidence_events WHERE session_id = ? AND event_type = 'turn/end' ORDER BY rowid").all(sessionId) as EvidenceEvent[]).at(-1);
  if (row === undefined || row.writer_sig === "unsigned" || !verifyEvidenceEventIntegrity({ ledger, eventId: row.id }).ok) return "unknown";
  return readTurnEndMeta(row.meta_json)?.reason ?? "unknown";
}

/**
 * The probe's frame row as it reads now (Review's re-check): the user/message row the probe named, by id and event hash,
 * still signed and verifying, in the probe's session, its payload holding the plugin's exact text. Anything else names why.
 */
export function probeFrameStatus(ledger: Ledger, probe: { snapshotEventId?: unknown; snapshotSha256?: unknown; sessionId?: unknown }, text: string): string {
  if (typeof probe.snapshotEventId !== "string" || typeof probe.snapshotSha256 !== "string") return "FRAME_ROW_NOT_RECORDED";
  const row = ledger.getEventById(probe.snapshotEventId);
  if (!row) return "FRAME_ROW_DANGLING";
  if (row.event_hash !== probe.snapshotSha256 || row.session_id !== probe.sessionId) return "FRAME_ROW_CHANGED";
  if (row.writer_sig === "unsigned" || !verifyEvidenceEventIntegrity({ ledger, eventId: row.id }).ok) return "FRAME_ROW_UNVERIFIED";
  const payload = readEventPayload(ledger.workspace, row);
  if (payload.status !== "ok" || sha256Hex(payload.bytes) !== row.payload_sha256) return "FRAME_ROW_PAYLOAD_UNAVAILABLE";
  return payload.bytes.toString("utf8").includes(text) ? "resolved" : "FRAME_ROW_WITHOUT_TEXT";
}

/**
 * One bounded in-process turn on the stub provider with the plugin as an extra context (never `contextPlugins`, which
 * would drop the workspace's own AGENTS.md), and the session's effective-policy receipt written through its own writer
 * before the turn (as agentToolset writes it before a session's first governed call). A receipt that cannot be written
 * fails the probe; a compiled plan that does not verify refuses it, as agentToolset refuses the session.
 */
export async function runContextProbe(input: { workspace: string; agentId: string; plugin: AdaptContextPlugin; ledger: Ledger }): Promise<ContextProbeOutcome> {
  let policy: ActiveCompiledPolicy | null;
  try {
    policy = loadActiveCompiledPolicy(input.workspace);
  } catch (error) {
    throw fail(409, errorCodeOf(error, "COMPILED_POLICY_UNREADABLE"), "The active compiled policy cannot be verified, so a session would be refused; restore or reactivate it.");
  }
  const runner = await composedRunner();
  const plugin: ContextPlugin = { name: input.plugin.name, order: input.plugin.order, collect: async () => input.plugin.text };
  let receipt: { eventId: string | null; receiptId: string; compiledPolicyDigest: string | null; downgrades: string[] } | null = null;
  let outcome: Awaited<ReturnType<typeof runner.runComposedTurn>>;
  try {
    outcome = await runner.runComposedTurn({
      workspace: input.workspace, agentId: input.agentId, prompt: PROBE_PROMPT,
      promptProfile: { extraContextPlugins: [plugin] },
      route: { providerId: STUB_PROVIDER_ID, model: STUB_PROVIDER_MODEL, params: {} }, routes: [stubProviderRoute()], transport: stubProviderTransport(),
      config: { maxStepsPerTurn: 1 }, credentials: { watch: false },
      bindToolSession: (session) => {
        const written = writeEffectivePolicyReceipt({ workspace: input.workspace, sessionId: session.sessionId, agentId: input.agentId, policy, guardLabels: [],
          record: (row) => session.recordProjectedEvidence({ eventType: "audit", payload: JSON.stringify(row), meta: row }).eventId });
        receipt = { eventId: written.evidenceRef.startsWith("effective-policy-receipt:") ? null : written.evidenceRef, receiptId: written.receipt.receiptId,
          compiledPolicyDigest: written.receipt.compiledPolicy?.digest ?? null, downgrades: [...written.receipt.downgrades] };
      }
    });
  } catch (error) {
    throw fail(409, errorCodeOf(error, "PROBE_FAILED"), "The probe turn did not run (the session, the receipt or the composition refused it).");
  }
  const written = receipt as { eventId: string | null; receiptId: string; compiledPolicyDigest: string | null; downgrades: string[] } | null;
  const row = written?.eventId == null ? null : input.ledger.getEventById(written.eventId);
  // A session store other than the ledger (JSONL) has no row an A4 ref can name: refused, never recorded as observed.
  if (written === null || row === null) throw fail(409, "PROBE_NOT_RECORDED", "The probe's effective-policy receipt has no ledger row (a JSONL session store, or no writer event id).");
  const snapshotEventId = snapshotRowOf(input.ledger, outcome.sessionId, input.plugin.text);
  return { sessionId: outcome.sessionId, systemPromptEventId: outcome.systemPromptEventId, turnStatus: turnEndOf(input.ledger, outcome.sessionId),
    driverStatus: outcome.status,
    receipt: { eventId: row.id, sha256: row.event_hash, receiptId: written.receiptId, compiledPolicyDigest: written.compiledPolicyDigest, downgrades: written.downgrades },
    snapshotEventId, snapshotSha256: snapshotEventId === null ? null : input.ledger.getEventById(snapshotEventId)?.event_hash ?? null };
}

const probeSchema = z.strictObject({ expectedHeadSeq: z.number().int().min(0), clientRequestId: z.string().regex(/^[A-Za-z0-9_-]{8,128}$/) });

/**
 * POST …/stages/adapt/probe (after Build, before completion; builder or owner, owner mode): the probe turn on the plugin
 * Build wrote, read back against the bytes Build recorded, then its receipt row recorded as a ledger_event ref
 * (observed when the row earns it) with what the probe saw beside it. The project head is pinned: a project that moved
 * while the turn ran is 409 A4_STALE_HEAD, and the stub session stays in the ledger unreferenced (harmless).
 */
async function probe(route: A4Route, projectId: string): Promise<true> {
  const principal = requirePrincipal(route);
  const { body, request } = await readJson(route, probeSchema);
  const replay = priorReplay(route.store, request, projectId);
  if (replay) return (apiSuccess(route.res, replay), true);
  const state = precheck(route, projectId, "build", body.expectedHeadSeq);
  if (state.project.stage !== "adapt" || (state.project.step !== "built" && state.project.step !== "reviewed")) {
    throw a4Fail(409, "A4_STEP_ORDER", `The probe runs after Adapt's Build; the project is at ${state.project.stage} ${state.project.step}.`);
  }
  assertOwnerMode(route.workspace, "loop run");
  const { spec, answers } = adaptSpecOf(state);
  const context = proposedFor(spec, answers) ? buildOf(spec)?.context : undefined;
  if (context === undefined) throw a4Fail(409, "A4_NOT_READY", "This Build wrote no context plugin; build again.", { reasonCodes: ["CONTEXT_PLUGIN_NOT_BUILT"] });
  const plugin = readContextPlugin(route.workspace, state.project.agent_id, context.fileSha256);
  const outcome = await runContextProbe({ workspace: route.workspace, agentId: state.project.agent_id, plugin, ledger: route.store.ledger });
  const inFrame = outcome.snapshotEventId !== null && outcome.snapshotSha256 !== null && outcome.turnStatus === "complete";
  const result = route.store.addEvidenceRef(projectId, { actor: principal, refKind: "ledger_event", refId: outcome.receipt.eventId, sha256: outcome.receipt.sha256,
    claimKind: "observed", method: "runtime_observation", column: "implementation", expectedHeadSeq: body.expectedHeadSeq, request,
    label: `adapt context probe: the effective-policy receipt of in-process session ${outcome.sessionId}, the policy reaching the runtime (stub provider; ${PROBE_LIMITATION})`,
    note: { purpose: PROBE_PURPOSE, sessionId: outcome.sessionId, systemPromptEventId: outcome.systemPromptEventId, snapshotEventId: outcome.snapshotEventId,
      snapshotSha256: outcome.snapshotSha256, contextPluginSha256: plugin.sha256, contextPluginFileSha256: context.fileSha256, inFrame, turnStatus: outcome.turnStatus,
      driverStatus: outcome.driverStatus, provider: STUB_PROVIDER_ID,
      receiptId: outcome.receipt.receiptId, compiledPolicyDigest: outcome.receipt.compiledPolicyDigest, downgrades: outcome.receipt.downgrades,
      modelDelivery: "not_evaluated", nativeDelivery: "not_evaluated", limitation: PROBE_LIMITATION } });
  apiSuccess(route.res, mutationResult(result, { probe: { sessionId: outcome.sessionId, inFrame, turnStatus: outcome.turnStatus, snapshotEventId: outcome.snapshotEventId,
    receiptEventId: outcome.receipt.eventId, downgrades: outcome.receipt.downgrades } }), 201);
  return true;
}

/** Adapt's POST routes; false when none matches. */
export async function handleAdaptRoute(route: A4Route, projectId: string, tail: string): Promise<boolean> {
  if (tail !== "/stages/adapt/probe") return false;
  return probe(route, projectId);
}

type Fields = Partial<Omit<A4ReadinessItem, "id" | "status">>;
const item = (id: string, status: A4ReadinessItem["status"], fields: Fields = {}): A4ReadinessItem => ({
  id, status, kind: null, reasonCodes: [], section: "implementation", evidence: [], claim: null, report: null, acknowledged: null,
  nextAction: null, mandatory: true, bound: false, ...fields
} as A4ReadinessItem);

/** The newest probe of exactly this build's plugin (its text's and its file's sha256), and its ref as resolved at this read. */
function probeOf(state: A4ReadinessState, context: NonNullable<AdaptBuild["context"]>) {
  const link = [...state.chain].reverse().find((candidate) => candidate.kind === "EVIDENCE_REF" && candidate.body.purpose === PROBE_PURPOSE
    && candidate.body.contextPluginSha256 === context.sha256 && candidate.body.contextPluginFileSha256 === context.fileSha256);
  const ref = link === undefined ? undefined : state.refs.find((candidate) => candidate.refKind === "ledger_event" && candidate.refId === link.body.refId
    && candidate.sha256 === link.body.sha256 && candidate.revisionNo === link.revisionNo);
  return { link, ref };
}

/**
 * The context items (design §10.3 Readiness): `prompts_attributed`, `context_reaches_runtime_frame` (observed only from
 * the probe's receipt row, never from a failed turn or a snapshot without the text) and its two not-evaluated
 * deliveries. Pure: the chain, the resolved refs and the build record only.
 */
export function contextItems(state: A4ReadinessState): A4ReadinessItem[] {
  const { spec, answers } = adaptSpecOf(state);
  const reviewed = (spec.review as { probe?: { receiptEventId?: unknown; frame?: unknown } } | undefined)?.probe;
  const build = proposedFor(spec, answers) ? buildOf(spec) : null;
  const context = build?.context;
  const built = reached(state, "built");
  const deliveries = [
    item("model_delivery", "NOT_EVALUATED", { kind: "not_evaluated", mandatory: false, reasonCodes: ["STUB_PROVIDER", "NO_REAL_PROVIDER_RECEIPT"],
      nextAction: { label: "Delivery to a model is not evaluated: the probe runs on the stub provider (no network, no credential)" } }),
    item("context.native_delivery", "NOT_EVALUATED", { kind: "not_evaluated", mandatory: false, reasonCodes: ["NO_NATIVE_LOADER", `KEY:${NATIVE_LOADER_KEY}`],
      nextAction: { label: "Nothing loads an A4 context plugin into a Studio native task's session or a deployed agent; a native task started now carries none (P2-37)" } })
  ];
  if (context === undefined) {
    return [
      item("prompts_attributed", "WAITING", { kind: "evidence_missing", mandatory: built, reasonCodes: ["PRODUCED_AT_BUILD"],
        nextAction: { label: built ? "This Build wrote no context plugin: build again" : "Build writes the attributed context plugin from your answers" } }),
      item("context_reaches_runtime_frame", "WAITING", { kind: "evidence_missing", mandatory: built, reasonCodes: ["CONTEXT_PLUGIN_NOT_BUILT"] }),
      ...deliveries
    ];
  }
  const { link, ref } = probeOf(state, context);
  const route = `POST /api/v1/a4/projects/${state.project.project_id}/stages/adapt/probe`;
  // Review's re-check of the frame row applies to the probe it read; a probe run after it stands on its own check.
  const recheck = link !== undefined && reviewed !== undefined && reviewed.receiptEventId === link.body.refId ? reviewed.frame : undefined;
  const frame = link === undefined
    ? item("context_reaches_runtime_frame", "WAITING", { kind: "evidence_missing", reasonCodes: ["CONTEXT_PROBE_NOT_RUN"],
      nextAction: { label: "Run the context probe: one in-process turn on the stub provider that records the runtime's effective-policy receipt", route } })
    : link.body.turnStatus !== "complete" || link.body.inFrame !== true
      ? item("context_reaches_runtime_frame", "BLOCKED", { kind: "evidence_contradictory",
        reasonCodes: [link.body.turnStatus !== "complete" ? "PROBE_DENIED" : "CONTEXT_NOT_IN_FRAME", `TURN_END:${String(link.body.turnStatus)}`, `SESSION:${String(link.body.sessionId)}`],
        nextAction: { label: "The probe's turn did not complete, or its session does not show the plugin in its frame: build again, then probe again", route } })
      : ref === undefined || ref.lane !== "observed"
        ? item("context_reaches_runtime_frame", "BLOCKED", { kind: "evidence_untrusted", reasonCodes: ["PROBE_REF_NOT_OBSERVED", ...(ref?.reasonCodes ?? ["REF_DANGLING"])],
          nextAction: { label: "The probe's receipt row no longer earns observed (missing, changed or unsigned): probe again", route } })
        : recheck !== undefined && recheck !== "resolved"
          ? item("context_reaches_runtime_frame", "BLOCKED", { kind: "evidence_contradictory", reasonCodes: [typeof recheck === "string" && /^[A-Z][A-Z0-9_]{0,63}$/.test(recheck)
            ? recheck : "FRAME_ROW_NOT_RECHECKED", `SNAPSHOT:${String(link.body.snapshotEventId)}`],
            nextAction: { label: "At Review the probe's user/message row no longer showed the plugin's text (gone, changed or unverified): probe again, then review again", route } })
          // The frame is AMC's check of the signed user/message row (at the probe, and again at Review): implementation, not the observed lane.
          : item("context_reaches_runtime_frame", "READY", { reasonCodes: ["CONTEXT_IN_RUNTIME_FRAME", recheck === "resolved" ? "FRAME_ROW_RECHECKED_AT_REVIEW" : "FRAME_ROW_CHECKED_AT_PROBE",
            `SNAPSHOT:${String(link.body.snapshotEventId)}`, "POLICY_REACHED_RUNTIME", "OBSERVED_IN_PROCESS", `SESSION:${String(link.body.sessionId)}`,
            ...(Array.isArray(link.body.downgrades) ? link.body.downgrades.map((code) => `DOWNGRADE:${String(code)}`) : [])],
          evidence: [{ refKind: ref.refKind, refId: ref.refId, sha256: ref.sha256, status: ref.status, trustTier: ref.trustTier, reasonCodes: ref.reasonCodes,
            lane: "observed", claimKind: "observed" }],
          nextAction: { label: `The plugin's exact text is in the session's signed user/message row ${String(link.body.snapshotEventId)} (AMC's check `
            + `${recheck === "resolved" ? "at the probe and again at Review" : "at the probe"}); the EFFECTIVE_POLICY row is the observed ref that the policy reached the `
            + `runtime; ${PROBE_LIMITATION}; delivery to a model: not evaluated on the stub provider` } });
  return [
    item("prompts_attributed", "READY", { reasonCodes: [`CONTEXT_PLUGIN:${context.sha256.slice(0, 16)}`, `ORDER:${context.order}`, `SOURCE:${context.source}`,
      "PROMPT_PACK_NOT_LOADED_BY_RUNTIME"] }),
    frame, ...deliveries, ...promptPackItem(spec)
  ];
}

/** Review's re-check of the agent's prompt pack: integrity of bytes under this workspace's keys (no lane, no claim); informational. */
function promptPackItem(spec: Record<string, unknown>): A4ReadinessItem[] {
  const pack = (spec.review as { promptPack?: { present?: unknown; verified?: unknown } } | undefined)?.promptPack;
  if (pack === undefined) return [];
  const integrity = { section: "integrity" as const, mandatory: false, evidence: [], claim: null };
  return [pack.present !== true ? item("adapt.prompt_pack_signature", "NOT_EVALUATED", { ...integrity, kind: "not_evaluated", reasonCodes: ["NO_PROMPT_PACK"] })
    : pack.verified === true ? item("adapt.prompt_pack_signature", "READY", { ...integrity, reasonCodes: ["SELF_CHECK", "UNANCHORED", "PROMPT_PACK_NOT_LOADED_BY_RUNTIME"] })
      : item("adapt.prompt_pack_signature", "BLOCKED", { ...integrity, kind: "evidence_untrusted", reasonCodes: ["PROMPT_PACK_UNVERIFIED"],
        nextAction: { label: "The agent's prompt pack does not verify under this workspace's keys: rebuild it (amc prompt pack build), then review again" } })];
}
