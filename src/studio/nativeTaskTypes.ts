import type { NativeValidationResult } from "../agent/nativeValidation.js";

/** Browser-safe contract. Workspace, credentials, process and grant selection stay server-owned. */
export type NativeTaskProvider = "stub" | "openai" | "openai-responses" | "anthropic" | "deepseek" | "gemini" | "gemini-audio" | "ollama";
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
  readonly validation?: NativeTaskValidationSelection;
  readonly prompt: string;
  readonly maxSteps?: number;
  readonly maxTokens?: number;
}
/** Original bytes only. Filenames, URLs, paths and caller-supplied commitments are not authority. */
export type NativeTaskInputPart =
  | { readonly type: "text"; readonly text: string }
  | { readonly type: "image"; readonly mimeType: "image/png" | "image/jpeg" | "image/gif" | "image/webp"; readonly data: string }
  | { readonly type: "audio"; readonly mimeType: "audio/wav"; readonly data: string };
export interface NativeTaskStructuredInput {
  readonly format: "amc-image-input@2" | "amc-audio-input@1";
  readonly parts: readonly NativeTaskInputPart[];
}
export type NativeTaskPrompt =
  | { readonly prompt: string; readonly input?: never }
  | { readonly prompt?: never; readonly input: NativeTaskStructuredInput };
/** Keep the historical text-only NativeTaskStart type available to existing callers. */
export type NativeTaskStartRequest = Omit<NativeTaskStart, "prompt"> & NativeTaskPrompt;
export type NativeTaskTurn = NativeTaskPrompt & { readonly clientRequestId: string; readonly expectedRevision: number };
export interface NativeTaskInputCapabilities {
  readonly formats: readonly ("text" | NativeTaskStructuredInput["format"])[];
  readonly imageMimeTypes: readonly string[]; readonly audioMimeTypes: readonly string[];
  readonly maxParts: number; readonly maxImages: number; readonly maxAudios: number;
  readonly maxTextBytes: number; readonly maxSerializedPartsBytes: number; readonly maxPromptFrameBytes: number;
  readonly modelSupport: "not-probed";
}
export interface NativeTaskValidationSelection { readonly configSha256: string; readonly checkIds: readonly string[] }
export interface NativeTaskValidationConfiguration {
  readonly ready: boolean; readonly configSha256: string | null;
  readonly checks: readonly { readonly id: string; readonly title: string }[]; readonly message: string;
}
export interface NativeTaskValidationOutput {
  readonly checkId: string; readonly outputEventId: string; readonly payloadSha256: string;
  readonly status: "available" | "unavailable" | "pruned"; readonly text: string | null;
  readonly truncated: boolean; readonly redacted: boolean; readonly bytes: number | null;
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
    readonly nativeSandbox: { readonly kind: "linux-bwrap" | "os-native"; readonly writableDirectories: readonly string[];
      readonly egress?: { readonly allowHosts: readonly string[] }; readonly readDeny?: readonly string[]; readonly maxProcesses?: number } | null }[];
  readonly message: string;
}
export interface NativeTaskConfiguration {
  readonly schemaVersion: "2026-09-08"; readonly agentId: string; readonly demo: boolean;
  readonly providers: readonly { readonly id: NativeTaskProvider; readonly local: boolean;
    /** `fixed`: the provider pins its own model (stub). `required`: the operator names an accessible model, local servers included. */
    readonly model: "fixed" | "required";
    readonly input?: NativeTaskInputCapabilities;
    readonly credential: { readonly ref: string; readonly configured: boolean; readonly source: "env" | "file" | null } | null }[];
  readonly scope: NativeTaskToolScope; readonly limits: NativeTaskLimits;
  readonly validation: NativeTaskValidationConfiguration;
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
  /** Metadata derived from authenticated original payload bytes, not a draft or an upload receipt. */
  readonly attachment?: { readonly type: "image" | "audio"; readonly mimeType: string; readonly byteLength: number; readonly sha256: string };
  /** Output comes from the native authenticated committed-row projector; full verification is separate. */
  readonly evidence: "committed";
}
export interface NativeTaskHistory {
  readonly status: "not-started" | "authenticated" | "unavailable";
  readonly backend: "sqlite" | "jsonl" | null;
  readonly headEventHash: string | null;
  readonly eventCount: number;
  /** Metadata authentication is not a full run-verification or payload-access grant. */
  readonly message: string;
}
export interface NativeTaskView {
  readonly taskId: string; readonly sessionId: string | null; readonly agentId: string;
  readonly revision: number; readonly clientRequestId: string; readonly lastClientRequestId: string;
  readonly provider: NativeTaskProvider; readonly model: string | null; readonly tools: "none" | "workspace";
  readonly toolsDigest: string | null;
  readonly validationSelection: NativeTaskValidationSelection | null;
  readonly validation: NativeValidationResult;
  readonly validationOutputs: readonly NativeTaskValidationOutput[];
  readonly maxSteps: number; readonly maxTokens: number;
  readonly state: NativeTaskState; readonly createdAt: number; readonly updatedAt: number;
  readonly archived: boolean;
  readonly turnEndReason: string | null; readonly error: string | null;
  readonly verification: "not-verified" | "workspace-key-consistency" | "externally-anchored" | "failed";
  readonly approvals: readonly NativeTaskApproval[]; readonly approvalError: string | null;
  readonly nextCursor: number; readonly firstCursor: number; readonly droppedEvents: number;
  readonly canResume: boolean;
  readonly resumeBlockedReason: string | null;
  /** Read-only eligibility, not an ownership grant or a completed recovery. */
  readonly recovery?: { readonly eligible: boolean; readonly state: "ready" | "interrupted" | "blocked"; readonly message: string } | null;
  readonly history: NativeTaskHistory;
}
export interface NativeTaskPoll { readonly task: NativeTaskView; readonly events: readonly NativeTaskEvent[]; readonly truncated: boolean }
export interface NativeTaskService {
  /** Studio's opt-in from its operator environment at start, as the child records it (--unsafe-unconfined-shell); absent means none (P0-06). */
  readonly shellOptIn?: "cli-flag" | null;
  configuration(actor: NativeTaskActor): Promise<NativeTaskConfiguration>;
  list(actor: NativeTaskActor, includeArchived?: boolean): readonly NativeTaskView[];
  start(actor: NativeTaskActor, input: NativeTaskStartRequest): Promise<NativeTaskView>;
  poll(actor: NativeTaskActor, taskId: string, cursor?: number): NativeTaskPoll;
  turn(actor: NativeTaskActor, taskId: string, input: NativeTaskTurn): Promise<NativeTaskView>;
  cancel(actor: NativeTaskActor, taskId: string, expectedRevision: number): NativeTaskView;
  release(actor: NativeTaskActor, taskId: string, expectedRevision: number): Promise<NativeTaskView>;
  resume(actor: NativeTaskActor, taskId: string, expectedRevision: number): Promise<NativeTaskView>;
  verify(actor: NativeTaskActor, taskId: string, expectedRevision: number): Promise<NativeTaskView>;
  archive(actor: NativeTaskActor, taskId: string, expectedRevision: number): NativeTaskView;
  close(): Promise<void>;
}
