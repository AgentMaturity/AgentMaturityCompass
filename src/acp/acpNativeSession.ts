import { openAgentSession, resumeAgentSession, type AgentSession, type AgentSessionInit } from "../agent/agentSession.js";
import type { AgentToolset } from "../agent/agentToolset.js";
import { EMPTY_TOOL_SEAM } from "../agent/toolSeam.js";
import { gateToolCallsOnApproval, type ToolApprovalGateOptions } from "../agent/approvalGate.js";
import { ApprovalSeam } from "../approvals/seam/approvalSeam.js";
import type { SessionService } from "../session/sessionService.js";
import type { RecoveryClaimant } from "../session/sessionRecovery.js";
import { mountNativeMcpServer, type MountedNativeMcpServer } from "../mcp/nativeMcpClient.js";
import { NativeMcpConfigError, reviewNativeMcpConfigurations, reviewedNativeMcpApprovalOptions, resolveNativeMcpServer, type LoadedNativeMcpConfiguration } from "../setup/nativeMcpConfig.js";
import { bindNativeMcpResourceStatus, projectNativeResourceStatus, type NativeMcpResourceSource } from "../prompt/context/nativeResourceStatus.js";
import { workspaceSkillRoots } from "../skills/skillTurn.js";
import { ACP_ERROR, AcpFailure } from "./acpErrors.js";

/** Reuse the native pipeline/approval engine and bind extensions to its actual session writer. */
export async function prepareAcpNativeSession(options: {
  readonly session: AgentSessionInit & { readonly sessionId: string };
  readonly claimant?: RecoveryClaimant;
  readonly approval?: ToolApprovalGateOptions;
  readonly mcp?: LoadedNativeMcpConfiguration | readonly LoadedNativeMcpConfiguration[];
  readonly credentialsHome?: string;
  readonly credentialsFile?: string;
  readonly signal: AbortSignal;
  readonly onApprovalRaised: (event: { readonly approvalId: string; readonly approvalRequestId: string; readonly toolCallId: string }) => void;
  /** Recorded on every approval request this session raises (P1-78). */
  readonly initiator: string;
}): Promise<AgentSession> {
  if (options.signal.aborted) throw new Error("Native session preparation was cancelled.");
  // Re-read before composing readiness. No process or session is created merely
  // to discover whether the caller's reviewed MCP-only subset is supported.
  const configs = options.mcp === undefined ? [] : "path" in options.mcp ? [options.mcp] : options.mcp;
  if (configs.length && (!options.approval || options.session.tools !== "workspace")) throw new Error("Native MCP requires explicit workspace tools and signed approvals.");
  const reviewed = options.approval ? reviewNativeMcpConfigurations(configs.map(config => config.path), configs.map(config => config.sha256),
    options.session.workspace, options.approval.actionClass) : [];
  const binding: { value?: { readonly session: SessionService; readonly toolset: AgentToolset | null } } = {};
  const mcpStatus: NativeMcpResourceSource[] = [];
  const init: AgentSessionInit & { sessionId: string } = {
    ...options.session,
    ...(reviewed.length ? { additionalCapabilities: reviewed.flatMap(entry => entry.review.capabilities) } : {}),
    resourceStatus: () => ({
      ...projectNativeResourceStatus({ mcp: mcpStatus, skillRoots: workspaceSkillRoots(options.session.workspace) }),
      extensions: options.session.resourceStatus?.().extensions ?? null
    }),
    // bindTools below gates every call (EMPTY_TOOL_SEAM included) whenever an approval is configured, so the prompt may say so.
    approvalGated: options.approval !== undefined,
    bindTools: context => {
      binding.value = context;
      const inner = context.toolset?.seam ?? EMPTY_TOOL_SEAM;
      if (!options.approval) return inner;
      const approval = new ApprovalSeam({ session: context.session, workspace: options.session.workspace,
        agentId: options.session.agentId, onRaised: options.onApprovalRaised, initiator: options.initiator });
      return gateToolCallsOnApproval(inner, approval, { ...options.approval, ...reviewedNativeMcpApprovalOptions(reviewed) });
    }
  };
  const session = options.claimant ? resumeAgentSession({ ...init, claimant: options.claimant }) : openAgentSession(init);
  const serverLifetime = new AbortController();
  const abortPreparation = () => serverLifetime.abort();
  options.signal.addEventListener("abort", abortPreparation, { once: true });
  const mounts: MountedNativeMcpServer[] = [];
  try {
    if (reviewed.length) {
      const toolset = binding.value?.toolset;
      if (!toolset || !options.approval || options.session.tools !== "workspace") throw new Error("Native MCP requires explicit workspace tools and signed approvals.");
      for (const { config, review } of reviewed) {
        const server = await resolveNativeMcpServer(config.config, { workspace: options.session.workspace,
          ...(options.credentialsHome === undefined ? {} : { credentialsHome: options.credentialsHome }),
          ...(options.credentialsFile === undefined ? {} : { credentialsFile: options.credentialsFile }) });
        if (options.signal.aborted) throw new Error("Native MCP preparation was cancelled.");
        const mount = await mountNativeMcpServer({ server, workspace: options.session.workspace, agentId: options.session.agentId,
          toolset, ...review, signal: serverLifetime.signal });
        mounts.push(mount);
        mcpStatus.push(bindNativeMcpResourceStatus(mount, toolset.registry, options.session.agentId));
      }
    }
    if (options.signal.aborted) throw new Error("Native session preparation was cancelled.");
  } catch (error) {
    serverLifetime.abort();
    await Promise.allSettled(mounts.map(mount => mount.close()));
    try { if (options.claimant) await session.release?.(); else await session.close(); } catch { /* evidence remains authoritative */ }
    // A reviewed config refused while mounting (credential, OAuth) keeps its stable code: the client
    // gets the same coded refusal as at startup review, not a generic internal fault.
    if (error instanceof NativeMcpConfigError) throw new AcpFailure(ACP_ERROR.startupRefused, error.message, { reason: error.code });
    throw error;
  } finally { options.signal.removeEventListener("abort", abortPreparation); }

  let finishing: Promise<void> | undefined;
  const finish = (release: boolean): Promise<void> => {
    if (finishing) return finishing;
    finishing = (async () => {
      serverLifetime.abort();
      const closed = await Promise.allSettled(mounts.map(mount => mount.close()));
      // Registry removal precedes teardown; no extension can keep issuing
      // pipeline calls after the session writer is sealed or released.
      if (release) await session.release?.(); else await session.close();
      if (closed.some(result => result.status === "rejected")) throw new Error("Native MCP cleanup did not complete cleanly; inspect the process before reusing this session.");
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
