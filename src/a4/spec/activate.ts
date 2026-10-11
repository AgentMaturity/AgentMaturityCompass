/**
 * Activate's question bank, spec helpers and readiness items (P1-62 slice A; design §10.4, §14). Understand carries
 * Adapt's `deploymentNeeds` as a `carried` answer, and the destination questions depend on it. The item builders are
 * pure: they read the newest Activate revision, the chain and the live facts, never a file. The producers live in
 * src/a4/stages/activate.ts; the package and the leases in src/a4/a4Package.ts. v1 deployment is a same-host restart of
 * the hosted Studio that built the agent (D-18): AMC prepares, signs and records; it never deploys.
 */
import { A4_STEPS } from "../../contracts/v1/a4Project.js";
import { ACTION_CLASSES } from "../../governor/actionCatalog.js";
import { leaseScopeSchema, type LeaseScope } from "../../leases/leaseSchema.js";
import type { ActionClass } from "../../types.js";
import { redoneStages, type A4ReadinessItem, type A4ReadinessQuery, type A4ReadinessState } from "../a4Readiness.js";
import type { A4Producer } from "../a4RouterStages.js";
import { a4AnswerSchema, flatSlots, type A4Answer, type A4ChainLink, type A4Question, type A4Step } from "../a4Schema.js";
import { adaptSpecOf } from "./adapt.js";
import { answersDigestOf, answerValues, dependencyDigest, listValue, textValue, understandingCurrent } from "./aspire.js";

const question = (id: string, prompt: string, kind: A4Question["kind"], required: boolean, dependsOn: string[] = []): A4Question =>
  ({ id, stage: "activate", prompt, dependsOn, required, kind });

/** Adapt answers Activate carries (Understand records them `source: "carried"`); they are changed only at Adapt. */
export const CARRIED = ["deploymentNeeds"] as const;

/** The Activate question bank (design §10.4 Ask). Never a credential: the lease token is delivered once by AMC, not asked for. */
export const QUESTIONS: A4Question[] = [
  question("deploymentNeeds", "Deployment needs, carried from Adapt (change them there: reopen Adapt).", "fact", false),
  question("target", "Deployment target: compose or helm. Both are recordable in v1; AMC prepares the files, an operator runs them.", "choice", true, ["deploymentNeeds"]),
  question("destinationRef", "The host name (and port) the deployed Studio answers on, e.g. amc.example.internal:443. Receipts and AMC's check must name this host; never a URL with credentials.",
    "text", true, ["deploymentNeeds", "target"]),
  question("hostHint", "A namespace or host hint for the prepared files (no credentials).", "text", false, ["target"]),
  question("leaseScopes", "Lease scopes the deployed agent needs (gateway:llm, toolhub:intent, toolhub:execute, …). One per line.", "list", true),
  question("executeActionClasses", "Action classes it may execute in production (READ_ONLY, WRITE_LOW, …). One per line; staging is narrowed to WRITE_LOW at most.", "list", false),
  question("stagingRoutes", "Gateway routes allowed in staging (each starts with /). One per line.", "list", true, ["destinationRef"]),
  question("productionRoutes", "Gateway routes allowed in production (each starts with /). One per line.", "list", true, ["destinationRef"]),
  question("modelAllowlist", "Models it may call. One per line.", "list", true),
  question("accessRoles", "Who may use the deployed agent, by role. One per line.", "list", false),
  question("accessNetworks", "Networks it may be reached from. One per line.", "list", false),
  question("releaseOwner", "Who owns this release (a project owner), in your words.", "text", false),
  question("onCall", "Who is on call for it, in your words.", "text", false),
  question("budgetRequestsPerMinute", "Request cap per minute for the agent's leases (a whole number).", "text", true),
  question("budgetTokensPerMinute", "Token cap per minute for the agent's leases (a whole number).", "text", true),
  question("budgetCostUsdPerDay", "Cost cap in USD per day (a number). Leave empty when none is set.", "text", false),
  question("productionLeaseDays", "How many days the production lease lasts (1 to 90; leave empty for 30).", "text", false),
  question("updateChannel", "Update channel (for example stable).", "text", false),
  question("updateVersionPin", "Version pin for updates.", "text", false),
  question("updateApproval", "Does an update need approval: required or not_required?", "choice", false),
  question("updateWindows", "Update windows, in your words.", "text", false),
  question("autoRollbackOn", "Conditions that should roll back an update automatically. One per line (recorded; nothing enforces it yet).", "list", false),
  question("businessOutcomes", "Business outcomes (KPIs) the release should move. One per line.", "list", false),
  question("sustainabilityObjectives", "Sustainability objectives and their measures. One per line.", "list", false),
  question("socialObjectives", "Social objectives and their measures. One per line.", "list", false),
  question("monitoringExpectations", "What you expect monitoring to show, in your words.", "text", false),
  question("rollbackAcceptance", "Rollback acceptance (RPO/RTO), in your words; recorded, not promised.", "text", false)
];

/** The values a choice question takes. */
export const CHOICES: Readonly<Record<string, readonly string[]>> = { target: ["compose", "helm"], updateApproval: ["required", "not_required"] };

export const ACTIVATE_SPEC_SCHEMA = "amc.a4-activate-spec/v1";
export const ACTIVATE_CLAIM_BOUNDARY = "Deployment is recorded from the operator's receipt; AMC did not execute it. Recorded: what the operator stated. Checked: what AMC's own probe found.";
export const RELEASE_EFFECT_ID = "a4.activate.release";
export const PRODUCTION_LEASE_EFFECT_ID = "a4.activate.production_lease";
export const STAGING_LEASE_TTL_MS = 24 * 60 * 60 * 1000;
/** No unauthenticated digest source exists at a destination until P2-40 (D-18 option 1). */
export const IDENTITY_NOT_EVALUATED = "no unauthenticated digest source at the destination (P2-40)";

const load = () => import("../stages/activate.js");
/** Activate's producers (slice A: Understand, Explain, Propose); Build is the release effect (POST …/releases). */
export const PRODUCERS: readonly A4Producer[] = (["understand", "explain", "propose"] as const)
  .map((step) => ({ id: `activate.${step}`, step, run: async (ctx) => (await load()).produceActivate(step, ctx) }));

/** The newest Activate revision's spec and answers. */
export function activateSpecOf(state: Pick<A4ReadinessState, "revisions">): { spec: Record<string, unknown>; answers: A4Answer[]; revisionNo: number | null } {
  const revision = state.revisions.filter((row) => row.stage === "activate").at(-1);
  const spec = revision ? JSON.parse(revision.spec_json) as Record<string, unknown> : {};
  const answers = Array.isArray(spec.answers) ? spec.answers.flatMap((answer) => {
    const parsed = a4AnswerSchema.safeParse(answer);
    return parsed.success ? [parsed.data] : [];
  }) : [];
  return { spec, answers, revisionNo: revision?.revision_no ?? null };
}

/** The Adapt answers Activate carries, as the newest Adapt revision records them (absent ones are left out). */
export function carriedValues(state: Pick<A4ReadinessState, "revisions">): Map<string, unknown> {
  const values = answerValues(adaptSpecOf(state).answers);
  return new Map(CARRIED.filter((id) => values.has(id)).map((id) => [id, values.get(id)]));
}

const HOST = /^(?=.{1,253}(:|$))[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*(:[0-9]{1,5})?$/;
const ROUTE = /^\/[A-Za-z0-9._~/-]{0,199}$/;
const SCOPES = leaseScopeSchema.options as readonly string[];
const positiveInt = (value: unknown): number | null => {
  const text = textValue(value);
  return text !== null && /^[1-9][0-9]{0,8}$/.test(text) ? Number(text) : null;
};
const positiveNumber = (value: unknown): number | null => {
  const text = textValue(value);
  return text !== null && /^[0-9]{1,9}(\.[0-9]{1,4})?$/.test(text) && Number(text) > 0 ? Number(text) : null;
};

/**
 * Required questions with no answer, answered ones whose dependencies changed since, answers that are not one of their
 * question's values, and carried answers that are missing or no longer Adapt's (fail closed: re-carry at Understand).
 */
export function answerGaps(answers: readonly A4Answer[], carried: ReadonlyMap<string, unknown>): { missing: string[]; stale: string[]; invalid: string[]; carried: string[] } {
  const values = answerValues(answers);
  const byId = new Map(answers.map((answer) => [answer.questionId, answer]));
  const missing = QUESTIONS.filter((entry) => entry.required && listValue(values.get(entry.id)).length === 0).map((entry) => entry.id);
  const stale = QUESTIONS.filter((entry) => byId.has(entry.id) && entry.dependsOn.length > 0
    && byId.get(entry.id)!.dependencyDigest !== dependencyDigest(entry.dependsOn, values)).map((entry) => entry.id);
  const answered = (id: string): boolean => listValue(values.get(id)).length > 0;
  const bad: Record<string, boolean> = {
    ...Object.fromEntries(Object.entries(CHOICES).map(([id, allowed]) => [id, answered(id) && !allowed.includes(textValue(values.get(id)) ?? "")])),
    destinationRef: answered("destinationRef") && !HOST.test(textValue(values.get("destinationRef")) ?? ""),
    stagingRoutes: listValue(values.get("stagingRoutes")).some((route) => !ROUTE.test(route)),
    productionRoutes: listValue(values.get("productionRoutes")).some((route) => !ROUTE.test(route)),
    leaseScopes: listValue(values.get("leaseScopes")).some((scope) => !SCOPES.includes(scope)),
    executeActionClasses: listValue(values.get("executeActionClasses")).some((name) => !(ACTION_CLASSES as readonly string[]).includes(name)),
    modelAllowlist: listValue(values.get("modelAllowlist")).length > 64 || listValue(values.get("modelAllowlist")).some((model) => model.length > 128),
    budgetRequestsPerMinute: answered("budgetRequestsPerMinute") && positiveInt(values.get("budgetRequestsPerMinute")) === null,
    budgetTokensPerMinute: answered("budgetTokensPerMinute") && positiveInt(values.get("budgetTokensPerMinute")) === null,
    budgetCostUsdPerDay: answered("budgetCostUsdPerDay") && positiveNumber(values.get("budgetCostUsdPerDay")) === null,
    productionLeaseDays: answered("productionLeaseDays") && !((positiveInt(values.get("productionLeaseDays")) ?? 0) <= 90 && positiveInt(values.get("productionLeaseDays")) !== null)
  };
  const carriedGaps = CARRIED.flatMap((id) => !carried.has(id) ? [] : !byId.has(id) ? [`CARRIED_MISSING:${id}`]
    : JSON.stringify(values.get(id) ?? null) !== JSON.stringify(carried.get(id) ?? null) ? [`CARRIED_STALE:${id}`] : []);
  return { missing, stale, invalid: Object.keys(bad).filter((id) => bad[id]), carried: carriedGaps };
}

/** One lease AMC mints for the release: the issueLeaseToken input without workspace, agent or work order. */
export interface LeasePlan {
  readonly scope: "staging" | "production";
  readonly scopes: LeaseScope[];
  readonly executeActionClasses: ActionClass[];
  readonly routeAllowlist: string[];
  readonly modelAllowlist: string[];
  readonly ttlMs: number;
  readonly maxRequestsPerMinute: number;
  readonly maxTokensPerMinute: number;
  readonly maxCostUsdPerDay: number | null;
}
const NARROW_CLASSES: readonly ActionClass[] = ["READ_ONLY", "WRITE_LOW"];
/**
 * The two leases from the answers (design §10.4): staging narrowed to WRITE_LOW at most, the staging routes and 24 h;
 * production with the answered classes, routes and caps. No class answered means READ_ONLY (never every class).
 * Null while an answer it needs is missing or invalid.
 */
export function leasePlans(answers: readonly A4Answer[]): { staging: LeasePlan; production: LeasePlan } | null {
  const values = answerValues(answers);
  const scopes = listValue(values.get("leaseScopes")) as LeaseScope[];
  const classes = listValue(values.get("executeActionClasses")) as ActionClass[];
  const models = listValue(values.get("modelAllowlist"));
  const requests = positiveInt(values.get("budgetRequestsPerMinute"));
  const tokens = positiveInt(values.get("budgetTokensPerMinute"));
  const staging = listValue(values.get("stagingRoutes"));
  const production = listValue(values.get("productionRoutes"));
  if (scopes.length === 0 || scopes.some((scope) => !SCOPES.includes(scope)) || models.length === 0 || requests === null || tokens === null
    || staging.length === 0 || production.length === 0 || [...staging, ...production].some((route) => !ROUTE.test(route))
    || classes.some((name) => !(ACTION_CLASSES as readonly string[]).includes(name))) return null;
  const cost = positiveNumber(values.get("budgetCostUsdPerDay"));
  const days = positiveInt(values.get("productionLeaseDays")) ?? 30;
  const common = { scopes: [...new Set(scopes)], modelAllowlist: [...new Set(models)], maxRequestsPerMinute: requests, maxTokensPerMinute: tokens, maxCostUsdPerDay: cost };
  const narrow = [...new Set(classes)].filter((name) => NARROW_CLASSES.includes(name));
  return {
    staging: { ...common, scope: "staging", executeActionClasses: narrow.length > 0 ? narrow : ["READ_ONLY"], routeAllowlist: [...new Set(staging)], ttlMs: STAGING_LEASE_TTL_MS },
    production: { ...common, scope: "production", executeActionClasses: classes.length > 0 ? [...new Set(classes)] : ["READ_ONLY"], routeAllowlist: [...new Set(production)],
      ttlMs: Math.min(days, 90) * 24 * 60 * 60 * 1000 }
  };
}

/** The update policy from the answers; signed inside the package, enforced by nothing until a runner exists (P2-34). */
export function updatePolicyOf(answers: readonly A4Answer[]): Record<string, unknown> {
  const values = answerValues(answers);
  return { schema: "amc.a4-update-policy/v1", channel: textValue(values.get("updateChannel")), versionPin: textValue(values.get("updateVersionPin")),
    approvalRequired: textValue(values.get("updateApproval")) !== "not_required", windows: textValue(values.get("updateWindows")),
    autoRollbackOn: listValue(values.get("autoRollbackOn")), enforcement: "none",
    enforcementNote: "Recorded and signed in the package; no runner enforces it yet (P2-34)." };
}

/** Whether `spec` is the proposal Propose built for exactly these answers. */
export const proposedFor = (spec: Record<string, unknown>, answers: readonly A4Answer[]): boolean =>
  spec.schema === ACTIVATE_SPEC_SCHEMA && spec.answersDigest === answersDigestOf(answers);
/** What Understand recorded (design §10.4 Understand), or null. */
export const understandingOf = (spec: Record<string, unknown>): { answersDigest: string; facts: Record<string, unknown> } | null =>
  (spec.understanding ?? null) as { answersDigest: string; facts: Record<string, unknown> } | null;

/**
 * The slots Propose copies into the content-addressed store `a4-projects/<id>/<revisionNo>/<sha256>` and the package path
 * each takes; the release effect reads them only from there, by the digest the gate bound (design §6.5).
 */
export const CAPTURED_SLOTS: Readonly<Record<string, string>> = {
  "context.promptPackSha256": "context/prompt-pack", "context.contextPluginSha256": "context/context-plugin.json",
  "context.memoryPolicySha256": "context/memory-policy.json", "signedConfigs.tools": "configs/tools.yaml",
  "signedConfigs.approvalPolicy": "configs/approval-policy.yaml", "signedConfigs.budgets": "configs/budgets.yaml",
  "signedConfigs.actionPolicy": "configs/action-policy.yaml", "signedConfigs.opsPolicy": "configs/ops-policy.yaml",
  "signedConfigs.firewall": "configs/firewall-policy.json"
};
/** The Enforce snapshot of a resource set: Enforce names a manifest by the first 16 hex of its resources digest. */
export const enforceManifestIdFor = (resourcesSha256: string): string => `enforce-resources-${resourcesSha256.slice(0, 16)}`;

/** The newest REOPEN or TUNE that sent the project back through Activate: releases before it belong to an earlier cycle. */
const cycleStart = (chain: readonly A4ChainLink[]): number =>
  [...chain].reverse().find((link) => link.kind !== "REVISION" && redoneStages(link)?.("activate") === true)?.seq ?? -1;
/** This cycle's links of `kind`, oldest first. */
export const cycleLinks = (chain: readonly A4ChainLink[], kind: string): A4ChainLink[] => {
  const start = cycleStart(chain);
  return chain.filter((link) => link.kind === kind && link.seq > start);
};
/** The newest RELEASE of this cycle (its body names the release, its package and its staging lease), or null. */
export const currentRelease = (chain: readonly A4ChainLink[]): A4ChainLink | null => cycleLinks(chain, "RELEASE").at(-1) ?? null;
/** The production lease the completion effect minted for `releaseId` (EFFECT_FINISHED's record), or null. */
export const productionLeaseOf = (chain: readonly A4ChainLink[], releaseId: string): Record<string, unknown> | null =>
  cycleLinks(chain, "EFFECT_FINISHED").map((link) => (link.body.effect === PRODUCTION_LEASE_EFFECT_ID ? (link.body.record as { lease?: Record<string, unknown> } | undefined)?.lease : undefined))
    .filter((lease): lease is Record<string, unknown> => lease !== undefined && lease.releaseId === releaseId).at(-1) ?? null;

type Fields = Partial<Omit<A4ReadinessItem, "id" | "status">>;
const item = (id: string, status: A4ReadinessItem["status"], fields: Fields = {}): A4ReadinessItem => ({
  id, status, kind: null, reasonCodes: [], section: "implementation", evidence: [], claim: null, report: null, acknowledged: null,
  nextAction: null, mandatory: true, bound: false, ...fields
} as A4ReadinessItem);
const waiting = (id: string, codes: string[], fields: Fields = {}): A4ReadinessItem => item(id, "WAITING", { kind: "evidence_missing", reasonCodes: codes, ...fields });

/** Whether the project has reached `step` at Activate (a retired project has). */
export function reached(state: A4ReadinessState, step: A4Step): boolean {
  if (state.project.stage === "retired") return true;
  return state.project.stage === "activate" && A4_STEPS.indexOf(state.project.step) >= A4_STEPS.indexOf(step);
}

/**
 * Propose's record of the package inputs against the slots its revision bound: every captured slot holds the bound digest
 * and the Enforce snapshot named by the bound resources digest verified. A digest the store does not hold is BLOCKED
 * (the release effect would fail INPUT_NOT_CAPTURED); propose again.
 */
function packageInputsItem(state: A4ReadinessState, spec: Record<string, unknown>, proposed: boolean): A4ReadinessItem {
  const inputs = (proposed ? spec.inputs ?? null : null) as { captured?: Record<string, unknown>; enforce?: { manifestId?: unknown; error?: unknown } } | null;
  if (inputs === null) return waiting("package.inputs", ["PRODUCED_AT_PROPOSE"], { mandatory: reached(state, "proposed") });
  const revision = state.revisions.find((row) => row.revision_no === state.project.revision_no && row.stage === "activate");
  const slots = revision === undefined ? {} : flatSlots(JSON.parse(revision.resource_digests_json));
  const uncaptured = Object.keys(CAPTURED_SLOTS).filter((slot) => (slots[slot] ?? null) !== null && inputs.captured?.[slot] !== slots[slot]);
  const resources = slots["enforce.resourcesSha256"] ?? null;
  const codes = [...uncaptured.map((slot) => `INPUT_NOT_CAPTURED:${slot}`),
    ...(resources === null ? ["ENFORCE_RESOURCES_NOT_PRODUCED"] : inputs.enforce?.manifestId !== enforceManifestIdFor(resources)
      ? ["ENFORCE_SNAPSHOT_MISSING", ...(typeof inputs.enforce?.error === "string" && /^[A-Z][A-Z0-9_]{0,63}$/.test(inputs.enforce.error) ? [inputs.enforce.error] : [])] : [])];
  return codes.length === 0 ? item("package.inputs", "READY", { reasonCodes: ["CONTENT_ADDRESSED"] })
    : item("package.inputs", "BLOCKED", { kind: "evidence_missing", reasonCodes: codes, nextAction: { label: resources === null
      ? "The agent has no signed Enforce manifest, so the package has no resource snapshot: build at Assemble or Adapt (which writes one), then propose again"
      : "A package input is not in the content-addressed store under the digest this revision bound (or its Enforce snapshot is missing): propose again" } });
}

/**
 * v1 is a same-host restart (D-18): the overlay restarts the hosted Studio that built the agent, so a release needs this
 * Studio to run under the chosen target (as Understand found it). Anything else has no v1 deployment path (P2-40).
 */
function sameHostItem(facts: Record<string, unknown> | null, target: string | null): A4ReadinessItem {
  const hosting = (facts?.hosting ?? null) as { kind?: unknown; signal?: unknown } | null;
  if (hosting === null) return waiting("deployment.same_host", ["PRODUCED_AT_UNDERSTAND"]);
  if (target === null) return waiting("deployment.same_host", ["TARGET_NOT_ANSWERED"]);
  if (hosting.kind === target) return item("deployment.same_host", "READY", { reasonCodes: ["SAME_HOST_RESTART", `HOSTED:${target}`] });
  return item("deployment.same_host", "BLOCKED", { kind: "unsupported_integration", reasonCodes: ["DEPLOYMENT_NOT_SAME_HOST", "KEY:P2-40",
    `HOSTED:${typeof hosting.kind === "string" ? hosting.kind : "none"}`, `TARGET:${target}`],
  nextAction: { label: "v1 deploys only by restarting the Compose or Helm-hosted Studio that built this agent; this Studio is not hosted under that target. "
    + "Installing a package into another workspace is P2-40." } });
}

/** The newest AMC check of this cycle's release (slice B writes VERIFICATION rows): BLOCKED on failed, READY only on passed. */
function amcCheckItem(state: A4ReadinessState, releaseId: string | null): A4ReadinessItem {
  const mandatory = reached(state, "reviewed");
  const check = releaseId === null ? undefined : cycleLinks(state.chain, "VERIFICATION").filter((link) => link.body.releaseId === releaseId).at(-1);
  const status = check?.body.amcCheckStatus;
  const reasons = Array.isArray(check?.body.reasonCodes) ? (check.body.reasonCodes as unknown[]).filter((code): code is string => typeof code === "string") : [];
  if (status === "failed") return item("deployment.amc_check", "BLOCKED", { kind: "evidence_contradictory", reasonCodes: ["AMC_CHECK_FAILED", ...reasons],
    nextAction: { label: "AMC's check of the deployment failed while the operator's receipt may say succeeded; fix the deployment and check again" } });
  if (status === "passed") return item("deployment.amc_check", "READY", { reasonCodes: ["AMC_CHECK_PASSED"] });
  if (status === "reachable") return waiting("deployment.amc_check", ["DEPLOYMENT_IDENTITY_NOT_EVALUATED", "KEY:P2-40"], { kind: "review_pending", mandatory,
    nextAction: { label: `The destination answered; the release's identity there is not evaluated: ${IDENTITY_NOT_EVALUATED}` } });
  return waiting("deployment.amc_check", ["DEPLOYMENT_UNCHECKED"], { kind: "review_pending", mandatory,
    nextAction: { label: "Record the operator's deployment receipt, then run AMC's check of the destination (owner)" } });
}

/** Which of the release's leases is live as recorded (staging from the release effect, production from the deployment approval). */
function leaseScopeItem(release: A4ChainLink | null, production: Record<string, unknown> | null): A4ReadinessItem {
  if (release === null) return waiting("lease.scope", ["LEASE_NOT_MINTED"], { mandatory: false, section: "governance" });
  if (production !== null) return item("lease.scope", "READY", { mandatory: false, section: "governance", reasonCodes: ["LEASE_PRODUCTION", `LEASE:${String(production.leaseId)}`] });
  return waiting("lease.scope", ["LEASE_STAGING_ONLY"], { mandatory: false, section: "governance", kind: "review_pending",
    nextAction: { label: "The staging lease (WRITE_LOW at most, staging routes, 24 h) is live; the production lease is minted at the deployment approval" } });
}

/** The newest monitor ref of this cycle (slice C): a ref with no non-null source is not present. */
function monitoringItem(state: A4ReadinessState): A4ReadinessItem {
  const monitor = cycleLinks(state.chain, "EVIDENCE_REF").filter((link) => link.body.refKind === "monitor").at(-1);
  const sources = typeof monitor?.body.nonNullSources === "number" ? monitor.body.nonNullSources : 0;
  return sources > 0 ? item("monitoring.source", "READY", { reasonCodes: [`SOURCES:${sources}`, "SELF_REPORTED"] })
    : waiting("monitoring.source", ["MONITOR_NO_SOURCE"], { kind: "source_unavailable", mandatory: reached(state, "reviewed"),
      nextAction: { label: "A monitor ref needs at least one source with a value; an all-null ref is not present" } });
}

/** Activate's readiness items (design §10.4 Readiness); the gates, `sod`, signing and lineage are the governance items. */
export function activateItems(state: A4ReadinessState, _query: A4ReadinessQuery): A4ReadinessItem[] {
  const { spec, answers } = activateSpecOf(state);
  const gaps = answerGaps(answers, carriedValues(state));
  const proposed = proposedFor(spec, answers);
  const facts = understandingCurrent(spec, answers) || proposed ? understandingOf(spec)?.facts ?? null : null;
  const target = textValue(answerValues(answers).get("target"));
  const release = currentRelease(state.chain);
  const releaseId = typeof release?.body.releaseId === "string" ? release.body.releaseId : null;
  return [
    gaps.missing.length + gaps.stale.length + gaps.invalid.length + gaps.carried.length === 0 ? item("ask_complete", "READY", { section: "recommendation" })
      : waiting("ask_complete", [...gaps.missing.map((id) => `ANSWER_MISSING:${id}`), ...gaps.stale.map((id) => `ANSWER_STALE:${id}`),
        ...gaps.invalid.map((id) => `ANSWER_INVALID:${id}`), ...gaps.carried], { section: "recommendation", nextAction: { label: gaps.carried.length > 0
          ? "Run Understand to carry the Adapt answers again" : "Answer or confirm the listed questions" } }),
    !reached(state, "understood") ? waiting("understanding_confirmed", ["UNDERSTANDING_NOT_CONFIRMED"], { section: "recommendation" })
      : state.project.stage === "activate" && !understandingCurrent(spec, answers) && !proposed
        ? waiting("understanding_confirmed", ["UNDERSTANDING_STALE"], { section: "recommendation", nextAction: { label: "Answers changed: run Understand again, then confirm it" } })
        : item("understanding_confirmed", "READY", { section: "recommendation" }),
    proposed ? item("release_proposed", "READY", { section: "recommendation" })
      : waiting("release_proposed", [spec.schema === ACTIVATE_SPEC_SCHEMA ? "PROPOSAL_STALE" : "NOT_PROPOSED"], { section: "recommendation", nextAction: { label: "Propose the release" } }),
    packageInputsItem(state, spec, proposed),
    sameHostItem(facts, target),
    // D-03 is open: a Helm target is recordable, its topology undecided (WAITING, never BLOCKED; C8).
    target === "helm" ? waiting("deployment.topology", ["TOPOLOGY_UNDECIDED", "KEY:D-03"], { kind: "review_pending", mandatory: false })
      : item("deployment.topology", "READY", { mandatory: false, reasonCodes: target === null ? ["TARGET_NOT_ANSWERED"] : [] }),
    // No image digest exists until D-03 and P0-14 (the bootstrap report records none): pinned by tag only, WAITING, never BLOCKED.
    waiting("deployment.image_pinned", ["IMAGE_TAG_ONLY", "KEY:P0-14"], { kind: "review_pending", mandatory: false,
      nextAction: { label: "The prepared files pin the image by tag; digest pinning waits for D-03 and P0-14 (the README names the gap)" } }),
    leaseScopeItem(release, releaseId === null ? null : productionLeaseOf(state.chain, releaseId)),
    amcCheckItem(state, releaseId),
    monitoringItem(state)
  ];
}
