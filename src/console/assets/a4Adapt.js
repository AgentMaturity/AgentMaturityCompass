// Adapt's Studio cards (P1-61, design §10.3): the compiled applicability under the catalog's own experimental notice (D-08),
// P2-22's plan-diff and blocker-inbox panels (the same BlockerKind vocabulary), the plan activation effect with the lockout
// notice and the lifecycle-bridge rows, the conformance statement's counts (slice A); the context plugin and its probe, the
// memory policy, the operating-profile widenings, the reporting clocks with CLOCK_REVIEW_STATUS and the data-handling
// declared-versus-enforced table (slice B). Read from the newest Adapt revision and the readiness Studio returns. Renderers
// are pure: every server string goes through esc(), statuses, reason codes and the catalog's notice are printed as Studio
// returned them, and no card names a maturity level or a percentage.
import { registerStageAction, registerStageCard } from "./a4Cards.js";
import * as view from "./a4View.js";

const { esc } = view;
const SPEC = "amc.a4-adapt-spec/v1";
const EFFECT = "a4.adapt.activate_plan";
const PRODUCED = "Adapt's producers run here: Studio records AMC's output (self-reported, never observed) and, beside it, what you write as your own statement.";
const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const list = (value) => (Array.isArray(value) ? value : []);
const specOf = (ctx) => (isObject(ctx.stageRevision?.spec) ? ctx.stageRevision.spec : {});
const itemOf = (ctx, id) => list(ctx.readiness?.items).find((item) => item.id === id) ?? null;
const codes = (values) => list(values).map((code) => `<code>${esc(code)}</code>`).join(" ");
const status = (ctx, id) => {
  const item = itemOf(ctx, id);
  return item ? `<p class="muted"><code>${esc(id)}</code> <code>${esc(item.status)}</code> ${codes(item.reasonCodes)}${item.nextAction?.label
    ? ` · ${esc(item.nextAction.label)}` : ""}</p>` : "";
};
const table = (head, rows, empty) => (rows.length ? `<div class="scroll"><table><thead><tr>${head.map((cell) => `<th>${esc(cell)}</th>`).join("")}</tr></thead>
  <tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join("")}</tr>`).join("")}</tbody></table></div>` : `<p class="muted">${esc(empty)}</p>`);
const coded = (item, prefix) => list(item?.reasonCodes).filter((code) => String(code).startsWith(`${prefix}:`)).map((code) => String(code).slice(prefix.length + 1).split(":"));

function renderConversation(ctx) {
  return `${view.renderConversation(ctx).replaceAll(view.NO_PRODUCER, PRODUCED)}
    <p class="muted">Understand carries <code>markets</code> and <code>stations</code> from Aspire; change them there (reopen Aspire). An empty or
      "unknown" answer stays unknown and leaves the requirements it decides unresolved.</p>
    ${["ask_complete", "understanding_confirmed", "profile_facts_complete"].map((id) => status(ctx, id)).join("")}`;
}

/** The compiled applicability: per requirement with reasons, citations and the catalog's own status, under its notice. */
function renderApplicability(ctx) {
  const spec = specOf(ctx);
  const facts = isObject(spec.understanding?.facts) ? spec.understanding.facts : null;
  if (facts === null) return "<p class=\"muted\">Run Understand to compile the plan from your answers.</p>";
  const rows = list(facts.requirements).map((row) => [`<code>${esc(row.controlId)}</code>`, `<code>${esc(row.applicability)}</code>`,
    codes(row.missingFacts) || "none", `<code>${esc(row.support)}</code> / <code>${esc(row.reviewStatus)}</code>`,
    list(row.citations).map((citation) => `<code>${esc(citation.key)}</code> ${esc(citation.instrument)} (${esc(citation.jurisdiction)}; applies
      <code>${esc(citation.appliesWhen)}</code>; retrieval <code>${esc(citation.retrieval)}</code>)`).join("<br>")]);
  const register = list(facts.register).map((entry) => [`<code>${esc(entry.id)}</code>`, esc(entry.instrument), esc(entry.jurisdiction),
    `<code>${esc(entry.status)}</code>`, `<code>verified: ${esc(entry.verified)}</code>`]);
  return `<p><strong>${esc(facts.notice)}</strong> <code>D-08</code></p>
    ${facts.compileError ? `<p class="status-bad">The answers did not compile: <code>${esc(facts.compileError.code)}</code> ${esc(facts.compileError.message)}</p>` : ""}
    ${table(["Requirement", "Applicability", "Missing facts", "Support / review", "Citations"], rows, "No requirement compiled.")}
    <h4>Register entries of the stations</h4>${table(["Entry", "Instrument", "Jurisdiction", "Status", "Verified (as recorded)"], register, "None.")}
    ${["plan_compiled", "plan_no_missing_facts", "plan_conflicts_resolved", "plan_unresolved", "plan_lock_drift", "regulatory_sources_status"]
    .map((id) => status(ctx, id)).join("")}`;
}

/** P2-22's plan-diff panel: the proposal against this project's previous one (renderPlanDiffMarkdown's sections, as rows). */
function renderPlanDiff(ctx) {
  const spec = specOf(ctx);
  if (spec.schema !== SPEC) return "<p class=\"muted\">No plan proposed yet.</p>";
  const diff = isObject(spec.diff) ? spec.diff : null;
  if (diff === null) return "<p class=\"muted\">No previous proposal of this project to compare with.</p>";
  const leaf = (rows) => list(rows).map((row) => [`<code>${esc(row.path)}</code>`, `<code>${esc(JSON.stringify(row.before))}</code>`, `<code>${esc(JSON.stringify(row.after))}</code>`]);
  return `<p class="muted">Against <code>${esc(diff.previousDigest)}</code>. Whether a change weakens a plan in force is decided at signing and at activation, never here.</p>
    ${table(["Requirement", "Change", "Before", "After", "Why"], list(diff.requirements).map((row) => [`<code>${esc(row.controlId)}</code>`, esc(row.change),
      `<code>${esc(row.before ?? "absent")}</code>`, `<code>${esc(row.after ?? "absent")}</code>`, esc(row.reason)]), "No requirement changed.")}
    <h4>Runtime policy</h4>${table(["Path", "Before", "After"], leaf(diff.runtimePolicy), "No change.")}
    <h4>Evidence plan</h4>${table(["Path", "Before", "After"], leaf(diff.evidencePlan), "No change.")}`;
}

/**
 * P2-22's blocker inbox: every item not READY or COMPLETE, grouped by its BlockerKind, with its codes and next action. It
 * never shows "all clear" by default: without a readiness evaluation it says nothing was evaluated.
 */
function renderBlockers(ctx) {
  if (!Array.isArray(ctx.readiness?.items)) return "<p class=\"status-bad\">Studio returned no readiness evaluation, so nothing here is shown as clear.</p>";
  const open = list(ctx.readiness?.items).filter((item) => item.status !== "READY" && item.status !== "COMPLETE");
  const kinds = [...new Set(open.map((item) => item.kind ?? "not_evaluated"))];
  return kinds.length === 0 ? `<p class="muted">No item is waiting in this evaluation (${esc(ctx.readiness.evaluatedAt ?? "time not stated")}).</p>` : kinds.map((kind) => `<h4><code>${esc(kind)}</code></h4><ul class="a4-rows">${open
    .filter((item) => (item.kind ?? "not_evaluated") === kind).map((item) => `<li><code>${esc(item.id)}</code> <code>${esc(item.status)}</code>${item.mandatory ? "" : " (informational)"}
      ${codes(item.reasonCodes)}${item.nextAction?.label ? `<br><span class="muted">${esc(item.nextAction.label)}</span>` : ""}</li>`).join("")}</ul>`).join("");
}

const decideButtons = (ctx, approvalRequestId, digest) => `${view.actionButton("Approve", "decide-engine", ctx.allowed.requestChanges,
  `data-approval="${esc(approvalRequestId)}" data-digest="${esc(digest)}" data-verb="approve"`)} ${view.actionButton("Deny", "decide-engine",
  ctx.allowed.requestChanges, `data-approval="${esc(approvalRequestId)}" data-digest="${esc(digest)}" data-verb="deny"`)}`;

/** The plan's signing and activation: the effect gate, its engine request, the lockout notice and the lifecycle-bridge rows. */
function renderActivation(ctx) {
  const item = itemOf(ctx, "plan_review_quorum");
  const [request] = coded(item, "APPROVAL_REQUEST");
  const completion = ctx.readiness?.gates?.completion;
  const openable = completion?.status === "QUORUM_MET" ? ctx.allowed.openEffect : view.held("The completion gate has no quorum yet");
  return `<p class="muted">Build signs the plan (a local audit trail under this workspace's keys). Activation is a second, separately decided plan review
    that an owner opens once the completion gate has its quorum; project approvers decide it here (two distinct people when regulated), and completing
    the stage activates the plan for the whole workspace. A regulated project activates at completion; any other completes with the plan signed and
    not activated unless an owner opens it.</p>
    <p><strong>Lockout.</strong> An active compiled plan with <code>L0-IDN-01</code> denies every native tool call that carries no verified lease. Studio
      native tasks with workspace tools started after activation run under a lease Studio mints (P1-67); tasks started before it, CLI agent sessions
      and delegated children carry none and are denied. A non-regulated project therefore completes with the plan signed and not activated.</p>
    ${["plan_signed", "plan_activated", "plan_review_quorum", "adapt.plan.nativeSessionsAllowed"].map((id) => status(ctx, id)).join("")}
    <div class="row wrap">${view.actionButton(request ? "Re-open the plan review" : "Open the plan review", "open-effect", openable,
      `data-gate="${esc(completion?.gateId ?? "")}"`)}</div>
    ${request ? `<p class="muted">Engine request <code>${esc(request[0])}</code></p><label>Decision reason <textarea name="engine-reason" rows="2" maxlength="1000"></textarea></label>
      <div class="row wrap">${decideButtons(ctx, request[0], request[1])}</div>` : ""}
    ${status(ctx, "effects.failed")}
    <h4>Lifecycle bridge (testing → staging)</h4>${table(["Control", "Status"], coded(itemOf(ctx, "lifecycle_bridge"), "BRIDGE")
      .map(([control, state]) => [`<code>${esc(control)}</code>`, `<code>${esc(state)}</code>`]), "Not evaluated.")}
    ${status(ctx, "lifecycle_bridge")}`;
}

/** The conformance statement: counts and the five dimensions per control, never a percentage; owner-settled ones stay unresolved. */
function renderConformance(ctx) {
  const conformance = specOf(ctx).review?.conformance;
  if (!isObject(conformance)) return `<p class="muted">Review records the control results.</p>${status(ctx, "conformance_statement")}`;
  const settled = itemOf(ctx, "plan_unresolved")?.acknowledged;
  const rows = list(conformance.controls).map((control) => [`<code>${esc(control.controlId)}</code>`, `<code>${esc(control.planApplicability)}</code>`,
    `<code>${esc(control.dimensions?.evidence)}</code>`, `<code>${esc(control.dimensions?.result)}</code>`, `<code>${esc(control.dimensions?.enforcement?.state)}</code>`,
    `<code>${esc(control.dimensions?.review)}</code>`, `<code>${esc(control.claimKind)}</code>`, esc(control.notEvaluatedReason ?? "")]);
  return `<p class="muted">Counts: ${Object.entries(isObject(conformance.counts) ? conformance.counts : {}).map(([key, value]) => `${esc(key)} <code>${esc(value)}</code>`).join(" · ")}.
    Signed results <code>${esc(conformance.resultsPath)}</code> (${conformance.verified ? "verified under this workspace's keys" : "not verified locally"}).</p>
    ${table(["Control", "Applicability", "Evidence", "Result", "Enforcement", "Review", "Claim", "Not evaluated because"], rows, "No control.")}
    ${settled ? `<p class="muted">Owner out of scope (still unresolved): ${codes(coded(itemOf(ctx, "plan_unresolved"), "UNRESOLVED").map(([id]) => id))} by
      <code>${esc(settled.by)}</code>: ${esc(settled.reason)}</p>` : ""}
    ${["conformance_statement", "adapt.control_results_signature", "required_entries_satisfied"].map((id) => status(ctx, id)).join("")}`;
}

const buildOf = (ctx) => (isObject(specOf(ctx).build) ? specOf(ctx).build : null);
const factsOf = (ctx) => (isObject(specOf(ctx).understanding?.facts) ? specOf(ctx).understanding.facts : null);

/** The context plugin Build wrote and the probe: where it reaches (an in-process run) and where it does not (native tasks, P2-37). */
function renderContext(ctx) {
  const context = buildOf(ctx)?.context;
  const probeOffer = ctx.project.stage === "adapt" && ["built", "reviewed"].includes(ctx.project.step) ? ctx.allowed.build : view.held("The probe runs after Build");
  return `<p class="muted">Build writes your audience, market, sector, language, accessibility, data-handling and regulatory-note answers as one attributed
      context plugin (order 160). Only an in-process run loads it: a Studio native task started now shows no A4 context plugin in its frame, and a deployed
      agent does not load it either (P2-37). The probe runs one turn on the stub provider and records that session's effective-policy receipt.</p>
    ${isObject(context) ? `<p class="muted">Plugin <code>${esc(context.name)}</code> · sha256 <code>${esc(context.sha256)}</code> · source <code>${esc(context.source)}</code>
      · file <code>${esc(context.path)}</code></p>` : "<p class=\"muted\">No context plugin built yet.</p>"}
    <div class="row wrap">${view.actionButton("Run the context probe", "probe", isObject(context) ? probeOffer : view.held("Build writes the context plugin first"))}</div>
    ${["prompts_attributed", "context_reaches_runtime_frame", "model_delivery", "context.native_delivery", "adapt.prompt_pack_signature"].map((id) => status(ctx, id)).join("")}
    <p class="muted">A prompt pack is a signed Score resource; the runtime does not load it into a model's prompt.</p>`;
}

/** The memory policy Build wrote, field by field with its source (answer or default); advisory, and the card says so. */
function renderMemory(ctx) {
  const memory = buildOf(ctx)?.memoryPolicy;
  const policy = isObject(memory?.policy) ? memory.policy : null;
  const sources = isObject(policy?.sources) ? policy.sources : {};
  const rows = policy === null ? [] : [["privacyClass", policy.privacyClass], ["allowedConsumers", list(policy.allowedConsumers).join(", ")],
    ["expiresAfterDays", policy.expiresAfterDays], ["reviewAfterDays", policy.reviewAfterDays], ["retentionTag", policy.retentionTag],
    ["spillCapBytes", policy.spillCapBytes], ["compaction.contextWindowTokens", policy.compaction?.contextWindowTokens ?? "off"]]
    .map(([field, value]) => [`<code>${esc(field)}</code>`, `<code>${esc(value)}</code>`, esc(sources[field] ?? (field.startsWith("compaction") || field === "spillCapBytes" ? "workspace" : ""))]);
  return `<p class="muted">Enforcement: <code>advisory</code>. ${esc(policy?.enforcementNote ?? "The reasoning-memory writer does not read this policy yet, so it limits nothing AMC stores.")}</p>
    ${policy === null ? "<p class=\"muted\">Build writes the memory policy from your answers.</p>"
      : `<p class="muted">File <code>${esc(memory.path)}</code> · sha256 <code>${esc(memory.sha256)}</code></p>${table(["Field", "Value", "From"], rows, "No field.")}`}
    ${status(ctx, "memory_policy_present")}`;
}

/** The station operating profile's dry run: each widening the current verified configs would take, and the digest an owner may accept. */
function renderPermissions(ctx) {
  const permissions = factsOf(ctx)?.permissions;
  if (!isObject(permissions)) return `<p class="muted">Understand compares the station's operating profile with your signed configs.</p>${status(ctx, "profile_no_widening")}`;
  return `<p class="muted">Station <code>${esc(permissions.station ?? "unknown")}</code>${permissions.profilePath ? ` · proposal <code>${esc(permissions.profilePath)}</code>` : ""}${
    permissions.error ? ` · <code>${esc(permissions.error)}</code>` : ""}. A4 never activates a profile that widens a config; activation stays the owner's
      <code>amc domain apply --activate-profile</code> after review.</p>
    ${table(["Widening (activateOperatingProfile refuses it)"], list(permissions.widenings).map((entry) => [`<code>${esc(entry)}</code>`]), "No widening.")}
    ${permissions.wideningsSha256 && list(permissions.widenings).length > 0 ? `<p class="muted">To accept exactly these, a project owner answers
      <code>acceptWidenings</code> with <code>${esc(permissions.wideningsSha256)}</code>.</p>` : ""}
    ${["profile_no_widening", "configs_trusted"].map((id) => status(ctx, id)).join("")}`;
}

/** Reporting-clock candidates: each NEEDS_CLASSIFICATION, with the table's review status and source flags verbatim; AMC decides none. */
function renderClocks(ctx) {
  const clocks = list(factsOf(ctx)?.clocks);
  const reviewStatus = clocks[0]?.reviewStatus;
  return `${reviewStatus ? `<p><strong>${esc(reviewStatus)}</strong></p>` : ""}
    ${table(["Clock", "Instrument", "Jurisdiction", "Deadline", "Condition", "Source verified", "Declared jurisdiction", "Status"], clocks.map((clock) => [
      `<code>${esc(clock.clockId)}</code>`, `${esc(clock.instrument)} ${esc(clock.article)}`, esc(clock.jurisdiction), esc(clock.deadline), esc(clock.condition),
      `<code>verified: ${esc(clock.source?.verified)}</code>${clock.source?.reason ? ` ${esc(clock.source.reason)}` : ""}`, `<code>${esc(clock.jurisdictionDeclared)}</code>`,
      `<code>${esc(clock.status)}</code>`]), "No reporting clock is listed for these stations.")}
    ${status(ctx, "clocks_classified")}`;
}

/** What the members declared about data and memory, beside what AMC enforces today (none or advisory, with the key that changes it). */
function renderDataHandling(ctx) {
  const declared = isObject(specOf(ctx).dataHandling) ? specOf(ctx).dataHandling : null;
  const shown = (value) => (Array.isArray(value) ? value.join(", ") : value) || "not stated";
  const rows = declared === null ? [] : [["Data classes", declared.dataClasses, "none", "P2-01"], ["Residency", declared.residency, "none", "P2-01"],
    ["Retention", declared.retention, "none", "P2-02"], ["Processors", declared.processors, "none", "P2-01"],
    ["Memory policy", buildOf(ctx)?.memoryPolicy?.policy?.retentionTag, "advisory", "the reasoning-memory writeback"]]
    .map(([field, value, enforced, key]) => [esc(field), esc(shown(value)), `<code>${esc(enforced)}</code>`, esc(key)]);
  return `${declared === null ? "<p class=\"muted\">Propose records what you declared about data handling.</p>"
    : table(["Declared", "Value", "Enforced by AMC", "Changes with"], rows, "Nothing declared.")}${status(ctx, "data_handling_declared")}`;
}

const stepCard = (step, note) => (ctx) => `<p class="muted">${esc(note)}</p><label>Your note <textarea name="content" rows="3" maxlength="65536"></textarea></label>
  <div class="row wrap">${view.actionButton(step === "build" ? "Build" : "Review", step, view.stepOffer(ctx.allowed[step], ctx, step))}</div>`;

export function register() {
  registerStageCard("adapt", "conversation", renderConversation, "Conversation");
  registerStageCard("adapt", "applicability", renderApplicability, "Applicability");
  registerStageCard("adapt", "plan-diff", renderPlanDiff, "Plan diff");
  registerStageCard("adapt", "blockers", renderBlockers, "Blockers");
  registerStageCard("adapt", "build", stepCard("build", "Build signs the proposed plan; its review is filed when an owner opens the plan review at completion."), "Build");
  registerStageCard("adapt", "review", stepCard("review", "Review evaluates every requirement over the admitted evidence and records the signed control results."), "Review");
  registerStageCard("adapt", "context", renderContext, "Context plugin and probe");
  registerStageCard("adapt", "memory", renderMemory, "Memory policy");
  registerStageCard("adapt", "permissions", renderPermissions, "Permissions");
  registerStageCard("adapt", "clocks", renderClocks, "Reporting clocks");
  registerStageCard("adapt", "data-handling", renderDataHandling, "Data handling: declared and enforced");
  registerStageCard("adapt", "activation", renderActivation, "Plan activation");
  registerStageCard("adapt", "conformance", renderConformance, "Conformance statement");
  registerStageAction("adapt", "probe", ({ headBinding, projectPath }) => ({ label: "Run the context probe", path: projectPath("/stages/adapt/probe"), body: headBinding() }));
  registerStageAction("adapt", "open-effect", ({ button, headBinding, projectPath }) => {
    if (!button.dataset.gate) throw new Error("No approved completion gate is shown. Refresh first. Nothing was sent.");
    return { label: "Open the plan review", path: projectPath(`/stages/adapt/effects/${EFFECT}/open`), body: { gateId: button.dataset.gate, ...headBinding() } };
  });
  registerStageAction("adapt", "decide-engine", ({ button, value, projectPath }) => {
    const reason = value("engine-reason");
    if (!reason) throw new Error("Write a decision reason first. Nothing was sent.");
    return { label: button.dataset.verb === "deny" ? "Deny" : "Approve",
      path: projectPath(`/approvals/${encodeURIComponent(button.dataset.approval)}/${button.dataset.verb === "deny" ? "deny" : "approve"}`),
      body: { reason, expectedRequestDigestSha256: button.dataset.digest } };
  });
}
