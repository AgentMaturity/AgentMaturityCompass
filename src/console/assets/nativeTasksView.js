const esc = value => String(value ?? "unknown").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
const labels = { starting: "Starting", idle: "Ready for another turn", running: "Running", "cancel-requested": "Stopping…", releasing: "Releasing writer…", released: "Released", failed: "Task failed", verifying: "Verifying recorded evidence…", closed: "Closed" };
export const providerLabel = id => ({ stub: "Local demonstration", openai: "OpenAI · Chat", "openai-responses": "OpenAI · Responses", anthropic: "Anthropic" })[id] || id;
const time = value => Number.isFinite(value) ? new Date(value).toLocaleString() : "unknown";

export function nativeTasksShell(agentId) {
  return `<section class="native-tasks" aria-labelledby="nativeTasksTitle">
    <header class="native-tasks-heading"><div><div class="studio-kicker">Native runtime</div><h2 id="nativeTasksTitle">Native Tasks</h2><p>Run a task here and follow its recorded activity.</p></div><a class="button secondary" href="./evidence?agent=${encodeURIComponent(agentId)}">Workspace evidence</a></header>
    <p id="nativeTaskNotice" class="native-task-notice" role="status" aria-live="polite">Loading task setup…</p>
    <div id="nativeTaskError" class="card status-bad" role="alert" hidden></div>
    <section class="card native-task-setup" aria-labelledby="nativeSetupTitle"><h3 id="nativeSetupTitle">Task setup</h3>
      <form id="nativeTaskSetup"><div class="native-task-fields"><label>Agent<input name="agent" id="nativeTaskAgent" value="${esc(agentId)}" maxlength="128" autocomplete="off" spellcheck="false" required></label><button type="submit" class="secondary">Check setup</button>
      <label>Provider<select id="nativeTaskProvider" disabled><option value="">Choose a provider</option></select></label><label>Model<input id="nativeTaskModel" maxlength="200" autocomplete="off" spellcheck="false" placeholder="Enter the model name" disabled></label>
      <label>Tools<select id="nativeTaskTools" disabled><option value="none">No tools</option><option value="workspace">Signed workspace tools</option></select></label></div></form>
      <p id="nativeTaskCredential" class="muted"></p><div id="nativeTaskScope"></div>
      <div id="nativeTaskValidationSetup"></div>
      <details><summary>Run limits</summary><div class="native-task-fields"><label>Maximum steps<input id="nativeTaskMaxSteps" type="number" min="1" step="1" disabled></label><label>Maximum output tokens<input id="nativeTaskMaxTokens" type="number" min="1" step="1" disabled></label></div><p id="nativeTaskLimits" class="muted"></p></details>
      <p id="nativeTaskBoundary" class="muted"></p>
    </section>
    <div class="native-task-layout"><section class="card native-task-conversation" aria-labelledby="nativeTranscriptTitle">
      <div class="native-task-row"><h3 id="nativeTranscriptTitle">Conversation</h3><span id="nativeTaskState" class="pill">No task selected</span></div>
      <p class="muted">Updates below are recorded blocks, not a token preview. Full evidence verification is separate.</p>
      <p id="nativeTaskRetention" class="muted" hidden></p><div id="nativeTaskTranscript" class="native-task-transcript" role="log" aria-label="Recorded task conversation" aria-live="off"><p class="muted" id="nativeTaskEmpty">Your task will appear here after you choose Run task.</p></div>
      <button id="nativeTaskNewMessages" class="secondary" hidden>Jump to new activity</button>
      <div><button id="nativeTaskRetry" type="button" class="secondary" aria-describedby="nativeTaskRetryHelp" hidden disabled>Retry original submission</button><p id="nativeTaskRetryHelp" class="muted" hidden></p></div>
      <form id="nativeTaskPromptForm"><label for="nativeTaskPrompt">Task or follow-up</label><textarea id="nativeTaskPrompt" rows="4" placeholder="What would you like AMC to do?" required disabled></textarea><p class="muted">Enter adds a new line. Ctrl/⌘ + Enter submits.</p><div class="native-task-row"><button id="nativeTaskSubmit" type="submit" disabled>Run task</button><button id="nativeTaskCancel" type="button" class="danger" hidden>Stop task</button></div></form>
    </section><aside class="native-task-sidebar">
      <section class="card"><h3>Session</h3><div id="nativeTaskIdentity"><p class="muted">No task has been started.</p></div><div class="native-task-actions"><button id="nativeTaskRefresh" class="secondary" disabled>Refresh status</button><button id="nativeTaskRelease" class="secondary" hidden>Release for later</button><button id="nativeTaskResume" hidden>Resume session</button><button id="nativeTaskVerify" class="secondary" hidden>Close and verify</button><button id="nativeTaskArchive" class="secondary" aria-describedby="nativeTaskArchiveHelp" hidden>Archive closed task</button><button id="nativeTaskNew" class="secondary" disabled>New task</button></div><p id="nativeTaskArchiveHelp" class="muted" hidden>Removes this closed task from your current list. Its signed history stays available under Show archived tasks.</p></section>
      <section class="card"><h3>Approvals</h3><div id="nativeTaskApprovals"><p class="muted">No pending requests.</p></div></section>
      <section class="card"><h3>Public validation</h3><div id="nativeTaskValidation"><p class="muted">No checks requested.</p></div></section>
      <section class="card"><h3>Evidence</h3><div id="nativeTaskVerification"><p class="muted">No verification has been requested.</p></div></section>
      <section class="card"><h3>Your tasks</h3><label><input id="nativeTaskIncludeArchived" type="checkbox">Show archived tasks</label><div id="nativeTaskList"><p class="muted">Loading…</p></div></section>
    </aside></div></section>`;
}

export function renderTaskScope(config, toolsMode, task = null) {
  const scope = config.scope;
  return `<p><strong>${toolsMode === "none" ? "No tools selected" : "Signed workspace tools"}</strong> · ${config.demo ? "Demo workspace: local demonstration only, no tools." : esc(scope.message)}</p>
    ${task?.tools === "workspace" && task.toolsDigest !== scope.digest ? '<p class="status-bad">The current policy differs from this task’s pinned scope. Review the current scope and create a new task; this session cannot silently adopt changed grants.</p>' : ""}
    <p class="muted">${toolsMode === "workspace" ? "Existing signed policy and approvals apply. This screen cannot create a tool grant." : "The task cannot use workspace tools with this selection."}</p>
    ${toolsMode === "workspace" ? `<details><summary>Available signed tools (${scope.tools.length})</summary><p class="muted">Scope summary; all remaining signed policy conditions and approvals still apply.</p>${scope.tools.map(tool => `<article class="native-task-scope-item"><strong>${esc(tool.name)}</strong> · ${esc(tool.actionClass)}${[ ["Paths",tool.paths],["Denied paths",tool.deniedPaths],["Hosts",tool.hosts],["Binaries",tool.binaries] ].map(([label,items]) => `<p>${label}: ${items.length ? items.map(v=>`<code>${esc(v)}</code>`).join(", ") : "none declared"}</p>`).join("")}${tool.nativeSandbox ? `<p>Native confinement: ${esc(tool.nativeSandbox.kind)}</p><p>Writable directories: ${tool.nativeSandbox.writableDirectories.length ? tool.nativeSandbox.writableDirectories.map(v=>`<code>${esc(v)}</code>`).join(", ") : "none"}</p>` : ""}</article>`).join("") || '<p class="muted">No signed tools are available.</p>'}<p>Current policy digest: <code>${esc(scope.digest)}</code></p>${task ? `<p>Task’s pinned policy digest: <code>${esc(task.toolsDigest)}</code></p>` : ""}</details>` : ""}`;
}

export function renderTaskIdentity(task) {
  if (!task) return '<p class="muted">No task has been started.</p>';
  return `<dl class="native-task-identity"><dt>Agent</dt><dd>${esc(task.agentId)}</dd><dt>Provider / model</dt><dd>${esc(providerLabel(task.provider))} / ${esc(task.model ?? "local stub")}</dd><dt>Tools</dt><dd>${task.tools === "workspace" ? "Signed workspace scope" : "None"}</dd><dt>Task ID</dt><dd><code>${esc(task.taskId)}</code></dd><dt>Session ID</dt><dd><code>${esc(task.sessionId || "not accepted yet")}</code></dd><dt>Last confirmed</dt><dd>${esc(time(task.updatedAt))}</dd><dt>Last recorded turn ending</dt><dd>${esc(task.turnEndReason ?? "not yet known")}</dd></dl>
    ${task.history ? `<p>Persisted history: <strong>${esc(task.history.status)}</strong>${task.history.backend ? ` · ${esc(task.history.backend)}` : ""}</p><p class="muted">${esc(task.history.message)}</p>` : ""}
    ${task.resumeBlockedReason ? `<p class="muted">${esc(task.resumeBlockedReason)}</p>` : ""}${task.error ? `<p class="status-bad">${esc(task.error)}</p>` : ""}`;
}
export function renderTaskValidationSetup(config, selectedIds, task) {
  const catalogue = config.validation;
  const pinned = task?.validationSelection;
  const changed = pinned && pinned.configSha256 !== catalogue.configSha256;
  return `<fieldset class="native-task-validation-selection"><legend>Public validation checks (optional)</legend>
    <p class="muted">${esc(catalogue.message)}</p>
    ${catalogue.checks.map(check => `<label><input type="checkbox" data-native-validation-id="${esc(check.id)}" ${selectedIds.includes(check.id) ? "checked" : ""}><span>${esc(check.title)} <code>${esc(check.id)}</code></span></label>`).join("")}
    <p class="muted">Checks use the existing bash grant and approval inbox. They run only after a completed turn. A read-only or no-tools task cannot select them.</p>
    ${pinned ? `<p>Pinned checks: ${pinned.checkIds.map(id => `<code>${esc(id)}</code>`).join(", ")}</p><details><summary>Accepted configuration</summary><code>${esc(pinned.configSha256)}</code></details>` : ""}
    ${changed ? '<p class="status-bad">The operator configuration changed. Review setup and create a new task; this task cannot silently run replacement checks.</p>' : ""}
    </fieldset>`;
}
export function renderTaskValidation(task) {
  if (!task) return '<p class="muted">No checks requested.</p>';
  const result = task.validation;
  const labels = { "not-requested": "Not requested", pending: "Pending", passed: "Selected checks passed", failed: "Selected checks failed", unavailable: "Validation unavailable" };
  return `<p class="${result.status === "failed" || result.status === "unavailable" ? "status-bad" : ""}"><strong>${esc(labels[result.status])}</strong></p>
    ${result.turn === null ? "" : `<p>Recorded turn: ${esc(result.turn)}</p>`}
    ${result.checks.map(check => `<article class="native-task-validation-result"><strong>${esc(check.title)}</strong><p>${esc(labels[check.status])}${check.exitCode === null ? "" : ` · exit ${esc(check.exitCode)}`}${check.timedOut ? " · timed out" : ""}</p>${check.reason ? `<p>${esc(check.reason)}</p>` : ""}${check.outputEventId ? renderValidationOutput(check, task.validationOutputs || []) : ""}</article>`).join("")}
    <p class="muted">Public checks assess only their configured assertions. Model completion, these results and evidence verification are separate; no hidden benchmark oracle is used.</p>`;
}
function renderValidationOutput(check, outputs) {
  const output = outputs.find(item => item.checkId === check.id && item.outputEventId === check.outputEventId);
  return `<details><summary>View check output</summary>${output?.status === "available" ?
    `<p class="muted">Authenticated payload display${output.redacted ? "; secret values redacted" : ""}${output.truncated ? "; shortened to 16 KiB" : ""}. The digest below identifies original payload bytes, not this display.</p><pre tabindex="0">${esc(output.text || "(empty output)")}</pre>` :
    `<p class="muted">${output?.status === "pruned" ? "This output was pruned under retention policy." : "Output is unavailable, too large, or could not be authenticated for display. Inspect runtime records; no output text is inferred."}</p>`}
    <p>Event: <code>${esc(check.outputEventId)}</code></p>${output ? `<p>Original payload digest: <code>${esc(output.payloadSha256)}</code></p>` : ""}</details>`;
}
export function taskStateLabel(task) { return task ? task.archived ? "Archived" : labels[task.state] || "Unknown task state" : "No task selected"; }
export function renderTaskApprovals(task) {
  if (!task) return '<p class="muted">No task selected.</p>';
  return `${task.approvalError ? `<p class="status-bad">${esc(task.approvalError)} Refresh before making a decision.</p>` : ""}${task.approvals.map(request => `<article class="native-task-approval"><strong>${esc(request.toolName)}</strong><p>${esc(request.actionClass)} · ${esc(request.riskTier)} · ${esc(request.status)}</p><p>${esc(request.received)} of ${esc(request.required)} required decisions. Expires ${esc(time(request.expiresTs))}.</p><p class="muted">Review the actual request and decide in the signed Approvals inbox. A recorded vote does not mean the action has run.</p><a class="button secondary" target="_blank" rel="noopener" href="./approvals?agent=${encodeURIComponent(task.agentId)}&approval=${encodeURIComponent(request.approvalRequestId)}">Review approval <span class="native-task-sr">(opens another tab)</span></a><details><summary>Request identity</summary><code>${esc(request.approvalRequestId)}</code><p>Digest: <code>${esc(request.requestDigestSha256)}</code></p></details></article>`).join("") || (!task.approvalError ? '<p class="muted">No pending requests.</p>' : "")}`;
}
export function renderTaskVerification(task) {
  if (!task) return '<p class="muted">No task evidence yet.</p>';
  if (task.history?.status === "unavailable") return '<p class="status-bad">Current persisted history is unavailable. No previous verification verdict is current; restore the original evidence and refresh.</p>';
  const labels = { "not-verified": "Recorded; no current full verification verdict", "workspace-key-consistency": "Verified against workspace keys", "externally-anchored": "Verified against the configured monitor fingerprint", failed: "Evidence verification failed" };
  return `<p class="${task.verification === "failed" ? "status-bad" : ""}"><strong>${esc(labels[task.verification] || "Verification unavailable")}</strong></p><p class="muted">This verdict concerns the recorded evidence and its stated trust scope. It does not assess whether the answer is correct.</p>${task.sessionId ? `<a href="./runtime?agent=${encodeURIComponent(task.agentId)}">Open runtime records</a>` : ""}`;
}
export function renderTaskList(tasks, selectedId) {
  return tasks.map(task => `<button type="button" class="secondary native-task-list-item" data-native-task-id="${esc(task.taskId)}" ${task.taskId === selectedId ? 'aria-current="true"' : ""}><strong>${esc(task.agentId)} · ${esc(providerLabel(task.provider))}</strong><span>${esc(taskStateLabel(task))} · ${esc(time(task.updatedAt))}</span></button>`).join("") || '<p class="muted">No retained tasks for this agent.</p>';
}
export function appendTaskEvent(container, event) {
  const node = document.createElement("article");
  node.className = `native-task-event native-task-event-${event.kind}`;
  node.dataset.cursor = String(event.cursor);
  const heading = document.createElement("div"); heading.className = "native-task-event-heading";
  const label = document.createElement("strong"); label.textContent = ({user:"You",assistant:"AMC",tool:"Tool", "tool-update":"Tool update",plan:"Plan"})[event.kind];
  const badge = document.createElement("span"); badge.className = "muted"; badge.textContent = `Recorded${event.status ? ` · ${event.status}` : ""}`;
  heading.append(label,badge); node.append(heading);
  if (event.toolCallId) { const id=document.createElement("small"); id.textContent=event.toolCallId; node.append(id); }
  const body=document.createElement("pre");body.textContent=event.text;body.tabIndex=0;node.append(body);container.append(node);
}
