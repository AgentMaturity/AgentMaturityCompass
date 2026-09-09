import { apiNativeRequest, getAdminToken } from "./api.js";
import { nativeTasksShell, providerLabel, renderTaskScope, renderTaskIdentity, renderTaskApprovals,
  renderTaskVerification, renderTaskValidationSetup, renderTaskValidation, renderTaskList, taskStateLabel, appendTaskEvent } from "./nativeTasksView.js";
import { captureNativeSubmission, nativeSubmissionScopeMatches, nativeSubmissionAcknowledged,
  definiteNativeSubmissionRefusal } from "./nativeTaskSubmission.js";

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
    || !(value.resumeBlockedReason === null || typeof value.resumeBlockedReason === "string")
    || !Array.isArray(value.approvals) || typeof value.canResume !== "boolean" || typeof value.archived !== "boolean"
    || !["not-verified","workspace-key-consistency","externally-anchored","failed"].includes(value.verification)) {
    throw new Error("Studio returned an unsupported task state. Refresh this page after updating Studio.");
  }
  return value;
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
  let selectedChecks = [], selectedChecksDigest = null;
  let notice = "", selectedAgent = initialAgent, taskRead = null;
  root.innerHTML = nativeTasksShell(initialAgent);
  const el = id => root.querySelector(`#${id}`);
  const listen = (target, event, fn) => target.addEventListener(event, fn, { signal: lifetime.signal });
  const tell = message => { if (!disposed && notice !== message) { notice = message; el("nativeTaskNotice").textContent = message; } };
  const clearError = () => { el("nativeTaskError").hidden = true; el("nativeTaskError").textContent = ""; };
  const showError = error => {
    if (disposed || error?.name === "AbortError") return;
    const message = error?.message || "Studio could not complete this request.";
    el("nativeTaskError").textContent = `${message}${error?.code ? ` (${error.code})` : ""}${[401,403].includes(error?.status) ? " Sign in or refresh setup before another action." : ""}`;
    el("nativeTaskError").hidden = false;
  };
  const request = (path, options = {}) => apiNativeRequest(path, { ...options, nativeCsrfToken: config?.nativeCsrfToken });
  const endpoint = (id, suffix = "") => `${API}/${encodeURIComponent(id)}${suffix}?agentId=${encodeURIComponent(task?.agentId || selectedAgent)}`;
  const workspaceScope = () => {
    const url = new URL(window.location.href), parts = url.pathname.split("/").filter(Boolean);
    return `${url.origin}${parts[0] === "w" ? `/w/${parts[1] || ""}` : parts[0] === "host" ? "/host" : ""}`;
  };
  const submissionScope = () => ({ agentId: config?.agentId, workspaceScope: workspaceScope(),
    csrfToken: config?.nativeCsrfToken, adminToken: getAdminToken() });
  const provider = () => config?.providers.find(item => item.id === el("nativeTaskProvider").value);
  const clearTimer = () => { if (timer !== null) clearTimeout(timer); timer = null; };
  function pauseObservation() {
    stale = true; readPaused = true; retryReady = false; cursor = 0;
    el("nativeTaskTranscript").replaceChildren();
    project();
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
      : chosen.local ? "Local recording demonstration; no external model or credential is used."
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
      check.disabled = Boolean(task) || mutation || inspecting || Boolean(pending) || config.demo || !config.validation.ready
        || el("nativeTaskTools").value !== "workspace" || !config.scope.ready || !config.scope.tools.some(tool => tool.name === "bash");
    }
    el("nativeTaskModel").disabled = Boolean(task) || !chosen || chosen.local || mutation || Boolean(pending);
    el("nativeTaskTools").querySelector('option[value="workspace"]').disabled = config.demo || !config.scope.ready;
  }
  function controls() {
    if (disposed) return;
    const chosen = provider();
    const setupReady = config && !config.executionBlocked && chosen && (chosen.local || chosen.credential?.configured === true)
      && (chosen.local || el("nativeTaskModel").value.trim())
      && (el("nativeTaskTools").value === "none" || (config.scope.ready && !config.demo && typeof config.scope.digest === "string"
        && (!task || task.toolsDigest === config.scope.digest)))
      && (!(task?.validationSelection || selectedChecks.length) || (config.validation.ready
        && (task?.validationSelection?.configSha256 || selectedChecksDigest) === config.validation.configSha256
        && el("nativeTaskTools").value === "workspace" && config.scope.tools.some(tool => tool.name === "bash")));
    const canPrompt = !stale && setupReady && (!task || task.state === "idle" && task.history.status === "authenticated");
    el("nativeTaskSubmit").disabled = !canPrompt || mutation || inspecting || Boolean(pending) || !navigator.onLine;
    el("nativeTaskSubmit").textContent = task ? "Send follow-up" : "Run task";
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
    el("nativeTaskProvider").disabled = !config || Boolean(task) || mutation || Boolean(pending);
    el("nativeTaskTools").disabled = !config || Boolean(task) || mutation || Boolean(pending) || config.demo;
    el("nativeTaskAgent").disabled = Boolean(task) || mutation || Boolean(pending);
    el("nativeTaskSetup").querySelector('button[type="submit"]').disabled = mutation || inspecting || Boolean(pending);
    for (const name of ["MaxSteps","MaxTokens"]) el(`nativeTask${name}`).disabled = !config || Boolean(task) || mutation || Boolean(pending);
    el("nativeTaskCancel").hidden = !task || !["starting","running","cancel-requested"].includes(task.state);
    el("nativeTaskCancel").disabled = stale || mutation || Boolean(pending) || !navigator.onLine || task?.state === "cancel-requested";
    el("nativeTaskRelease").hidden = !task || !["idle","failed"].includes(task.state) || !task.sessionId;
    el("nativeTaskResume").hidden = !task || !task.canResume;
    el("nativeTaskVerify").hidden = !task || !["idle","released","closed","failed"].includes(task.state) || !task.sessionId;
    for (const action of ["Release","Resume","Verify"]) el(`nativeTask${action}`).disabled = stale || mutation || inspecting || Boolean(pending) || !navigator.onLine;
    el("nativeTaskResume").disabled ||= !setupReady;
    el("nativeTaskVerify").disabled ||= task?.history.status === "unavailable";
    el("nativeTaskVerify").textContent = task && ["released","closed","failed"].includes(task.state) ? "Verify evidence" : "Close and verify";
    el("nativeTaskArchive").hidden = !task || task.state !== "closed" || task.archived || !task.sessionId;
    el("nativeTaskArchive").disabled = stale || task?.history.status !== "authenticated" || mutation || inspecting || Boolean(pending) || !navigator.onLine;
    el("nativeTaskArchiveHelp").hidden = el("nativeTaskArchive").hidden;
    el("nativeTaskIncludeArchived").disabled = !config || mutation || inspecting || Boolean(pending);
    el("nativeTaskRefresh").disabled = (!config && !pending) || mutation || inspecting || polling || reconciling || !navigator.onLine;
    el("nativeTaskNew").disabled = !task || ACTIVE.has(task.state) || mutation || Boolean(pending);
    el("nativeTaskState").textContent = taskStateLabel(task);
    if (config) scope();
  }
  function project() {
    // Preserve keyboard focus and expanded details when a poll has no visible change.
    for (const [id,html] of [["nativeTaskIdentity",renderTaskIdentity(task)], ["nativeTaskApprovals",renderTaskApprovals(task)],
      ["nativeTaskVerification",renderTaskVerification(task)], ["nativeTaskValidation",renderTaskValidation(task)], ["nativeTaskList",renderTaskList(tasks, task?.taskId)]]) {
      const node=el(id); if(node.dataset.rendered !== html) { node.innerHTML=html; node.dataset.rendered=html; }
    }
    if (stale) for (const id of ["nativeTaskVerification", "nativeTaskValidation", "nativeTaskApprovals"]) {
      const node = el(id);
      node.textContent = "Current status is unconfirmed. Refresh status to authenticate this view before acting; no previous result is presented as current.";
      delete node.dataset.rendered;
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
    if (el("nativeTaskPrompt").value === pending.prompt) el("nativeTaskPrompt").value = "";
    pending = null; retryReady = false;
    tell("Submission recorded. Waiting for the task's actual outcome.");
  }
  function receive(view) {
    const next = taskView(view);
    if (task && (next.taskId !== task.taskId || next.agentId !== task.agentId)) throw new Error("Task or agent identity changed unexpectedly. Refresh under the original identity.");
    task = next; stale = false; selectedAgent = task.agentId; updateUrl(task.taskId);
    const index = tasks.findIndex(item=>item.taskId===task.taskId);
    if (task.archived && !el("nativeTaskIncludeArchived").checked) {
      if (index >= 0) tasks.splice(index,1);
    } else if (index < 0) tasks.unshift(task); else tasks[index] = task;
    confirmSubmission(task); project();
  }
  function schedule() {
    clearTimer();
    if (!disposed && !mutation && !readPaused && task && navigator.onLine && !["released","closed"].includes(task.state)) {
      timer = setTimeout(()=>{ void poll().catch(showError); }, ACTIVE.has(task.state) ? 1000 : 4000);
    }
  }
  async function poll() {
    if (disposed || !task || polling) return;
    const id = task.taskId, generation = readGeneration;
    polling = true; controls();
    const controller = new AbortController(); taskRead = controller;
    try {
      const value = await request(`${endpoint(id)}&cursor=${cursor}`, { signal: controller.signal });
      if (disposed || generation !== readGeneration || task?.taskId !== id) return;
      if (!object(value) || !Array.isArray(value.events) || typeof value.truncated !== "boolean") throw new Error("Unsupported task event response. Refresh status before continuing.");
      const view = taskView(value.task);
      if (view.taskId !== id || view.agentId !== task.agentId) throw new Error("Task identity changed unexpectedly. No further updates were applied.");
      if (view.history.status === "unavailable") {
        el("nativeTaskTranscript").replaceChildren(); cursor = 0; readPaused = true;
        receive(view); tell(view.history.message); return;
      }
      const transcript = el("nativeTaskTranscript");
      const nearBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 180;
      let added = 0;
      for (const event of value.events) {
        if (!object(event) || !integer(event.cursor) || !EVENT_KINDS.has(event.kind) || event.evidence !== "committed" || typeof event.text !== "string") throw new Error("Unsupported task update. No unrecognized event is treated as verified output.");
        if (event.cursor <= cursor) continue;
        el("nativeTaskEmpty")?.remove(); appendTaskEvent(transcript,event); cursor = event.cursor; added++;
      }
      cursor = Math.max(cursor, view.nextCursor);
      const limit = Math.max(1,Math.min(config?.limits.maxEvents || 500,500));
      while (transcript.children.length > limit) transcript.firstElementChild.remove();
      receive(view);
      if (!pending) tell(`${taskStateLabel(task)}${!ACTIVE.has(task.state) && task.turnEndReason ? ` · ${task.turnEndReason}` : ""}. Last confirmed ${new Date(task.updatedAt).toLocaleTimeString()}.`);
      if (added) {
        if (nearBottom) transcript.lastElementChild?.scrollIntoView({block:"nearest"});
        else el("nativeTaskNewMessages").hidden = false;
      }
    } catch(error) {
      if (error?.name !== "AbortError" && generation === readGeneration) {
        pauseObservation(); tell("Updates paused. Refresh status to reconnect; no task action will be repeated automatically.");
      }
      throw error;
    } finally {
      if (taskRead === controller) taskRead = null;
      polling = false; controls(); schedule();
    }
  }
  async function inspect(agentId) {
    const generation=++setupGeneration; inspecting=true; controls();
    let value;
    try { value=configuration(await request(`${API}/options?agentId=${encodeURIComponent(agentId)}`, { signal:lifetime.signal })); }
    catch(error) { if(generation===setupGeneration) config=null; throw error; }
    finally { if(generation===setupGeneration) { inspecting=false; controls(); } }
    if (disposed || generation!==setupGeneration) return;
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
    updateUrl(task?.taskId || new URL(window.location.href).searchParams.get("task")); controls();
  }
  async function list() {
    const value=await request(`${API}?agentId=${encodeURIComponent(selectedAgent)}&includeArchived=${el("nativeTaskIncludeArchived").checked}`, {signal:lifetime.signal});
    if (disposed) return;
    if (!object(value) || !Array.isArray(value.tasks)) throw new Error("Task list is unavailable.");
    tasks=value.tasks.map(taskView); project();
    if (pending?.kind === "create") {
      const recovered=tasks.find(item=>item.clientRequestId===pending.id || item.lastClientRequestId===pending.id);
      if (recovered) await selectTask(recovered);
    }
  }
  async function selectTask(view) {
    clearTimer(); readGeneration++;taskRead?.abort();cursor=0;readPaused=false;
    el("nativeTaskTranscript").replaceChildren();task=taskView(view);selectedAgent=task.agentId;
    receive(task); await inspect(task.agentId); await poll();
  }
  async function refresh() {
    if (reconciling || mutation) return;
    reconciling=true; retryReady=false; controls();
    try {
      clearError(); readPaused=false; await inspect(pending?.agentId || task?.agentId || selectedAgent); await list(); if(task) await poll(); else stale=false;
      if (pending) {
        retryReady=nativeSubmissionScopeMatches(pending, submissionScope());
        tell(retryReady ? "Submission outcome is still unconfirmed. Retry original submission resends the same request only when you choose it."
          : "The sign-in or workspace changed. The original submission remains unconfirmed and cannot be retried under another identity.");
      }
    } catch(error) { pauseObservation(); throw error; }
    finally { reconciling=false; controls(); }
  }
  async function mutate(action) {
    if (!task || mutation || pending || stale) return;
    const body={expectedRevision:task.revision};
    mutation=true;readGeneration++;taskRead?.abort();clearTimer();clearError();controls();
    try {
      const view=await request(endpoint(task.taskId,`/${action}`),{method:"POST",body,signal:lifetime.signal});
      if (!disposed) {
        receive(view); await poll();
        if (action === "archive") { await list(); tell("Task archived. Its signed history is retained; use Show archived tasks to inspect it."); }
      }
    }
    catch(error) { pauseObservation(); showError(error); tell("Action outcome may need confirmation. Refresh status before trying another action."); }
    finally { mutation=false;controls();schedule(); }
  }
  async function submit() {
    if (mutation || pending || el("nativeTaskSubmit").disabled) return;
    const prompt=el("nativeTaskPrompt").value;
    if (!prompt.trim()) return;
    if (typeof crypto.randomUUID !== "function") { showError(new Error("Open Studio over HTTPS or localhost before submitting a native task."));return; }
    if (new TextEncoder().encode(prompt).length>config.limits.maxPromptBytes) { showError(new Error("This prompt exceeds the configured byte limit. Shorten it before submitting."));return; }
    const id=crypto.randomUUID();
    const body=task ? {prompt,clientRequestId:id,expectedRevision:task.revision} : {agentId:selectedAgent,provider:provider().id,...(provider().local?{}:{model:el("nativeTaskModel").value.trim()}),tools:el("nativeTaskTools").value,...(el("nativeTaskTools").value === "workspace" ? {toolsDigest:config.scope.digest} : {}),...(selectedChecks.length ? {validation:{configSha256:selectedChecksDigest,checkIds:[...selectedChecks]}} : {}),prompt,clientRequestId:id,maxSteps:Number(el("nativeTaskMaxSteps").value),maxTokens:Number(el("nativeTaskMaxTokens").value)};
    pending=captureNativeSubmission({ url:task?endpoint(task.taskId,"/turn"):API,body,agentId:selectedAgent,
      taskId:task?.taskId || null,...submissionScope() });
    await sendSubmission(false);
  }
  async function sendSubmission(retry) {
    if (!pending || mutation || inspecting || reconciling || (retry && (!retryReady || polling || !navigator.onLine))) return;
    if (!nativeSubmissionScopeMatches(pending, submissionScope())) {
      retryReady=false;showError(new Error("The original submission belongs to another workspace or sign-in. Refresh status under its original identity."));controls();return;
    }
    const original=pending;
    retryReady=false;mutation=true;readGeneration++;taskRead?.abort();clearTimer();clearError();controls();
    tell(retry ? "Retrying the original submission with the same request identity. Your edited draft will not be sent."
      : "Submitting once. Your draft stays here until Studio acknowledges it.");
    let acknowledged=false;
    try {
      const view=taskView(await apiNativeRequest(original.url,{method:"POST",body:original.body,nativeCsrfToken:original.csrfToken,signal:lifetime.signal}));
      if (!nativeSubmissionAcknowledged(original,view,true)) throw new Error("Studio returned a different admission. The original submission is still unconfirmed; refresh its status.");
      acknowledged=true;
      if (disposed) return;
      // Settle the exact acknowledgement before any subsequent setup or polling can fail.
      confirmSubmission(view,true);
      if (original.kind === "create") await selectTask(view); else { receive(view); await poll(); }
    } catch(error) {
      if (pending===original && definiteNativeSubmissionRefusal(error,retry)) { pending=null;retryReady=false; }
      showError(error);tell(acknowledged ? "Submission recorded, but setup or status refresh failed. Refresh status to see its outcome; no request was repeated."
        : pending ? "Submission outcome unknown. Use Refresh status to find the original request; no automatic retry will run."
        : "Submission refused. Your draft is preserved; refresh setup or task status before trying again.");
    } finally { mutation=false;controls();schedule(); }
  }
  listen(el("nativeTaskSetup"),"submit",event=>{event.preventDefault();clearError();if(task){void refresh().catch(showError);return;}selectedAgent=el("nativeTaskAgent").value.trim()||"default";void inspect(selectedAgent).then(list).then(()=>tell("Setup checked. Choose your provider and task.")).catch(showError);});
  for (const id of ["nativeTaskProvider","nativeTaskModel","nativeTaskTools"]) listen(el(id),"input",controls);
  listen(el("nativeTaskValidationSetup"),"change",event=>{
    const checkbox=event.target.closest("[data-native-validation-id]");if(!checkbox || task || mutation || pending || checkbox.disabled)return;
    selectedChecks=[...el("nativeTaskValidationSetup").querySelectorAll("[data-native-validation-id]:checked")].map(node=>node.dataset.nativeValidationId);
    selectedChecksDigest=config.validation.configSha256;controls();
  });
  listen(el("nativeTaskTools"),"change",()=>{if(!task && el("nativeTaskTools").value === "none") { selectedChecks=[];controls(); }});
  listen(el("nativeTaskPromptForm"),"submit",event=>{event.preventDefault();void submit();});
  listen(el("nativeTaskRetry"),"click",()=>{void sendSubmission(true);});
  listen(el("nativeTaskPrompt"),"keydown",event=>{if(event.key==="Enter"&&(event.ctrlKey||event.metaKey)){event.preventDefault();void submit();}});
  listen(el("nativeTaskRefresh"),"click",()=>{void refresh().catch(showError);});
  for(const [id,action] of [["nativeTaskCancel","cancel"],["nativeTaskRelease","release"],["nativeTaskResume","resume"],["nativeTaskVerify","verify"],["nativeTaskArchive","archive"]]) listen(el(id),"click",()=>{void mutate(action);});
  listen(el("nativeTaskIncludeArchived"),"change",()=>{if(!mutation&&!pending&&!inspecting)void list().catch(showError);});
  listen(el("nativeTaskNewMessages"),"click",()=>{el("nativeTaskTranscript").lastElementChild?.scrollIntoView({block:"nearest"});el("nativeTaskNewMessages").hidden=true;});
  listen(el("nativeTaskNew"),"click",()=>{if(pending||mutation||ACTIVE.has(task?.state))return;clearTimer();readGeneration++;taskRead?.abort();task=null;selectedChecks=[];selectedChecksDigest=config?.validation.configSha256 ?? null;cursor=0;readPaused=false;el("nativeTaskTranscript").replaceChildren();updateUrl(null);project();tell("Choose the next task. Previous tasks remain available in Your tasks.");});
  listen(el("nativeTaskList"),"click",event=>{const button=event.target.closest("[data-native-task-id]");if(!button||mutation||pending)return;const view=tasks.find(item=>item.taskId===button.dataset.nativeTaskId);if(view)void selectTask(view).catch(showError);});
  const dispose=()=>{if(disposed)return;disposed=true;pending=null;clearTimer();taskRead?.abort();lifetime.abort();mounts.delete(root);};mounts.set(root,dispose);listen(window,"pagehide",dispose);
  listen(window,"offline",()=>{clearTimer();pauseObservation();tell("Connection lost. Task outcome is unknown until Studio confirms it; this view does not stop the task.");controls();});
  listen(window,"online",()=>{tell("Connection restored. Refresh status before another action.");controls();});
  try {
    const requestedId=new URL(window.location.href).searchParams.get("task");
    await inspect(initialAgent);await list();
    if(requestedId){const existing=tasks.find(item=>item.taskId===requestedId);if(existing)await selectTask(existing);else {const value=await request(endpoint(requestedId),{signal:lifetime.signal});await selectTask(taskView(value.task));}}
    else tell(config.demo?"Demo workspace: run an explicit local demonstration with no tools.":"Choose a provider and task. Setup inspection has not contacted a model.");
  } catch(error){showError(error);tell("Native task setup is unavailable. Correct the reported configuration and choose Check setup.");}
  return dispose;
}
