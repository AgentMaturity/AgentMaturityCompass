/** Browser-safe contract. Workspace, credentials, process and grant selection stay server-owned. */
export type NativeTaskProvider = "stub" | "openai" | "openai-responses" | "anthropic";
export class NativeTaskServiceError extends Error {
  readonly code: string;
  constructor(code: string, readonly statusCode: number, message: string) {
    super(message); this.name = "NativeTaskServiceError"; this.code = code.startsWith("NATIVE_") ? code : `NATIVE_${code}`;
  }
}
export type NativeTaskState = "starting" | "idle" | "running" | "cancel-requested" | "releasing" | "released" | "failed" | "verifying" | "closed";
export interface NativeTaskActor { readonly principalId: string; readonly agentId: string; readonly demo: boolean }
export interface NativeTaskStart {
  readonly clientRequestId: string;
  readonly agentId: string;
  readonly provider: NativeTaskProvider;
  readonly model?: string;
  readonly tools: "none" | "workspace";
  readonly toolsDigest?: string;
  readonly prompt: string;
  readonly maxSteps?: number;
  readonly maxTokens?: number;
}
export interface NativeTaskLimits {
  readonly maxActive: number; readonly maxSteps: number; readonly maxTokens: number;
  readonly turnTimeoutMs: number; readonly idleTimeoutMs: number; readonly lifetimeMs: number;
  readonly maxEvents: number; readonly maxEventBytes: number; readonly maxPromptBytes: number;
}
export interface NativeTaskToolScope {
  readonly ready: boolean; readonly digest: string | null; readonly approvalRequired: true;
  readonly tools: readonly { readonly name: string; readonly actionClass: string;
    readonly paths: readonly string[]; readonly deniedPaths: readonly string[]; readonly hosts: readonly string[]; readonly binaries: readonly string[];
    readonly nativeSandbox: { readonly kind: "linux-bwrap"; readonly writableDirectories: readonly string[] } | null }[];
  readonly message: string;
}
export interface NativeTaskConfiguration {
  readonly schemaVersion: "2026-09-08"; readonly agentId: string; readonly demo: boolean;
  readonly providers: readonly { readonly id: NativeTaskProvider; readonly local: boolean;
    readonly credential: { readonly ref: string; readonly configured: boolean; readonly source: "env" | "file" | null } | null }[];
  readonly scope: NativeTaskToolScope; readonly limits: NativeTaskLimits;
  readonly boundary: string;
}
export interface NativeTaskApproval {
  readonly approvalRequestId: string; readonly requestDigestSha256: string; readonly toolName: string;
  readonly actionClass: string; readonly riskTier: string; readonly status: string;
  readonly required: number; readonly received: number; readonly expiresTs: number;
}
export interface NativeTaskEvent {
  readonly cursor: number; readonly kind: "user" | "assistant" | "tool" | "tool-update" | "plan";
  readonly text: string; readonly toolCallId?: string; readonly status?: string;
  /** Output comes from the native authenticated committed-row projector; full verification is separate. */
  readonly evidence: "committed";
}
export interface NativeTaskView {
  readonly taskId: string; readonly sessionId: string | null; readonly agentId: string;
  readonly revision: number; readonly clientRequestId: string; readonly lastClientRequestId: string;
  readonly provider: NativeTaskProvider; readonly model: string | null; readonly tools: "none" | "workspace";
  readonly toolsDigest: string | null;
  readonly maxSteps: number; readonly maxTokens: number;
  readonly state: NativeTaskState; readonly createdAt: number; readonly updatedAt: number;
  readonly turnEndReason: string | null; readonly error: string | null;
  readonly verification: "not-verified" | "workspace-key-consistency" | "externally-anchored" | "failed";
  readonly approvals: readonly NativeTaskApproval[]; readonly approvalError: string | null;
  readonly nextCursor: number; readonly firstCursor: number; readonly droppedEvents: number;
  readonly canResume: boolean;
}
export interface NativeTaskPoll { readonly task: NativeTaskView; readonly events: readonly NativeTaskEvent[]; readonly truncated: boolean }
export interface NativeTaskService {
  configuration(actor: NativeTaskActor): Promise<NativeTaskConfiguration>;
  list(actor: NativeTaskActor): readonly NativeTaskView[];
  start(actor: NativeTaskActor, input: NativeTaskStart): Promise<NativeTaskView>;
  poll(actor: NativeTaskActor, taskId: string, cursor?: number): NativeTaskPoll;
  turn(actor: NativeTaskActor, taskId: string, input: { readonly prompt: string; readonly clientRequestId: string; readonly expectedRevision: number }): Promise<NativeTaskView>;
  cancel(actor: NativeTaskActor, taskId: string, expectedRevision: number): NativeTaskView;
  release(actor: NativeTaskActor, taskId: string, expectedRevision: number): Promise<NativeTaskView>;
  resume(actor: NativeTaskActor, taskId: string, expectedRevision: number): Promise<NativeTaskView>;
  verify(actor: NativeTaskActor, taskId: string, expectedRevision: number): Promise<NativeTaskView>;
  close(): Promise<void>;
}
