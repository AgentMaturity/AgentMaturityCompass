/**
 * Evidence collector — gathers evidence artifacts from module outputs.
 */

import type { EvidenceArtifact } from './formalSpec.js';
import { readGuardEvents } from '../enforce/evidenceEmitter.js';

export interface CollectedEvidence {
  artifacts: EvidenceArtifact[];
  trustBreakdown: Record<string, number>;
  totalTrust: number;
}

/**
 * Wraps caller-supplied module outputs as SELF-REPORTED evidence.
 *
 * These artifacts did not come from the ledger: AMC did not capture them, so
 * they cannot be OBSERVED. This function previously stamped every non-null
 * input `kind: 'observed'` with a flat trust of 0.7, which contradicted the
 * trust-tier methodology and let any caller mint top-tier evidence.
 *
 * Use collectEvidenceFromLedger for real captured evidence.
 */
export function collectEvidence(moduleOutputs: Record<string, unknown>): CollectedEvidence {
  const artifacts: EvidenceArtifact[] = [];
  const trustBreakdown: Record<string, number> = {};
  let totalTrust = 0;

  for (const [qid, output] of Object.entries(moduleOutputs)) {
    // Self-reported weight, matching the canonical trust table.
    const trust = output !== null && output !== undefined ? 0.4 : 0;
    const artifact: EvidenceArtifact = {
      qid,
      kind: 'self_reported',
      trust,
      payload: output,
      timestamp: new Date(),
    };
    artifacts.push(artifact);
    trustBreakdown[qid] = trust;
    totalTrust += trust;
  }

  return { artifacts, trustBreakdown, totalTrust };
}

/**
 * Collect evidence from the guard_events SQLite ledger.
 * Reads real guard_check events and applies trust weights:
 *   - guard_check (observed) = 1.0
 *   - self_reported = 0.4
 * Evidence gates: L1 requires ≥2 events within the window.
 */
export function collectEvidenceFromLedger(agentId: string, windowDays: number): CollectedEvidence {
  const artifacts: EvidenceArtifact[] = [];
  const trustBreakdown: Record<string, number> = {};
  let totalTrust = 0;

  try {
    const windowHours = windowDays * 24;
    const events = readGuardEvents(agentId, windowHours);

    // Group events by module_code
    const byModule = new Map<string, Array<{ decision: string; reason: string; severity: string; created_at: string; meta_json: string | null }>>();
    for (const ev of events) {
      const arr = byModule.get(ev.module_code) ?? [];
      arr.push(ev);
      byModule.set(ev.module_code, arr);
    }

    for (const [moduleCode, moduleEvents] of byModule) {
      // guard_check events are OBSERVED trust = 1.0
      const trust = 1.0;
      const artifact: EvidenceArtifact = {
        qid: moduleCode,
        kind: 'observed',
        trust,
        payload: {
          eventCount: moduleEvents.length,
          decisions: moduleEvents.map(e => e.decision),
          severities: moduleEvents.map(e => e.severity),
        },
        timestamp: new Date(moduleEvents[0]!.created_at),
      };
      artifacts.push(artifact);
      trustBreakdown[moduleCode] = trust;
      totalTrust += trust;
    }
  } catch (_e) {
    // Fail-safe: return empty evidence on error
  }

  return { artifacts, trustBreakdown, totalTrust };
}
