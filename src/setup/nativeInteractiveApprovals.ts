import { spawn, type ChildProcess } from "node:child_process";
import { resolve } from "node:path";
import { getApprovalInboxItem, type ApprovalInboxItem } from "../approvals/approvalInbox.js";
import { readNativeApprovalActor } from "./nativeApprovalIdentity.js";

export interface NativeApprovalPromptOptions {
  readonly child: ChildProcess; readonly workspace: string; readonly entry: string;
  /** The parent should cancel its readline question when this signal aborts. */
  readonly question: (prompt: string, signal?: AbortSignal) => Promise<string | null>;
  readonly log: (line: string) => void; readonly error: (line: string) => void;
}
interface Raised {
  readonly type: "amc/native-approval-raised"; readonly v: 1;
  readonly agentId: string; readonly approvalId: string; readonly approvalRequestId: string;
}
function raised(value: unknown): value is Raised {
  if (value === null || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return item.type === "amc/native-approval-raised" && item.v === 1 && item.agentId === "default"
    && typeof item.approvalId === "string" && /^apr_[a-f0-9-]{36}$/.test(item.approvalId)
    && typeof item.approvalRequestId === "string" && /^apprreq_[a-f0-9]{32}$/.test(item.approvalRequestId);
}
function loadPending(workspace: string, event: Raised): ApprovalInboxItem {
  const item = getApprovalInboxItem({ workspace, agentId: event.agentId, approvalRequestId: event.approvalRequestId });
  if (item.request.approvalRequestId !== event.approvalRequestId || item.request.agentId !== event.agentId
    || item.request.intentId !== event.approvalId || !item.requestIntegrity.valid || !item.chainIntegrity.valid || !item.contextIntegrity.valid) throw new Error("The queued request does not match this child's actual approval event or does not verify");
  return item;
}

/** IPC-only prompts over actual signed requests. No stdout parsing or injected answerer. */
export function createNativeInteractiveApprovals(options: NativeApprovalPromptOptions): { close(): Promise<void> } {
  const workspace = resolve(options.workspace), entry = resolve(options.entry);
  let closed = false, channelLost = false, promptAbort: AbortController | null = null, tokenFile: string | null = null;
  let decisionChild: ChildProcess | null = null, decisionDone: Promise<void> | null = null;
  let pending = 0, queue = Promise.resolve(), closing: Promise<void> | null = null;
  const seen = new Set<string>();
  const queuedRequests = new Map<string, Raised>();
  const cancelTurn = () => {
    if (options.child.exitCode === null && options.child.signalCode === null) options.child.kill("SIGINT");
  };
  const ask = (prompt: string, signal: AbortSignal): Promise<string | null> => {
    if (closed || signal.aborted) return Promise.resolve(null);
    return new Promise(resolveAnswer => {
      let settled = false;
      const finish = (answer: string | null) => {
        if (settled) return; settled = true; signal.removeEventListener("abort", aborted); resolveAnswer(answer);
      };
      const aborted = () => finish(null);
      signal.addEventListener("abort", aborted, { once: true });
      Promise.resolve().then(() => options.question(prompt, signal)).then(answer => finish(answer), () => finish(null));
    });
  };
  const decide = (args: string[], signal: AbortSignal): Promise<boolean> => {
    if (closed || signal.aborted) return Promise.resolve(false);
    let resolveDone!: () => void;
    decisionDone = new Promise<void>(done => { resolveDone = done; });
    return new Promise(resolveDecision => {
      let processError = false, outputBytes = 0;
      let child: ChildProcess;
      try {
        child = spawn(process.execPath, [...process.execArgv, entry, ...args], {
          cwd: workspace, env: process.env, shell: false, stdio: ["ignore", "pipe", "pipe"]
        });
      } catch { decisionDone = null; resolveDone(); resolveDecision(false); return; }
      decisionChild = child;
      let force: NodeJS.Timeout | undefined;
      const stop = () => {
        child.kill("SIGTERM");
        force ??= setTimeout(() => child.kill("SIGKILL"), 1_000);
      };
      signal.addEventListener("abort", stop, { once: true });
      const timeout = setTimeout(stop, 30_000);
      // Output is never interpreted as a decision or rendered as terminal controls.
      const consume = (chunk: Buffer) => { outputBytes += chunk.byteLength; if (outputBytes > 256 * 1024) { processError = true; stop(); } };
      child.stdout?.on("data", consume); child.stderr?.on("data", consume);
      child.once("error", () => { processError = true; });
      child.once("close", code => {
        clearTimeout(timeout); if (force) clearTimeout(force); signal.removeEventListener("abort", stop);
        if (decisionChild === child) { decisionChild = null; decisionDone = null; }
        resolveDone(); resolveDecision(!closed && !signal.aborted && !processError && code === 0);
      });
    });
  };
  const handle = async (event: Raised): Promise<void> => {
    if (closed || channelLost) return;
    const item = loadPending(workspace, event);
    if (item.status !== "PENDING") { options.log(`Approval ${event.approvalRequestId} is already ${item.status}; no decision requested.`); return; }
    const controller = new AbortController(); promptAbort = controller;
    const expiry = setTimeout(() => controller.abort(), Math.max(0, Math.min(2_147_483_647, item.request.expiresTs - Date.now())));
    try {
      const request = item.request;
      options.log("Actual signed approval request:\n" + JSON.stringify({ approvalRequestId: request.approvalRequestId,
        requestDigestSha256: item.requestDigestSha256, tool: request.toolName, actionClass: request.actionClass,
        riskTier: request.riskTier, requestedMode: request.requestedMode, effectiveMode: request.effectiveMode,
        quorum: item.quorum, rolesAllowed: request.rolesAllowed, expiresAt: new Date(request.expiresTs).toISOString(),
        boundHashes: request.boundHashes }, null, 2));
      options.log("The inbox binds tool arguments by digest; it does not store their text. Cancel if you cannot establish the intended scope from the recorded task.");
      const choice = await ask("Approval: approve, deny, or cancel this turn (no default): ", controller.signal);
      if (channelLost) return;
      if (choice === null || choice.trim().toLowerCase() === "cancel") { cancelTurn(); return; }
      const decision = choice.trim().toLowerCase();
      if (decision !== "approve" && decision !== "deny") { options.error("No explicit approve/deny decision received; cancelling this turn."); cancelTurn(); return; }
      if (tokenFile === null) {
        const path = await ask("Path to an existing private tracked workspace session token file (not the token; blank cancels): ", controller.signal);
        if (channelLost) return;
        if (!path?.trim()) { options.error("An authenticated reviewer session is required. Configure workspace login before approving; no identity was invented."); cancelTurn(); return; }
        tokenFile = resolve(workspace, path.trim());
      }
      const actor = readNativeApprovalActor(workspace, tokenFile);
      if (!actor.roles.some(role => request.rolesAllowed.includes(role))) throw new Error("Your authenticated roles are not allowed to decide this request");
      options.log(`Reviewer ${JSON.stringify(actor.username)}; authenticated roles ${actor.roles.join(", ")}. Required distinct-user quorum remains in force.`);
      const reason = await ask(`Reason to ${decision} this exact request (required, up to 1000 characters): `, controller.signal);
      if (channelLost) return;
      if (reason === null || !reason.trim() || reason.trim().length > 1000) { options.error("No valid decision reason received; cancelling this turn."); cancelTurn(); return; }
      if (closed || controller.signal.aborted) { cancelTurn(); return; }
      const current = loadPending(workspace, event);
      if (current.status !== "PENDING" || current.requestDigestSha256 !== item.requestDigestSha256) throw new Error("The approval changed while you were reviewing it; no decision sent");
      const args = ["approvals", decision, "--agent", request.agentId,
        ...(decision === "approve" ? ["--mode", request.effectiveMode.toLowerCase()] : []),
        "--reason", reason.trim(), "--username", actor.username, "--roles", actor.roles.join(","), "--user-id", actor.userId,
        "--session-token-file", tokenFile, "--expect-request-digest", item.requestDigestSha256, "--", request.approvalRequestId];
      const completed = await decide(args, controller.signal);
      if (closed) return;
      const after = loadPending(workspace, event);
      const kind = decision === "deny" ? "DENY" : request.effectiveMode === "EXECUTE" ? "APPROVE_EXECUTE" : "APPROVE_SIMULATE";
      const signed = after.decisions.find(row => !item.decisions.some(old => old.approvalDecisionId === row.approvalDecisionId)
        && row.userId === actor.userId && row.username === actor.username && row.decision === kind
        && row.requestDigestSha256 === item.requestDigestSha256);
      if (!completed || !signed) {
        options.error(signed ? "The decision is recorded, but its command did not complete cleanly. No retry was sent; inspect approval delivery." : "No matching signed decision was confirmed. No approval or successful execution is claimed.");
        cancelTurn(); return;
      }
      options.log(`Signed ${decision} decision ${signed.approvalDecisionId}; request status ${after.status}, quorum ${after.quorum.received}/${after.quorum.required}.`);
      if (after.status === "PENDING") options.log("More approval is required. Another eligible reviewer can use the existing approvals CLI; this terminal does not manufacture additional identities. Ctrl-C cancels the turn.");
    } finally {
      clearTimeout(expiry); controller.abort(); if (promptAbort === controller) promptAbort = null;
    }
  };
  const onMessage = (value: unknown) => {
    if (closed || channelLost) return;
    if (!raised(value)) {
      if (value !== null && typeof value === "object" && (value as { type?: unknown }).type === "amc/native-approval-raised") {
        options.error("Native approval IPC had an invalid request identity; cancelling the turn."); cancelTurn();
      }
      return;
    }
    if (seen.has(value.approvalRequestId)) return;
    if (seen.size >= 128 || pending >= 8) { options.error("Native approval prompt queue exceeded its bound; cancelling the turn."); cancelTurn(); return; }
    seen.add(value.approvalRequestId); queuedRequests.set(value.approvalRequestId, value); pending++;
    queue = queue.then(() => handle(value)).catch(error => {
      if (!closed) { options.error(`Native approval review refused: ${JSON.stringify(error instanceof Error ? error.message.slice(0, 600) : "request or identity unavailable")}. No decision was invented.`); cancelTurn(); }
    }).finally(() => { pending--; });
  };
  const onClose = () => { void close(); };
  const onDisconnect = () => {
    if (closed) return;
    channelLost = true;
    // Node disconnects IPC during ordinary child exit, before `close` and often
    // before exitCode is visible. The signed queue, not event timing, tells us
    // whether a reviewer decision is still outstanding.
    let unfinished = false;
    for (const event of queuedRequests.values()) {
      try { unfinished ||= loadPending(workspace, event).status === "PENDING"; }
      catch { unfinished = true; }
    }
    if (unfinished) {
      options.error("Native approval IPC closed with an undecided or unverified request; cancelling the turn.");
      promptAbort?.abort(); cancelTurn();
    } else if (decisionChild === null) promptAbort?.abort();
    // Do not kill a completed decision's delivery child merely because its
    // asking process is exiting normally. Actual close owns final disposal.
  };
  const close = (): Promise<void> => {
    if (closing) return closing;
    closed = true; options.child.removeListener("message", onMessage); options.child.removeListener("close", onClose); options.child.removeListener("disconnect", onDisconnect);
    if (promptAbort !== null) { promptAbort.abort(); cancelTurn(); }
    const child = decisionChild, done = decisionDone;
    closing = (async () => {
      if (child && done) {
        child.kill("SIGTERM");
        const force = setTimeout(() => child.kill("SIGKILL"), 1_000);
        try { await done; } finally { clearTimeout(force); }
      }
      await queue;
    })();
    return closing;
  };
  options.child.on("message", onMessage); options.child.once("close", onClose); options.child.once("disconnect", onDisconnect);
  return { close };
}
