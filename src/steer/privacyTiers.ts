/**
 * Privacy Tiers — Zero-content telemetry (AMC-431)
 *
 * Configurable privacy levels that control what telemetry data
 * leaves the agent boundary. Ensures AMC can score without ever
 * seeing raw prompts or responses when configured for max privacy.
 *
 * Tiers:
 *  - full: all content, all metadata (dev/staging)
 *  - redacted: metadata + hashed content + scores (production default)
 *  - zero: scores + structural metadata only, zero content (regulated/sensitive)
 */

import { createHash } from "node:crypto";

// ── Types ──────────────────────────────────────────────────────────────────

export type PrivacyTier = "full" | "redacted" | "zero";

export interface TelemetryEvent {
  eventId: string;
  agentId: string;
  timestamp: number;
  eventType: string;
  // Content fields — subject to privacy filtering
  prompt?: string;
  response?: string;
  systemPrompt?: string;
  // Structural metadata — always included
  model?: string;
  providerId?: string;
  latencyMs?: number;
  tokenCount?: number;
  // Score metadata — always included
  microScore?: number;
  dimensions?: Record<string, number>;
  // Custom metadata
  metadata?: Record<string, unknown>;
}

export interface SanitizedTelemetryEvent {
  eventId: string;
  agentId: string;
  timestamp: number;
  eventType: string;
  // Content — depends on tier
  prompt?: string;
  promptHash?: string;
  response?: string;
  responseHash?: string;
  systemPrompt?: string;
  systemPromptHash?: string;
  // Structural — always present
  model?: string;
  providerId?: string;
  latencyMs?: number;
  tokenCount?: number;
  promptLength?: number;
  responseLength?: number;
  // Scores — always present
  microScore?: number;
  dimensions?: Record<string, number>;
  // Privacy metadata
  privacyTier: PrivacyTier;
  redactedFields?: string[];
}

export interface PrivacyConfig {
  tier: PrivacyTier;
  /** Custom fields to always redact regardless of tier */
  alwaysRedact?: string[];
  /** Hash algorithm for redacted tier (default sha256) */
  hashAlgorithm?: string;
  /** Salt for content hashing (prevents rainbow attacks) */
  hashSalt?: string;
}

// ── Content hashing ────────────────────────────────────────────────────────

function hashContent(
  content: string,
  algorithm: string,
  salt: string,
): string {
  return createHash(algorithm)
    .update(salt + content)
    .digest("hex")
    .slice(0, 16); // truncated hash — enough for correlation, not reversible
}

// ── Sanitization ───────────────────────────────────────────────────────────

const CONTENT_FIELDS = ["prompt", "response", "systemPrompt"] as const;

/**
 * Sanitize a telemetry event according to the privacy tier.
 */
export function sanitizeTelemetryEvent(
  event: TelemetryEvent,
  config: PrivacyConfig,
): SanitizedTelemetryEvent {
  const algorithm = config.hashAlgorithm ?? "sha256";
  const salt = config.hashSalt ?? "amc-privacy-salt";
  const redactedFields: string[] = [];

  const result: SanitizedTelemetryEvent = {
    eventId: event.eventId,
    agentId: event.agentId,
    timestamp: event.timestamp,
    eventType: event.eventType,
    model: event.model,
    providerId: event.providerId,
    latencyMs: event.latencyMs,
    tokenCount: event.tokenCount,
    microScore: event.microScore,
    dimensions: event.dimensions,
    privacyTier: config.tier,
  };

  // Add content lengths regardless of tier
  if (event.prompt !== undefined) {
    result.promptLength = event.prompt.length;
  }
  if (event.response !== undefined) {
    result.responseLength = event.response.length;
  }

  switch (config.tier) {
    case "full":
      result.prompt = event.prompt;
      result.response = event.response;
      result.systemPrompt = event.systemPrompt;
      break;

    case "redacted":
      for (const field of CONTENT_FIELDS) {
        const value = event[field];
        if (value !== undefined) {
          const hashKey = `${field}Hash` as keyof SanitizedTelemetryEvent;
          (result as unknown as Record<string, unknown>)[hashKey] = hashContent(
            value,
            algorithm,
            salt,
          );
          redactedFields.push(field);
        }
      }
      break;

    case "zero":
      for (const field of CONTENT_FIELDS) {
        if (event[field] !== undefined) {
          redactedFields.push(field);
        }
      }
      break;
  }

  // Always-redact overrides
  if (config.alwaysRedact) {
    for (const field of config.alwaysRedact) {
      if (field in result) {
        delete (result as unknown as Record<string, unknown>)[field];
        if (!redactedFields.includes(field)) {
          redactedFields.push(field);
        }
      }
    }
  }

  if (redactedFields.length > 0) {
    result.redactedFields = redactedFields;
  }

  return result;
}

/**
 * Validate that a sanitized event conforms to its declared privacy tier.
 * Returns a list of violations (empty = compliant).
 */
export function validatePrivacyCompliance(
  event: SanitizedTelemetryEvent,
): string[] {
  const violations: string[] = [];

  if (event.privacyTier === "zero") {
    if (event.prompt) violations.push("zero-tier event contains prompt");
    if (event.response) violations.push("zero-tier event contains response");
    if (event.systemPrompt)
      violations.push("zero-tier event contains systemPrompt");
    if (event.promptHash)
      violations.push("zero-tier event contains promptHash");
    if (event.responseHash)
      violations.push("zero-tier event contains responseHash");
  }

  if (event.privacyTier === "redacted") {
    if (event.prompt) violations.push("redacted-tier event contains raw prompt");
    if (event.response)
      violations.push("redacted-tier event contains raw response");
    if (event.systemPrompt)
      violations.push("redacted-tier event contains raw systemPrompt");
  }

  return violations;
}
