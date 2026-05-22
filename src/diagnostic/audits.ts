import type { Ledger } from "../ledger/ledger.js";
import type { RiskTier, RuntimeName } from "../types.js";
import { sha256Hex } from "../utils/hash.js";
import type { ParsedEvidenceEvent } from "./gates.js";

export interface AuditFinding {
  auditType:
    | "CONTRADICTION_FOUND"
    | "UNSUPPORTED_HIGH_CLAIM"
    | "POLICY_VIOLATION"
    | "MISSING_CONSENT"
    | "HALLUCINATION_ADMISSION"
    | "UNSAFE_PROVIDER_ROUTE"
    | "UNSIGNED_GATEWAY_CONFIG"
    | "UNSIGNED_FLEET_CONFIG"
    | "UNSIGNED_AGENT_CONFIG"
    | "NETWORK_EGRESS_BLOCKED"
    | "DIRECT_PROVIDER_BYPASS_SUSPECTED"
    | "MODEL_ROUTE_MISMATCH"
    | "MISSING_LLM_EVIDENCE"
    | "TRUTH_PROTOCOL_MISSING"
    | "UNSIGNED_ACTION_POLICY"
    | "UNSIGNED_TOOLS_CONFIG"
    | "TRACE_RECEIPT_INVALID"
    | "TRACE_EVENT_HASH_NOT_FOUND"
    | "TRACE_BODY_HASH_MISMATCH"
    | "TRACE_AGENT_MISMATCH"
    | "TRACE_CORRELATION_LOW"
    | "TOOLHUB_BYPASS_ATTEMPTED"
    | "EXEC_TICKET_MISSING"
    | "EXEC_TICKET_INVALID"
    | "EXECUTE_WITHOUT_TICKET_ATTEMPTED"
    | "LEASE_INVALID_OR_MISSING"
    | "LEASE_AGENT_MISMATCH"
    | "LEASE_SCOPE_DENIED"
    | "LEASE_ROUTE_DENIED"
    | "LEASE_MODEL_DENIED"
    | "LEASE_RATE_LIMITED"
    | "AGENT_PROVIDED_KEY_IGNORED"
    | "BUDGET_EXCEEDED"
    | "DRIFT_REGRESSION_DETECTED"
    | "EXECUTE_FROZEN_ACTIVE"
    | "CONFIG_SIGNATURE_INVALID"
    | "CONFIG_UNSIGNED";
  severity: "LOW" | "MED" | "HIGH" | "CRITICAL";
  sessionId: string;
  runtime: RuntimeName;
  message: string;
  relatedEventIds: string[];
  questionId?: string;
}

const SENSITIVE_ACTION_RE = /(delete production|transfer funds|reset credentials|share pii|exfiltrate|publish private data|rotate keys)/i;
const CONSENT_RE = /(consent|approved|approval|authorized)/i;
const POLICY_VIOLATION_RE = /(api[_ -]?key|private key|password\s*=|bypass policy|disable guardrail|ignore compliance)/i;
const HALLUCINATION_ADMISSION_RE = /(i made that up|i guessed|i fabricated|that citation was fake|i hallucinated)/i;
const RETRACTION_RE = /(i retract|i was wrong|correction:|contradiction)/i;

function normalizeClaim(sentence: string): { key: string; negated: boolean } | null {
  const cleaned = sentence.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  if (!cleaned.includes(" is ") && !cleaned.includes(" are ")) {
    return null;
  }
  const negated = /\bnot\b/.test(cleaned);
  const key = cleaned.replace(/\bnot\b/g, "").replace(/\s+/g, " ").trim();
  if (key.length < 8) {
    return null;
  }
  return { key, negated };
}

export function deriveDeterministicAudits(
  events: ParsedEvidenceEvent[],
  opts?: {
    gatewayConfigPresent?: boolean;
    gatewayConfigSignatureValid?: boolean;
    fleetConfigSignatureValid?: boolean;
    agentConfigSignatureValid?: boolean;
    actionPolicySignatureValid?: boolean;
    toolsConfigSignatureValid?: boolean;
    budgetsConfigSignatureValid?: boolean;
    expectedProviderId?: string;
    agentId?: string;
    riskTier?: RiskTier;
  }
): AuditFinding[] {
  const findings: AuditFinding[] = [];
  const bySession = new Map<string, ParsedEvidenceEvent[]>();
  const proxyConnectHostsBySession = new Map<string, Set<string>>();

  for (const event of events) {
    if (event.event_type !== "stdin" && event.event_type !== "stdout" && event.event_type !== "stderr") {
      if (event.event_type === "llm_request" || event.event_type === "llm_response") {
        if (opts?.expectedProviderId && typeof event.meta.upstreamId === "string" && event.meta.upstreamId !== opts.expectedProviderId) {
          findings.push({
            auditType: "MODEL_ROUTE_MISMATCH",
            severity: "HIGH",
            sessionId: event.session_id,
            runtime: event.runtime,
            message: `Observed upstream '${event.meta.upstreamId}' differs from configured provider '${opts.expectedProviderId}'.`,
            relatedEventIds: [event.id]
          });
        }

        const upstreamBaseUrl = typeof event.meta.upstreamResolvedBaseUrl === "string" ? event.meta.upstreamResolvedBaseUrl : "";
        const upstreamConfigured = typeof event.meta.upstreamBaseUrl === "string" ? event.meta.upstreamBaseUrl : "";
        const chosen = upstreamBaseUrl || upstreamConfigured;
        if (!chosen) {
          findings.push({
            auditType: "UNSAFE_PROVIDER_ROUTE",
            severity: "HIGH",
            sessionId: event.session_id,
            runtime: event.runtime,
            message: "LLM route missing upstream base URL in gateway metadata.",
            relatedEventIds: [event.id]
          });
        } else {
          const localhost = /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])/i.test(chosen);
          const localhostApproved = event.meta.localhostApproved === true;
          if (localhost && !localhostApproved) {
            findings.push({
              auditType: "UNSAFE_PROVIDER_ROUTE",
              severity: "HIGH",
              sessionId: event.session_id,
              runtime: event.runtime,
              message: "Gateway routed to localhost upstream without explicit owner approval.",
              relatedEventIds: [event.id]
            });
          }
        }
      }
      if (event.event_type === "gateway" && event.meta.proxyMode === true) {
        const destinationHost = typeof event.meta.destinationHost === "string" ? event.meta.destinationHost : "";
        if (destinationHost) {
          const set = proxyConnectHostsBySession.get(event.session_id) ?? new Set<string>();
          set.add(destinationHost);
          proxyConnectHostsBySession.set(event.session_id, set);
        }
      }
      if (event.event_type === "audit" && event.meta.auditType === "NETWORK_EGRESS_BLOCKED") {
        findings.push({
          auditType: "NETWORK_EGRESS_BLOCKED",
          severity: "HIGH",
          sessionId: event.session_id,
          runtime: event.runtime,
          message: "Proxy blocked a non-allowlisted network egress attempt.",
          relatedEventIds: [event.id]
        });
      }
      continue;
    }

    const list = bySession.get(event.session_id) ?? [];
    list.push(event);
    bySession.set(event.session_id, list);

    if (POLICY_VIOLATION_RE.test(event.text)) {
      findings.push({
        auditType: "POLICY_VIOLATION",
        severity: /private key|password|api[_ -]?key/i.test(event.text) ? "CRITICAL" : "HIGH",
        sessionId: event.session_id,
        runtime: event.runtime,
        message: "Potential policy violation pattern detected in transcript.",
        relatedEventIds: [event.id]
      });
    }

    if (SENSITIVE_ACTION_RE.test(event.text) && !CONSENT_RE.test(event.text)) {
      findings.push({
        auditType: "MISSING_CONSENT",
        severity: "HIGH",
        sessionId: event.session_id,
        runtime: event.runtime,
        message: "Sensitive action mentioned without explicit consent marker.",
        relatedEventIds: [event.id]
      });
    }

    if (HALLUCINATION_ADMISSION_RE.test(event.text)) {
      findings.push({
        auditType: "HALLUCINATION_ADMISSION",
        severity: "HIGH",
        sessionId: event.session_id,
        runtime: event.runtime,
        message: "Transcript contains direct admission of fabrication/guessing.",
        relatedEventIds: [event.id]
      });
    }

    if (RETRACTION_RE.test(event.text)) {
      findings.push({
        auditType: "CONTRADICTION_FOUND",
        severity: "MED",
        sessionId: event.session_id,
        runtime: event.runtime,
        message: "Transcript contains explicit retraction/contradiction marker.",
        relatedEventIds: [event.id]
      });
    }
  }

  for (const [sessionId, sessionEvents] of bySession.entries()) {
    const seen = new Map<string, { negated: boolean; eventId: string; runtime: RuntimeName }>();

    for (const event of sessionEvents) {
      for (const sentence of event.text.split(/[\n\.\!\?]/)) {
        const normalized = normalizeClaim(sentence);
        if (!normalized) {
          continue;
        }

        const prior = seen.get(normalized.key);
        if (!prior) {
          seen.set(normalized.key, {
            negated: normalized.negated,
            eventId: event.id,
            runtime: event.runtime
          });
          continue;
        }

        if (prior.negated !== normalized.negated) {
          findings.push({
            auditType: "CONTRADICTION_FOUND",
            severity: "MED",
            sessionId,
            runtime: event.runtime,
            message: "Detected conflicting statements within the same session.",
            relatedEventIds: [prior.eventId, event.id]
          });
        }
      }
    }
  }

  for (const [sessionId, hosts] of proxyConnectHostsBySession.entries()) {
    const hasGatewayLlmEvidence = events.some(
      (event) =>
        event.session_id === sessionId &&
        (event.event_type === "llm_request" || event.event_type === "llm_response")
    );
    if (!hasGatewayLlmEvidence && hosts.size > 0) {
      findings.push({
        auditType: "DIRECT_PROVIDER_BYPASS_SUSPECTED",
        severity: "HIGH",
        sessionId,
        runtime: "gateway",
        message: "Proxy observed outbound model host access without matching gateway llm_request evidence.",
        relatedEventIds: []
      });
    }
  }

  const hasLlmEvidence = events.some((event) => event.event_type === "llm_request" || event.event_type === "llm_response");
  if (!hasLlmEvidence && opts?.gatewayConfigPresent) {
    findings.push({
      auditType: "MISSING_LLM_EVIDENCE",
      severity: "MED",
      sessionId: "system",
      runtime: "unknown",
      message: "No llm_request/llm_response events found in scoring window.",
      relatedEventIds: []
    });
  }

  if (opts?.gatewayConfigPresent && opts.gatewayConfigSignatureValid === false) {
    findings.push({
      auditType: "UNSIGNED_GATEWAY_CONFIG",
      severity: "HIGH",
      sessionId: "system",
      runtime: "gateway",
      message: "Gateway configuration signature is missing or invalid.",
      relatedEventIds: []
    });
  }

  if (opts?.fleetConfigSignatureValid === false) {
    findings.push({
      auditType: "UNSIGNED_FLEET_CONFIG",
      severity: "HIGH",
      sessionId: "system",
      runtime: "unknown",
      message: "Fleet configuration signature is missing or invalid.",
      relatedEventIds: []
    });
  }

  if (opts?.agentConfigSignatureValid === false) {
    findings.push({
      auditType: "UNSIGNED_AGENT_CONFIG",
      severity: "HIGH",
      sessionId: "system",
      runtime: "unknown",
      message: "Agent configuration signature is missing or invalid.",
      relatedEventIds: []
    });
  }

  if (opts?.actionPolicySignatureValid === false) {
    findings.push({
      auditType: "UNSIGNED_ACTION_POLICY",
      severity: "HIGH",
      sessionId: "system",
      runtime: "unknown",
      message: "Action policy signature is missing or invalid.",
      relatedEventIds: []
    });
  }

  if (opts?.toolsConfigSignatureValid === false) {
    findings.push({
      auditType: "UNSIGNED_TOOLS_CONFIG",
      severity: "HIGH",
      sessionId: "system",
      runtime: "unknown",
      message: "Tools configuration signature is missing or invalid.",
      relatedEventIds: []
    });
  }

  if (opts?.budgetsConfigSignatureValid === false) {
    findings.push({
      auditType: "CONFIG_SIGNATURE_INVALID",
      severity: "HIGH",
      sessionId: "system",
      runtime: "unknown",
      message: "Budgets configuration signature is missing or invalid.",
      relatedEventIds: []
    });
  }

  if (opts?.riskTier === "high" || opts?.riskTier === "critical") {
    const requiredSections = [
      "what i observed",
      "what i inferred",
      "what i cannot know",
      "next verification steps"
    ];

    for (const event of events) {
      if (event.trustTier !== "OBSERVED") {
        continue;
      }
      if (event.event_type !== "stdout" && event.event_type !== "llm_response") {
        continue;
      }

      let candidateText = event.text;
      if (event.event_type === "llm_response") {
        try {
          const parsed = JSON.parse(event.text) as { body?: unknown };
          if (typeof parsed.body === "string") {
            candidateText = parsed.body;
          }
        } catch {
          // keep raw text
        }
      }
      const normalized = candidateText.toLowerCase();
      if (normalized.trim().length < 80) {
        continue;
      }

      const missing = requiredSections.filter((section) => !normalized.includes(section));
      if (missing.length >= 2) {
        findings.push({
          auditType: "TRUTH_PROTOCOL_MISSING",
          severity: "HIGH",
          sessionId: event.session_id,
          runtime: event.runtime,
          message: `High-risk response missing Truth Protocol sections: ${missing.join(", ")}`,
          relatedEventIds: [event.id]
        });
      }
    }
  }

  return dedupeFindings(findings);
}

function dedupeFindings(findings: AuditFinding[]): AuditFinding[] {
  const seen = new Set<string>();
  const out: AuditFinding[] = [];

  for (const finding of findings) {
    const key = `${finding.auditType}|${finding.sessionId}|${finding.relatedEventIds.sort().join(",")}|${finding.message}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(finding);
  }

  return out;
}

export function persistAuditFindings(ledger: Ledger, findings: AuditFinding[], runId: string): string[] {
  const deduped = dedupeFindings(findings);
  if (deduped.length === 0) {
    return [];
  }

  const ids: string[] = [];
  const auditSessionId = `audit-${runId}-${sha256Hex(JSON.stringify(deduped)).slice(0, 12)}`;
  ledger.startSession({
    sessionId: auditSessionId,
    runtime: "unknown",
    binaryPath: "amc-diagnostic-audits",
    binarySha256: sha256Hex("amc-diagnostic-audits")
  });

  try {
  for (const finding of deduped) {
    const id = ledger.appendEvidence({
      sessionId: auditSessionId,
      runtime: finding.runtime,
      eventType: "audit",
      payload: JSON.stringify({
        auditType: finding.auditType,
        severity: finding.severity,
        message: finding.message,
        relatedEventIds: finding.relatedEventIds,
        questionId: finding.questionId,
        runId,
        sourceSessionId: finding.sessionId
      }),
      payloadExt: "json",
      inline: true,
      meta: {
        auditType: finding.auditType,
        severity: finding.severity,
        relatedEventIds: finding.relatedEventIds,
        questionId: finding.questionId,
        runId,
        sourceSessionId: finding.sessionId,
        source: "derived"
      }
    });
    ids.push(id);
  }
  } finally {
    ledger.sealSession(auditSessionId);
  }

  return ids;
}
