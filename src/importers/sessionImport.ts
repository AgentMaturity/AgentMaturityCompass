/** Recognises a Claude Code transcript, a `codex exec --json` stream or an ATIF trajectory, before the generic decoders. */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ProductionTrace } from "../agents/traceIngestion.js";
import { atifUnfollowed, looksLikeAtif, parseAtifTrajectory } from "./atifTrajectory.js";
import { looksLikeClaudeCodeTranscript, parseClaudeCodeTranscript } from "./claudeCodeTranscript.js";
import { looksLikeCodexExecJson, parseCodexExecJson } from "./codexExecJson.js";
import { countTimes, readJsonLines, sessionTraces, sessionWarnings, type SessionImportContext, type SessionImportFormat, type SessionStep } from "./sessionImportCommon.js";

export interface ParsedSessionImport {
  format: SessionImportFormat;
  /** What is stored for the candidate: one projected row per step, text as digests unless --keep-text. */
  rows: Array<Record<string, unknown>>;
  traces: (target: { agentId: string; source: string }) => ProductionTrace[];
  warnings: (source: string) => string[];
  /** Secret-shaped values removed from the step text before anything was kept. */
  redactionCount: number;
}

function parsed(raw: { format: SessionImportFormat; steps: SessionStep[] }, ctx: SessionImportContext, extra: string[] = []): ParsedSessionImport {
  const result = { format: countTimes(raw.format, raw.steps, ctx.now), steps: raw.steps };
  const rows = result.steps.map((step) => ({ id: step.step, step: step.step, sourceStep: step.sourceStep ?? null, kind: step.kind, tool: step.tool ?? null,
    model: step.model ?? null, outcome: step.outcome, tokens: step.tokens ?? null, stopReason: step.stopReason ?? null, input: step.input ?? null, output: step.output ?? null }));
  return { format: result.format, rows, traces: (target) => sessionTraces(result.format, result.steps, ctx, target),
    warnings: (source) => [...sessionWarnings(result.format, source), ...extra.map((line) => `${source}: ${line}`)],
    redactionCount: ctx.redactions?.count ?? 0 };
}

export function detectSessionImport(text: string, fileFormat: string, context: SessionImportContext): ParsedSessionImport | null {
  const ctx = { ...context, redactions: { count: 0 } };
  if (fileFormat === "json") {
    let document: unknown;
    try { document = JSON.parse(text) as unknown; } catch { return null; }
    if (!looksLikeAtif(document)) return null;
    const unfollowed = atifUnfollowed(document);
    return parsed(parseAtifTrajectory(document, ctx), ctx,
      unfollowed > 0 ? [`${unfollowed} embedded or continued trajectory reference(s) were counted and not imported.`] : []);
  }
  if (fileFormat !== "jsonl") return null;
  const read = readJsonLines(text);
  if (looksLikeCodexExecJson(read.rows)) return parsed(parseCodexExecJson(read, ctx), ctx);
  if (looksLikeClaudeCodeTranscript(read.rows)) return parsed(parseClaudeCodeTranscript(read, ctx), ctx);
  return null;
}

/**
 * The import that already holds exactly these session files for this agent, if any: a second import of the same bytes
 * adds nothing. Only imports made entirely of session formats are compared; an unreadable manifest is ignored.
 */
export function earlierSessionImport(manifestsDir: string, agentId: string,
  candidates: Array<{ digest: string; sourceFormat?: { name: string } }>): string | null {
  const sessionNames = new Set(["claude-code-transcript", "codex-exec-json", "atif-trajectory"]);
  if (candidates.length === 0 || !candidates.every((candidate) => sessionNames.has(candidate.sourceFormat?.name ?? ""))) return null;
  const wanted = candidates.map((candidate) => candidate.digest).sort().join(",");
  if (!existsSync(manifestsDir)) return null;
  for (const entry of readdirSync(manifestsDir).filter((name) => name.endsWith(".json")).sort()) {
    try {
      const manifest = JSON.parse(readFileSync(join(manifestsDir, entry), "utf8")) as { importId?: unknown; agentId?: unknown;
        plan?: { candidates?: Array<{ digest?: unknown }> } };
      const digests = (manifest.plan?.candidates ?? []).map((candidate) => String(candidate.digest)).sort().join(",");
      if (manifest.agentId === agentId && digests === wanted && typeof manifest.importId === "string") return manifest.importId;
    } catch {
      continue;
    }
  }
  return null;
}
