import { canonicalize } from "../utils/json.js";
import { sha256Hex } from "../utils/hash.js";

export type HookActionProvider = "claude-code" | "gemini-cli";
export type HookActionIdentitySource = "provider-call-id" | "derived-request-id";

export interface ProviderHookActionIdentity {
  actionId: string;
  correlationSha256: string;
  source: HookActionIdentitySource;
}

const SAFE_ACTION_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;

export function isSafeProviderActionId(value: unknown): value is string {
  return typeof value === "string"
    && value.length >= 1
    && value.length <= 160
    && SAFE_ACTION_ID.test(value);
}

export function providerHookCorrelationSha256(input: {
  provider: HookActionProvider;
  sessionId?: string | null;
  toolName: string;
  toolInput?: unknown;
}): string {
  return sha256Hex(canonicalize({
    schemaVersion: "2026-07-11",
    provider: input.provider,
    sessionIdSha256: input.sessionId
      ? sha256Hex(`${input.provider}:${input.sessionId}`)
      : null,
    toolNameSha256: sha256Hex(input.toolName),
    toolInputSha256: sha256Hex(canonicalize(input.toolInput ?? null)),
  }));
}

export function resolveProviderHookRequestIdentity(input: {
  provider: HookActionProvider;
  providerActionId?: string | null;
  sessionId?: string | null;
  timestamp?: string | null;
  toolName: string;
  toolInput?: unknown;
  rawInputSha256: string;
}): ProviderHookActionIdentity {
  const provided = isSafeProviderActionId(input.providerActionId)
    ? input.providerActionId
    : null;
  return {
    actionId: provided ?? `action_${sha256Hex(canonicalize({
      provider: input.provider,
      session: input.sessionId ?? null,
      timestamp: input.timestamp ?? null,
      rawInputSha256: input.rawInputSha256,
    })).slice(0, 32)}`,
    correlationSha256: providerHookCorrelationSha256(input),
    source: provided ? "provider-call-id" : "derived-request-id",
  };
}
