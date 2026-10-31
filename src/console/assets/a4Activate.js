// Activate's Studio cards (P1-62, design §10.4, §14, §15): the release record with its eight-surface table and the lifecycle
// provenance rows, the package file list, the prepared deployment with copy buttons (the lease token is an operator-supplied
// secret file, shown here as a placeholder), the receipt form for either target, AMC's check beside the operator's status
// (two columns, never merged), the rollback preview and confirmation, the monitor tiles, the four-column value table and the
// hypotheses predicted vs observed. The release, the deployment approval and the rollback each run here, never through the
// generic Complete button: a lease token is answered once, kept in this page's memory only and shown until it reloads.
// Renderers are pure: every server string goes through esc(); statuses, claim kinds and reason codes are printed as Studio
// returned them. The release, value and monitor views are read on request (Load), never on render.
import { apiNativeRequest } from "./api.js";
import { registerStageAction, registerStageCard } from "./a4Cards.js";
import * as view from "./a4View.js";

const { esc } = view;
const SPEC = "amc.a4-activate-spec/v1";
const RELEASE_EFFECT = "a4.activate.release";
const PRODUCED = "Activate's producers run here: Studio records AMC's output (self-reported, never observed) and, beside it, what you write as your own statement.";
const TOKEN_NOTICE = "Shown once, in this page only: AMC stores no token. Copy it into the operator's secret file now; reloading the page loses it.";
const SECRET_PLACEHOLDER = "<the lease token shown once on the Release card>";
const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const list = (value) => (Array.isArray(value) ? value : []);
const specOf = (ctx) => (isObject(ctx.stageRevision?.spec) ? ctx.stageRevision.spec : {});
const itemOf = (ctx, id) => list(ctx.readiness?.items).find((item) => item.id === id) ?? null;
const codes = (values) => list(values).map((code) => `<code>${esc(code)}</code>`).join(" ");
const json = (value) => `<code>${esc(JSON.stringify(value ?? null))}</code>`;
const status = (ctx, id) => {
  const item = itemOf(ctx, id);
  return item ? `<p class="muted"><code>${esc(id)}</code> <code>${esc(item.status)}</code> ${codes(item.reasonCodes)}${item.nextAction?.label
    ? ` · ${esc(item.nextAction.label)}` : ""}</p>` : "";
};
const table = (head, rows, empty) => (rows.length ? `<div class="scroll"><table><thead><tr>${head.map((cell) => `<th>${esc(cell)}</th>`).join("")}</tr></thead>
  <tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join("")}</tr>`).join("")}</tbody></table></div>` : `<p class="muted">${esc(empty)}</p>`);
const coded = (item, prefix) => list(item?.reasonCodes).filter((code) => String(code).startsWith(`${prefix}:`)).map((code) => String(code).slice(prefix.length + 1).split(":"));
const copyButton = (text, label = "Copy") => `<button type="button" class="secondary" data-a4-action="copy" data-copy="${esc(text)}">${esc(label)}</button>`;
const quorumMet = (gate) => gate?.status === "QUORUM_MET";

// Per project: the views read on request, the lease tokens answered to this page, the rollback preview and check it opened.
const loaded = new Map();
const tokens = new Map();
const previews = new Map();
const checks = new Map();

/** GET …/releases (then the newest release), …/value and …/monitor; a failure keeps what was shown and says why. */
async function loadViews(projectPath, projectId) {
  try {
    const [releases, value, monitor] = await Promise.all([apiNativeRequest(projectPath("/releases")), apiNativeRequest(projectPath("/value")),
      apiNativeRequest(projectPath("/monitor"))]);
    const newest = list(releases?.releases).at(-1) ?? null;
    const release = newest === null ? null : await apiNativeRequest(projectPath(`/releases/${encodeURIComponent(newest.releaseId)}`));
    loaded.set(projectId, { release, releases: list(releases?.releases), value, monitor, error: null, at: new Date().toISOString() });
  } catch (error) {
    loaded.set(projectId, { ...(loaded.get(projectId) ?? {}), error: error?.message ?? String(error) });
  }
}
const views = (ctx) => loaded.get(ctx.project.projectId) ?? null;
const loadButton = (ctx) => {
  const data = views(ctx);
  return `<div class="row wrap">${view.actionButton(data ? "Load again" : "Load the release, value and monitor views", "load-views", { allowed: true },
    `data-project="${esc(ctx.project.projectId)}"`)}</div>${data?.error ? `<p class="status-bad">${esc(data.error)}</p>` : ""}${data?.at
    ? `<p class="muted">Read at ${esc(data.at)}; actions on this page do not refresh it.</p>` : ""}`;
};
const releaseOf = (ctx) => views(ctx)?.release ?? null;

function renderConversation(ctx) {
  return `${view.renderConversation(ctx).replaceAll(view.NO_PRODUCER, PRODUCED)}
    <p class="muted">Understand carries <code>deploymentNeeds</code> from Adapt; change it there (reopen Adapt). AMC never asks for a credential: each lease
      token is delivered once by AMC.</p>
    ${["ask_complete", "understanding_confirmed", "release_proposed", "deployment.same_host", "deployment.topology", "deployment.image_pinned", "backup.include_paths"]
    .map((id) => status(ctx, id)).join("")}`;
}

/** The token a release or deployment approval answered to this page, or the replay's reason. */
function tokenBox(token) {
  if (!token) return "";
  if (typeof token.token !== "string") {
    return `<p class="muted">The ${esc(token.scope)} lease token is not shown: <code>${esc(token.reasonCode ?? "TOKEN_ALREADY_DELIVERED")}</code>.</p>`;
  }
  return `<div class="card"><p><strong>${esc(token.scope)} lease <code>${esc(token.leaseId)}</code></strong> · expires ${esc(token.expiresAt)}</p>
    <p class="status-bad">${esc(TOKEN_NOTICE)}</p><pre class="scroll">${esc(token.token)}</pre>${copyButton(token.token, "Copy the token")}</div>`;
}

const decideForm = (ctx, request, name) => (request ? `<p class="muted">Engine request <code>${esc(request[0])}</code> (decided by project approvers or owners,
  bound to its digest)</p><label>Decision reason <textarea name="${name}" rows="2" maxlength="1000"></textarea></label>
  <div class="row wrap">${["approve", "deny"].map((verb) => view.actionButton(verb === "approve" ? "Approve" : "Deny", "decide-engine", ctx.allowed.requestChanges,
    `data-approval="${esc(request[0])}" data-digest="${esc(request[1])}" data-verb="${verb}" data-field="${name}"`)).join(" ")}</div>` : "");

/** What Propose drafted (no part is edited by hand; change the answers). */
function proposalSummary(proposal) {
  const target = proposal.deploymentTarget ?? {};
  const leases = isObject(proposal.leases) ? proposal.leases : {};
  return `<p>Target <code>${esc(target.kind)}</code> · destination <code>${esc(target.destinationRef)}</code> · image ${esc(target.imagePin)}</p>
    ${table(["Lease", "Scopes", "Classes", "Routes", "TTL (h)", "Token"], ["staging", "production"].filter((scope) => isObject(leases[scope])).map((scope) => [
      `<code>${esc(scope)}</code>`, codes(leases[scope].scopes), codes(leases[scope].executeActionClasses), codes(leases[scope].routeAllowlist),
      esc(leases[scope].ttlHours), esc(leases[scope].token)]), "No lease plan.")}
    <p class="muted">Update policy: enforcement <code>${esc(proposal.updatePolicy?.enforcement ?? "none")}</code> (signed in the package; nothing enforces it yet).
      Kill switch: ${esc(proposal.monitoringPlan?.killSwitch ?? "an active kill switch holds the project until it is released and an owner resumes")}.</p>`;
}

/** The release record as GET …/releases/:rid returned it: header, surfaces, leases, lifecycle provenance and the package files. */
function releaseRecord(release) {
  const files = release.packageFiles?.files;
  const productionRun = list(release.lifecycleBridge).filter((row) => row.effect === "a4.activate.production_lease").at(-1);
  const controls = (rows) => list(rows).map((row) => [`<code>${esc(row.controlId)}</code>`, `<code>${esc(row.status)}</code>`, esc(row.evidenceRef ?? "none"),
    `<code>${esc(row.claimKind ?? "none")}</code>`, `<code>${esc(row.satisfiedBy ?? "none")}</code>`, esc(row.reason ?? "")]);
  return `<h4>Release record <code>${esc(release.releaseId)}</code></h4>
    <p class="muted">Version ${esc(release.version)} · package <code>${esc(release.packageDigest)}</code> · record envelope
      <code>${release.envelopeValid ? "valid under this workspace's keys or its pinned notary" : "does not verify"}</code> · transparency entry <code>${esc(release.transparencyEntryId ?? release.transparency?.reason ?? "none")}</code>
      · previous <code>${esc(release.previousReleaseId ?? "none")}</code> · base <code>${esc(release.baseReleaseId ?? "none")}</code></p>
    <p class="muted">Expert review at the deployment approval (D-21): <code>${esc(release.expertReview?.status ?? "not_recorded")}</code>${release.expertReview?.acknowledgement
      ? ` · acknowledged by <code>${esc(release.expertReview.acknowledgement.by)}</code> until ${esc(new Date(release.expertReview.acknowledgement.expiresTs).toISOString())}: ${esc(release.expertReview.acknowledgement.reason)}`
      : ""}</p>
    <h4>Eight surfaces</h4>${table(["Surface", "Status", "Reason", "Values"], list(release.surfaceTable).map((row) => [`<code>${esc(row.surface)}</code>`,
      `<code>${esc(row.status)}</code>`, esc(row.reason ?? ""), json(row.values)]), "No surface table.")}
    <h4>Leases</h4>${table(["Lease", "Scope", "Status now", "Recorded", "Expires"], list(release.leases).map((lease) => [`<code>${esc(lease.leaseId)}</code>`,
      `<code>${esc(lease.scope)}</code>`, `<code>${esc(lease.status)}</code>${lease.reasonCode ? ` ${codes([lease.reasonCode])}` : ""}`,
      `<code>${esc(lease.recordedStatus)}</code>`, esc(lease.expiresAt)]), "No lease.")}
    <h4>Lifecycle provenance (${esc(release.lifecycle?.from)} → ${esc(release.lifecycle?.to)}, as recorded at release)</h4>
    ${table(["Control", "Status", "Evidence ref", "Claim kind", "Satisfied by", "Reason"], controls(release.lifecycle?.controls), "No control.")}
    <h4>Production bridge as the deployment approval's effect recorded it</h4>
    ${table(["Control", "Status", "Evidence ref", "Claim kind", "Satisfied by", "Reason"], controls(productionRun?.controls), "The deployment approval's effect has not run.")}
    <h4>Production bridge as it stands now</h4>
    ${table(["Control", "Status", "Evidence ref", "Claim kind", "Satisfied by", "Reason"], controls(release.lifecycleProduction), "Not evaluated.")}
    ${table(["Bridge run", "From", "To", "Advanced", "Transition", "Missing"], list(release.lifecycleBridge).map((row) => [`<code>${esc(row.effect)}</code>`,
      esc(row.from), esc(row.to), `<code>${esc(row.advanced)}</code>`, esc(row.transitionId ?? "none"), codes(row.missing)]), "The bridge has not run.")}
    <details data-a4-open="package-files"><summary>Package files</summary>${Array.isArray(files)
      ? table(["Path", "sha256", "Size", "Kind"], files.map((file) => [`<code>${esc(file.path)}</code>`, `<code>${esc(file.sha256)}</code>`, esc(file.size), esc(file.kind)]), "No file.")
      : `<p class="status-bad">Not listed: <code>${esc(release.packageFiles?.reason ?? "MANIFEST_UNREADABLE")}</code></p>`}</details>
    <p class="muted">${esc(release.boundary)}</p>`;
}

function renderRelease(ctx) {
  const spec = specOf(ctx);
  const proposal = spec.schema === SPEC && isObject(spec.proposal) ? spec.proposal : null;
  const { direction, completion } = ctx.readiness?.gates ?? {};
  const [request] = coded(itemOf(ctx, "release_effect"), "APPROVAL_REQUEST");
  const project = `data-project="${esc(ctx.project.projectId)}"`;
  const release = releaseOf(ctx);
  return `<p class="muted">AMC builds a signed package and prepares the files an operator runs; it never deploys. Recorded: what the operator stated.
      Checked: what AMC's own probe found. v1 deploys by restarting the hosted Studio that built this agent (D-18).</p>
    ${proposal ? proposalSummary(proposal) : "<p class=\"muted\">Propose the release first: the draft comes from your answers.</p>"}
    ${["package.inputs", "signing.notary_route", "lineage.independent_approvals", "release_effect", "lease.scope", "lease.principal"].map((id) => status(ctx, id)).join("")}
    <h4>Release</h4>
    <p class="muted">Once the release approval (direction gate) has its quorum, an owner opens <code>${RELEASE_EFFECT}</code>, a second DEPLOY request decided
      separately; then an owner releases. The response carries the staging lease token (WRITE_LOW at most, the staging routes, 24 hours) once.</p>
    <div class="row wrap">${view.actionButton(request ? "Re-open the release request" : "Open the release request", "open-release",
      quorumMet(direction) ? ctx.allowed.openEffect : view.held("The release approval has no quorum yet"), `data-gate="${esc(direction?.gateId ?? "")}"`)}
      ${view.actionButton("Release", "release", quorumMet(direction) ? ctx.allowed.release : view.held("The release approval has no quorum yet"),
        `data-gate="${esc(direction?.gateId ?? "")}" ${project}`)}</div>
    ${decideForm(ctx, request, "release-reason")}
    <h4>Deployment approval</h4>
    <p class="muted">Completing the deployment approval (completion gate) mints the production lease, whose token this page shows once, then moves the
      lifecycle to production only with every production control evidenced; in v1 it stays at staging (P2-40). A DENY of it revokes the staging lease.
      On a regulated project an owner acknowledges the pending expert review (D-21) before requesting it.</p>
    ${["package.transparency", "deployment.receipt", "deployment.amc_check", "monitoring.source", "regulatory_sources_status", "lifecycle.production_controls"].map((id) => status(ctx, id)).join("")}
    <div class="row wrap">${view.actionButton("Complete the deployment approval", "complete-activate", quorumMet(completion) ? ctx.allowed.progress
      : view.held("The deployment approval has no quorum yet"), `data-gate="${esc(completion?.gateId ?? "")}" ${project}`)}</div>
    ${tokenBox(tokens.get(ctx.project.projectId))}
    ${loadButton(ctx)}${release ? releaseRecord(release) : ""}
    ${release && release.transparencyEntryId === null ? `<div class="row wrap">${view.actionButton("Append the transparency entry", "append-transparency", ctx.allowed.release,
      `data-release="${esc(release.releaseId)}" ${project}`)}</div>` : ""}`;
}

/**
 * The prepared plan (signed a4-deployment-plan), each command with a copy button; the lease secret is a placeholder. Once
 * the release's recorded rollback target was rolled back, the rollback steps (which re-pin it) are marked superseded and
 * lose their copy buttons: the rollback preview says what runs instead (Compose's base file; no Helm command).
 */
function planSteps(plan, release) {
  if (!isObject(plan)) return "<p class=\"muted\">The signed plan could not be read.</p>";
  const superseded = (step) => step.phase === "rollback" && release.rollbackTargetRolledBack === true;
  return `${table(["Phase", "Command", "Note"], list(plan.steps).map((step) => [`<code>${esc(step.phase)}</code>`,
    !step.command ? "<span class=\"muted\">by hand</span>" : superseded(step) ? `<code>${esc(step.command)}</code> <span class="status-bad">superseded</span>`
      : `<code>${esc(step.command)}</code> ${copyButton(step.command)}`,
    superseded(step) ? `${esc(step.note)} <span class="muted">Release ${esc(release.rollback?.releaseId)}, the recorded rollback target, was rolled back since:
      preview the rollback for what runs instead.</span>` : esc(step.note)]), "No step.")}
    <p class="muted">Lease secret file: <code>${esc(SECRET_PLACEHOLDER)}</code>. AMC never writes, reads or stores it.</p>
    <h4>Gaps</h4><ul class="a4-rows">${list(plan.gaps).map((gap) => `<li><code>${esc(gap.reasonCode)}</code> ${esc(gap.note)}</li>`).join("")}</ul>`;
}

const receiptRows = (deployments) => list(deployments).map((row) => [`<code>${esc(row.deploymentId)}</code>`, `<code>${esc(row.kind)}</code> ${esc(row.environment)} · ${esc(row.target)}`,
  `<code>${esc(row.recordedStatus)}</code>`, `<code>${esc(row.amcCheckStatus)}</code>`, esc(row.statusText),
  row.check ? `${codes(row.check.reasonCodes)} address <code>${esc(row.check.resolvedAddress ?? "none")}</code> · response <code>${esc(row.check.responseSha256 ?? "none")}</code>
    ${list(row.check.checks).map((check) => `<br><code>${esc(check.name)}</code> <code>${esc(check.status)}</code> ${esc(check.detail ?? "")}`).join("")}` : "not checked"]);

function receiptForm(ctx, release) {
  const target = release.deploymentTarget?.kind;
  const staging = list(release.leases).filter((lease) => lease.scope === "staging").map((lease) => lease.leaseId);
  const offer = ctx.allowed.recordDeployment;
  return `<h4>Record the operator's receipt (${esc(target)})</h4>
    <p class="muted">What the operator ran and saw; it lists what changed and nothing more. Studio refuses it unless this Studio runs under the target
      (DEPLOYMENT_NOT_SAME_HOST, P2-40), and it issues no lease and starts no run.</p>
    <div class="a4-form">
      <label>Kind <select name="receipt-kind"><option value="deploy">deploy</option><option value="rollback">rollback</option></select></label>
      <label>Environment <select name="receipt-environment"><option value="staging">staging</option><option value="production">production</option></select></label>
      <label>Operator status <select name="receipt-status"><option value="succeeded">succeeded</option><option value="failed">failed</option><option value="partial">partial</option></select></label>
      <label>Package digest (the rolled-back-to release's for a rollback row; empty for none) <input name="receipt-package" value="${esc(release.packageDigest)}" maxlength="64"></label>
      <label>Overlay digest (sha256sum of the overlay you applied) <input name="receipt-overlay" maxlength="64"></label>
      <label>Image digest (sha256:…; empty while pinned by tag) <input name="receipt-image" maxlength="71"></label>
      <label>Restarted at <input type="datetime-local" name="receipt-restarted" step="1"></label>
      ${target === "helm" ? "<label>Helm revision (from helm history) <input type=\"number\" name=\"receipt-helm\" min=\"1\"></label>" : ""}
      <label>Lease ids (one per line) <textarea name="receipt-leases" rows="2">${esc(staging.join("\n"))}</textarea></label>
      <label>Destination <input name="receipt-destination" value="${esc(release.deployPlan?.plan?.destinationRef ?? "")}" maxlength="260"></label>
      <div class="row wrap">${view.actionButton("Record the receipt", "record-receipt", offer, `data-release="${esc(release.releaseId)}" data-target="${esc(target)}"
        data-project="${esc(ctx.project.projectId)}"`)}</div></div>`;
}

function renderDeploy(ctx) {
  const release = releaseOf(ctx);
  if (!release) return `<p class="muted">Load the release to see its prepared deployment.</p>${loadButton(ctx)}`;
  const plan = release.deployPlan;
  const check = checks.get(ctx.project.projectId);
  return `<p class="muted">Prepared by AMC; AMC never runs these commands. Instructions are not evidence of an executed deployment. Plan signature
      <code>${plan?.signatureValid === true && plan.reason === null ? "valid under this workspace's keys, listed in the package manifest" : esc(plan?.reason ?? "not checked")}</code>.</p>
    ${plan?.signatureValid === true && plan.reason === null ? planSteps(plan.plan, release) : "<p class=\"muted\">The prepared steps are not shown: the plan's signature, or its digest in the package manifest, did not verify.</p>"}${receiptForm(ctx, release)}
    <h4>Receipts: recorded by the operator, checked by AMC</h4>
    ${table(["Receipt", "Kind", "Recorded", "AMC check", "Status", "Check detail"], receiptRows(release.deployments), "No receipt recorded.")}
    <h4>AMC's check</h4>
    <p class="muted">Owner only, token-less, to the newest receipt's destination: reachability at best in v1 (release identity not evaluated at the destination
      until P2-40). A failed check blocks the deployment approval; it never changes the operator's status.</p>
    <div class="row wrap"><select name="verify-environment"><option value="staging">staging</option><option value="production">production</option></select>
      ${view.actionButton("Run AMC's check", "verify", ctx.allowed.verifyDeployment, `data-release="${esc(release.releaseId)}" data-project="${esc(ctx.project.projectId)}"`)}</div>
    ${check ? `<p>AMC check <code>${esc(check.checkId)}</code>: <code>${esc(check.amcCheckStatus)}</code> · ${esc(check.statusText)}</p>` : ""}
    ${status(ctx, "deployment.amc_check")}${loadButton(ctx)}`;
}

function renderRollback(ctx) {
  const release = releaseOf(ctx);
  if (!release) return `<p class="muted">Load the release to roll it back.</p>${loadButton(ctx)}`;
  const opened = previews.get(ctx.project.projectId);
  const preview = opened?.releaseId === release.releaseId ? opened.preview : null;
  const [request] = coded(itemOf(ctx, "rollback_effect"), "APPROVAL_REQUEST");
  const attrs = `data-release="${esc(release.releaseId)}" data-project="${esc(ctx.project.projectId)}"`;
  const target = release.rollback?.releaseId ?? null;
  // A Helm rollback re-pins whatever its chosen revision deployed, so with the target rolled back AMC prepares no Helm command.
  const repin = release.deploymentTarget?.kind === "compose" ? "its one prepared command returns to the base file, which re-pins no release"
    : "AMC prepares no command: a Helm rollback re-pins whatever release its chosen revision deployed";
  const restores = target === null ? "A rollback restores no Enforce snapshot (no release ran in production when this one was built); it revokes this release's leases and prepares the operator's commands"
    : release.rollbackTargetRolledBack === true ? `Release ${target}, the release that ran in production when this one was built, was rolled back since, so a rollback restores no Enforce snapshot; it revokes this release's leases, and ${repin}`
      : `A rollback restores the Enforce snapshot of release ${target}, the one that ran in production when this one was built (signed receipts); it revokes this release's leases and prepares the operator's commands`;
  return `<p class="muted">${esc(restores)}; it never moves the lifecycle backwards, and the deployed release changes only when the operator records the rollback row. A high or critical
      risk tier freezes first and holds the project.</p>
    <div class="row wrap"><select name="rollback-environment"><option value="staging">staging</option><option value="production">production</option></select>
      ${view.actionButton("Preview the rollback", "rollback-preview", ctx.allowed.rollback, attrs)}</div>
    ${preview ? `<p>To <code>${esc(preview.toReleaseId ?? "none")}</code> · Enforce manifest <code>${esc(preview.confirmManifestId ?? "none")}</code> ·
      freeze first <code>${esc(preview.freezeFirst)}</code> · leases ${codes(preview.leaseIds)}</p>
      ${preview.restore?.note ? `<p class="muted">${esc(preview.restore.note)}</p>` : ""}
      ${table(["Prepared command"], list(preview.preparedCommands).map((command) => [`<code>${esc(command)}</code> ${copyButton(command)}`]), "No command.")}` : ""}
    ${status(ctx, "rollback_effect")}${decideForm(ctx, request, "rollback-reason-engine")}
    <h4>Confirm with the exact ids the preview bound</h4>
    <label>Release rolled back to (empty for none) <input name="rollback-to" maxlength="36"></label>
    <label>Enforce manifest id (empty for none) <input name="rollback-manifest" maxlength="40"></label>
    <label>Reason <textarea name="rollback-reason" rows="2" maxlength="2000"></textarea></label>
    <div class="row wrap">${view.actionButton("Roll back", "rollback", ctx.allowed.rollback, attrs)}</div>
    ${table(["Rollback", "To", "Environment", "Leases revoked", "Lifecycle"], list(release.rollbacks).map((row) => [`<code>${esc(row.rollbackId)}</code>`,
      esc(row.toReleaseId ?? "none"), esc(row.environment), codes(row.leaseIdsRevoked), esc(row.lifecycle)]), "No rollback recorded.")}`;
}

const brief = (value) => {
  const text = JSON.stringify(value ?? null);
  return text.length > 160 ? `${text.slice(0, 157)}...` : text;
};

function renderMonitor(ctx) {
  const monitor = views(ctx)?.monitor;
  const doc = monitor?.status === "recorded" && isObject(monitor.monitor) ? monitor.monitor : null;
  const tiles = doc === null ? "" : `<ul class="a4-rows">${Object.entries(isObject(doc.fields) ? doc.fields : {}).map(([name, entry]) => `<li><strong>${esc(name)}</strong>
    ${entry.value === null ? "<code>source_unavailable</code>" : `<code>${esc(brief(entry.value))}</code>`}<br><span class="muted">source <code>${esc(entry.source)}</code>
    · tier <code>${esc(entry.trustTier ?? "none")}</code>${entry.window ? ` · ${esc(entry.window.from)} to ${esc(entry.window.to)}` : ""}${entry.reason ? ` · ${esc(entry.reason)}` : ""}</span></li>`)
    .join("")}</ul>`;
  const envelopes = doc === null ? [] : Object.entries(isObject(doc.envelopes) ? doc.envelopes : {}).map(([name, envelope]) => [`<code>${esc(name)}</code>`,
    `<code>${esc(doc.sources?.[name])}</code>`, `<code>${esc(envelope.claimKind)}</code>`, `<code>${esc(envelope.statusDimensions?.evidence)}</code>`, codes(envelope.reasons)]);
  return `<p class="muted">Review records one monitor record per review: lane implementation, self-reported, whatever its sources say. Each source has its own
      claim envelope; a source that is missing is <code>source_unavailable</code> with no value. The SLO source is in-memory and unsigned.</p>
    ${status(ctx, "monitoring.source")}
    ${monitor && !doc ? `<p class="muted"><code>${esc(monitor.status)}</code> ${codes(monitor.reasonCodes)}</p>` : ""}
    ${doc ? `<p class="muted">Recorded ${esc(doc.recordedAt)} · ${esc(doc.nonNullSources)} source(s) with a value · SLO measurements ${esc(doc.sloMeasurements)} ·
      overall <code>${esc(doc.claim?.claimKind)}</code> <code>${esc(doc.claim?.statusDimensions?.evidence)}</code></p>${tiles}
      ${table(["Source", "Read", "Claim kind", "Evidence", "Reasons"], envelopes, "No source.")}
      <p class="muted">Alert rules (proposals): ${list(doc.alertRules).map((rule) => esc(rule.rule)).join("; ")}.</p>` : ""}
    <p class="muted">Kill switch: ${esc(monitor?.killSwitch ?? "an active kill switch holds the project until it is released and an owner resumes")}.</p>${loadButton(ctx)}`;
}

const observedCell = (observed) => {
  const now = observed?.now ?? {};
  return `${now.value === null || now.value === undefined ? "<span class=\"muted\">insufficient evidence</span>" : `<code>${esc(now.value)}</code>`}
    <br><span class="muted">${esc(now.resolvedRefs)} resolved · ${esc(now.danglingRefs)} dangling · <code>${esc(now.claim?.claimKind)}</code>
    ${codes(now.reasonCodes)} · window ${esc(observed?.recorded?.window?.from)} to ${esc(observed?.recorded?.window?.to)}</span>`;
};

function hypothesesHtml(ctx, hypotheses) {
  const open = hypotheses.filter((row) => row.observeRoute);
  return `<h4>Hypotheses: predicted, observed, verdict</h4>
    ${table(["Id", "Predicted", "Observed value", "Verdict (self-reported)", "Status"], hypotheses.map((row) => [`<code>${esc(row.id)}</code> ${esc(row.statement)}`,
      esc(row.predicted), row.observed?.value === null || row.observed?.value === undefined ? "<span class=\"muted\">none</span>"
        : `<code>${esc(brief(row.observed.value))}</code> <code>${esc(row.observed.lane)}</code>`,
      row.verdict ? `<code>${esc(row.verdict.outcome)}</code> by ${esc(row.verdict.username ?? row.verdict.by)}` : "none",
      `<code>${esc(row.observed?.status)}</code> ${codes(row.observed?.reasonCodes)}`]), "No hypothesis in the Aspire brief.")}
    ${open.length ? `<p class="muted">A hypothesis leaves proposed only with a runtime-written row of its evidence source inside its window; the verdict is
      your statement, recorded beside the row's value.</p>
      <label>Hypothesis <select name="observe-id">${open.map((row) => `<option value="${esc(row.id)}">${esc(row.id)}</option>`).join("")}</select></label>
      <label>Ledger row id <input name="observe-ref" maxlength="512"></label><label>Its sha256 <input name="observe-sha" maxlength="64"></label>
      <label>Verdict <select name="observe-verdict"><option value="observed">observed</option><option value="refuted">refuted</option></select></label>
      <div class="row wrap">${view.actionButton("Observe", "observe", ctx.allowed.observeHypothesis)}</div>` : ""}`;
}

function renderValue(ctx) {
  const value = views(ctx)?.value;
  if (!value) return `<p class="muted">Review runs the value report once and records one value claim per value-contract KPI. Load to see them.</p>${loadButton(ctx)}`;
  const rows = list(value.claims).map((row) => row.integrity?.status === "integrity_failed" && !row.label
    ? [`<code>${esc(row.kpiId)}</code>`, "", "", `<span class="status-bad">${codes(row.integrity.reasonCodes)}</span>`, ""]
    : [`<code>${esc(row.kpiId)}</code> ${esc(row.label)} (${esc(row.unit)})${row.integrity?.envelopeValid ? "" : " <span class=\"status-bad\">record envelope does not verify</span>"}`,
      `${esc(row.recommended?.target)}<br><span class="muted">${esc(row.recommended?.source)} · <code>${esc(row.recommended?.claimKind)}</code></span>`,
      `<code>${esc(row.implemented?.instrumentation)}</code>${row.implemented?.contractDigest ? ` <code>${esc(row.implemented.contractDigest)}</code>` : ""}`,
      observedCell(row.observed), `<code>${esc(row.verified?.status)}</code> <span class="muted">${esc(row.verified?.reason ?? "")}</span>`]);
  return `<p class="muted">${esc(value.boundary)}</p>${value.status === "recorded" ? "" : `<p class="muted"><code>${esc(value.status)}</code> ${codes(value.reasonCodes)}</p>`}
    ${table(["KPI", "Recommended", "Implemented", "Observed", "Independently reviewed"], rows, "No value claim recorded for this release.")}
    <h4>Other objectives (self-reported, not evaluated)</h4>
    ${table(["Kind", "Statement"], list(value.objectives).map((row) => [`<code>${esc(row.kind)}</code>`, esc(row.statement)]), "None stated.")}
    <p class="muted">ROI worksheet (${esc(value.roiWorksheet?.formula)}): <code>${esc(value.roiWorksheet?.status)}</code> · <code>${esc(value.roiWorksheet?.claim?.claimKind)}</code>
      ${codes(value.roiWorksheet?.claim?.reasons)}</p>
    ${hypothesesHtml(ctx, list(value.hypotheses))}${loadButton(ctx)}`;
}

const stepCard = (note) => (ctx) => `<p class="muted">${esc(note)}</p><label>Your note <textarea name="content" rows="3" maxlength="65536"></textarea></label>
  <div class="row wrap">${view.actionButton("Review", "review", view.stepOffer(ctx.allowed.review, ctx, "review"))}</div>${status(ctx, "monitoring.source")}`;

/** Each action's builder; a missing id or value refuses before anything is sent. */
function need(text, message) {
  if (!text) throw new Error(`${message} Nothing was sent.`);
  return text;
}
const keep = (map, key, entry) => {
  map.set(key, entry);
  loaded.delete(key); // what the page read before this action is stale now
};

export function register() {
  registerStageCard("activate", "conversation", renderConversation, "Conversation");
  registerStageCard("activate", "build", () => "<p class=\"muted\">Activate's Build is the release: the Release card opens its request and releases.</p>", "Build");
  registerStageCard("activate", "review", stepCard("Review records this release's monitor record, then runs the value report once and records one value claim per value-contract KPI. Results are reviewed, never approved."), "Review");
  registerStageCard("activate", "release", renderRelease, "Release");
  registerStageCard("activate", "deploy", renderDeploy, "Deployment: prepared plan, receipts and AMC's check");
  registerStageCard("activate", "rollback", renderRollback, "Rollback");
  registerStageCard("activate", "monitor", renderMonitor, "Monitor");
  registerStageCard("activate", "value", renderValue, "Value: four lanes and hypotheses");
  registerStageAction("activate", "load-views", ({ button, projectPath }) => ({ local: true, pending: loadViews(projectPath, button.dataset.project) }));
  registerStageAction("activate", "copy", ({ button }) => ({ local: true, pending: navigator.clipboard.writeText(button.dataset.copy ?? "") }));
  registerStageAction("activate", "open-release", ({ button, headBinding, projectPath }) => ({ label: "Open the release request",
    path: projectPath(`/stages/activate/effects/${RELEASE_EFFECT}/open`), body: { gateId: need(button.dataset.gate, "No approved release approval is shown."), ...headBinding() } }));
  registerStageAction("activate", "decide-engine", ({ button, value, projectPath }) => ({ label: button.dataset.verb === "deny" ? "Deny" : "Approve",
    path: projectPath(`/approvals/${encodeURIComponent(button.dataset.approval)}/${button.dataset.verb === "deny" ? "deny" : "approve"}`),
    body: { reason: need(value(button.dataset.field), "Write a decision reason first."), expectedRequestDigestSha256: button.dataset.digest } }));
  registerStageAction("activate", "release", ({ button, headBinding, projectPath }) => ({ label: "Release", path: projectPath("/releases"),
    body: { gateId: need(button.dataset.gate, "No approved release approval is shown."), ...headBinding() },
    got: (data) => keep(tokens, button.dataset.project, { scope: "staging", ...(data?.staging ?? {}) }) }));
  registerStageAction("activate", "complete-activate", ({ button, headBinding, projectPath }) => ({ label: "Complete the deployment approval",
    path: projectPath("/stages/activate/complete"), body: { gateId: need(button.dataset.gate, "No approved deployment approval is shown."), ...headBinding() },
    got: (data) => keep(tokens, button.dataset.project, { scope: "production", ...(data?.production ?? {}) }) }));
  registerStageAction("activate", "record-receipt", ({ button, value, headBinding, projectPath }) => {
    const restarted = Date.parse(need(value("receipt-restarted"), "Give the restart time."));
    if (!Number.isFinite(restarted)) throw new Error("The restart time is not a date. Nothing was sent.");
    const helm = button.dataset.target === "helm";
    return { label: "Record the receipt", path: projectPath(`/releases/${encodeURIComponent(button.dataset.release)}/deployments`),
      body: { kind: value("receipt-kind"), environment: value("receipt-environment"), target: button.dataset.target, packageDigest: value("receipt-package") || null,
        imageDigest: value("receipt-image") || null, overlayDigest: need(value("receipt-overlay"), "Give the overlay digest."), restartedAt: new Date(restarted).toISOString(),
        helmRevision: helm ? Number(need(value("receipt-helm"), "Give the helm history revision.")) : null,
        leaseIds: value("receipt-leases").split(/\s+/).filter(Boolean), destinationRef: need(value("receipt-destination"), "Give the destination."),
        operatorStated: { status: value("receipt-status") }, ...headBinding() }, got: () => loaded.delete(button.dataset.project) };
  });
  registerStageAction("activate", "verify", ({ button, value, headBinding, projectPath }) => ({ label: "Run AMC's check",
    path: projectPath(`/releases/${encodeURIComponent(button.dataset.release)}/verify`), body: { environment: value("verify-environment"), ...headBinding() },
    got: (data) => keep(checks, button.dataset.project, { checkId: data?.checkId, amcCheckStatus: data?.amcCheckStatus, statusText: data?.statusText }) }));
  registerStageAction("activate", "append-transparency", ({ button, headBinding, projectPath }) => ({ label: "Append the transparency entry",
    path: projectPath(`/releases/${encodeURIComponent(button.dataset.release)}/transparency`), body: headBinding(), got: () => loaded.delete(button.dataset.project) }));
  registerStageAction("activate", "rollback-preview", ({ button, value, headBinding, projectPath }) => ({ label: "Preview the rollback",
    path: projectPath(`/releases/${encodeURIComponent(button.dataset.release)}/rollback/preview`), body: { environment: value("rollback-environment"), ...headBinding() },
    got: (data) => previews.set(button.dataset.project, { releaseId: button.dataset.release, preview: data?.preview ?? null }) }));
  registerStageAction("activate", "rollback", ({ button, value, headBinding, projectPath }) => ({ label: "Roll back",
    path: projectPath(`/releases/${encodeURIComponent(button.dataset.release)}/rollback`), body: { environment: value("rollback-environment"),
      reason: need(value("rollback-reason"), "Write the reason first."), toReleaseId: value("rollback-to") || null, confirmManifestId: value("rollback-manifest") || null,
      ...headBinding() }, got: () => loaded.delete(button.dataset.project) }));
  registerStageAction("activate", "observe", ({ value, headBinding, projectPath }) => ({ label: "Observe the hypothesis",
    path: projectPath(`/hypotheses/${encodeURIComponent(need(value("observe-id"), "Choose a hypothesis."))}/observe`),
    body: { verdict: value("observe-verdict"), evidenceRef: { refId: need(value("observe-ref"), "Give the ledger row id."), sha256: need(value("observe-sha"), "Give its sha256.") },
      ...headBinding() } }));
}
