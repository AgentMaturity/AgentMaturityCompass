import { assertOwnerMode } from "../mode/mode.js";

/** The fixed registered benchmark write gate supplies authority; the export label is error context only. */
function assertBenchmarkWriteOwnerMode(workspace: string, label: "benchmark export" | "bench create"): void {
  try { assertOwnerMode(workspace, "benchmark ingest"); }
  catch (cause) {
    if (!(cause instanceof Error) || cause.message !== "Command 'benchmark ingest' is blocked in agent mode. Switch to owner mode with: amc mode owner") throw cause;
    throw new Error(`Command '${label}' is blocked in agent mode. Switch to owner mode with: amc mode owner`, { cause });
  }
}

export const assertBenchmarkExportOwnerMode = (workspace: string): void => assertBenchmarkWriteOwnerMode(workspace, "benchmark export");
export const assertBenchCreateOwnerMode = (workspace: string): void => assertBenchmarkWriteOwnerMode(workspace, "bench create");

