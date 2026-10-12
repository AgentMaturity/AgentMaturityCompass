/**
 * The audit latch for Claude Code sessions (P1-23, after P1-78's): once an observation of a session cannot be recorded
 * and verified, AMC can no longer audit that session, so every later call in it is denied. The latch lives in the
 * Bridge's memory and in `.amc/hooks/claude-code.latched.json`, which every decision reads; a latch file AMC cannot
 * read latches every session (fail closed). Limit: a latch file deleted while the Bridge restarts is forgotten.
 */
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { z } from "zod";
import { writeFileAtomic } from "../utils/fs.js";

const latchFileSchema = z.strictObject({
  v: z.literal(1),
  sessions: z.array(z.strictObject({ sessionSha256: z.string().regex(/^[a-f0-9]{64}$/), latchedTs: z.number().int(), reason: z.string().max(1_024) })),
});
const latched = new Set<string>();
const latchPath = (workspace: string) => join(workspace, ".amc", "hooks", "claude-code.latched.json");
const memoryKey = (workspace: string, sessionSha256: string) => `${resolve(workspace)}\0${sessionSha256}`;

function readLatchFile(workspace: string): z.infer<typeof latchFileSchema> | null {
  const path = latchPath(workspace);
  return existsSync(path) ? latchFileSchema.parse(JSON.parse(readFileSync(path, "utf8"))) : null;
}

export function latchClaudeSession(workspace: string, sessionSha256: string, reason: string): void {
  latched.add(memoryKey(workspace, sessionSha256));
  try {
    const current = readLatchFile(workspace) ?? { v: 1 as const, sessions: [] };
    if (current.sessions.some((session) => session.sessionSha256 === sessionSha256)) return;
    writeFileAtomic(latchPath(workspace), `${JSON.stringify({ v: 1, sessions: [...current.sessions,
      { sessionSha256, latchedTs: Date.now(), reason: reason.slice(0, 1_024) }] }, null, 2)}\n`, 0o600);
  } catch {
    // The memory latch holds; a latch file AMC cannot read latches every session.
  }
}

export function claudeSessionLatched(workspace: string, sessionSha256: string): boolean {
  if (latched.has(memoryKey(workspace, sessionSha256))) return true;
  try {
    return readLatchFile(workspace)?.sessions.some((session) => session.sessionSha256 === sessionSha256) ?? false;
  } catch {
    return true;
  }
}
