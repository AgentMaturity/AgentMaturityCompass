/**
 * LIVE-VAULT-18: .amc/studio/sessions is read on every authenticated request (verifyTrackedSessionToken,
 * revokeSessionByToken, A4's router sessions), so records expired for more than a day are deleted when a session is
 * created. A revoked record that has not expired stays, so its token keeps failing as "session revoked"; an unparseable
 * file is left alone.
 * ponytail: paced once per 5 minutes per process; a long-idle Studio prunes on the next login, which is enough.
 */
import { readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { readUtf8 } from "../utils/fs.js";

const EXPIRED_FOR_MS = 24 * 60 * 60_000;
const PACE_MS = 5 * 60_000;
let lastPruneTs = Number.NEGATIVE_INFINITY;

export function pruneSessions(dir: string, now = Date.now()): void {
  if (now - lastPruneTs < PACE_MS) return;
  lastPruneTs = now;
  let names: string[];
  try { names = readdirSync(dir).filter((name) => name.endsWith(".json")); } catch { return; }
  for (const name of names) {
    try {
      const { expiresTs } = JSON.parse(readUtf8(join(dir, name))) as { expiresTs?: unknown };
      if (typeof expiresTs === "number" && expiresTs < now - EXPIRED_FOR_MS) rmSync(join(dir, name), { force: true });
    } catch { /* unparseable or unreadable: left alone */ }
  }
}
