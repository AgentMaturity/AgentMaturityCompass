import { openAgentSession, resumeAgentSession, type AgentSession, type AgentSessionInit } from "../agent/agentSession.js";
import type { AgentToolset } from "../agent/agentToolset.js";
import { EMPTY_TOOL_SEAM } from "../agent/toolSeam.js";
import { gateToolCallsOnApproval, type ToolApprovalGateOptions } from "../agent/approvalGate.js";
import { ApprovalSeam } from "../approvals/seam/approvalSeam.js";
import type { SessionService } from "../session/sessionService.js";
import type { RecoveryClaimant } from "../session/sessionRecovery.js";
import { mountNativeMcpServer, type MountedNativeMcpServer } from "../mcp/nativeMcpClient.js";
import { loadNativeMcpConfiguration, requireReviewedNativeMcpGrants, resolveNativeMcpServer, type LoadedNativeMcpConfiguration } from "../setup/nativeMcpConfig.js";

/** Reuse the native pipeline/approval engine and bind extensions to its actual session writer. */
export async function prepareAcpNativeSession(options: {
  readonly session: AgentSessionInit & { readonly sessionId: string };
  readonly claimant?: RecoveryClaimant;
  readonly approval?: ToolApprovalGateOptions;
  readonly mcp?: LoadedNativeMcpConfiguration;
  readonly credentialsHome?: string;
  readonly credentialsFile?: string;
  readonly signal: AbortSignal;
  readonly onApprovalRaised: (event: { readonly approvalId: string; readonly approvalRequestId: string }) => void;
}): Promise<AgentSession> {
  if (options.signal.aborted) throw new Error("Native session preparation was cancelled.");
  // Re-read before composing readiness. No process or session is created merely
  // to discover whether the caller's reviewed MCP-only subset is supported.
  const reviewed = options.mcp ? loadNativeMcpConfiguration(options.mcp.path, options.mcp.sha256) : undefined;
  if (reviewed && (!options.approval || options.session.tools !== "workspace")) throw new Error("Native MCP requires explicit workspace tools and signed approvals.");
  const grants = reviewed && options.approval ? requireReviewedNativeMcpGrants(reviewed, options.session.workspace, options.approval.actionClass) : undefined;
  const binding: { value?: { readonly session: SessionService; readonly toolset: AgentToolset | null } } = {};
  const init: AgentSessionInit & { sessionId: string } = {
    ...options.session,
    ...(grants ? { additionalCapabilities: grants.capabilities } : {}),
    bindTools: context => {
      binding.value = context;
      const inner = context.toolset?.seam ?? EMPTY_TOOL_SEAM;
      if (!options.approval) return inner;
      const approval = new ApprovalSeam({ session: context.session, workspace: options.session.workspace,
        agentId: options.session.agentId, onRaised: options.onApprovalRaised });
      return gateToolCallsOnApproval(inner, approval, options.approval);
    }
  };
  const session = options.claimant ? resumeAgentSession({ ...init, claimant: options.claimant }) : openAgentSession(init);
  const serverLifetime = new AbortController();
  const abortPreparation = () => serverLifetime.abort();
  options.signal.addEventListener("abort", abortPreparation, { once: true });
  let mount: MountedNativeMcpServer | undefined;
  try {
    if (reviewed && grants) {
      const toolset = binding.value?.toolset;
      if (!toolset || !options.approval || options.session.tools !== "workspace") throw new Error("Native MCP requires explicit workspace tools and signed approvals.");
      const server = await resolveNativeMcpServer(reviewed.config, { workspace: options.session.workspace,
        ...(options.credentialsHome === undefined ? {} : { credentialsHome: options.credentialsHome }),
        ...(options.credentialsFile === undefined ? {} : { credentialsFile: options.credentialsFile }) });
      if (options.signal.aborted) throw new Error("Native MCP preparation was cancelled.");
      mount = await mountNativeMcpServer({ server, workspace: options.session.workspace, agentId: options.session.agentId,
        toolset, ...grants, signal: serverLifetime.signal });
    }
    if (options.signal.aborted) throw new Error("Native session preparation was cancelled.");
  } catch (error) {
    serverLifetime.abort();
    try { await mount?.close(); } catch { /* retain startup failure */ }
    try { if (options.claimant) await session.release?.(); else await session.close(); } catch { /* evidence remains authoritative */ }
    throw error;
  } finally { options.signal.removeEventListener("abort", abortPreparation); }

  let finishing: Promise<void> | undefined;
  const finish = (release: boolean): Promise<void> => {
    if (finishing) return finishing;
    finishing = (async () => {
      serverLifetime.abort();
      let cleanupFailed = false;
      try { await mount?.close(); } catch { cleanupFailed = true; }
      // Registry removal precedes teardown; no extension can keep issuing
      // pipeline calls after the session writer is sealed or released.
      if (release) await session.release?.(); else await session.close();
      if (cleanupFailed) throw new Error("Native MCP cleanup did not complete cleanly; inspect the process before reusing this session.");
    })();
    return finishing;
  };
  return { ...session,
    // Tool invocations receive the native turn signal. Cancelling one prompt
    // must not permanently abort the reviewed mount needed by the next prompt.
    // The server lifetime is stopped only by preparation failure or teardown.
    cancel: (cause, by) => { session.cancel(cause, by); },
    close: () => finish(false), release: () => finish(true) };
}
