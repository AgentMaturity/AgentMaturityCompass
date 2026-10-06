const esc = value => String(value ?? "unknown").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
const labels = { starting: "Starting", idle: "Ready for another turn", running: "Running", "cancel-requested": "Stop requested", releasing: "Releasing writer…", released: "Released", failed: "Task failed", verifying: "Verifying recorded evidence…", closed: "Closed" };
export const providerLabel = id => ({ stub: "Local demonstration", openai: "OpenAI · Chat", "openai-responses": "OpenAI · Responses", anthropic: "Anthropic", deepseek: "DeepSeek · Chat", gemini: "Gemini", "gemini-audio": "Gemini · Audio", ollama: "Ollama · local model server" })[id] || id;
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
      <p id="nativeTaskShell" class="native-task-approval-banner" role="status" hidden></p><p id="nativeTaskBoundary" class="muted"></p>
    </section>
    <div class="native-task-layout"><section class="card native-task-conversation" aria-labelledby="nativeTranscriptTitle">
      <div class="native-task-row"><h3 id="nativeTranscriptTitle">Conversation</h3><span id="nativeTaskState" class="pill">No task selected</span></div>
      <p class="muted">Updates below are recorded blocks, not a token preview. Full evidence verification is separate.</p>
      <div class="native-task-observation"><p id="nativeTaskConnection" role="status" aria-live="polite">Loading setup…</p><p id="nativeTaskObservedAt" class="muted"></p><button id="nativeTaskReconnect" type="button" class="secondary" hidden>Reconnect and refresh status</button></div>
      <p id="nativeTaskActionHelp" class="muted"></p>
      <div id="nativeTaskApprovalBanner" class="native-task-approval-banner" role="status" aria-live="polite" hidden></div>
      <section class="native-task-tool-panel" aria-labelledby="nativeTaskToolTitle"><h4 id="nativeTaskToolTitle">Recorded tool activity</h4><div id="nativeTaskToolStatus"><p class="muted">No tool activity loaded.</p></div></section>
      <p id="nativeTaskRetention" class="muted" hidden></p><div id="nativeTaskTranscript" class="native-task-transcript" role="log" aria-label="Recorded task conversation" aria-live="off"><p class="muted" id="nativeTaskEmpty">Your task will appear here after you choose Run task.</p></div>
      <button id="nativeTaskNewMessages" class="secondary" hidden>Jump to new activity</button>
      <div><button id="nativeTaskRetry" type="button" class="secondary" aria-describedby="nativeTaskRetryHelp" hidden disabled>Retry original submission</button><p id="nativeTaskRetryHelp" class="muted" hidden></p></div>
      <form id="nativeTaskPromptForm"><label for="nativeTaskPrompt">Task or follow-up</label><textarea id="nativeTaskPrompt" rows="4" placeholder="What would you like AMC to do?" aria-describedby="nativeTaskDraftHint nativeTaskDraftBytes" required disabled></textarea><p id="nativeTaskDraftHint" class="muted">Enter adds a new line. Ctrl/⌘ + Enter submits. Drafts and selected files stay in this page only; reloading loses them.</p>
        <fieldset class="native-task-attachments"><legend>Attachments</legend><label for="nativeTaskAttachments">Attach UTF-8 text files</label><input id="nativeTaskAttachments" type="file" multiple accept=".txt,.md,.markdown,.csv,.tsv,.json,.jsonl,.yaml,.yml,.log,.xml,.html,.css,.js,.mjs,.cjs,.ts,.tsx,.jsx,.py,.rs,.go,.java,.sh,.sql,.toml,.ini" aria-describedby="nativeTaskAttachmentHelp" disabled><p id="nativeTaskAttachmentHelp" class="muted">Up to four text files. Their text is included in the prompt when you submit, and may be sent to your chosen provider. Review it first; do not attach credentials or secrets. Text context is not a binary upload, filesystem grant, or authenticated attachment object. PDFs are unsupported.</p>
          <label for="nativeTaskMediaAttachments">Attach original images or WAV audio</label><input id="nativeTaskMediaAttachments" type="file" multiple aria-describedby="nativeTaskMediaHelp" disabled><p id="nativeTaskMediaHelp" class="muted">Select a provider and check setup for advertised original-media support.</p><p class="muted">Submission order: task text and text-file context first, followed by original media in the order below. Media filenames stay local; original bytes may be sent to the selected provider. Only basic headers are checked here; Studio validates original payloads and runtime negotiation. Model compatibility is not probed by setup. No conversion, OCR or transcription is used as a fallback.</p>
          <p id="nativeTaskAttachmentLoading" role="status" hidden>Reading selected files locally. Selecting files sends no request.</p><div id="nativeTaskAttachmentList"></div></fieldset>
        <p id="nativeTaskDraftBytes" class="muted"></p><details id="nativeTaskSubmissionPreview" hidden><summary>Review submitted text and media order</summary><pre id="nativeTaskSubmittedText" tabindex="0"></pre></details>
        <div class="native-task-row"><button id="nativeTaskSubmit" type="submit" disabled>Run task</button><button id="nativeTaskCancel" type="button" class="danger" hidden>Stop task</button></div></form>
    </section><aside class="native-task-sidebar">
      <section class="card"><h3>Session</h3><div id="nativeTaskIdentity"><p class="muted">No task has been started.</p></div><div class="native-task-actions"><button id="nativeTaskRefresh" class="secondary" disabled>Refresh status</button><button id="nativeTaskRelease" class="secondary" hidden>Release for later</button><button id="nativeTaskResume" hidden>Resume session</button><button id="nativeTaskVerify" class="secondary" hidden>Close and verify</button><button id="nativeTaskArchive" class="secondary" aria-describedby="nativeTaskArchiveHelp" hidden>Archive closed task</button><button id="nativeTaskNew" class="secondary" disabled>New task</button></div><p id="nativeTaskArchiveHelp" class="muted" hidden>Removes this closed task from your current list. Its signed history stays available under Show archived tasks.</p></section>
      <section class="card"><h3>Approvals</h3><div id="nativeTaskApprovals"><p class="muted">No pending requests.</p></div></section>
      <section class="card"><h3>Public validation</h3><div id="nativeTaskValidation"><p class="muted">No checks requested.</p></div></section>
      <section class="card"><h3>Evidence</h3><div id="nativeTaskVerification"><p class="muted">No verification has been requested.</p></div></section>
      <section class="card"><h3>Recorded usage</h3><div id="nativeTaskUsage"><p class="muted">Usage unavailable until reported by Studio.</p></div></section>
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
  return `<dl class="native-task-identity"><dt>Agent</dt><dd>${esc(task.agentId)}</dd><dt>Provider / model</dt><dd>${esc(providerLabel(task.provider))} / ${esc(task.model ?? "local stub")}</dd><dt>Tools</dt><dd>${task.tools === "workspace" ? "Signed workspace scope" : "None"}</dd><dt>Task ID</dt><dd><code>${esc(task.taskId)}</code></dd><dt>Session ID</dt><dd><code>${esc(task.sessionId || "not accepted yet")}</code></dd><dt>Task last changed</dt><dd>${esc(time(task.updatedAt))}</dd><dt>Last recorded turn ending</dt><dd>${esc(task.turnEndReason ?? "not yet known")}</dd></dl>
    ${task.history ? `<p>Persisted history: <strong>${esc(task.history.status)}</strong>${task.history.backend ? ` · ${esc(task.history.backend)}` : ""}</p><p class="muted">${esc(task.history.message)}</p>` : ""}
    ${task.recovery ? `<p data-native-recovery-state="${esc(task.recovery.state)}"><strong>${task.recovery.state === "interrupted" ? "Interrupted session · recovery available" : task.recovery.state === "ready" ? "Session ready to resume" : "Recovery unavailable"}</strong></p><p class="muted">${esc(task.recovery.message)}</p>` : ""}
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
  if (task.history?.status === "unavailable") return '<p class="status-bad">Validation evidence is unavailable. No previous result or output is shown as current.</p>';
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
  if (task.history?.status === "unavailable") return '<p class="status-bad">Approval evidence is unavailable. Authenticate the original history before deciding in the signed inbox.</p>';
  return `${task.approvalError ? `<p class="status-bad">${esc(task.approvalError)} Refresh before making a decision.</p>` : ""}${task.approvals.map(request => `<article class="native-task-approval"><strong>${esc(request.toolName)}</strong><p>${esc(request.actionClass)} · ${esc(request.riskTier)} · ${esc(request.status)}</p><p>${esc(request.received)} of ${esc(request.required)} required decisions. Expires ${esc(time(request.expiresTs))}.</p>${Number.isFinite(request.expiresTs) && request.expiresTs <= Date.now() ? '<p class="status-bad">The expiry time has passed on this device. Refresh the signed inbox; only the server determines whether a decision is still admissible.</p>' : ""}<p class="muted">Review the actual request and decide in the signed Approvals inbox. A recorded vote does not mean the action has run.</p><a class="button secondary" target="_blank" rel="noopener" href="./approvals?agent=${encodeURIComponent(task.agentId)}&approval=${encodeURIComponent(request.approvalRequestId)}">Review approval <span class="native-task-sr">(opens another tab)</span></a><details><summary>Request identity</summary><code>${esc(request.approvalRequestId)}</code><p>Digest: <code>${esc(request.requestDigestSha256)}</code></p></details></article>`).join("") || (!task.approvalError ? '<p class="muted">No pending requests.</p>' : "")}`;
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
  const body=document.createElement("pre");body.textContent=event.text;body.tabIndex=0;node.append(body);
  if (event.attachment) {
    const metadata = document.createElement("div"); metadata.className = "native-task-attachment-evidence";
    metadata.innerHTML = renderTaskAttachmentEvidence(event.attachment); node.append(metadata);
  }
  container.append(node);
}

export function renderTaskAttachments(attachments) {
  let mediaPosition = 0;
  return attachments.map((item, index) => {
    const media = item.type === "image" || item.type === "audio";
    const earlier = media && attachments.slice(0, index).some(row => row.type === "image" || row.type === "audio");
    return `<article class="native-task-attachment"><div class="native-task-row"><strong>${media ? `Media ${++mediaPosition} · ` : ""}${esc(item.name)}</strong><div>${earlier ? `<button type="button" class="secondary" data-native-move-attachment="${index}" aria-label="Move ${esc(item.name)} earlier in the media sequence">Move earlier</button>` : ""}<button type="button" class="secondary" data-native-remove-attachment="${index}" aria-label="Remove ${esc(item.name)}">Remove</button></div></div><p class="muted">${esc(item.bytes)} ${media ? `original bytes · ${esc(item.mimeType)}` : "UTF-8 text bytes"} · local draft selection, not a committed input receipt</p>${media ? '<p class="muted">Original file bytes retained in this page without conversion. For a committed payload digest, inspect task activity after Studio records the input.</p>' : `<details><summary>Preview text</summary><pre tabindex="0">${esc(item.text)}</pre></details>`}</article>`;
  }).join("");
}

export function renderTaskAttachmentEvidence(attachment) {
  return `<p><strong>Committed original ${esc(attachment.type)}</strong> · ${esc(attachment.mimeType)} · ${esc(attachment.byteLength)} bytes</p><details><summary>Original payload identity</summary><p>SHA-256: <code>${esc(attachment.sha256)}</code></p><p class="muted">Metadata supplied by Studio from authenticated original bytes. This display does not independently rehash the bytes, infer an original filename, or grant access to the payload. Full run verification remains separate.</p></details>`;
}

/** Last committed status per call. Missing endings are never promoted to completed work. */
export function collectNativeTaskTools(previous, events, limit = 128) {
  const tools = new Map(previous);
  for (const event of events) {
    if (event.kind !== "tool" && event.kind !== "tool-update") continue;
    const key = event.toolCallId || `unlinked-update-${event.cursor}`, prior = tools.get(key);
    const title = (prior?.title || (event.kind === "tool" ? event.text : "Tool update (opening not loaded)"));
    tools.delete(key);
    tools.set(key, { toolCallId: event.toolCallId || null, title: title.slice(0, 240), titleTruncated: title.length > 240 || prior?.titleTruncated === true,
      status: event.status || prior?.status || "unreported", cursor: event.cursor });
    while (tools.size > limit) tools.delete(tools.keys().next().value);
  }
  return tools;
}

export function renderTaskToolStatus(tools, available = true) {
  if (!available) return '<p class="muted">Tool status is unconfirmed. Refresh the original task history; no completion is inferred.</p>';
  if (!tools.size) return '<p class="muted">No tool activity in the loaded updates. This does not prove that no tool ran.</p>';
  const statuses = { pending: "Pending", in_progress: "In progress", completed: "Completed", failed: "Failed", cancelled: "Cancelled", canceled: "Cancelled", unreported: "Status unreported" };
  const visible = [...tools.values()].slice(-20).reverse();
  return `<p class="muted">Latest recorded status for ${visible.length} retained calls; not a complete tool inventory or a live process check.</p>${visible.map(tool => `<article class="native-task-tool-status" data-native-tool-status="${esc(tool.status)}"><div class="native-task-row"><strong>${esc(tool.title || "Tool call")}${tool.titleTruncated ? "… (title shortened)" : ""}</strong><span class="pill">${esc(statuses[tool.status] || tool.status)}</span></div><small>${tool.toolCallId ? esc(tool.toolCallId) : "Call identity not reported"} · recorded update ${esc(tool.cursor)}</small></article>`).join("")}`;
}

/** Optional additive P10 projection: NativeTaskView.usage = NativeRunUsage, not maxTokens or estimates. */
export function renderTaskUsage(task) {
  const unavailable = '<p class="muted">Usage unavailable. Studio has not supplied a usable recorded usage projection; absent counts are not zero.</p>';
  if (!task) return unavailable;
  if (task.history?.status !== "authenticated") return '<p class="muted">Usage withheld until the original session history is authenticated.</p>';
  if (task.provider === "stub") return '<p class="muted">Local demonstration only. Stub counts are synthetic, not measured provider usage or cost.</p>';
  const usage = task.usage, count = value => Number.isSafeInteger(value) && value >= 0;
  const fields = [["inputTokens", "Input"], ["outputTokens", "Output"], ["cacheReadTokens", "Cache read"], ["cacheWriteTokens", "Cache write"], ["reasoningTokens", "Reasoning"]];
  if (!usage || usage.scope !== "recorded-session" || !["recorded", "partial"].includes(usage.status)
    || !Array.isArray(usage.issues) || usage.issues.length > 0
    || ![usage.requests, usage.syntheticRequests, usage.reportedRequests, usage.completeRequests, usage.unreportedRequests, usage.pendingRequests].every(count)
    || usage.syntheticRequests > usage.requests || usage.reportedRequests > usage.requests - usage.syntheticRequests
    || usage.completeRequests > usage.reportedRequests || usage.pendingRequests > usage.requests
    || usage.reportedRequests < 1 || usage.reportedRequests + usage.pendingRequests > usage.requests
    || (usage.status === "recorded" ? usage.completeRequests !== usage.requests - usage.syntheticRequests
      : usage.completeRequests >= usage.requests - usage.syntheticRequests)
    || usage.unreportedRequests !== usage.requests - usage.syntheticRequests - usage.reportedRequests
    || !usage.totals || !fields.every(([field]) => {
      const metric = usage.totals[field];
      return metric && count(metric.reportedRequests) && metric.reportedRequests <= usage.reportedRequests
        && (metric.reportedRequests === 0 ? metric.observedTokens === null : count(metric.observedTokens));
    }) || usage.totals.inputTokens.reportedRequests !== usage.reportedRequests
    || usage.totals.outputTokens.reportedRequests !== usage.reportedRequests
    || usage.totals.reasoningTokens.observedTokens !== null && usage.totals.reasoningTokens.observedTokens > usage.totals.outputTokens.observedTokens) return unavailable;
  return `<p><strong>${esc(usage.status)} · recorded session subtotals</strong></p><p>${usage.reportedRequests} of ${usage.requests - usage.syntheticRequests} non-synthetic requests reported usage; ${usage.completeRequests} complete reports, ${usage.pendingRequests} pending requests.</p><dl class="native-task-identity">${fields.map(([field, label]) => `<dt>${label} tokens</dt><dd>${usage.totals[field].observedTokens === null ? "Unreported" : esc(usage.totals[field].observedTokens)} <small>(${usage.totals[field].reportedRequests} reports)</small></dd>`).join("")}</dl><p class="muted">${usage.syntheticRequests} synthetic requests excluded. These are cumulative reported subtotals, not a whole-session estimate or evidence-verification verdict. Cache read and reasoning may overlap other token counts; do not add them into a billed total. Cost is unavailable; configured token limits are not measured usage.</p>`;
}

export function nativeTaskErrorText(error) {
  const hints = {
    NATIVE_STALE_REVISION: "Refresh status and review the newer turn before acting; the previous control is not automatically resent.",
    NATIVE_CURSOR_AHEAD: "Refresh status to reload committed updates from cursor zero.",
    NATIVE_CSRF_REQUIRED: "Refresh setup or sign in again; no submission is retried automatically.",
    NATIVE_CREDENTIAL_MISSING: "Configure the named credential on the Studio host, never in the prompt, then refresh setup.",
    NATIVE_SCOPE_CHANGED: "Review the signed scope and create a new task. This session cannot silently adopt new grants.",
    NATIVE_CAPACITY: "Release an idle task you own before starting another.",
    NATIVE_TURN_LIMIT: "Release this task and start a new one; its recorded history remains available.",
    NATIVE_INPUT_UNSUPPORTED: "Review the pinned provider's advertised media formats. No conversion or provider fallback was used.",
    NATIVE_INPUT_NOT_NEGOTIATED: "Refresh setup and inspect runtime capability compatibility. No replacement prompt was submitted.",
    NATIVE_INPUT_TOO_LARGE: "Remove an attachment or shorten the text. Frame limits include base64 and metadata, not just original file bytes.",
    NATIVE_TIMEOUT: "The request timed out locally, not necessarily on the server. Refresh status before another action."
  };
  return `${error?.message || "Studio could not complete this request."}${error?.code ? ` (${error.code})` : ""}${hints[error?.code] ? ` ${hints[error.code]}` : [401, 403].includes(error?.status) ? " Sign in or refresh setup before another action." : ""}`;
}
