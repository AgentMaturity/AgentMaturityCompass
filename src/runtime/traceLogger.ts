import { canonicalize } from "../utils/json.js";
import type { AMCTraceV1 } from "../correlation/traceSchema.js";
import { sanitizeTelemetryEvent, type PrivacyTier } from "../steer/privacyTiers.js";

const SECRET_REDACTIONS: RegExp[] = [
  /sk-[A-Za-z0-9]{10,}/g,
  /bearer\s+[A-Za-z0-9._-]{10,}/gi,
  /(?:api|secret|token|key)\s*[:=]\s*[A-Za-z0-9._-]{10,}/gi
];

function redactString(value: string): string {
  let redacted = value;
  for (const pattern of SECRET_REDACTIONS) {
    redacted = redacted.replace(pattern, "[REDACTED]");
  }
  return redacted;
}

function redactValue(value: unknown): unknown {
  if (typeof value === "string") {
    return redactString(value);
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item));
  }
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(obj)) {
      out[key] = redactValue(item);
    }
    return out;
  }
  return value;
}

export type TraceInput = Omit<AMCTraceV1, "amc_trace_v" | "ts"> & {
  ts?: number;
};

function getTracePrivacyTier(): PrivacyTier {
  const tier = process.env.AMC_PRIVACY_TIER;
  if (tier === "full" || tier === "redacted" || tier === "zero") {
    return tier;
  }
  return "full";
}

function applyTracePrivacy(payload: AMCTraceV1): AMCTraceV1 {
  const tier = getTracePrivacyTier();
  if (tier === "full") {
    return payload;
  }

  const sanitized = sanitizeTelemetryEvent(
    {
      eventId: payload.request_id ?? `${payload.agentId}:${payload.ts}:${payload.event}`,
      agentId: payload.agentId,
      timestamp: payload.ts,
      eventType: payload.event,
      prompt: payload.note,
      model: payload.model,
      providerId: payload.providerId,
      metadata: {
        request_id: payload.request_id,
        receipt: payload.receipt,
      },
    },
    {
      tier,
      hashSalt: process.env.AMC_PRIVACY_HASH_SALT,
    },
  );

  return {
    ...payload,
    note: sanitized.prompt,
    hashes: {
      ...(payload.hashes ?? {}),
      ...(sanitized.promptHash ? { noteHash: sanitized.promptHash } : {}),
    },
  };
}

export function buildTrace(input: TraceInput): AMCTraceV1 {
  if (!input.agentId || input.agentId.trim().length === 0) {
    throw new Error("Trace input must include non-empty agentId.");
  }
  const payload: AMCTraceV1 = {
    amc_trace_v: 1,
    ts: input.ts ?? Date.now(),
    agentId: input.agentId,
    event: input.event,
    request_id: input.request_id,
    receipt: input.receipt,
    providerId: input.providerId,
    model: input.model,
    note: input.note,
    hashes: input.hashes
  };
  return redactValue(applyTracePrivacy(payload)) as AMCTraceV1;
}

export function stableTraceString(trace: AMCTraceV1): string {
  return canonicalize(trace);
}

export function logTrace(input: TraceInput): AMCTraceV1 {
  const trace = buildTrace(input);
  process.stdout.write(`${stableTraceString(trace)}\n`);
  return trace;
}
