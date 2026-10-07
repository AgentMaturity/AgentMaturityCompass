import { effectiveTrustTier, producerOfMeta, readerTrustList } from "../claims/evidenceProvenance.js";
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

export function parseEvidenceEvent(event: EvidenceEvent): ParsedEvidenceEvent {
  let meta: Record<string, unknown> = {};
  try {
    meta = JSON.parse(event.meta_json) as Record<string, unknown>;
  } catch {
    meta = {};
  }

  // P0-18: the tier comes from provenance, not from the row. Synthetic rows read SELF_REPORTED here and evaluateGate
  // drops them.
  const baselineTrustTier = effectiveTrustTier(event, { trustList: readerTrustList }) ?? "SELF_REPORTED";
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

const regexCache = new Map<string, RegExp>();

function compileRegex(pattern: string): RegExp {
  let re = regexCache.get(pattern);
  if (re) return re;
  try {
    re = new RegExp(pattern, "i");
  } catch {
    re = new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
  }
  regexCache.set(pattern, re);
  return re;
}

export interface GateEvaluation {
  pass: boolean;
  matchedEventIds: string[];
  reason: string;
  distinctSessions: number;
  distinctDays: number;
}

export function evaluateGate(gate: Gate, allEvents: ParsedEvidenceEvent[]): GateEvaluation {
  // Synthetic (seeded or example) evidence never satisfies a gate, at any tier.
  const events = allEvents.filter((event) => producerOfMeta(event.meta) !== "synthetic");
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

  // Each named type must actually be PRESENT, not merely counted.
  //
  // This field used to be a whitelist filter alone: a gate naming
  // [stdout, audit, metric] was satisfied by three stdout events, with audit
  // and metric entirely absent. The name promised a requirement the code did
  // not implement, and the published methodology repeats that promise to users
  // ("Required evidence types for each level"). Changing the behaviour to
  // match the name is a methodology change, and is versioned as one.
  const presentTypes = new Set(typedEvents.map((event) => event.event_type));
  const missingTypes = gate.requiredEvidenceTypes.filter((type) => !presentTypes.has(type));
  const evidenceTypesOk = missingTypes.length === 0;

  const eventCountOk = typedEvents.length >= gate.minEvents;
  const distinctSessions = new Set(typedEvents.map((event) => event.session_id)).size;
  const sessionsOk = distinctSessions >= gate.minSessions;
  const distinctDays = new Set(typedEvents.map((event) => dayKey(event.ts))).size;
  const daysOk = distinctDays >= gate.minDistinctDays;

  /**
   * Requirements that failed, by name.
   *
   * `includeChecks` was an array of anonymous booleans, so a gate could fail
   * with every printed number satisfied and say nothing about why: a run with
   * `events=120/8, sessions=12/3, days=30/3` and no missing types still failed,
   * because an unmet `mustInclude.metaKeys` produced no message at all. A
   * reason that lies by omission costs more than a missing check.
   */
  const unmetRequirements: string[] = [];
  const includeChecks: boolean[] = [];
  const requireInclude = (label: string, ok: boolean): void => {
    includeChecks.push(ok);
    if (!ok) unmetRequirements.push(label);
  };

  if (gate.mustInclude.textRegex && gate.mustInclude.textRegex.length > 0) {
    for (const pattern of gate.mustInclude.textRegex) {
      const re = compileRegex(pattern);
      requireInclude(`text:${pattern}`, trustFilteredEvents.some((event) => re.test(event.text)));
    }
  }

  if (gate.mustInclude.metaKeys && gate.mustInclude.metaKeys.length > 0) {
    for (const key of gate.mustInclude.metaKeys) {
      requireInclude(`metaKey:${key}`, trustFilteredEvents.some((event) => Object.prototype.hasOwnProperty.call(event.meta, key)));
    }
  }

  if (gate.mustInclude.artifactPatterns && gate.mustInclude.artifactPatterns.length > 0) {
    for (const pattern of gate.mustInclude.artifactPatterns) {
      const re = compileRegex(pattern);
      requireInclude(
        `artifact:${pattern}`,
        trustFilteredEvents.some((event) => (event.payload_path ?? "").length > 0 && re.test(event.payload_path ?? ""))
      );
    }
  }

  if (gate.mustInclude.metricKeys && gate.mustInclude.metricKeys.length > 0) {
    for (const metric of gate.mustInclude.metricKeys) {
      requireInclude(
        `metricKey:${metric}`,
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
      requireInclude(
        `auditType:${auditType}`,
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
      if (found) unmetRequirements.push(`forbidden auditType:${auditType}`);
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

  const pass = evidenceTypesOk && eventCountOk && sessionsOk && daysOk && includeOk && excludeOk && requiredTrustTierOk;

  return {
    pass,
    matchedEventIds: typedEvents.map((event) => event.id),
    reason: pass
      ? `gate level ${gate.level} satisfied`
      : `failed gate ${gate.level}: events=${typedEvents.length}/${gate.minEvents}, sessions=${distinctSessions}/${gate.minSessions}, days=${distinctDays}/${gate.minDistinctDays}`
        + (missingTypes.length > 0 ? `, missing evidence types=${missingTypes.join(",")}` : "")
        + (requiredTrustTierOk ? "" : `, no evidence at required trust tier ${gate.requiredTrustTier}`)
        + (unmetRequirements.length > 0 ? `, unmet=${unmetRequirements.join(",")}` : ""),
    distinctSessions,
    distinctDays
  };
}
