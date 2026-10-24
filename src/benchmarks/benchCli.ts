import { assertOwnerMode } from "../mode/mode.js";

/** The fixed registered benchmark write gate supplies authority; the export label is error context only. */
export function assertBenchmarkExportOwnerMode(workspace: string): void {
  try { assertOwnerMode(workspace, "benchmark ingest"); }
  catch (cause) {
    if (!(cause instanceof Error) || cause.message !== "Command 'benchmark ingest' is blocked in agent mode. Switch to owner mode with: amc mode owner") throw cause;
    throw new Error("Command 'benchmark export' is blocked in agent mode. Switch to owner mode with: amc mode owner", { cause });
  }
}

export function parseBenchGroupBy(value?: string): "archetype" | "riskTier" | "trustLabel" {
  const normalized = (value ?? "riskTier").trim();
  if (normalized === "archetype" || normalized === "riskTier" || normalized === "trustLabel") {
    return normalized;
  }
  throw new Error(`Invalid --group-by value '${value}'. Expected archetype|riskTier|trustLabel.`);
}

