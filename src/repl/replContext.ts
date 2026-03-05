/**
 * REPL session context — tracks state across the interactive session.
 * Pure in-memory, no persistence.
 */

export interface ReplContext {
  agentId: string;
  score: number | null;
  trustLabel: string | null;
  level: number | null;
  gaps: number | null;
  studioRunning: boolean | null;
  commandHistory: string[];
  lastCommand: string | null;
  lastOutput: string | null;
  sessionStart: number;
  commandCount: number;
}

export function createReplContext(agentId?: string): ReplContext {
  return {
    agentId: agentId ?? "default",
    score: null,
    trustLabel: null,
    level: null,
    gaps: null,
    studioRunning: null,
    commandHistory: [],
    lastCommand: null,
    lastOutput: null,
    sessionStart: Date.now(),
    commandCount: 0,
  };
}

export function updateContextFromOutput(ctx: ReplContext, cmd: string, output: string): void {
  ctx.lastCommand = cmd;
  ctx.lastOutput = output;
  ctx.commandCount++;
  ctx.commandHistory.push(cmd);

  // Parse score from quickscore output
  const scoreMatch = output.match(/(?:composite|overall|score)[:\s]+(\d+(?:\.\d+)?)\s*(?:\/\s*5)?/i);
  if (scoreMatch?.[1]) {
    ctx.score = parseFloat(scoreMatch[1]);
  }

  // Parse trust label
  const trustMatch = output.match(/(UNRELIABLE|BASIC|TRUSTED|HIGH TRUST|AUTONOMOUS|CERTIFIED)/i);
  if (trustMatch?.[1]) {
    ctx.trustLabel = trustMatch[1].toUpperCase();
  }

  // Parse level
  const levelMatch = output.match(/L(\d)\b/);
  if (levelMatch?.[1]) {
    ctx.level = parseInt(levelMatch[1], 10);
  }

  // Parse gap count
  const gapMatch = output.match(/(\d+)\s+(?:evidence\s+)?gaps?/i);
  if (gapMatch?.[1]) {
    ctx.gaps = parseInt(gapMatch[1], 10);
  }
}

export function formatStatusLine(ctx: ReplContext): string {
  const parts: string[] = [ctx.agentId];
  if (ctx.trustLabel) parts.push(ctx.trustLabel);
  if (ctx.score !== null) parts.push(`${ctx.score.toFixed(1)}/5`);
  if (ctx.gaps !== null) parts.push(`${ctx.gaps} gaps`);
  if (ctx.studioRunning !== null) parts.push(ctx.studioRunning ? "Studio: on" : "Studio: off");
  return parts.join(" │ ");
}
