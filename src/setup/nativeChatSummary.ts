import chalk from "chalk";
import { renderNativeRunUsage } from "../agent/nativeRunUsage.js";
import { renderNativeRunDiagnostics } from "../agent/nativeFailureGuidance.js";
import { renderNativeCost } from "../budgets/nativeCostProjection.js";
import type { NativeChatChildSummary } from "./nativeChatResult.js";
import type { ChatContextReading } from "./nativeChatDisplay.js";

/** The few numbers chat shows under a reply, read defensively from the child's serialized usage projection. */
export interface ChatUsageTotals {
  readonly requests: number;
  readonly standIn: boolean;
  readonly inputTokens: number | null;
  readonly outputTokens: number | null;
  readonly costUsd: number | null;
  readonly costComplete: boolean;
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
function amount(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}
const tokens = (value: number) => value.toLocaleString("en-US");

export function chatUsageTotals(usage: unknown): ChatUsageTotals {
  const row = record(usage);
  const totals = record(row?.totals);
  const metric = (name: string) => amount(record(totals?.[name])?.observedTokens);
  const input = [metric("inputTokens"), metric("cacheReadTokens"), metric("cacheWriteTokens")];
  const cost = record(row?.cost);
  const requests = amount(row?.requests) ?? 0;
  return {
    requests,
    standIn: requests > 0 && amount(row?.syntheticRequests) === requests,
    inputTokens: input.every(value => value === null) ? null : input.reduce<number>((sum, value) => sum + (value ?? 0), 0),
    outputTokens: metric("outputTokens"),
    costUsd: amount(cost?.attributedSubtotalUsd) ?? amount(cost?.estimatedSubtotalUsd) ?? amount(cost?.reportedSubtotalUsd),
    costComplete: cost?.status === "complete"
  };
}

/** Tokens and cost so far, in one phrase. Cost is a catalog estimate unless the provider reported it, so it says so. */
function renderChatUsage(totals: ChatUsageTotals): string {
  if (totals.standIn) return "stand-in model: no tokens used, no cost";
  if (totals.requests === 0) return "no model requests yet";
  const counted = totals.inputTokens === null && totals.outputTokens === null ? "tokens not reported by the provider"
    : `${tokens(totals.inputTokens ?? 0)} tokens in, ${tokens(totals.outputTokens ?? 0)} out`;
  const cost = totals.costUsd === null ? "cost unknown" : `cost about $${totals.costUsd.toFixed(totals.costUsd < 0.01 ? 4 : 2)}${totals.costComplete ? "" : " or more"} (estimated)`;
  return `${counted} · ${cost}`;
}

function renderContext(reading: ChatContextReading | null): string | null {
  if (reading === null || reading.promptTokens === null || reading.windowTokens === null || reading.windowTokens <= 0) return null;
  return `context ${Math.round(reading.promptTokens / reading.windowTokens * 100)}% of ${tokens(reading.windowTokens)} (estimated)`;
}

/** The dim line under each reply: recorded or not, the turn's ending, session usage so far, and context fill. */
export function renderTurnFooter(input: { readonly recorded: boolean; readonly turn: number | undefined; readonly ending: string | undefined;
  readonly usage: unknown; readonly context: ChatContextReading | null }): string {
  const parts = [input.recorded ? "reply recorded" : "no reply recorded",
    `turn ${input.turn ?? "?"} ${input.ending === "blocked" ? "ended by AMC before its next step (blocked)" : input.ending ?? "has no recorded ending"}`, renderChatUsage(chatUsageTotals(input.usage)), renderContext(input.context)];
  return chalk.dim(`── ${parts.filter(part => part !== null).join(" · ")}`);
}

/** At most six lines on leaving chat; the details are in /status. */
export function renderExitSummary(input: { readonly sessionId: string; readonly summary: NativeChatChildSummary | null;
  readonly resume: string; readonly verify: string }): string[] {
  const ending = input.summary?.endings.at(-1);
  const turns = input.summary?.endings.length ?? 0;
  return [
    `Session ${input.sessionId} · ${turns} turn${turns === 1 ? "" : "s"}${ending === undefined ? "" : ` · last turn ${ending.reason}`}`,
    `Usage: ${renderChatUsage(chatUsageTotals(input.summary?.usage))}`,
    `Resume in this workspace: ${input.resume}`,
    `Check the record: ${input.verify}`,
    "Details: type /status during a chat, or run amc session show <session id>."
  ];
}

/** /cost: the session's usage and the cost projection behind the footer. */
export function renderCostLines(summary: NativeChatChildSummary | null): string[] {
  if (summary === null) return ["No task has run in this chat yet, so there is no usage to show."];
  const totals = chatUsageTotals(summary.usage);
  if (totals.standIn || totals.requests === 0) return [`This session: ${renderChatUsage(totals)}.`];
  return [`This session: ${renderChatUsage(totals)}.`, renderNativeCost(record(summary.usage)?.cost),
    "Estimates use the model price list AMC ships with; your provider's bill is what counts."];
}

/** /status: everything the exit summary and the per-turn lines leave out. */
export function renderStatusLines(input: { readonly scope: readonly string[]; readonly notes: readonly string[]; readonly shell: string | null;
  readonly summary: NativeChatChildSummary | null;
  readonly resume: string | null; readonly verify: string | null }): string[] {
  const lines = [...input.scope];
  if (input.shell !== null) lines.push(input.shell);
  lines.push(...input.notes);
  if (input.summary !== null) {
    lines.push(renderNativeRunUsage(input.summary.usage, { requestWindow: "latest" }), renderNativeRunDiagnostics(input.summary.diagnostics),
      `Public task validation: ${input.summary.validation?.status ?? "unavailable"}. Passing the selected checks does not show the work is correct.`);
  }
  if (input.resume !== null) lines.push(`Resume in this workspace: ${input.resume}`);
  if (input.verify !== null) lines.push(`Check the record: ${input.verify}`);
  return lines;
}
