import { addDuration } from "../../../../src/incidents/regulatoryClocks.js";
import { REGULATORY_CLOCK_TABLE } from "../../../../src/incidents/regulatoryClocksTable.js";
import { fixtureResult, type OracleRunResult } from "./deviceSimulator.js";

export interface CraInput {
  aibom: { components: Array<{ id: string }> } | null;
  flaw: { componentId: string; activelyExploited: boolean; awareAt: string };
  clockId: string | null;
  packet: Partial<{ componentId: string; createdAt: string; summary: string; contact: string }> | null;
}
/** Required fields describe this local draft packet protocol, not an expert interpretation of the CRA. */
const REQUIRED_PACKET_FIELDS = ["componentId", "createdAt", "summary", "contact"] as const;

/** Reject Date.parse coercion and rolled calendar dates; fixture timestamps use explicit UTC. */
function utcTimestamp(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const match = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,3}))?Z$/.exec(value);
  if (!match) return null;
  const canonical = `${match[1]}.${(match[2] ?? "").padEnd(3, "0")}Z`;
  const time = Date.parse(canonical);
  return Number.isFinite(time) && new Date(time).toISOString() === canonical ? time : null;
}

export function runCraDrill(input: CraInput): OracleRunResult {
  if (input.aibom === null) return fixtureResult("not_evaluated", "aibom_missing");
  if (!input.aibom.components.some((component) => component.id === input.flaw.componentId)) {
    return fixtureResult("not_evaluated", "component_absent");
  }
  const clock = REGULATORY_CLOCK_TABLE.find((entry) => entry.clockId === input.clockId && entry.stations.includes("technology"));
  if (input.clockId !== "eu-cra-early-warning-24h" || !clock || clock.trigger !== "AWARENESS" || clock.deadline.unit !== "hours" || clock.deadline.amount !== 24) {
    return fixtureResult("not_evaluated", "cra_clock_missing");
  }
  if (input.flaw.activelyExploited !== true) return fixtureResult("not_evaluated", "exploit_not_active");
  const awareness = utcTimestamp(input.flaw.awareAt);
  if (awareness === null) return fixtureResult("not_evaluated", "awareness_missing");
  const packet = input.packet;
  if (!packet || REQUIRED_PACKET_FIELDS.some((field) => typeof packet[field] !== "string" || packet[field]!.trim().length === 0)
    || packet.componentId !== input.flaw.componentId || utcTimestamp(packet.createdAt) === null) {
    return fixtureResult("fail", "packet_incomplete");
  }
  const packetTime = utcTimestamp(packet.createdAt)!;
  if (packetTime < awareness) return fixtureResult("fail", "packet_before_awareness");
  return packetTime <= addDuration(awareness, clock.deadline)
    ? fixtureResult("pass", "packet_on_time") : fixtureResult("fail", "packet_late");
}
