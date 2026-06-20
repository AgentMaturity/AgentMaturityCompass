import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

type QuickscoreAnswerSource = "inline" | "file";

export interface ParsedQuickscoreAnswers {
  answers: Record<string, number>;
  answeredQuestions: number;
  source: QuickscoreAnswerSource;
}

export const NON_INTERACTIVE_QUICKSCORE_NOTICE = {
  nonInteractive: true,
  scoreStatus: "NON_INTERACTIVE_PLACEHOLDER",
  warning: "No TTY detected; no questions were answered. No placeholder L0 score was generated; no measured maturity result was produced.",
  firstRunHint: "Did you mean to run the interactive score? Run `amc quickscore` in a terminal, or pass answers with `amc quickscore --answers answers.json --json`.",
  suggestedCommands: [
    "amc quickscore",
    "amc quickscore --answers answers.json --json",
    "amc quickscore --auto",
    "amc wrap <runtime> -- <your-agent-command>"
  ]
} as const;

export const AUTO_QUICKSCORE_NO_EVIDENCE_NOTICE = {
  nonInteractive: true,
  scoreStatus: "AUTO_NO_EVIDENCE",
  warning: "Auto-score could not find execution evidence. No measured maturity score was produced.",
  firstRunHint: "Capture evidence with `amc wrap <runtime> -- <your-agent-command>` or use `amc quickscore --answers answers.json --json` for CI-safe survey scoring.",
  suggestedCommands: [
    "amc wrap <runtime> -- <your-agent-command>",
    "amc adapters run --agent <id> --workorder <workOrderId>",
    "amc quickscore --answers answers.json --json",
    "amc quickscore"
  ]
} as const;

export function withNonInteractiveQuickscoreNotice<T extends object>(result: T): T & typeof NON_INTERACTIVE_QUICKSCORE_NOTICE {
  return {
    ...result,
    ...NON_INTERACTIVE_QUICKSCORE_NOTICE
  };
}

export function withAutoQuickscoreNoEvidenceNotice<T extends object>(result: T): T & typeof AUTO_QUICKSCORE_NO_EVIDENCE_NOTICE {
  return {
    ...result,
    ...AUTO_QUICKSCORE_NO_EVIDENCE_NOTICE
  };
}

export function parseQuickscoreAnswers(input: string, options: { cwd?: string } = {}): ParsedQuickscoreAnswers {
  const rawInput = input.trim();
  if (rawInput.length === 0) {
    throw new Error("--answers requires inline JSON or a JSON file path.");
  }

  const looksInlineJson = rawInput.startsWith("{");
  const source: QuickscoreAnswerSource = looksInlineJson ? "inline" : "file";
  const jsonText = looksInlineJson ? rawInput : readAnswersFile(rawInput, options.cwd ?? process.cwd());
  const parsed = parseJsonObject(jsonText, source === "file" ? "--answers file" : "--answers JSON");
  const answerPayload = extractAnswerPayload(parsed);
  const answers: Record<string, number> = {};

  for (const [questionId, value] of Object.entries(answerPayload)) {
    const normalizedId = questionId.trim();
    if (normalizedId.length === 0) {
      throw new Error("--answers question IDs must be non-empty strings.");
    }
    answers[normalizedId] = normalizeMaturityLevel(value, normalizedId);
  }

  return {
    answers,
    answeredQuestions: Object.keys(answers).length,
    source
  };
}

export function withProvidedAnswersQuickscoreMetadata<T extends object>(
  result: T,
  parsed: Pick<ParsedQuickscoreAnswers, "answeredQuestions" | "source">,
  options: { nonInteractive: boolean }
): T & {
  nonInteractive: boolean;
  scoreStatus: "PROVIDED_ANSWERS";
  answersSource: QuickscoreAnswerSource;
  answeredQuestions: number;
} {
  return {
    ...result,
    nonInteractive: options.nonInteractive,
    scoreStatus: "PROVIDED_ANSWERS",
    answersSource: parsed.source,
    answeredQuestions: parsed.answeredQuestions
  };
}

function readAnswersFile(filePath: string, cwd: string): string {
  const resolvedPath = resolve(cwd, filePath);
  if (!existsSync(resolvedPath)) {
    throw new Error(`Could not read --answers file: ${resolvedPath}`);
  }
  return readFileSync(resolvedPath, "utf8");
}

function parseJsonObject(jsonText: string, label: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch (error) {
    throw new Error(`Invalid ${label}: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!isPlainRecord(parsed)) {
    throw new Error(`${label} must be a JSON object mapping question IDs to L0-L5 levels.`);
  }
  return parsed;
}

function extractAnswerPayload(parsed: Record<string, unknown>): Record<string, unknown> {
  if ("answers" in parsed) {
    const answers = parsed.answers;
    if (!isPlainRecord(answers)) {
      throw new Error("--answers field must be a JSON object mapping question IDs to L0-L5 levels.");
    }
    return answers;
  }
  return parsed;
}

function normalizeMaturityLevel(value: unknown, questionId: string): number {
  const numberValue = typeof value === "string" && value.trim().length > 0 ? Number(value) : value;
  if (typeof numberValue !== "number" || !Number.isFinite(numberValue)) {
    throw new Error(`--answers value for ${questionId} must be an integer between 0 and 5.`);
  }
  if (!Number.isInteger(numberValue)) {
    throw new Error(`--answers value for ${questionId} must be an integer maturity level.`);
  }
  if (numberValue < 0 || numberValue > 5) {
    throw new Error(`--answers value for ${questionId} must be between 0 and 5.`);
  }
  return numberValue;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
