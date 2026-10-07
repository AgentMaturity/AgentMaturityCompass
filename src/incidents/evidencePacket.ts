/**
 * Builds the evidence packet a regulator asks for from existing incident data:
 * the incident, its state transitions and causal edges, the attached regulatory
 * clocks, verified human-oversight records, and ledger receipt references.
 * Nothing is synthesised — anything not supplied is listed under `missing`
 * with the reason, and unverified clock sources are called out separately.
 */
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import type { Domain } from "../domains/domainRegistry.js";
import type { CausalEdge, Incident, IncidentTransition } from "./incidentTypes.js";
import { CLOCK_REVIEW_STATUS, type IncidentClockInstance } from "./regulatoryClocks.js";
import { verifyOversightRecord, type HumanOversightRecord } from "./oversightRecord.js";

export interface PacketReceiptRef {
  receiptId: string;
  kind: string;
  ts: number;
  /** true/false from an actual verification; null when not verified in this run. */
  verified: boolean | null;
}

export interface PacketTimelineEvent {
  eventId: string;
  ts: number;
  summary: string;
}

export interface EvidencePacketInput {
  incident: Incident;
  station: Domain;
  generatedTs: number;
  clocks: IncidentClockInstance[];
  transitions?: IncidentTransition[];
  causalEdges?: CausalEdge[];
  oversightRecords?: HumanOversightRecord[];
  /** Public keys used to verify oversight records; without them records are reported as unverified. */
  oversightPublicKeys?: string[];
  receipts?: PacketReceiptRef[];
  timelineEvents?: PacketTimelineEvent[];
}

export interface MissingEvidenceItem {
  item: string;
  reason: string;
}

export interface PacketOversightEntry {
  recordId: string;
  reviewerId: string;
  reviewedAt: string;
  decision: HumanOversightRecord["decision"];
  rationale: string;
  clockIds: string[];
  signatureVerified: boolean | null;
  verificationErrors: string[];
}

export interface UnverifiedClockSource {
  clockId: string;
  instrument: string;
  url: string;
  reason: string;
}

export interface IncidentEvidencePacket {
  v: 1;
  generatedAt: string;
  station: Domain;
  incident: {
    incidentId: string;
    agentId: string;
    severity: Incident["severity"];
    state: Incident["state"];
    title: string;
    description: string;
    triggerType: Incident["triggerType"];
    triggerId: string;
    createdAt: string;
    updatedAt: string;
    resolvedAt: string | null;
    postmortemRef: string | null;
    rootCauseClaimIds: string[];
    affectedQuestionIds: string[];
    timelineEventIds: string[];
    incidentHash: string;
    prevIncidentHash: string;
  };
  clocks: IncidentClockInstance[];
  overdueClockIds: string[];
  transitions: IncidentTransition[];
  causalEdges: CausalEdge[];
  oversight: PacketOversightEntry[];
  receipts: PacketReceiptRef[];
  timeline: PacketTimelineEvent[];
  missing: MissingEvidenceItem[];
  unverifiedSources: UnverifiedClockSource[];
  packetSha256: string;
}

function iso(ts: number): string {
  return new Date(ts).toISOString();
}

function oversightEntries(input: EvidencePacketInput): PacketOversightEntry[] {
  const keys = input.oversightPublicKeys ?? [];
  return (input.oversightRecords ?? []).map((record) => {
    const verification = keys.length === 0 ? null : verifyOversightRecord(record, input.incident, keys);
    return {
      recordId: record.recordId,
      reviewerId: record.reviewerId,
      reviewedAt: iso(record.reviewedTs),
      decision: record.decision,
      rationale: record.rationale,
      clockIds: [...record.clockIds],
      signatureVerified: verification === null ? null : verification.ok,
      verificationErrors: verification === null ? ["no oversight public keys supplied"] : verification.errors
    };
  });
}

function missingItems(input: EvidencePacketInput, oversight: PacketOversightEntry[]): MissingEvidenceItem[] {
  const { incident } = input;
  const missing: MissingEvidenceItem[] = [];
  const verifiedOversight = oversight.filter((entry) => entry.signatureVerified === true);
  if (oversight.length === 0) {
    missing.push({ item: "human-oversight-record", reason: "no human oversight record supplied for this incident" });
  } else if (verifiedOversight.length === 0) {
    const detail = oversight.map((entry) => `${entry.recordId}: ${entry.verificationErrors.join("; ")}`).join(" | ");
    missing.push({ item: "human-oversight-record", reason: `${oversight.length} record(s) supplied, none verified (${detail})` });
  }
  if (oversight.length > 0 && (input.oversightPublicKeys ?? []).length === 0) {
    missing.push({ item: "oversight-verification-keys", reason: "oversight records supplied without public keys; signatures not checked" });
  }
  const receipts = input.receipts ?? [];
  if (receipts.length === 0) {
    missing.push({ item: "ledger-receipts", reason: "no ledger receipt references supplied for the incident window" });
  } else if (receipts.some((receipt) => receipt.verified !== true)) {
    const ids = receipts.filter((receipt) => receipt.verified !== true).map((receipt) => receipt.receiptId);
    missing.push({ item: "receipt-signature-verification", reason: `receipts not verified in this run: ${ids.join(", ")}` });
  }
  if ((input.transitions ?? []).length === 0) {
    missing.push({ item: "state-transitions", reason: `no state transitions supplied; incident state is ${incident.state}` });
  }
  if ((input.causalEdges ?? []).length === 0 && incident.causalEdges.length === 0) {
    missing.push({ item: "causal-edges", reason: "no causal edges recorded or supplied" });
  }
  if ((input.timelineEvents ?? []).length === 0) {
    missing.push({
      item: "timeline-events",
      reason: `no timeline events supplied (incident references ${incident.timelineEventIds.length} event id(s))`
    });
  }
  if (incident.rootCauseClaimIds.length === 0) {
    missing.push({ item: "root-cause-claims", reason: "incident has no root-cause claim ids" });
  }
  if (incident.postmortemRef === null) {
    missing.push({ item: "postmortem", reason: "incident has no postmortem reference" });
  }
  if (incident.resolvedTs === null) {
    missing.push({ item: "resolution-timestamp", reason: `incident is not resolved (state ${incident.state})` });
  }
  return missing;
}

function unverifiedSources(clocks: IncidentClockInstance[]): UnverifiedClockSource[] {
  return clocks
    .filter((clock) => !clock.source.verified)
    .map((clock) => ({
      clockId: clock.clockId,
      instrument: clock.instrument,
      url: clock.source.url,
      reason: clock.source.reason ?? "source marked unverified without a reason"
    }));
}

export function buildEvidencePacket(input: EvidencePacketInput): IncidentEvidencePacket {
  const { incident } = input;
  if (!Number.isFinite(input.generatedTs)) throw new Error("generatedTs must be a finite timestamp");
  if (input.generatedTs < incident.createdTs) {
    throw new Error(`generatedTs ${input.generatedTs} is before incident createdTs ${incident.createdTs}`);
  }
  const oversight = oversightEntries(input);
  const body: Omit<IncidentEvidencePacket, "packetSha256"> = {
    v: 1,
    generatedAt: iso(input.generatedTs),
    station: input.station,
    incident: {
      incidentId: incident.incidentId,
      agentId: incident.agentId,
      severity: incident.severity,
      state: incident.state,
      title: incident.title,
      description: incident.description,
      triggerType: incident.triggerType,
      triggerId: incident.triggerId,
      createdAt: iso(incident.createdTs),
      updatedAt: iso(incident.updatedTs),
      resolvedAt: incident.resolvedTs === null ? null : iso(incident.resolvedTs),
      postmortemRef: incident.postmortemRef,
      rootCauseClaimIds: [...incident.rootCauseClaimIds],
      affectedQuestionIds: [...incident.affectedQuestionIds],
      timelineEventIds: [...incident.timelineEventIds],
      incidentHash: incident.incident_hash,
      prevIncidentHash: incident.prev_incident_hash
    },
    clocks: input.clocks,
    overdueClockIds: input.clocks.filter((clock) => clock.status === "OVERDUE").map((clock) => clock.clockId),
    transitions: [...(input.transitions ?? [])],
    causalEdges: [...(input.causalEdges ?? incident.causalEdges)],
    oversight,
    receipts: [...(input.receipts ?? [])],
    timeline: [...(input.timelineEvents ?? [])],
    missing: missingItems(input, oversight),
    unverifiedSources: unverifiedSources(input.clocks)
  };
  return { ...body, packetSha256: sha256Hex(canonicalize(body)) };
}

function cell(value: string | number | null): string {
  return String(value ?? "—").replace(/\|/g, "\\|").replace(/\n/g, " ");
}

export function renderEvidencePacketMarkdown(packet: IncidentEvidencePacket): string {
  const lines: string[] = [];
  const inc = packet.incident;
  lines.push("# Incident evidence packet", "");
  lines.push(`Generated: ${packet.generatedAt} · Station: ${packet.station} · Packet SHA-256: \`${packet.packetSha256}\``, "");
  lines.push("## Incident", "");
  lines.push("| Field | Value |", "|---|---|");
  const rows: Array<[string, string | number | null]> = [
    ["Incident id", inc.incidentId], ["Agent", inc.agentId], ["Severity", inc.severity], ["State", inc.state],
    ["Title", inc.title], ["Trigger", `${inc.triggerType} / ${inc.triggerId}`], ["Created", inc.createdAt],
    ["Updated", inc.updatedAt], ["Resolved", inc.resolvedAt], ["Postmortem", inc.postmortemRef],
    ["Root-cause claims", inc.rootCauseClaimIds.join(", ") || null],
    ["Affected questions", inc.affectedQuestionIds.join(", ") || null],
    ["Incident hash", inc.incidentHash], ["Previous incident hash", inc.prevIncidentHash]
  ];
  for (const [field, value] of rows) lines.push(`| ${field} | ${cell(value)} |`);
  lines.push("", `Description: ${inc.description}`, "");

  lines.push("## Regulatory clocks", "");
  lines.push("| Clock | Instrument / article | Trigger | Trigger at | Due at | Status | Source verified |", "|---|---|---|---|---|---|---|");
  for (const clock of packet.clocks) {
    lines.push(
      `| ${cell(clock.clockId)} | ${cell(`${clock.instrument} ${clock.article}`)} | ${cell(clock.trigger)} | ${cell(clock.triggerTs === null ? null : new Date(clock.triggerTs).toISOString())} | ${cell(clock.dueAt)} | ${cell(clock.status)} | ${clock.source.verified ? "yes" : "NO"} |`
    );
  }
  lines.push("", `Overdue: ${packet.overdueClockIds.length === 0 ? "none" : packet.overdueClockIds.join(", ")}`, "");
  lines.push(`Clock review status: ${CLOCK_REVIEW_STATUS}. Not legal advice. Deadlines run from operator-recorded timestamps; AMC does not check statutory conditions or file notices.`, "");

  lines.push("## Human oversight", "");
  if (packet.oversight.length === 0) lines.push("None supplied.", "");
  else {
    lines.push("| Record | Reviewer | Reviewed at | Decision | Signature verified | Clocks |", "|---|---|---|---|---|---|");
    for (const entry of packet.oversight) {
      const verified = entry.signatureVerified === null ? "not checked" : entry.signatureVerified ? "yes" : `NO (${entry.verificationErrors.join("; ")})`;
      lines.push(`| ${cell(entry.recordId)} | ${cell(entry.reviewerId)} | ${entry.reviewedAt} | ${entry.decision} | ${cell(verified)} | ${cell(entry.clockIds.join(", ") || null)} |`);
    }
    lines.push("");
  }

  lines.push("## State transitions", "");
  if (packet.transitions.length === 0) lines.push("None supplied.", "");
  else {
    for (const t of packet.transitions) lines.push(`- ${iso(t.ts)} ${t.fromState} → ${t.toState}: ${t.reason} (${t.transitionId})`);
    lines.push("");
  }

  lines.push("## Ledger receipts", "");
  if (packet.receipts.length === 0) lines.push("None supplied.", "");
  else {
    for (const r of packet.receipts) lines.push(`- ${iso(r.ts)} ${r.kind} ${r.receiptId} — verified: ${r.verified === null ? "not checked" : String(r.verified)}`);
    lines.push("");
  }

  lines.push("## Timeline events", "");
  if (packet.timeline.length === 0) lines.push("None supplied.", "");
  else {
    for (const e of packet.timeline) lines.push(`- ${iso(e.ts)} ${e.eventId}: ${e.summary}`);
    lines.push("");
  }

  lines.push("## Missing evidence", "");
  if (packet.missing.length === 0) lines.push("Nothing missing from the supplied inputs.", "");
  else {
    for (const m of packet.missing) lines.push(`- **${m.item}** — ${m.reason}`);
    lines.push("");
  }

  lines.push("## Unverified clock sources", "");
  if (packet.unverifiedSources.length === 0) lines.push("All clock sources were read from official primary text.", "");
  else {
    for (const s of packet.unverifiedSources) lines.push(`- ${s.clockId} (${s.instrument}) — ${s.url} — ${s.reason}`);
    lines.push("");
  }
  return lines.join("\n");
}
