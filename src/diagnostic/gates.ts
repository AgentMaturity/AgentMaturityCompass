import type { EvidenceEvent, Gate, TrustTier } from "../types.js";
import { dayKey } from "../utils/time.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const EVIDENCE_STALE_AFTER_MS = 90 * DAY_MS;

export interface ParsedEvidenceEvent extends EvidenceEvent {
  meta: Record<string, unknown>;
  text: string;
  trustTier: TrustTier;
}

function degradeTrustTierForStaleness(trustTier: TrustTier): TrustTier {
  switch (trustTier) {
    case "OBSERVED_HARDENED":
      return "OBSERVED";
    case "OBSERVED":
      return "ATTESTED";
    case "ATTESTED":
      return "SELF_REPORTED";
    case "SELF_REPORTED":
    default:
      return "SELF_REPORTED";
  }
}

function trustTierFromMeta(meta: Record<string, unknown>): TrustTier {
  if (
    meta.trustTier === "OBSERVED" ||
    meta.trustTier === "OBSERVED_HARDENED" ||
    meta.trustTier === "ATTESTED" ||
    meta.trustTier === "SELF_REPORTED"
  ) {
    return meta.trustTier;
  }
  return "SELF_REPORTED";
}

export function parseEvidenceEvent(event: EvidenceEvent): ParsedEvidenceEvent {
  let meta: Record<string, unknown> = {};
  try {
    meta = JSON.parse(event.meta_json) as Record<string, unknown>;
  } catch {
    meta = {};
  }

  const baselineTrustTier = trustTierFromMeta(meta);
  const staleEvidence =
    Number.isFinite(event.ts) && event.ts > 0 && Date.now() - event.ts > EVIDENCE_STALE_AFTER_MS;
  const trustTier = staleEvidence ? degradeTrustTierForStaleness(baselineTrustTier) : baselineTrustTier;

  const text = event.payload_inline ?? "";
  return {
    ...event,
    meta,
    text,
    trustTier
  };
}

function compileRegex(pattern: string): RegExp {
  try {
    return new RegExp(pattern, "i");
  } catch {
    return new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
  }
}

export interface GateEvaluation {
  pass: boolean;
  matchedEventIds: string[];
  reason: string;
  distinctSessions: number;
  distinctDays: number;
}

export function evaluateGate(gate: Gate, events: ParsedEvidenceEvent[]): GateEvaluation {
  const acceptedTrustTiers: TrustTier[] =
    gate.acceptedTrustTiers && gate.acceptedTrustTiers.length > 0
      ? gate.acceptedTrustTiers
      : gate.requiredTrustTier
        ? [gate.requiredTrustTier]
        : ["OBSERVED", "ATTESTED", "SELF_REPORTED"];
  const accepted = new Set<TrustTier>(acceptedTrustTiers);
  if (accepted.has("OBSERVED")) {
    accepted.add("OBSERVED_HARDENED");
  }

  const trustFilteredEvents = events.filter((event) => accepted.has(event.trustTier));
  const typedEvents = gate.requiredEvidenceTypes.length
    ? trustFilteredEvents.filter((event) => gate.requiredEvidenceTypes.includes(event.event_type))
    : trustFilteredEvents;

  const eventCountOk = typedEvents.length >= gate.minEvents;
  const distinctSessions = new Set(typedEvents.map((event) => event.session_id)).size;
  const sessionsOk = distinctSessions >= gate.minSessions;
  const distinctDays = new Set(typedEvents.map((event) => dayKey(event.ts))).size;
  const daysOk = distinctDays >= gate.minDistinctDays;

  const includeChecks: boolean[] = [];

  if (gate.mustInclude.textRegex && gate.mustInclude.textRegex.length > 0) {
    for (const pattern of gate.mustInclude.textRegex) {
      const re = compileRegex(pattern);
      includeChecks.push(trustFilteredEvents.some((event) => re.test(event.text)));
    }
  }

  if (gate.mustInclude.metaKeys && gate.mustInclude.metaKeys.length > 0) {
    for (const key of gate.mustInclude.metaKeys) {
      includeChecks.push(trustFilteredEvents.some((event) => Object.prototype.hasOwnProperty.call(event.meta, key)));
    }
  }

  if (gate.mustInclude.artifactPatterns && gate.mustInclude.artifactPatterns.length > 0) {
    for (const pattern of gate.mustInclude.artifactPatterns) {
      const re = compileRegex(pattern);
      includeChecks.push(
        trustFilteredEvents.some((event) => (event.payload_path ?? "").length > 0 && re.test(event.payload_path ?? ""))
      );
    }
  }

  if (gate.mustInclude.metricKeys && gate.mustInclude.metricKeys.length > 0) {
    for (const metric of gate.mustInclude.metricKeys) {
      includeChecks.push(
        trustFilteredEvents.some(
          (event) =>
            event.event_type === "metric" &&
            typeof event.meta.metricKey === "string" &&
            event.meta.metricKey.toLowerCase() === metric.toLowerCase()
        )
      );
    }
  }

  if (gate.mustInclude.auditTypes && gate.mustInclude.auditTypes.length > 0) {
    for (const auditType of gate.mustInclude.auditTypes) {
      includeChecks.push(
        trustFilteredEvents.some(
          (event) =>
            event.event_type === "audit" &&
            typeof event.meta.auditType === "string" &&
            event.meta.auditType.toLowerCase() === auditType.toLowerCase()
        )
      );
    }
  }

  const includeOk = includeChecks.every(Boolean);

  let requiredTrustTierOk = true;
  if (gate.requiredTrustTier) {
    if (gate.requiredTrustTier === "OBSERVED") {
      requiredTrustTierOk = typedEvents.some(
        (event) => event.trustTier === "OBSERVED" || event.trustTier === "OBSERVED_HARDENED"
      );
    } else {
      requiredTrustTierOk = typedEvents.some((event) => event.trustTier === gate.requiredTrustTier);
    }
  }

  const excludeChecks: boolean[] = [];

  if (gate.mustNotInclude.auditTypes && gate.mustNotInclude.auditTypes.length > 0) {
    for (const auditType of gate.mustNotInclude.auditTypes) {
      const found = trustFilteredEvents.some(
        (event) =>
          event.event_type === "audit" &&
          typeof event.meta.auditType === "string" &&
          event.meta.auditType.toLowerCase() === auditType.toLowerCase()
      );
      excludeChecks.push(!found);
    }
  }

  if (gate.mustNotInclude.textRegex && gate.mustNotInclude.textRegex.length > 0) {
    for (const pattern of gate.mustNotInclude.textRegex) {
      const re = compileRegex(pattern);
      excludeChecks.push(!trustFilteredEvents.some((event) => re.test(event.text)));
    }
  }

  const excludeOk = excludeChecks.every(Boolean);

  const pass = eventCountOk && sessionsOk && daysOk && includeOk && excludeOk && requiredTrustTierOk;

  return {
    pass,
    matchedEventIds: typedEvents.map((event) => event.id),
    reason: pass
      ? `gate level ${gate.level} satisfied`
      : `failed gate ${gate.level}: events=${typedEvents.length}/${gate.minEvents}, sessions=${distinctSessions}/${gate.minSessions}, days=${distinctDays}/${gate.minDistinctDays}`,
    distinctSessions,
    distinctDays
  };
}
