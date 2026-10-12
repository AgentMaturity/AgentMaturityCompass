/**
 * The hook audit latch (P1-23): once AMC's own verifying writer cannot record hook evidence, the Bridge refuses every
 * hook request of the scope that writer serves until the owner recovers it.
 *
 * - Trip (`tripHookAuditLatch`): only a `HookWriterFault`, a failure of the writer itself (disk, signing or chain fault)
 *   while recording for a session with a verified registration. Input-driven failures (an unauthenticated, malformed,
 *   oversized, duplicate, conflicting, replayed or over-limit request, a forwarder's own report, or a session with no
 *   verified registration) are refused, and recorded where they reach the writer, but never trip it.
 * - Scope: the writer is the workspace's ledger, shared by every session and provider in it, so a fault latches that
 *   workspace and no other.
 * - Persist (`persistHookAuditLatch`): `<AMC home>/state/hook-audit-latch/<scope>.json`, one file per latched workspace,
 *   outside it (the scope is a digest of its real path, src/keys/highWater.ts), plus the Bridge's memory. A new session,
 *   a re-registration, a later successful write or a restart do not clear it; the file exists only once tripped.
 * - Recover (`recoverHookAuditLatch`): `amc connect hooks recover`, owner mode and vault passphrase, recorded as verified
 *   evidence with the same writer first. A running Bridge keeps its memory latch until it restarts.
 * - Startup (`hookAuditLatchState`): reports the state and never trips; no file, no state directory or an empty ledger
 *   read as not latched.
 *
 * Limits: a Bridge started with another AMC home, or after the machine's user deleted the file, starts unlatched; a
 * write the Bridge never received (it was unreachable) latches nothing.
 */
import { mkdirSync } from "node:fs";
import { z } from "zod";
import { resolveAmcHome } from "../credentials/credentialsPaths.js";
import { workspaceScope } from "../keys/highWater.js";
import { openLedger } from "../ledger/ledger.js";
import { assertOwnerMode } from "../mode/mode.js";
import { ensureContainedDir, readContainedOrNull, removeContained, writeContained } from "../utils/containedFs.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize, parseCanonicalJson } from "../utils/json.js";
import { unlockVault } from "../vault/vault.js";
import { appendVerified } from "./claudeCodeObservations.js";
import { HookControlError } from "./hookProviders.js";

/** AMC's own verifying writer failed; `underRegistration`: it was recording for a session with a verified registration. */
export class HookWriterFault extends HookControlError {
  constructor(message: string, readonly underRegistration: boolean) {
    super("HOOK_CONTROL_LEDGER_UNAVAILABLE", 503, message);
    this.name = "HookWriterFault";
  }
}

/** A writer error as the route answers it: a duplicate row id is a replay (409); anything else is a writer fault. */
export function writerFault(error: unknown, underRegistration: boolean, what: string): HookControlError {
  const message = error instanceof Error ? error.message : String(error);
  return /UNIQUE constraint failed|SQLITE_CONSTRAINT_PRIMARYKEY/i.test(message)
    ? new HookControlError("HOOK_CONTROL_REPLAY_CONFLICT", 409, `${what} repeats one already recorded`)
    : new HookWriterFault(`${what} could not be recorded and verified: ${message}`, underRegistration);
}

const DIR_REL = "state/hook-audit-latch";
const entrySchema = z.strictObject({ type: z.literal("amc.hook-audit-latch"), version: z.literal(1), workspaceScope: z.string(),
  latchedAt: z.iso.datetime(), reason: z.string().max(1_024) });
type Entry = z.infer<typeof entrySchema>;
export type HookAuditLatchState = { latched: false } | { latched: true; reason: string; latchedAt: string | null };
const memory = new Map<string, Entry>();
const fileOf = (scope: string) => `${DIR_REL}/${scope}.json`;

export const latchedMessage = (reason: string) => `AMC latched this workspace's hooks because its writer could not record their evidence (${reason}); `
  + "every hook request is refused until the owner runs `amc connect hooks recover`";

/** The workspace's latch as this process sees it. Reads only: it never trips. A latch file AMC cannot read is still a latch. */
export function hookAuditLatchState(workspace: string): HookAuditLatchState {
  const scope = workspaceScope(workspace);
  const held = memory.get(scope);
  if (held) return { latched: true, reason: held.reason, latchedAt: held.latchedAt };
  let bytes: Buffer | null;
  try {
    bytes = readContainedOrNull(resolveAmcHome(), fileOf(scope), 65_536);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { latched: false };
    return { latched: true, reason: `its latch file cannot be read (${error instanceof Error ? error.message : String(error)})`, latchedAt: null };
  }
  if (bytes === null) return { latched: false };
  try {
    const entry = entrySchema.parse(parseCanonicalJson(bytes));
    return { latched: true, reason: entry.reason, latchedAt: entry.latchedAt };
  } catch {
    return { latched: true, reason: "its latch file is not valid", latchedAt: null };
  }
}

/** Write the latch file of `entry`'s workspace unless one exists; the first fault's reason is kept. */
export function persistHookAuditLatch(entry: Entry): void {
  const home = resolveAmcHome();
  mkdirSync(home, { recursive: true, mode: 0o700 });
  ensureContainedDir(home, DIR_REL);
  if (readContainedOrNull(home, fileOf(entry.workspaceScope), 65_536) === null) writeContained(home, fileOf(entry.workspaceScope), canonicalize(entry), 0o600);
}

/** Latch the workspace whose writer failed: in memory at once, and in AMC home. */
export function tripHookAuditLatch(workspace: string, fault: HookWriterFault): void {
  const scope = workspaceScope(workspace);
  const entry: Entry = { type: "amc.hook-audit-latch", version: 1, workspaceScope: scope, latchedAt: new Date().toISOString(), reason: fault.message.slice(0, 1_024) };
  if (!memory.has(scope)) memory.set(scope, entry);
  try {
    persistHookAuditLatch(entry);
  } catch (error) {
    // The memory latch holds until this Bridge stops.
    process.stderr.write(`[amc] hook audit latch not persisted: ${error instanceof Error ? error.message : String(error)}\n`);
  }
}

/** One hook request of `workspace`: refused while latched (`refuse` makes the error); a writer fault under a registration trips the latch. */
export function guardHookAudit<T>(workspace: string, refuse: (message: string) => Error, run: () => T): T {
  const state = hookAuditLatchState(workspace);
  if (state.latched) throw refuse(latchedMessage(state.reason));
  try {
    return run();
  } catch (error) {
    if (error instanceof HookWriterFault && error.underRegistration) tripHookAuditLatch(workspace, error);
    throw error;
  }
}

/**
 * `amc connect hooks recover`: in owner mode, with the vault passphrase, record the recovery as verified evidence with
 * the workspace's writer (a writer that still fails keeps the latch), then clear the latch.
 */
export function recoverHookAuditLatch(input: { workspace: string; passphrase: string | undefined; now?: number }):
  { recovered: boolean; reason: string | null; eventId: string | null } {
  assertOwnerMode(input.workspace, "connect hooks recover");
  if (!input.passphrase) throw new Error("Recovering latched hooks requires the vault passphrase (AMC_VAULT_PASSPHRASE or interactive input).");
  unlockVault(input.workspace, input.passphrase);
  const state = hookAuditLatchState(input.workspace);
  if (!state.latched) return { recovered: false, reason: null, eventId: null };
  const scope = workspaceScope(input.workspace);
  const now = input.now ?? Date.now();
  const body = { kind: "amc.hook-audit-latch-recovery/v1", workspaceScope: scope, latchedAt: state.latchedAt, reason: state.reason,
    recoveredAt: new Date(now).toISOString() };
  const ledger = openLedger(input.workspace);
  let eventId: string;
  try {
    eventId = appendVerified(ledger, { id: `hooklatchrecovery_${sha256Hex(canonicalize(body)).slice(0, 44)}`, now, body,
      meta: { agentId: "workspace-owner", provider: null, ...body }, receipt: { kind: "guard_check", providerId: "hook-audit-latch" } }).eventId;
  } finally {
    ledger.close();
  }
  try {
    removeContained(resolveAmcHome(), fileOf(scope));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  memory.delete(scope);
  return { recovered: true, reason: state.reason, eventId };
}
