/**
 * A4 presence (P1-57; design §11): who is looking at which card, for 30 seconds. In memory, per Studio process, never
 * deduplicated, journaled or signed: it is a courtesy hint, never evidence and never input to readiness.
 * ponytail: one map per process; a shared store when Studio runs more than one process per workspace.
 */
export const A4_PRESENCE_TTL_MS = 30_000;
const MAX_PER_PROJECT = 64;

const presence = new Map<string, Map<string, { username: string; card: string; ts: number }>>();

/** Records `principalKey` on `card` now and drops entries older than the TTL. */
export function touchPresence(projectId: string, principalKey: string, username: string, card: string, now = Date.now()): void {
  const entries = presence.get(projectId) ?? new Map<string, { username: string; card: string; ts: number }>();
  for (const [key, entry] of entries) if (now - entry.ts > A4_PRESENCE_TTL_MS) entries.delete(key);
  if (entries.size >= MAX_PER_PROJECT && !entries.has(principalKey)) return;
  entries.set(principalKey, { username, card, ts: now });
  presence.set(projectId, entries);
  // Projects nobody has looked at within the TTL are dropped, so the map holds only live projects.
  for (const [id, other] of presence) if ([...other.values()].every((entry) => now - entry.ts > A4_PRESENCE_TTL_MS)) presence.delete(id);
}

/** The live presence of a project: `{ username, card }` per principal seen within the TTL. */
export function presenceOf(projectId: string, now = Date.now()): Array<{ username: string; card: string }> {
  return [...(presence.get(projectId)?.values() ?? [])].filter((entry) => now - entry.ts <= A4_PRESENCE_TTL_MS)
    .map(({ username, card }) => ({ username, card }));
}
