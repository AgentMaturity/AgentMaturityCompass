import { apiNativeRequest, getAdminToken } from "./api.js";
import { nativeTasksShell, providerLabel, renderTaskScope, renderTaskIdentity, renderTaskApprovals,
  renderTaskVerification, renderTaskValidationSetup, renderTaskValidation, renderTaskList, taskStateLabel, appendTaskEvent,
  renderTaskAttachments, collectNativeTaskTools, renderTaskToolStatus, renderTaskUsage, nativeTaskErrorText } from "./nativeTasksView.js";
import { captureNativeSubmission, nativeSubmissionScopeMatches, nativeSubmissionAcknowledged,
  definiteNativeSubmissionRefusal, nativeSubmissionDraftMatches, readNativeTextAttachment,
  composeNativeTaskInput, nativeTaskMediaCapabilities, readNativeMediaAttachment,
  assertNativeTaskRequestSize, NATIVE_TEXT_ATTACHMENT_LIMIT } from "./nativeTaskSubmission.js";

const API = "/api/v1/native-tasks";
const mounts = new WeakMap();
const STATES = new Set(["starting","idle","running","cancel-requested","releasing","released","failed","verifying","closed"]);
const EVENT_KINDS = new Set(["user","assistant","tool","tool-update","plan"]);
const VALIDATION_STATES = new Set(["not-requested","pending","passed","failed","unavailable"]);
const ACTIVE = new Set(["starting","running","cancel-requested","releasing","verifying"]);
const object = value => value !== null && typeof value === "object" && !Array.isArray(value);
const integer = value => Number.isSafeInteger(value) && value >= 0;
function taskView(value) {
  if (!object(value) || typeof value.taskId !== "string" || typeof value.agentId !== "string" || !STATES.has(value.state)
    || !integer(value.revision) || !integer(value.nextCursor) || !integer(value.firstCursor) || !integer(value.droppedEvents)
    || !object(value.validation) || !VALIDATION_STATES.has(value.validation.status) || !Array.isArray(value.validation.checks) || !Array.isArray(value.validationOutputs)
    || !object(value.history) || !["authenticated","unavailable","not-started"].includes(value.history.status)
    || !["sqlite","jsonl",null].includes(value.history.backend) || !integer(value.history.eventCount)
    || typeof value.history.message !== "string"
    || (value.recovery != null && (!object(value.recovery) || typeof value.recovery.eligible !== "boolean"
      || !["ready","interrupted","blocked"].includes(value.recovery.state) || typeof value.recovery.message !== "string"
      || value.recovery.eligible !== (value.recovery.state !== "blocked")))
    || !(value.resumeBlockedReason === null || typeof value.resumeBlockedReason === "string")
    || !Array.isArray(value.approvals) || typeof value.canResume !== "boolean" || typeof value.archived !== "boolean"
    || !["not-verified","workspace-key-consistency","externally-anchored","failed"].includes(value.verification)) {
    throw new Error("Studio returned an unsupported task state. Refresh this page after updating Studio.");
  }
  return value;
}

/**
 * Validate the whole page before touching the DOM or advancing the committed cursor.
 * @param {unknown} value The raw poll response; nothing in it is trusted until validated here.
 * @param {{taskId: string, agentId: string, revision: number}} current
 * @param {number} cursor
 * @param {{maxEvents?: number, maxEventBytes?: number}} [limits]
 * @returns {{task: Record<string, any>, events: Array<Record<string, any> & {cursor: number}>, truncated: boolean}}
 */
export function validateNativeTaskPoll(value, current, cursor, limits = {}) {
  if (!object(value) || !Array.isArray(value.events) || typeof value.truncated !== "boolean") throw new Error("Unsupported task event response. Refresh status before continuing.");
  const view = taskView(value.task);
  if (view.taskId !== current.taskId || view.agentId !== current.agentId || view.revision < current.revision) {
    throw new Error("Task identity or revision changed unexpectedly. No updates were applied.");
  }
  const maximumEvents = Math.max(1, Math.min(limits.maxEvents || 512, 512));
  const maximumBytes = Math.max(1, Math.min(limits.maxEventBytes || 2 * 1024 * 1024, 2 * 1024 * 1024));
  if (value.events.length > maximumEvents || new TextEncoder().encode(JSON.stringify(value.events)).byteLength > maximumBytes + value.events.length * 2 + 2) {
    throw new Error("The task event page exceeded its display bound. No partial page was applied.");
  }
  if (view.history.status !== "authenticated") {
    if (value.events.length || view.approvals.length) throw new Error("Studio supplied activity without authenticated history. No activity was displayed.");
    return { task: view, events: [], truncated: value.truncated };
  }
  if (view.nextCursor < cursor || view.firstCursor < 1 || view.firstCursor > view.nextCursor + 1) {
    throw new Error("The committed event cursor moved backwards. Refresh status from cursor zero.");
  }
  let previous = 0, observed = cursor;
  for (const event of value.events) {
    if (!object(event) || !integer(event.cursor) || event.cursor <= previous || event.cursor < view.firstCursor
      || event.cursor > view.nextCursor || !EVENT_KINDS.has(event.kind) || event.evidence !== "committed" || typeof event.text !== "string"
      || (event.toolCallId !== undefined && (typeof event.toolCallId !== "string" || !event.toolCallId || event.toolCallId.length > 256))
      || (event.status !== undefined && (typeof event.status !== "string" || event.status.length > 128))
      || (event.attachment !== undefined && (!object(event.attachment) || event.kind !== "user"
        || !integer(event.attachment.byteLength) || event.attachment.byteLength < 1
        || typeof event.attachment.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(event.attachment.sha256)
        || !(event.attachment.type === "image" && ["image/png","image/jpeg","image/gif","image/webp"].includes(event.attachment.mimeType)
          || event.attachment.type === "audio" && event.attachment.mimeType === "audio/wav")))) {
      throw new Error("Unsupported or out-of-order committed task update. No partial page was displayed.");
    }
    previous = event.cursor;
    if (event.cursor <= cursor) continue;
    if (!value.truncated && event.cursor !== observed + 1) throw new Error("Task updates contain an unexplained cursor gap. Refresh the original history.");
    observed = event.cursor;
  }
  if (!value.truncated && observed !== view.nextCursor) throw new Error("Studio omitted updates without a retention notice. Refresh the original history.");
  return { task: view, events: value.events.filter(event => event.cursor > cursor), truncated: value.truncated };
}
function configuration(value) {
  if (!object(value) || value.schemaVersion !== "2026-09-08" || typeof value.agentId !== "string"
    || typeof value.demo !== "boolean" || typeof value.executionBlocked !== "boolean" || !Array.isArray(value.providers) || !object(value.scope)
    || !object(value.validation) || typeof value.validation.ready !== "boolean" || !Array.isArray(value.validation.checks)
    || !Array.isArray(value.scope.tools) || !object(value.limits)
    || !(typeof value.nativeCsrfToken === "string" && value.nativeCsrfToken || value.nativeCsrfToken === null && getAdminToken())
    || !integer(value.limits.maxPromptBytes) || !integer(value.limits.maxEvents)) {
    throw new Error("Native task setup is unavailable or uses an unsupported version.");
  }
  return value;
}

/** One page-owned reader. Disconnecting this view never silently cancels or replays a task. */
export async function renderNativeTasksPage({ root, initialAgent = "default" }) {
  mounts.get(root)?.();
  const lifetime = new AbortController();
  let disposed = false, config = null, task = null, tasks = [], cursor = 0, timer = null;
  let polling = false, mutation = false, inspecting = false, pending = null, readGeneration = 0, setupGeneration = 0, readPaused = false;
  let retryReady = false, reconciling = false, stale = false;
  let pollJob = null, listGeneration = 0, lastObservedAt = null, operationAction = null;
  let attachments = [], readingAttachments = false, attachmentGeneration = 0, observedTools = new Map();
  let selectedChecks = [], selectedChecksDigest = null;
  let notice = "", selectedAgent = initialAgent, taskRead = null;
  root.innerHTML = nativeTasksShell(initialAgent);
  const el = id => root.querySelector(`#${id}`);
  const listen = (target, event, fn) => target.addEventListener(event, fn, { signal: lifetime.signal });
  const tell = message => { if (!disposed && notice !== message) { notice = message; el("nativeTaskNotice").textContent = message; } };
  const clearError = () => { el("nativeTaskError").hidden = true; el("nativeTaskError").textContent = ""; };
  const showError = error => {
    if (disposed || error?.name === "AbortError") return;
    el("nativeTaskError").textContent = nativeTaskErrorText(error);
    el("nativeTaskError").hidden = false;
  };
  async function request(path, options = {}) {
    const controller = new AbortController(), signals = [...new Set([lifetime.signal, options.signal].filter(Boolean))];
    const abort = () => controller.abort();
    for (const signal of signals) { if (signal.aborted) abort(); else signal.addEventListener("abort", abort, { once: true }); }
    let timedOut = false;
    const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, options.method === "POST" ? 120_000 : 15_000);
    try {
      return await apiNativeRequest(path, { ...options,
        nativeCsrfToken: options.nativeCsrfToken ?? config?.nativeCsrfToken, signal: controller.signal });
    } catch (error) {
      if (timedOut && !signals.some(signal => signal.aborted)) {
        const timeoutError = new Error("Studio did not return a response before this page's request deadline.");
        timeoutError.code = "NATIVE_TIMEOUT"; throw timeoutError;
      }
      throw error;
    } finally { clearTimeout(timeout); for (const signal of signals) signal.removeEventListener("abort", abort); }
  }
  const endpoint = (id, suffix = "") => `${API}/${encodeURIComponent(id)}${suffix}?agentId=${encodeURIComponent(task?.agentId || selectedAgent)}`;
  const workspaceScope = () => {
    const url = new URL(window.location.href), parts = url.pathname.split("/").filter(Boolean);
    return `${url.origin}${parts[0] === "w" ? `/w/${parts[1] || ""}` : parts[0] === "host" ? "/host" : ""}`;
  };
  const submissionScope = () => ({ agentId: config?.agentId, workspaceScope: workspaceScope(),
    csrfToken: config?.nativeCsrfToken, adminToken: getAdminToken() });
  const provider = () => config?.providers.find(item => item.id === el("nativeTaskProvider").value);
  const clearTimer = () => { if (timer !== null) clearTimeout(timer); timer = null; };
  function abortRead() {
    readGeneration++; taskRead?.abort(); taskRead = null; pollJob = null; polling = false; clearTimer();
  }
  function clearActivity(message = "Recorded activity will appear after the next successful status read.") {
    cursor = 0; observedTools = new Map(); lastObservedAt = null;
    const empty = document.createElement("p"); empty.id = "nativeTaskEmpty"; empty.className = "muted"; empty.textContent = message;
    el("nativeTaskTranscript").replaceChildren(empty); el("nativeTaskNewMessages").hidden = true;
  }
  function pauseObservation() {
    if (disposed) return;
    abortRead(); setupGeneration++; listGeneration++; inspecting = false;
    stale = true; readPaused = true; retryReady = false;
    clearActivity("Activity is withheld until a fresh status read authenticates the original history.");
    project();
  }

  function draft() {
    const capability = nativeTaskMediaCapabilities(provider()?.input);
    const maximum = Math.min(config?.limits.maxPromptBytes || 16_384, capability?.maxTextBytes || 16_384);
    let payload = null, error = null;
    try { payload = composeNativeTaskInput(el("nativeTaskPrompt").value, attachments, capability, maximum); }
    catch (failure) { error = failure; }
    const firstPart = payload?.input?.parts[0];
    const combined = payload?.prompt ?? (firstPart?.type === "text" ? firstPart.text : "");
    const serialized = payload?.input ? `${new TextEncoder().encode(JSON.stringify(payload.input.parts)).byteLength} / ${capability.maxSerializedPartsBytes} serialized part bytes, including base64. ` : "";
    el("nativeTaskDraftBytes").textContent = error?.message || `${new TextEncoder().encode(combined).byteLength} / ${maximum} UTF-8 text bytes, including text-file context. ${serialized}These are byte limits, not token-usage measurements.`;
    el("nativeTaskDraftBytes").classList.toggle("status-bad", Boolean(error));
    el("nativeTaskPrompt").setAttribute("aria-invalid", String(Boolean(error)));
    el("nativeTaskSubmissionPreview").hidden = attachments.length === 0;
    const sequence = payload?.input ? `\n\nOriginal media follows this text (${payload.input.format}; original bytes are sent, not the descriptions below):\n${attachments.filter(item => item.type === "image" || item.type === "audio").map((item, index) => `${index + 1}. ${item.name} · ${item.mimeType} · ${item.bytes} original bytes`).join("\n")}` : "";
    el("nativeTaskSubmittedText").textContent = error ? "Review the reported limit or provider mismatch and adjust the selection. No partial input will be sent." : combined + sequence;
    const html = renderTaskAttachments(attachments), node = el("nativeTaskAttachmentList");
    if (node.dataset.rendered !== html) { node.innerHTML = html; node.dataset.rendered = html; }
    el("nativeTaskAttachments").disabled = !config || readingAttachments;
    const supportedMimes = [...(capability?.imageMimeTypes || []), ...(capability?.audioMimeTypes || [])];
    el("nativeTaskMediaAttachments").disabled = !config || readingAttachments || supportedMimes.length === 0;
    el("nativeTaskMediaAttachments").accept = supportedMimes.join(",");
    el("nativeTaskMediaHelp").textContent = !supportedMimes.length
      ? "The selected provider has not advertised a supported original-media input contract. Text files remain available; no media-to-text fallback is used."
      : `Advertised original formats: ${supportedMimes.join(", ")}. Up to ${capability.maxImages} images and ${capability.maxAudios} WAV files, subject to the combined ${capability.maxSerializedPartsBytes}-byte parts limit. No provider/model request has been made by this inspection.`;
    el("nativeTaskAttachmentLoading").hidden = !readingAttachments;
    return !error;
  }
  function updateUrl(id) {
    const url = new URL(window.location.href); url.searchParams.set("agent", selectedAgent);
    if (id) url.searchParams.set("task", id); else url.searchParams.delete("task");
    window.history.replaceState(null, "", url);
  }
  function scope() {
    if (!config) return;
    const chosen = provider();
    const ready = chosen && (chosen.local || chosen.credential?.configured === true);
    el("nativeTaskCredential").textContent = !chosen ? "Choose a provider. No model request runs while inspecting setup."
      : chosen.local ? (chosen.model === "fixed" ? "Local recording demonstration; no external model or credential is used."
        : "Local model server on the Studio host; no credential is used. Start the server and pull the named model before running; access is not probed here.")
      : ready ? `Credential ${chosen.credential.ref} is configured (${chosen.credential.source || "configured source"}). Provider access has not been tested by setup inspection.`
      : `Configure ${chosen.credential?.ref || "the required provider credential"} on the Studio host, then choose Check setup. This page does not collect secret values.`;
    const scopeHtml=renderTaskScope(config, el("nativeTaskTools").value, task);
    if(el("nativeTaskScope").dataset.rendered !== scopeHtml) {
      el("nativeTaskScope").innerHTML=scopeHtml; el("nativeTaskScope").dataset.rendered=scopeHtml;
    }
    const validationHtml=renderTaskValidationSetup(config, task?.validationSelection?.checkIds || selectedChecks, task);
    if(el("nativeTaskValidationSetup").dataset.rendered !== validationHtml) {
      el("nativeTaskValidationSetup").innerHTML=validationHtml;el("nativeTaskValidationSetup").dataset.rendered=validationHtml;
    }
    for(const check of el("nativeTaskValidationSetup").querySelectorAll("[data-native-validation-id]")) {
      check.disabled = Boolean(task) || mutation || inspecting || reconciling || Boolean(pending) || config.demo || !config.validation.ready
        || el("nativeTaskTools").value !== "workspace" || !config.scope.ready || !config.scope.tools.some(tool => tool.name === "bash");
    }
    el("nativeTaskModel").disabled = Boolean(task) || !chosen || chosen.model === "fixed" || mutation || inspecting || reconciling || Boolean(pending);
    el("nativeTaskTools").querySelector('option[value="workspace"]').disabled = config.demo || !config.scope.ready;
  }
  function controls() {
    if (disposed) return;
    const chosen = provider();
    const setupReady = config && !config.executionBlocked && chosen && (chosen.local || chosen.credential?.configured === true)
      && (chosen.model === "fixed" || el("nativeTaskModel").value.trim())
      && (el("nativeTaskTools").value === "none" || (config.scope.ready && !config.demo && typeof config.scope.digest === "string"
        && (!task || task.toolsDigest === config.scope.digest)))
      && (!(task?.validationSelection || selectedChecks.length) || (config.validation.ready
        && (task?.validationSelection?.configSha256 || selectedChecksDigest) === config.validation.configSha256
        && el("nativeTaskTools").value === "workspace" && config.scope.tools.some(tool => tool.name === "bash")));
    const canPrompt = !stale && setupReady && (!task || task.state === "idle" && task.history.status === "authenticated");
    el("nativeTaskSubmit").disabled = !draft() || readingAttachments || !canPrompt || mutation || inspecting || reconciling || Boolean(pending) || !navigator.onLine;
    el("nativeTaskSubmit").textContent = mutation && !operationAction ? "Awaiting admission…" : task ? "Send follow-up" : "Run task";
    el("nativeTaskRetry").hidden = !pending;
    el("nativeTaskRetry").disabled = !pending || !retryReady || mutation || inspecting || reconciling || polling
      || !navigator.onLine || !nativeSubmissionScopeMatches(pending, submissionScope());
    el("nativeTaskRetryHelp").hidden = !pending;
    el("nativeTaskRetryHelp").textContent = !pending ? "" : !nativeSubmissionScopeMatches(pending, submissionScope())
      ? "The original workspace or sign-in changed. Return to the original session and refresh status; this request cannot be sent under another identity."
      : retryReady ? "Retry sends only the original task text and choices. Any edits in the draft below stay here for a later submission."
      : "Refresh status first. If Studio cannot find the original admission, you can explicitly retry that same submission.";
    // Keep the draft editable while a submission is awaiting acknowledgement.
    el("nativeTaskPrompt").disabled = !config;
    el("nativeTaskProvider").disabled = !config || Boolean(task) || mutation || inspecting || reconciling || Boolean(pending);
    el("nativeTaskTools").disabled = !config || Boolean(task) || mutation || inspecting || reconciling || Boolean(pending) || config.demo;
    el("nativeTaskAgent").disabled = Boolean(task) || mutation || inspecting || reconciling || Boolean(pending);
    el("nativeTaskSetup").querySelector('button[type="submit"]').disabled = mutation || inspecting || reconciling || Boolean(pending) || !navigator.onLine;
    for (const name of ["MaxSteps","MaxTokens"]) el(`nativeTask${name}`).disabled = !config || Boolean(task) || mutation || inspecting || reconciling || Boolean(pending);
    el("nativeTaskCancel").hidden = !task || !["starting","running","cancel-requested"].includes(task.state);
    el("nativeTaskCancel").disabled = stale || mutation || inspecting || reconciling || Boolean(pending) || !navigator.onLine || task?.state === "cancel-requested";
    el("nativeTaskCancel").textContent = task?.state === "cancel-requested" ? "Stop requested" : "Stop task";
    el("nativeTaskRelease").hidden = !task || !["idle","failed"].includes(task.state) || !task.sessionId;
    el("nativeTaskResume").hidden = !task || !task.canResume;
    el("nativeTaskVerify").hidden = !task || !["idle","released","closed","failed"].includes(task.state) || !task.sessionId;
    for (const action of ["Release","Resume","Verify"]) el(`nativeTask${action}`).disabled = stale || mutation || inspecting || reconciling || Boolean(pending) || !navigator.onLine;
    el("nativeTaskResume").disabled ||= !setupReady;
    el("nativeTaskVerify").disabled ||= task?.history.status === "unavailable";
    el("nativeTaskVerify").textContent = task && ["released","closed","failed"].includes(task.state) ? "Verify evidence" : "Close and verify";
    el("nativeTaskArchive").hidden = !task || task.state !== "closed" || task.archived || !task.sessionId;
    el("nativeTaskArchive").disabled = stale || task?.history.status !== "authenticated" || mutation || inspecting || reconciling || Boolean(pending) || !navigator.onLine;
    el("nativeTaskArchiveHelp").hidden = el("nativeTaskArchive").hidden;
    el("nativeTaskIncludeArchived").disabled = !config || mutation || inspecting || reconciling || Boolean(pending);
    // Refresh supersedes a slow poll; a failed options read must not strand the reconnect button.
    el("nativeTaskRefresh").disabled = mutation || inspecting || reconciling || !navigator.onLine;
    el("nativeTaskRefresh").textContent = reconciling ? "Refreshing status…" : "Refresh status";
    el("nativeTaskReconnect").hidden = !stale && !readPaused && Boolean(config);
    el("nativeTaskReconnect").disabled = el("nativeTaskRefresh").disabled;
    el("nativeTaskNew").disabled = !task || stale || readPaused || ACTIVE.has(task.state) || mutation || inspecting || reconciling || Boolean(pending);
    el("nativeTaskState").textContent = stale ? "Status unconfirmed"
      : task?.history.status === "unavailable" ? "Evidence unavailable" : taskStateLabel(task);
    el("nativeTaskConnection").textContent = !navigator.onLine ? "Offline. This page has not stopped the task."
      : inspecting ? "Loading authenticated task setup…" : reconciling ? "Refreshing task history; no action is replayed."
      : mutation ? `${operationAction ? `${operationAction} request` : "Submission"} awaiting a server response; outcome not yet confirmed.`
      : stale || readPaused ? "Updates paused. Reconnect with a status read before another action."
      : task ? ACTIVE.has(task.state) ? "Watching committed updates. No provisional model tokens are displayed."
        : "Latest status read received. Recorded activity is not proof of answer correctness."
      : config ? "Setup available. This page has not submitted the current draft." : "Task setup unavailable. Check setup before submitting.";
    el("nativeTaskObservedAt").textContent = lastObservedAt === null ? "No current task observation." : `Status received ${new Date(lastObservedAt).toLocaleTimeString()}. Task changes and provider activity may occur between reads.`;
    el("nativeTaskActionHelp").textContent = stale ? "Current controls are withheld until Refresh status succeeds. Disconnecting does not cancel server work."
      : task?.state === "cancel-requested" ? "Cancellation is requested, not confirmed. Wait for a recorded turn ending; no rollback of earlier tool effects is implied."
      : task?.canResume ? "Resume reopens the same recorded session. It does not replay the last prompt; send a follow-up only after resume is acknowledged."
      : task?.state === "released" ? "The writer is released. Review recovery eligibility before continuing; no replacement session is created automatically."
      : task?.state === "closed" ? "This session is closed and read-only. New task starts a separate session."
      : task?.state === "failed" ? "The task did not finish cleanly. Inspect the recorded error and evidence before choosing recovery or a new task."
      : "Stop requests cancellation of the active turn. Release for later preserves an eligible session; Close and verify ends it.";
    el("nativeTaskSetup").setAttribute("aria-busy", String(inspecting));
    el("nativeTaskPromptForm").setAttribute("aria-busy", String(mutation || readingAttachments));
    if (config) scope();
  }
  function project() {
    if (disposed) return;
    // Preserve keyboard focus and expanded details when a poll has no visible change.
    for (const [id,html] of [["nativeTaskIdentity",renderTaskIdentity(task)], ["nativeTaskApprovals",renderTaskApprovals(task)],
      ["nativeTaskVerification",renderTaskVerification(task)], ["nativeTaskValidation",renderTaskValidation(task)], ["nativeTaskList",renderTaskList(tasks, task?.taskId)],
      ["nativeTaskUsage",renderTaskUsage(task)], ["nativeTaskToolStatus",renderTaskToolStatus(observedTools, !stale && task?.history.status === "authenticated")]]) {
      const node=el(id); if(node.dataset.rendered !== html) { node.innerHTML=html; node.dataset.rendered=html; }
    }
    if (stale) for (const id of ["nativeTaskVerification", "nativeTaskValidation", "nativeTaskApprovals", "nativeTaskUsage"]) {
      const node = el(id);
      node.textContent = "Current status is unconfirmed. Refresh status to authenticate this view before acting; no previous result is presented as current.";
      delete node.dataset.rendered;
    }
    const approvals = !stale && task?.history.status === "authenticated" ? task.approvals.length : 0;
    const banner = el("nativeTaskApprovalBanner"); banner.hidden = approvals === 0;
    if (banner.dataset.count !== String(approvals)) {
      banner.replaceChildren();
      if (approvals) {
        const message = document.createElement("strong"); message.textContent = `${approvals} signed approval request${approvals === 1 ? "" : "s"} require review. `;
        const link = document.createElement("a"); link.href = "#nativeTaskApprovals"; link.textContent = "Review pending requests";
        banner.append(message, link);
      }
      banner.dataset.count = String(approvals);
    }
    if (stale) {
      const identity = el("nativeTaskIdentity");
      identity.textContent = `Last selected task: ${task?.taskId || "none"}. Its current history and state are unconfirmed until Refresh status succeeds.`;
      delete identity.dataset.rendered;
    }
    const shown=el("nativeTaskTranscript").querySelectorAll(".native-task-event").length;
    const dropped = Math.max(0,(task?.nextCursor || 0)-shown);
    el("nativeTaskRetention").hidden = !dropped;
    el("nativeTaskRetention").textContent = `${shown} of ${task?.nextCursor || 0} recorded updates are displayed. Some updates are not loaded or were withheld by retention limits. The transcript is partial; use runtime evidence for the full verification verdict.`;
    controls();
  }
  function confirmSubmission(view, directResponse = false) {
    if (!pending) return;
    if (!nativeSubmissionAcknowledged(pending, view, directResponse)) return;
    if (!readingAttachments && nativeSubmissionDraftMatches(pending, el("nativeTaskPrompt").value, attachments)) {
      el("nativeTaskPrompt").value = ""; attachments = []; attachmentGeneration++;
    }
    pending = null; retryReady = false;
    tell("Submission recorded. Waiting for the task's actual outcome.");
  }
  function receive(view) {
    const next = taskView(view);
    if (task && (next.taskId !== task.taskId || next.agentId !== task.agentId)) throw new Error("Task or agent identity changed unexpectedly. Refresh under the original identity.");
    task = next; selectedAgent = task.agentId; updateUrl(task.taskId);
    const index = tasks.findIndex(item=>item.taskId===task.taskId);
    if (task.archived && !el("nativeTaskIncludeArchived").checked) {
      if (index >= 0) tasks.splice(index,1);
    } else if (index < 0) tasks.unshift(task); else tasks[index] = task;
    confirmSubmission(task); project();
  }
  function schedule() {
    clearTimer();
    if (!disposed && !mutation && !inspecting && !reconciling && !readPaused && task && navigator.onLine && !["released","closed"].includes(task.state)) {
      timer = setTimeout(()=>{ void poll().catch(showError); }, ACTIVE.has(task.state) ? 1000 : 4000);
    }
  }
  function poll() {
    if (disposed || !task || readPaused || !navigator.onLine) return Promise.resolve(false);
    // Callers await the actual read, never mistake an early-return busy flag for a successful refresh.
    if (pollJob) return pollJob.promise;
    const current = task, startCursor = cursor;
    const job = { controller: new AbortController(), generation: readGeneration, promise: null };
    const isCurrent = () => !disposed && !job.controller.signal.aborted && job.generation === readGeneration
      && task?.taskId === current.taskId && task?.agentId === current.agentId && navigator.onLine;
    taskRead = job.controller; polling = true; controls();
    job.promise = (async () => {
      try {
        const raw = await request(`${endpoint(current.taskId)}&cursor=${startCursor}`, { signal: job.controller.signal });
        if (!isCurrent()) return false;
        const value = validateNativeTaskPoll(raw, current, startCursor, config?.limits), view = value.task;
        if (view.history.status === "unavailable") {
          clearActivity("Original task evidence is unavailable; no previous transcript is shown as current.");
          stale = false; readPaused = true; retryReady = false; lastObservedAt = Date.now();
          receive(view); tell(view.history.message); return false;
        }
        const transcript = el("nativeTaskTranscript");
        const nearBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 180;
        for (const event of value.events) { el("nativeTaskEmpty")?.remove(); appendTaskEvent(transcript, event); }
        observedTools = collectNativeTaskTools(observedTools, value.events);
        cursor = view.nextCursor; stale = false; lastObservedAt = Date.now();
        const limit = Math.max(1, Math.min(config?.limits.maxEvents || 500, 500));
        while (transcript.children.length > limit) transcript.firstElementChild.remove();
        receive(view);
        if (!pending) tell(task.approvals.length ? `${task.approvals.length} signed approval request(s) require review. A vote is not tool execution.`
          : `${taskStateLabel(task)}${!ACTIVE.has(task.state) && task.turnEndReason ? ` · ${task.turnEndReason}` : ""}.`);
        if (value.events.length) {
          if (nearBottom) transcript.lastElementChild?.scrollIntoView({ block: "nearest" });
          else el("nativeTaskNewMessages").hidden = false;
        }
        return true;
      } catch (error) {
        if (!isCurrent()) return false;
        pauseObservation(); tell("Updates paused. Refresh status to reconnect; no task action will be repeated automatically.");
        throw error;
      } finally {
        // A superseded response cannot clear a replacement reader's flags or schedule its timer.
        if (pollJob === job) { pollJob = null; taskRead = null; polling = false; controls(); schedule(); }
      }
    })();
    pollJob = job;
    return job.promise;
  }
  async function inspect(agentId) {
    const generation=++setupGeneration, observation = readGeneration; inspecting=true; controls();
    let value;
    try { value=configuration(await request(`${API}/options?agentId=${encodeURIComponent(agentId)}`, { signal:lifetime.signal })); }
    catch(error) { if(generation===setupGeneration) config=null; throw error; }
    finally { if(generation===setupGeneration) { inspecting=false; controls(); } }
    if (disposed || generation!==setupGeneration || observation !== readGeneration || !navigator.onLine) return false;
    if (value.agentId !== agentId) throw new Error("Setup returned a different agent. No replacement identity was selected.");
    if(!task && selectedChecksDigest !== value.validation.configSha256) { selectedChecks=[];selectedChecksDigest=value.validation.configSha256; }
    config = value; selectedAgent = value.agentId; el("nativeTaskAgent").value = selectedAgent;
    const select = el("nativeTaskProvider"), previous = task?.provider || select.value;
    select.replaceChildren(new Option("Choose a provider", ""));
    for (const item of config.providers) if (!config.demo || item.id === "stub") select.add(new Option(providerLabel(item.id),item.id));
    select.value = previous; if (config.demo) select.value="stub";
    if (task) { el("nativeTaskModel").value=task.model || ""; el("nativeTaskTools").value=task.tools; }
    if (!task && (config.demo || !config.scope.ready)) el("nativeTaskTools").value="none";
    for (const [name,key] of [["MaxSteps","maxSteps"],["MaxTokens","maxTokens"]]) {
      const input=el(`nativeTask${name}`);input.max=String(config.limits[key]);input.value=String(task?.[key] || config.limits[key]);
    }
    el("nativeTaskPrompt").maxLength=config.limits.maxPromptBytes;
    el("nativeTaskLimits").textContent=`Task lifetime: ${Math.round(config.limits.lifetimeMs/60000)} minutes. Idle timeout: ${Math.round(config.limits.idleTimeoutMs/60000)} minutes. These limits do not grant additional tools or budget.`;
    el("nativeTaskBoundary").textContent=`${config.executionBlocked ? "Execution is blocked by workspace trust or user-signature checks. An operator must correct the reported setup before a new task, follow-up or resume. Existing tasks can still be stopped or released. " : ""}${config.boundary}`;
    updateUrl(task?.taskId || new URL(window.location.href).searchParams.get("task")); controls(); return true;
  }
  async function list() {
    const agent = selectedAgent, generation = ++listGeneration, observation = readGeneration;
    const value=await request(`${API}?agentId=${encodeURIComponent(agent)}&includeArchived=${el("nativeTaskIncludeArchived").checked}`, {signal:lifetime.signal});
    if (disposed || agent !== selectedAgent || generation !== listGeneration || observation !== readGeneration || !navigator.onLine) return false;
    if (!object(value) || !Array.isArray(value.tasks)) throw new Error("Task list is unavailable.");
    const next = value.tasks.map(taskView);
    if (next.some(item => item.agentId !== agent)) throw new Error("The task list contains a different agent. No task selection was changed.");
    tasks=next; project(); return true;
  }
  async function selectTask(view) {
    const next = taskView(view);
    abortRead(); stale = true; readPaused = false; retryReady = false; clearActivity();
    task=next;selectedAgent=task.agentId; receive(task);
    if (!await inspect(task.agentId)) return false;
    return await poll();
  }
  async function refresh() {
    if (reconciling || mutation || !navigator.onLine) return;
    reconciling=true; pauseObservation(); clearError(); readPaused=false; controls();
    const generation = readGeneration;
    try {
      if (!await inspect(pending?.agentId || task?.agentId || selectedAgent) || !await list()
        || generation !== readGeneration || disposed || !navigator.onLine) return;
      const recovered = pending?.kind === "create" ? tasks.find(item => nativeSubmissionAcknowledged(pending, item)) : null;
      const observed = recovered ? await selectTask(recovered) : task ? await poll() : true;
      if (!observed || disposed || !navigator.onLine || readPaused) return;
      if (!task) { stale = false; project(); tell("Setup and task list refreshed. No prompt or control was replayed."); }
      if (pending) {
        retryReady=!stale && nativeSubmissionScopeMatches(pending, submissionScope());
        tell(retryReady ? "Submission outcome is still unconfirmed. Retry original submission resends the same request only when you choose it."
          : "The sign-in or workspace changed. The original submission remains unconfirmed and cannot be retried under another identity.");
      }
    } catch(error) { pauseObservation(); throw error; }
    finally { reconciling=false; controls(); schedule(); }
  }
  async function mutate(action) {
    if (!task || mutation || inspecting || reconciling || pending || stale || !navigator.onLine) return;
    const body={expectedRevision:task.revision};
    mutation=true;operationAction=action;abortRead();stale=true;clearError();project();
    try {
      const view=await request(endpoint(task.taskId,`/${action}`),{method:"POST",body,signal:lifetime.signal});
      if (!disposed) {
        receive(view); await poll();
        if (action === "archive") { await list(); tell("Task archived. Its signed history is retained; use Show archived tasks to inspect it."); }
      }
    }
    catch(error) { pauseObservation(); showError(error); tell("Action outcome may need confirmation. Refresh status before trying another action."); }
    finally { mutation=false;operationAction=null;controls();schedule(); }
  }
  async function submit() {
    if (mutation || pending || el("nativeTaskSubmit").disabled) return;
    const draftPrompt=el("nativeTaskPrompt").value;
    if (!draftPrompt.trim()) return;
    if (typeof crypto.randomUUID !== "function") { showError(new Error("Open Studio over HTTPS or localhost before submitting a native task."));return; }
    let payload;
    try { payload = composeNativeTaskInput(draftPrompt, attachments, provider()?.input, config.limits.maxPromptBytes); }
    catch (error) { showError(error); return; }
    const id=crypto.randomUUID();
    const body=task ? {...payload,clientRequestId:id,expectedRevision:task.revision} : {agentId:selectedAgent,provider:provider().id,...(provider().model === "fixed"?{}:{model:el("nativeTaskModel").value.trim()}),tools:el("nativeTaskTools").value,...(el("nativeTaskTools").value === "workspace" ? {toolsDigest:config.scope.digest} : {}),...(selectedChecks.length ? {validation:{configSha256:selectedChecksDigest,checkIds:[...selectedChecks]}} : {}),...payload,clientRequestId:id,maxSteps:Number(el("nativeTaskMaxSteps").value),maxTokens:Number(el("nativeTaskMaxTokens").value)};
    try { assertNativeTaskRequestSize(body); } catch (error) { showError(error); return; }
    pending=captureNativeSubmission({ url:task?endpoint(task.taskId,"/turn"):API,body,agentId:selectedAgent,
      taskId:task?.taskId || null,...submissionScope(), draftPrompt, attachments });
    await sendSubmission(false);
  }
  async function sendSubmission(retry) {
    if (!pending || mutation || inspecting || reconciling || (retry && (!retryReady || polling || !navigator.onLine))) return;
    if (!nativeSubmissionScopeMatches(pending, submissionScope())) {
      retryReady=false;showError(new Error("The original submission belongs to another workspace or sign-in. Refresh status under its original identity."));controls();return;
    }
    const original=pending;
    retryReady=false;mutation=true;operationAction=null;abortRead();stale=true;clearError();project();
    tell(retry ? "Retrying the original submission with the same request identity. Your edited draft will not be sent."
      : "Submitting once. Your draft stays here until Studio acknowledges it.");
    let acknowledged=false;
    try {
      const view=taskView(await request(original.url,{method:"POST",body:original.body,nativeCsrfToken:original.csrfToken,signal:lifetime.signal}));
      if (!nativeSubmissionAcknowledged(original,view,true)) throw new Error("Studio returned a different admission. The original submission is still unconfirmed; refresh its status.");
      acknowledged=true;
      if (disposed) return;
      // Settle the exact acknowledgement before any subsequent setup or polling can fail.
      confirmSubmission(view,true);
      if (original.kind === "create") await selectTask(view); else { receive(view); await poll(); }
    } catch(error) {
      if (disposed) return;
      if (pending===original && definiteNativeSubmissionRefusal(error,retry)) { pending=null;retryReady=false; }
      pauseObservation();
      showError(error);tell(acknowledged ? "Submission recorded, but setup or status refresh failed. Refresh status to see its outcome; no request was repeated."
        : pending ? "Submission outcome unknown. Use Refresh status to find the original request; no automatic retry will run."
        : "Submission refused. Your draft is preserved; refresh setup or task status before trying again.");
    } finally { mutation=false;controls();schedule(); }
  }
  async function addAttachments(files, media = false) {
    if (!config || readingAttachments || !files.length) return;
    const capability = nativeTaskMediaCapabilities(provider()?.input);
    const selectedCount = attachments.filter(item => media ? item.type === "image" || item.type === "audio" : item.type === undefined).length;
    const maximumFiles = media ? (capability?.maxImages || 0) + (capability?.maxAudios || 0) : NATIVE_TEXT_ATTACHMENT_LIMIT;
    if (selectedCount + files.length > maximumFiles) { showError(new Error(`This selection exceeds the ${maximumFiles} ${media ? "original media" : "text"} file limit. Remove a selected file or review provider support.`)); return; }
    const generation = ++attachmentGeneration;
    const maximumTextBytes = config.limits.maxPromptBytes;
    readingAttachments = true; clearError(); controls();
    try {
      const selected = [];
      for (const file of files) {
        if (disposed || generation !== attachmentGeneration) return;
        selected.push(await (media ? readNativeMediaAttachment(file, capability) : readNativeTextAttachment(file, maximumTextBytes)));
        if (disposed || generation !== attachmentGeneration) return;
        composeNativeTaskInput(el("nativeTaskPrompt").value, [...attachments, ...selected], provider()?.input, config?.limits.maxPromptBytes || maximumTextBytes);
      }
      if (disposed || generation !== attachmentGeneration) return;
      const next = [...attachments, ...selected];
      composeNativeTaskInput(el("nativeTaskPrompt").value, next, provider()?.input, config?.limits.maxPromptBytes || maximumTextBytes);
      attachments = next;
    } catch (error) { if (!disposed && generation === attachmentGeneration) showError(error); }
    finally { if (!disposed && generation === attachmentGeneration) { readingAttachments = false; controls(); } }
  }
  listen(el("nativeTaskSetup"),"submit",event=>{
    event.preventDefault(); if (mutation || inspecting || reconciling || pending) return;
    if (!task) selectedAgent=el("nativeTaskAgent").value.trim()||"default";
    void refresh().catch(showError);
  });
  for (const id of ["nativeTaskProvider","nativeTaskModel","nativeTaskTools"]) listen(el(id),"input",controls);
  listen(el("nativeTaskValidationSetup"),"change",event=>{
    const checkbox=event.target.closest("[data-native-validation-id]");if(!checkbox || task || mutation || pending || checkbox.disabled)return;
    selectedChecks=[...el("nativeTaskValidationSetup").querySelectorAll("[data-native-validation-id]:checked")].map(node=>node.dataset.nativeValidationId);
    selectedChecksDigest=config.validation.configSha256;controls();
  });
  listen(el("nativeTaskTools"),"change",()=>{if(!task && el("nativeTaskTools").value === "none") { selectedChecks=[];controls(); }});
  listen(el("nativeTaskPromptForm"),"submit",event=>{event.preventDefault();void submit();});
  listen(el("nativeTaskPrompt"),"input",controls);
  listen(el("nativeTaskAttachments"),"change",event=>{
    const files = [...event.target.files]; event.target.value = ""; void addAttachments(files);
  });
  listen(el("nativeTaskMediaAttachments"),"change",event=>{
    const files = [...event.target.files]; event.target.value = ""; void addAttachments(files, true);
  });
  listen(el("nativeTaskAttachmentList"),"click",event=>{
    const move = event.target.closest("[data-native-move-attachment]");
    if (move && !readingAttachments) {
      const index = Number(move.dataset.nativeMoveAttachment);
      if (!Number.isInteger(index) || index < 1 || index >= attachments.length || !["image","audio"].includes(attachments[index].type)) return;
      let earlier = index - 1;
      while (earlier >= 0 && !["image","audio"].includes(attachments[earlier].type)) earlier--;
      if (earlier < 0) return;
      const next = [...attachments]; [next[earlier], next[index]] = [next[index], next[earlier]];
      attachments = next; attachmentGeneration++; controls(); el("nativeTaskMediaAttachments").focus(); return;
    }
    const button = event.target.closest("[data-native-remove-attachment]");
    if (!button || readingAttachments) return;
    const index = Number(button.dataset.nativeRemoveAttachment);
    if (!Number.isInteger(index) || index < 0 || index >= attachments.length) return;
    attachments = attachments.filter((_, position) => position !== index); attachmentGeneration++; controls();
    el("nativeTaskAttachments").focus();
  });
  listen(el("nativeTaskRetry"),"click",()=>{void sendSubmission(true);});
  listen(el("nativeTaskPrompt"),"keydown",event=>{if(event.key==="Enter"&&(event.ctrlKey||event.metaKey)){event.preventDefault();void submit();}});
  listen(el("nativeTaskRefresh"),"click",()=>{void refresh().catch(showError);});
  listen(el("nativeTaskReconnect"),"click",()=>{void refresh().catch(showError);});
  for(const [id,action] of [["nativeTaskCancel","cancel"],["nativeTaskRelease","release"],["nativeTaskResume","resume"],["nativeTaskVerify","verify"],["nativeTaskArchive","archive"]]) listen(el(id),"click",()=>{void mutate(action);});
  listen(el("nativeTaskIncludeArchived"),"change",()=>{if(!mutation&&!pending&&!inspecting&&!reconciling)void list().catch(showError);});
  listen(el("nativeTaskNewMessages"),"click",()=>{el("nativeTaskTranscript").lastElementChild?.scrollIntoView({block:"nearest"});el("nativeTaskNewMessages").hidden=true;});
  listen(el("nativeTaskNew"),"click",()=>{
    if(pending||mutation||inspecting||reconciling||stale||readPaused||ACTIVE.has(task?.state))return;
    abortRead(); task=null; selectedChecks=[]; selectedChecksDigest=config?.validation.configSha256 ?? null;
    stale=false;readPaused=false;clearActivity("Your next task will appear here after you choose Run task.");
    updateUrl(null);project();tell("Choose the next task. Your unsent draft is preserved; previous tasks remain available in Your tasks.");
  });
  listen(el("nativeTaskList"),"click",event=>{const button=event.target.closest("[data-native-task-id]");if(!button||mutation||pending||inspecting||reconciling||!navigator.onLine)return;const view=tasks.find(item=>item.taskId===button.dataset.nativeTaskId);if(view)void selectTask(view).catch(error=>{pauseObservation();showError(error);});});
  const dispose=()=>{if(disposed)return;disposed=true;pending=null;attachments=[];attachmentGeneration++;abortRead();lifetime.abort();mounts.delete(root);};mounts.set(root,dispose);
  listen(window,"pagehide",event=>{if(event.persisted)pauseObservation();else dispose();});
  listen(window,"pageshow",event=>{if(event.persisted){pauseObservation();tell("Page restored. The in-memory draft is retained; refresh status before another action. No submission was replayed.");}});
  listen(window,"offline",()=>{clearTimer();pauseObservation();tell("Connection lost. Task outcome is unknown until Studio confirms it; this view does not stop the task.");controls();});
  listen(window,"online",()=>{tell("Connection restored. Refresh status before another action.");controls();});
  try {
    const requestedId=new URL(window.location.href).searchParams.get("task");
    if (!await inspect(initialAgent) || !await list()) return dispose;
    if(requestedId){const existing=tasks.find(item=>item.taskId===requestedId);if(existing)await selectTask(existing);else {
      const generation = readGeneration, value=await request(endpoint(requestedId),{signal:lifetime.signal});
      if (disposed || generation !== readGeneration || !navigator.onLine) return dispose;
      const selected = taskView(value.task);
      if (selected.taskId !== requestedId || selected.agentId !== initialAgent) throw new Error("The requested task identity did not match the returned history.");
      await selectTask(selected);
    }}
    else { stale=false;project();tell(config.demo?"Demo workspace: run an explicit local demonstration with no tools.":"Choose a provider and task. Setup inspection has not contacted a model."); }
  } catch(error){if(!disposed){pauseObservation();showError(error);tell("Native task setup is unavailable. Correct the reported configuration and choose Check setup.");}}
  return dispose;
}
