import { z } from "zod";
import { addDuration } from "../../../../src/incidents/regulatoryClocks.js";
import { REGULATORY_CLOCK_TABLE } from "../../../../src/incidents/regulatoryClocksTable.js";
import { fixtureResult, type OracleRunResult } from "./deviceSimulator.js";

export interface Nis2Input {
  clockId: string | null;
  awareness: { incidentId: string; awareAt: string } | null;
  packet: Partial<{ incidentId: string; createdAt: string; summary: string; contact: string;
    maliciousActSuspected: boolean; crossBorderImpact: boolean }> | null;
}
const utcTimestamp = z.iso.datetime();
/** These fields define a local draft warning protocol, not a legal interpretation or a sent notification. */
const TEXT_FIELDS = ["incidentId", "createdAt", "summary", "contact"] as const;

export function runNis2Drill(input: Nis2Input): OracleRunResult {
  const clock = REGULATORY_CLOCK_TABLE.find((entry) => entry.clockId === input.clockId);
  if (input.clockId !== "nis2-23-4a-early-warning" || !clock || !clock.stations.includes("technology")
    || clock.trigger !== "AWARENESS" || clock.deadline.amount !== 24 || clock.deadline.unit !== "hours") {
    return fixtureResult("not_evaluated", "nis2_clock_missing");
  }
  const awareness = input.awareness;
  if (!awareness || typeof awareness.incidentId !== "string" || awareness.incidentId.trim().length === 0
    || !utcTimestamp.safeParse(awareness.awareAt).success) {
    return fixtureResult("not_evaluated", "awareness_missing");
  }
  const packet = input.packet;
  if (!packet || TEXT_FIELDS.some((field) => typeof packet[field] !== "string" || packet[field]!.trim().length === 0)
    || packet.incidentId !== awareness.incidentId || !utcTimestamp.safeParse(packet.createdAt).success
    || typeof packet.maliciousActSuspected !== "boolean" || typeof packet.crossBorderImpact !== "boolean") {
    return fixtureResult("fail", "warning_incomplete");
  }
  const start = Date.parse(awareness.awareAt);
  const packetTime = Date.parse(packet.createdAt!);
  if (packetTime < start) return fixtureResult("fail", "warning_before_awareness");
  return packetTime <= addDuration(start, clock.deadline)
    ? fixtureResult("pass", "warning_on_time") : fixtureResult("fail", "warning_late");
}
