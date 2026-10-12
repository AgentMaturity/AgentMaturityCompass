/**
 * The hook audit latch (P1-23). Once the Bridge cannot record and verify hook evidence for a workspace (a decision, an
 * observation, an admission or a registration fails with a 5xx, or AMC's forwarder reports a write it could not make),
 * AMC can no longer audit that workspace's hooks, and every provider shares the workspace's one ledger writer. From then
 * on the Bridge refuses every hook request of the workspace, whatever its session, event or provider, until the owner
 * recovers it with `amc connect hooks recover` (owner mode, vault passphrase), which first records and verifies the
 * recovery with that same writer.
 *
 * The latch is kept outside the workspace, in `<AMC home>/state/hook-audit-latch.json` (mode 0600, keyed by a digest of
 * the workspace's real path, as src/keys/highWater.ts keys its marks), and in the Bridge's memory. A new session, a
 * re-registration, a later successful write or a restart do not clear it, and a latch file AMC cannot read latches every
 * workspace. A Bridge running in another process keeps its memory latch after a recovery until it restarts. Limits: a
 * Bridge started with another AMC home, or after the machine's user deleted the latch file, starts unlatched; and a
 * write the Bridge never saw (it was unreachable) latches nothing.
 */
import { mkdirSync } from "node:fs";
import { z } from "zod";
import { resolveAmcHome } from "../credentials/credentialsPaths.js";
import { workspaceScope } from "../keys/highWater.js";
import { openLedger } from "../ledger/ledger.js";
import { withControlFileLock } from "../lifecycle/controlFileLock.js";
import { assertOwnerMode } from "../mode/mode.js";
import { ensureContainedDir, readContainedOrNull, writeContained } from "../utils/containedFs.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize, parseCanonicalJson } from "../utils/json.js";
import { unlockVault } from "../vault/vault.js";
import { appendVerified } from "./claudeCodeObservations.js";

const STATE_REL = "state/hook-audit-latch.json";
const entrySchema = z.strictObject({ latchedAt: z.iso.datetime(), reason: z.string().max(1_024) });
const fileSchema = z.strictObject({
  type: z.literal("amc.hook-audit-latch"),
  version: z.literal(1),
  workspaces: z.record(z.string().regex(/^[0-9a-f]{16}$/), entrySchema),
});
type Entry = z.infer<typeof entrySchema>;
const memory = new Map<string, Entry>();

function readLatches(home: string): Record<string, Entry> {
  const bytes = readContainedOrNull(home, STATE_REL, 1_048_576);
  return bytes === null ? {} : fileSchema.parse(parseCanonicalJson(bytes)).workspaces;
}

function updateLatches(home: string, update: (entries: Record<string, Entry>) => Record<string, Entry>): void {
  mkdirSync(home, { recursive: true, mode: 0o700 });
  withControlFileLock({ root: ensureContainedDir(home, "state"), name: "hook-audit-latch", operation: () => {
    const workspaces = update(readLatches(home));
    writeContained(home, STATE_REL, canonicalize(fileSchema.parse({ type: "amc.hook-audit-latch", version: 1, workspaces })), 0o600);
  } });
}

export const latchedMessage = (reason: string) => `AMC latched this workspace's hooks because it could not record their evidence (${reason}); `
  + "every hook request is refused until the owner runs `amc connect hooks recover`";

/** Why the workspace's hooks are latched, or null when they are not. */
export function hookAuditLatch(workspace: string): string | null {
  const scope = workspaceScope(workspace);
  const held = memory.get(scope);
  if (held) return held.reason;
  try {
    return readLatches(resolveAmcHome())[scope]?.reason ?? null;
  } catch (error) {
    return `AMC cannot read its hook audit latch: ${error instanceof Error ? error.message : String(error)}`;
  }
}

export function latchHookAudit(workspace: string, reason: string): void {
  const scope = workspaceScope(workspace);
  const entry = { latchedAt: new Date().toISOString(), reason: reason.slice(0, 1_024) };
  if (!memory.has(scope)) memory.set(scope, entry);
  try {
    updateLatches(resolveAmcHome(), (entries) => (entries[scope] ? entries : { ...entries, [scope]: entry }));
  } catch (error) {
    // The memory latch holds until this Bridge stops.
    process.stderr.write(`[amc] hook audit latch not persisted: ${error instanceof Error ? error.message : String(error)}\n`);
  }
}

/**
 * One hook request of `workspace`: refused while its hooks are latched (`refuse` makes the error the route answers), and
 * a request that fails with a 5xx or an unexpected error latches them.
 */
export function guardHookAudit<T>(workspace: string, refuse: (message: string) => Error, run: () => T): T {
  const reason = hookAuditLatch(workspace);
  if (reason !== null) throw refuse(latchedMessage(reason));
  try {
    return run();
  } catch (error) {
    const status = (error as { statusCode?: unknown } | null)?.statusCode;
    if (typeof status !== "number" || status >= 500) latchHookAudit(workspace, error instanceof Error ? error.message : String(error));
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
  const scope = workspaceScope(input.workspace);
  const home = resolveAmcHome();
  const entry = readLatches(home)[scope] ?? memory.get(scope) ?? null;
  if (entry === null) return { recovered: false, reason: null, eventId: null };
  const now = input.now ?? Date.now();
  const body = { kind: "amc.hook-audit-latch-recovery/v1", workspaceScope: scope, latchedAt: entry.latchedAt, reason: entry.reason,
    recoveredAt: new Date(now).toISOString() };
  const ledger = openLedger(input.workspace);
  let eventId: string;
  try {
    eventId = appendVerified(ledger, { id: `hooklatchrecovery_${sha256Hex(canonicalize(body)).slice(0, 44)}`, now, body,
      meta: { agentId: "workspace-owner", provider: null, ...body }, receipt: { kind: "guard_check", providerId: "hook-audit-latch" } }).eventId;
  } finally {
    ledger.close();
  }
  updateLatches(home, (entries) => Object.fromEntries(Object.entries(entries).filter(([key]) => key !== scope)));
  memory.delete(scope);
  return { recovered: true, reason: entry.reason, eventId };
}
