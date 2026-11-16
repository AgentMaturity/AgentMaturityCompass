/** CLI parsing and selection for the existing `amc assurance run` command. */
import { InvalidArgumentError, type Command } from "commander";
import type { RunAssuranceInput } from "../assuranceRunner.js";
import { STATION_QUESTION_CONVERSIONS } from "./registry.js";

export interface AssuranceRunCliOptions {
  agent?: string;
  scope?: "workspace" | "node" | "agent";
  id?: string;
  pack?: string;
  format: string;
  verbose: boolean;
  all: boolean;
  demo: boolean;
  mode: "supervise" | "sandbox";
  window: string;
  windowDays?: string;
  out?: string;
  model?: string;
  /** Tries per effect-graded scenario (1-25). */
  attempts?: number;
  sign: boolean; // Commander inverts --no-sign to sign=false
  executedAttempts?: 1 | 25;
  stationQuestions?: string[];
}

const stationQuestionIds = STATION_QUESTION_CONVERSIONS.map((row) => row.questionId);

function parseExecutedAttempts(value: string): 1 | 25 {
  if (value !== "1" && value !== "25") {
    throw new InvalidArgumentError("--executed-attempts must be 1 or 25.");
  }
  return value === "1" ? 1 : 25;
}

function parseStationQuestions(value: string): string[] {
  const ids = value.split(",").map((id) => id.trim());
  if (new Set(ids).size !== ids.length || ids.some((id) => !stationQuestionIds.includes(id))) {
    throw new InvalidArgumentError(`use comma-separated unique station question IDs: ${stationQuestionIds.join(", ")}`);
  }
  return ids;
}

function parseAttempts(value: string): number {
  if (!/^(?:[1-9]|1\d|2[0-5])$/.test(value)) throw new InvalidArgumentError("--attempts must be a whole number from 1 to 25.");
  return Number(value);
}

/** Add flags to the same command object; this registers no command or authority. */
export function withExecutedAssuranceOptions(command: Command): Command {
  return command
    .option("--attempts <n>", "tries per attack scenario graded by what the agent did, each with its ordinary-task twin (1-25; default 5, 1 with --demo)", parseAttempts)
    .option("--executed-attempts <1|25>", "seeded attempts: 1 smoke or 25 full (default: 25)", parseExecutedAttempts)
    .option("--station-questions <ids>", `experimental unreviewed partial aspects; comma-separated IDs: ${stationQuestionIds.join(", ")}`, parseStationQuestions);
}

/** runAssurance retains the authoritative input validation and native evidence caps. */
export function selectExecutedAssuranceOptions(opts: AssuranceRunCliOptions):
  Pick<RunAssuranceInput, "executedAttempts" | "stationQuestionIds" | "packIds"> {
  const hasQuestions = opts.stationQuestions !== undefined;
  const scope = (opts.scope ?? "agent").toLowerCase();
  if (hasQuestions && opts.demo) {
    throw new InvalidArgumentError("--station-questions cannot be combined with --demo.");
  }
  if (hasQuestions && scope !== "agent") {
    throw new InvalidArgumentError("--station-questions is only supported for agent-scoped assurance runs.");
  }
  if (opts.executedAttempts !== undefined && scope !== "agent") {
    throw new InvalidArgumentError("--executed-attempts is only supported for agent-scoped assurance runs.");
  }
  return {
    executedAttempts: opts.executedAttempts,
    stationQuestionIds: opts.stationQuestions,
    packIds: hasQuestions && !opts.pack && !opts.all && !opts.demo ? [] : undefined
  };
}

/** Preserve the explicit smoke mode and partial question selection in remediation reruns. */
export function executedRerunFlags(opts: AssuranceRunCliOptions): string[] {
  return [
    opts.attempts ? `--attempts ${opts.attempts}` : "",
    opts.executedAttempts ? `--executed-attempts ${opts.executedAttempts}` : "",
    opts.stationQuestions ? `--station-questions ${opts.stationQuestions.join(",")}` : ""
  ].filter(Boolean);
}
