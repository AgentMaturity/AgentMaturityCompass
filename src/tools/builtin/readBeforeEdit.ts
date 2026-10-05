import { createHash } from "node:crypto";
import { readFileSync, realpathSync } from "node:fs";

/**
 * The read-before-edit policy (P4.3).
 *
 * An agent may only edit a file it has read, and only while that file still
 * looks the way it did when it read it. Both halves matter and they defend
 * different things:
 *
 * READ FIRST defends against blind edits. An edit is a find-and-replace over
 * content the model believes is there; performed without reading, it is a
 * guess that either silently matches the wrong thing or fails confusingly.
 *
 * UNCHANGED SINCE defends against everything else. A path is not a stable
 * identity: it can be re-pointed by a symlink, replaced between two calls, or
 * written by another process while the agent was thinking. The recorded
 * content DIGEST is what makes the check about the file rather than the name.
 *
 * Scoped per agent. One agent reading a file must not authorise another's
 * edit — that would make the policy a property of the workspace rather than of
 * what this agent actually knows.
 *
 * A successful write or edit REFRESHES the observation to the version it just
 * produced, so create→edit and edit→edit chains do not demand a re-read of
 * content the agent itself just wrote. Requiring one would train an agent to
 * read reflexively, which defeats the policy by making it noise.
 */

export interface ReadRecord {
  readonly digest: string;
  readonly readAt: number;
}

export type EditVerdict =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: string };

function digestOf(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/**
 * Resolve a path to its real location.
 *
 * Keyed on the canonical path so `./a.txt` and `a.txt` are one entry rather
 * than two, and so a symlink and its target cannot be tracked as different
 * files. Falls back to the given path when the file does not exist yet, which
 * is the normal case for a write.
 */
function canonicalKey(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return path;
  }
}

export class ReadBeforeEditLedger {
  private readonly reads = new Map<string, Map<string, ReadRecord>>();

  /** Record that `agentId` has seen the current contents of `path`. */
  recordRead(agentId: string, path: string, bytes: Buffer): void {
    const perAgent = this.reads.get(agentId) ?? new Map<string, ReadRecord>();
    perAgent.set(canonicalKey(path), { digest: digestOf(bytes), readAt: Date.now() });
    this.reads.set(agentId, perAgent);
  }

  /**
   * May this agent edit this file right now?
   *
   * Re-reads the file rather than trusting the recorded digest, because the
   * question is whether the file changed and only the file can answer that.
   */
  mayEdit(agentId: string, path: string): EditVerdict {
    const record = this.reads.get(agentId)?.get(canonicalKey(path));
    if (!record) {
      return { ok: false, reason: `edit requires reading "${path}" first — read the file, then retry` };
    }
    let current: Buffer;
    try {
      current = readFileSync(path);
    } catch {
      return { ok: false, reason: `"${path}" no longer exists — read it again, then retry` };
    }
    if (digestOf(current) !== record.digest) {
      return { ok: false, reason: `"${path}" changed since you read it — read it again, then retry` };
    }
    return { ok: true };
  }

  /**
   * May this agent write this file?
   *
   * CREATING a file needs no prior read: there is nothing to have read, and
   * refusing would make the first write of every new file impossible.
   * OVERWRITING one does, for the same reason an edit does — a write over
   * content the agent has not seen is a blind destructive act, and the whole
   * point of the policy is that it cannot happen by accident.
   */
  mayWrite(agentId: string, path: string): EditVerdict {
    let exists = true;
    try {
      readFileSync(path);
    } catch {
      exists = false;
    }
    if (!exists) return { ok: true };
    return this.mayEdit(agentId, path);
  }

  /**
   * Whether this agent has an observation for the file at all.
   *
   * Exists so a caller can tell "never read it" from "read it and it changed"
   * without re-deriving the digest.
   */
  hasObserved(agentId: string, path: string): boolean {
    return this.reads.get(agentId)?.has(canonicalKey(path)) === true;
  }

  /** Forget one agent's reads, e.g. when its session ends. */
  forget(agentId: string): void {
    this.reads.delete(agentId);
  }
}
