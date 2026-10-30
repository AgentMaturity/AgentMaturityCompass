/**
 * Notice drafts for one incident clock (P2-26 slice A): the deadline, the recipients the clock's notify list names, a
 * checklist from its requiredContent and the evidence packet's missing items, under a fixed banner. A draft is markdown
 * and JSON for people to review; nothing here sends, uploads or files anything (contract §7.3).
 */
import type Database from "better-sqlite3";
import { buildEvidencePacket, type IncidentEvidencePacket, type MissingEvidenceItem } from "./evidencePacket.js";
import { createIncidentStore } from "./incidentStore.js";
import type { Incident } from "./incidentTypes.js";
import { incidentRuntimeClocks, type RuntimeClock } from "./clockRuntime.js";
import { oversightRecordPath, readOversightRecords, workspaceOversightPublicKeys } from "./oversightRecord.js";

export const NOTICE_DRAFT_BANNER = "Draft for human review. AMC does not file notices.";

export interface NoticeDraft {
  v: 1;
  banner: typeof NOTICE_DRAFT_BANNER;
  incidentId: string;
  clockId: string;
  instrument: string;
  article: string;
  authority: string;
  status: RuntimeClock["status"];
  deadline: string | null;
  recipients: string[];
  checklist: Array<{ item: string; done: false }>;
  missing: MissingEvidenceItem[];
  review: string;
  sourceUrl: string;
  sourceVerified: boolean;
}

function buildNoticeDraft(input: { incident: Incident; clock: RuntimeClock; evidence: Pick<IncidentEvidencePacket, "missing"> }): { json: NoticeDraft; markdown: string } {
  const { incident, clock } = input;
  const json: NoticeDraft = {
    v: 1, banner: NOTICE_DRAFT_BANNER, incidentId: incident.incidentId, clockId: clock.clockId, instrument: clock.instrument,
    article: clock.article, authority: clock.authority, status: clock.status, deadline: clock.dueAt, recipients: [...clock.notify],
    checklist: clock.requiredContent.map((item) => ({ item, done: false })), missing: [...input.evidence.missing],
    review: clock.review, sourceUrl: clock.source.url, sourceVerified: clock.source.verified
  };
  const lines = [
    `> **${NOTICE_DRAFT_BANNER}**`, "",
    `# Notice draft: ${clock.instrument} ${clock.article}`, "",
    `- Incident: ${incident.incidentId} (${incident.title})`,
    `- Clock: ${clock.clockId} (${clock.status})`,
    `- Deadline: ${clock.dueAt ?? "not started: its trigger has not been recorded"}`,
    `- Authority: ${clock.authority}`,
    `- Source: ${clock.source.url} (verified: ${String(clock.source.verified)})`,
    `- Review status: ${clock.review}`, "",
    "## Recipients", "", ...clock.notify.map((recipient) => `- ${recipient}`), "",
    "## Required content", "", ...clock.requiredContent.map((item) => `- [ ] ${item}`), "",
    "## Missing evidence", "",
    ...(json.missing.length === 0 ? ["- none listed by the evidence packet"] : json.missing.map((m) => `- ${m.item}: ${m.reason}`)), ""
  ];
  return { json, markdown: `${lines.join("\n")}\n` };
}

/**
 * Drafts for every recorded clock a person has not classified out (NOT_APPLICABLE), with missing items from the
 * incident's evidence packet. Pure apart from reads; the caller decides where to write them.
 */
export function incidentNoticeDrafts(p: { workspace: string; db: Database.Database; incidentId: string; nowTs: number }) {
  const runtime = incidentRuntimeClocks(p);
  const store = createIncidentStore(p.db);
  const incident = store.getIncident(p.incidentId)!;
  const clocks = runtime.clocks.filter((clock) => clock.status !== "NOT_APPLICABLE");
  if (clocks.length === 0) return { runtime, drafts: [] };
  const evidence = buildEvidencePacket({
    incident, station: clocks[0]!.station, generatedTs: p.nowTs, clocks: [], transitions: store.getIncidentTransitions(p.incidentId),
    causalEdges: store.getCausalEdges(p.incidentId), oversightRecords: readOversightRecords(oversightRecordPath(p.workspace, p.incidentId)),
    oversightPublicKeys: workspaceOversightPublicKeys(p.workspace)
  });
  return { runtime, drafts: clocks.map((clock) => buildNoticeDraft({ incident, clock, evidence })) };
}
