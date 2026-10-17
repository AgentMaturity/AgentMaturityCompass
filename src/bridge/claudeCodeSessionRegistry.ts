/**
 * Claude Code session registrations (P1-23): a lease-holder attestation, made with the installation's hook lease by
 * AMC's SessionStart hook, that AMC's hooks run in a Claude Code session. The hook sends the session id, Claude Code's
 * process id (CLAUDE_PID) and its configuration directory. AMC itself then measures, against the signed installation
 * manifest: AMC's hook forwarder entry, the bound Claude Code binary, the executable of that process, and the settings
 * files Claude Code merges (AMC's handlers present exactly, no other hook that can rewrite a tool's input). Any mismatch
 * refuses the registration; otherwise AMC records a signed registration bound to that session and manifest. Every
 * PreToolUse decision rechecks the same files on disk (cached by file identity, fail closed). What this does not prove:
 * a process holding the lease can register without Claude Code running, and AMC cannot prove Claude Code ran a hook.
 * A session without a registration under the current installation is not governed: its tool calls are denied and
 * nothing reads "enforced" for it. AMC cannot see a session in which Claude Code ran none of its hooks.
 */
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { z } from "zod";
import {
  CLAUDE_MANAGED_SETTINGS_DIRS, claudeCodeBindingSchema, claudeSessionHookSources, claudeSessionSha256, processExecutable, QUALIFIED_CLAUDE_CODE_VERSIONS,
  scanClaudeHookSettings, type ClaudeCodeBinding, type ClaudeHookBinding,
} from "../adapters/hookProviders/claudeCode.js";
import { cachedFileSha256, clearPiDigestCache } from "../adapters/pi/piInstall.js";
import { getPurposeKeyHistory } from "../keys/signingKeys.js";
import { hashBinaryOrPath, openLedger, verifyEvidenceEventIntegrity } from "../ledger/ledger.js";
import { verifySignedFileWithAuditor } from "../org/orgSigner.js";
import { verifyReceipt } from "../receipts/receipt.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import { writerFault } from "./hookAuditLatch.js";
import { IntakeCounters, REGISTRATION_LIMITS } from "./hookIntake.js";
import { HookControlError } from "./hookProviders.js";

export const CLAUDE_NOT_GOVERNED_NOTE = "AMC cannot see Claude Code sessions that ran none of AMC's hooks; they are reported as not governed.";
const RECORD_KIND = "amc.claude-code-session-registration/v1";
const PROVIDER_ID = "hook-registration:claude-code";
const MAX_BODY_BYTES = 16_384;
const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);

const registrationInputSchema = z.strictObject({
  hook_event_name: z.literal("SessionStart"),
  session_id: z.string().min(1).max(256),
  amc: z.strictObject({ claudePid: z.number().int().positive(), configDir: z.string().min(1).max(4096) }),
});

const recordSchema = z.strictObject({
  kind: z.literal(RECORD_KIND),
  agentId: z.string().min(1),
  sessionSha256: sha256Schema,
  claudeCodeVersion: z.string().min(1),
  claudeCodeSha256: sha256Schema,
  forwarderSha256: sha256Schema,
  /** The signed installation manifest the registration was made under; a reinstall starts with no registrations. */
  manifestSha256: sha256Schema,
  /** The user settings file of this session's Claude Code configuration directory, scanned at every decision. */
  userSettingsPath: z.string().min(1),
  qualified: z.boolean(),
});
type ClaudeCodeRegistrationRecord = z.infer<typeof recordSchema>;

export type ClaudeCodeRegistration =
  | { readonly status: "registered"; readonly record: ClaudeCodeRegistrationRecord }
  | { readonly status: "missing" }
  | { readonly status: "invalid"; readonly reason: string };

export interface ClaudeCodeRegistrationResult {
  registered: true;
  idempotentReplay: boolean;
  provider: "claude-code";
  record: ClaudeCodeRegistrationRecord;
  eventId: string;
  receiptId: string;
}

const manifestSchema = z.object({
  provider: z.literal("claude-code"), mode: z.literal("control"), agentId: z.string().min(1),
  handlers: z.array(z.object({ eventName: z.string().min(1), handlerSha256: sha256Schema })), claudeCode: claudeCodeBindingSchema,
});
type Manifest = z.infer<typeof manifestSchema> & { manifestSha256: string };
type LedgerHandle = ReturnType<typeof openLedger>;

const invalid = (message: string) => new HookControlError("HOOK_CONTROL_INPUT_INVALID", 400, message);
const manifestPath = (workspace: string) => join(workspace, ".amc", "hooks", "claude-code.json");
/** Every registration row of one session under one installation starts with this; the newest one is the session's active registration. */
const prefixFor = (agentId: string, sessionId: string, manifestSha256: string) =>
  `cc_registration_${sha256Hex(canonicalize({ agentId, session: claudeSessionSha256(sessionId), manifest: manifestSha256 })).slice(0, 44)}`;
const PREFIX_LENGTH = "cc_registration_".length + 44;
// ponytail: in-memory per Bridge process (bounded, hookIntake.ts); a restart resets the window.
const registrationCounters = new IntakeCounters(REGISTRATION_LIMITS);
const bodySha256 = (record: ClaudeCodeRegistrationRecord) => sha256Hex(Buffer.from(canonicalize(record), "utf8"));
const bindings = (manifest: Manifest): ClaudeHookBinding[] => manifest.handlers.map(({ eventName, handlerSha256 }) => ({ eventName, handlerSha256 }));
const defaultManagedDir = () => CLAUDE_MANAGED_SETTINGS_DIRS[process.platform] ?? null;

/** The manifest at `bytes`, parsed; null when it is not a Claude Code control manifest with a binding. */
function parseManifest(bytes: Buffer): Manifest | null {
  try {
    const parsed = manifestSchema.safeParse(JSON.parse(bytes.toString("utf8")));
    return parsed.success ? { ...parsed.data, manifestSha256: sha256Hex(bytes) } : null;
  } catch {
    return null;
  }
}

/** The signed control installation, verified over the exact bytes parsed; anything else refuses registration. */
function signedControlManifest(workspace: string): Manifest {
  const path = manifestPath(workspace);
  try {
    const bytes = readFileSync(path);
    const manifest = verifySignedFileWithAuditor(workspace, path, bytes).valid ? parseManifest(bytes) : null;
    if (manifest) return manifest;
  } catch {
    // Reported below.
  }
  throw invalid("Claude Code session registration needs a signed Claude Code control installation; reinstall to bind Claude Code");
}

/** Why the bound files on disk are not what `binding` recorded, or null. Each is read from a no-follow descriptor. */
function bindingDrift(binding: ClaudeCodeBinding): string | null {
  if (cachedFileSha256(binding.forwarder.path) !== binding.forwarder.sha256) return "AMC's hook forwarder on disk is not the one the installation bound";
  if (!binding.install) return "the installation binds no Claude Code; reinstall with Claude Code on PATH";
  if (cachedFileSha256(binding.install.binaryPath) !== binding.install.sha256) return "the Claude Code on disk is not the one the installation bound";
  return null;
}

/** One recorded registration, verified whole: the row's integrity, its signed receipt (receipt purpose) and its binding. */
function verifiedRegistration(ledger: LedgerHandle, eventId: string, agentId: string): ClaudeCodeRegistration {
  const row = ledger.db.prepare("SELECT meta_json FROM evidence_events WHERE id = ? LIMIT 1").get(eventId) as { meta_json: string } | undefined;
  if (!row) return { status: "missing" };
  try {
    const meta = JSON.parse(row.meta_json) as { registration?: unknown; receipt?: unknown };
    const record = recordSchema.parse(meta.registration);
    const integrity = verifyEvidenceEventIntegrity({ ledger, eventId, requireReceipt: true, requireSealedSession: true });
    const receipt = verifyReceipt(String(meta.receipt), getPurposeKeyHistory(ledger.workspace, "receipt"));
    if (integrity.ok && receipt.ok && receipt.payload?.kind === "work_accepted" && receipt.payload.providerId === PROVIDER_ID
      && receipt.payload.agentId === agentId && record.agentId === agentId && receipt.payload.body_sha256 === bodySha256(record)) {
      return { status: "registered", record };
    }
  } catch {
    // Reported below.
  }
  return { status: "invalid", reason: "the Claude Code session registration failed verification" };
}

/** The newest registration row of one session (ids `<prefix>_<suffix>`, read by primary-key range), verified, with its id. */
function latestRegistration(ledger: LedgerHandle, prefix: string, agentId: string): ClaudeCodeRegistration & { eventId: string | null } {
  const row = ledger.db.prepare("SELECT id FROM evidence_events WHERE id > ? AND id < ? ORDER BY ts DESC, rowid DESC LIMIT 1")
    .get(`${prefix}_`, `${prefix}\``) as { id: string } | undefined;
  return row ? { ...verifiedRegistration(ledger, row.id, agentId), eventId: row.id } : { status: "missing", eventId: null };
}

/**
 * The verified registration of Claude Code session `sessionId` for `agentId` under the current installation: the
 * newest one recorded for the session, which supersedes and closes any earlier one. Every
 * call rechecks the disk: AMC's forwarder, the bound Claude Code and the settings Claude Code merges must still be what
 * the session registered, or the session is not governed.
 */
export function claudeCodeSessionRegistration(ledger: LedgerHandle, agentId: string, sessionId: string,
  managedDir: string | null = defaultManagedDir()): ClaudeCodeRegistration {
  const path = manifestPath(ledger.workspace);
  if (!existsSync(path)) return { status: "missing" };
  const bytes = readFileSync(path);
  const manifest = parseManifest(bytes);
  if (!manifest) return { status: "missing" };
  const { eventId: _eventId, ...found } = latestRegistration(ledger, prefixFor(agentId, sessionId, manifest.manifestSha256), agentId);
  if (found.status !== "registered") return found;
  const drift = bindingDrift(manifest.claudeCode);
  if (drift || found.record.forwarderSha256 !== manifest.claudeCode.forwarder.sha256) {
    return { status: "invalid", reason: `${drift ?? "AMC's hook forwarder changed"} after this session registered` };
  }
  const scan = scanClaudeHookSettings({ workspace: ledger.workspace, userSettingsPath: found.record.userSettingsPath, managedDir, bindings: bindings(manifest) });
  return scan.problem ? { status: "invalid", reason: `${scan.problem}, after this session registered` } : found;
}

/**
 * Record (or replay) the registration of one Claude Code session. Its first registration binds its configuration
 * directory: another is refused. A newer registration under the same installation supersedes the earlier one.
 */
export function registerClaudeCodeSession(input: { workspace: string; authenticatedAgentId: string; rawInput: string; now?: number;
  managedDir?: string | null; lease?: { leaseId: string } }): ClaudeCodeRegistrationResult {
  if (Buffer.byteLength(input.rawInput, "utf8") > MAX_BODY_BYTES) throw invalid("Claude Code session registration is too large");
  let parsed: z.infer<typeof registrationInputSchema>;
  try {
    parsed = registrationInputSchema.parse(JSON.parse(input.rawInput));
  } catch {
    throw invalid("Claude Code session registration does not match its schema");
  }
  if (!isAbsolute(parsed.amc.configDir)) throw invalid("Claude Code's configuration directory must be absolute");
  // A registration measures everything afresh.
  clearPiDigestCache();
  const manifest = signedControlManifest(input.workspace);
  if (manifest.agentId !== input.authenticatedAgentId) throw invalid("Claude Code session registration is for another agent's installation");
  const drift = bindingDrift(manifest.claudeCode);
  if (drift) throw invalid(drift);
  const install = manifest.claudeCode.install!;
  const executable = processExecutable(parsed.amc.claudePid);
  if (!executable || cachedFileSha256(executable) !== install.sha256) {
    throw invalid("this session's Claude Code process is not running the Claude Code the installation bound");
  }
  const userSettingsPath = join(parsed.amc.configDir, "settings.json");
  const scan = scanClaudeHookSettings({ workspace: input.workspace, userSettingsPath, managedDir: input.managedDir === undefined ? defaultManagedDir() : input.managedDir,
    bindings: bindings(manifest) });
  if (scan.problem) throw invalid(scan.problem);
  const extra = scan.foreignHooksBlocked ? null : claudeSessionHookSources({ workspace: input.workspace, configDir: parsed.amc.configDir, pid: parsed.amc.claudePid });
  if (extra) throw invalid(extra);
  const record: ClaudeCodeRegistrationRecord = {
    kind: RECORD_KIND, agentId: input.authenticatedAgentId, sessionSha256: claudeSessionSha256(parsed.session_id), claudeCodeVersion: install.version,
    claudeCodeSha256: install.sha256, forwarderSha256: manifest.claudeCode.forwarder.sha256, manifestSha256: manifest.manifestSha256, userSettingsPath,
    qualified: QUALIFIED_CLAUDE_CODE_VERSIONS.includes(install.version),
  };
  const prefix = prefixFor(input.authenticatedAgentId, parsed.session_id, manifest.manifestSha256);
  const now = input.now ?? Date.now();
  const ledger = openLedger(input.workspace);
  try {
    const existing = latestRegistration(ledger, prefix, input.authenticatedAgentId);
    if (existing.status === "invalid") throw new HookControlError("HOOK_CONTROL_LEDGER_UNAVAILABLE", 503, existing.reason);
    // The configuration directory is the one input the client names: the session's first registration binds it.
    if (existing.status === "registered" && existing.record.userSettingsPath !== record.userSettingsPath) {
      throw new HookControlError("HOOK_CONTROL_REPLAY_CONFLICT", 409, "this Claude Code session registered another configuration directory; AMC keeps the first");
    }
    if (existing.status === "registered" && existing.eventId && canonicalize(existing.record) === canonicalize(record)) {
      const meta = JSON.parse((ledger.db.prepare("SELECT meta_json FROM evidence_events WHERE id = ?").get(existing.eventId) as { meta_json: string }).meta_json) as
        { receipt_id: string };
      return { registered: true, idempotentReplay: true, provider: "claude-code", record, eventId: existing.eventId, receiptId: meta.receipt_id };
    }
    // A new registration, or one that supersedes the session's earlier one: counted per lease and per workspace, never per
    // registration, so churning registrations cannot reset the count. Intake counters are kept by session and lease.
    const refused = registrationCounters.admit({ workspace: resolve(input.workspace), lease: `${input.authenticatedAgentId}\0${input.lease?.leaseId ?? "no-lease"}`,
      session: prefix }, now);
    if (refused !== null) throw new HookControlError("HOOK_CONTROL_RATE_LIMITED", 429, `Claude Code session registrations are over AMC's ${refused} limit; AMC refused this one`);
    const eventId = `${prefix}_${sha256Hex(`${canonicalize(record)}\0${now}\0${randomUUID()}`).slice(0, 16)}`;
    const sessionId = `cc-registration-session-${sha256Hex(eventId).slice(0, 36)}`;
    try {
      ledger.startSession({ sessionId, runtime: "claude", binaryPath: "amc-bridge-claude-registration", binarySha256: hashBinaryOrPath("amc-bridge-claude-registration", "1") });
      const appended = ledger.appendEvidenceWithReceipt({
        id: eventId, ts: now, sessionId, runtime: "claude", eventType: "audit",
        payload: `${JSON.stringify({ record, hookSettingsSha256: scan.digest, managedDelivery: scan.managedDelivery }, null, 2)}\n`, payloadExt: "json", inline: false,
        meta: { trustTier: "OBSERVED", registrationSchemaVersion: 1, agentId: input.authenticatedAgentId, provider: "claude-code", registration: record,
          hookSettingsSha256: scan.digest, managedDelivery: scan.managedDelivery, bodySha256: bodySha256(record) },
        receipt: { kind: "work_accepted", agentId: input.authenticatedAgentId, providerId: PROVIDER_ID, model: null, bodySha256: bodySha256(record) },
      });
      ledger.sealSession(sessionId);
      return { registered: true, idempotentReplay: false, provider: "claude-code", record, eventId: appended.id, receiptId: appended.receiptId };
    } catch (error) {
      // The registration was verified (installation, process and settings) before AMC's writer was reached.
      throw writerFault(error, true, "the Claude Code session registration");
    }
  } finally {
    ledger.close();
  }
}

export interface ClaudeCodeGovernance {
  claim: "enforced_at_claude_code_pretooluse" | "not_governed" | "observed" | "not_evaluated";
  registeredSessions: number;
  qualifiedSessions: number;
  invalidRegistrations: number;
  latestRegistrationAt: string | null;
  note: string;
}

/**
 * What AMC may claim for an agent's Claude Code sessions, from verified registrations under the current installation
 * only: "enforced at Claude Code PreToolUse" while at least one session of a qualified Claude Code registered, otherwise
 * not governed. The installer's status lowers it to not governed unless the installation itself is intact.
 */
export function claudeCodeGovernance(workspace: string, agentId: string): ClaudeCodeGovernance {
  const manifestSha256 = cachedFileSha256(manifestPath(workspace));
  const ledger = openLedger(workspace);
  try {
    const all = ledger.db.prepare("SELECT id, ts, meta_json FROM evidence_events WHERE event_type = 'audit' AND id LIKE 'cc_registration_%' ORDER BY ts ASC, rowid ASC")
      .all() as Array<{ id: string; ts: number; meta_json: string }>;
    // Only each session's newest registration counts: it supersedes the earlier ones.
    const rows = [...new Map(all.map((row) => [row.id.slice(0, PREFIX_LENGTH), row])).values()];
    let registered = 0, qualified = 0, invalidCount = 0, latest: number | null = null;
    for (const row of rows) {
      // Other agents' rows are skipped; an edited agent field can only hide a registration, which lowers the claim.
      if (!row.meta_json.includes(`"agentId":${JSON.stringify(agentId)}`)) continue;
      const found = verifiedRegistration(ledger, row.id, agentId);
      if (found.status === "invalid") invalidCount += 1;
      if (found.status !== "registered" || found.record.manifestSha256 !== manifestSha256) continue;
      registered += 1;
      if (found.record.qualified) qualified += 1;
      latest = row.ts;
    }
    return { claim: qualified > 0 ? "enforced_at_claude_code_pretooluse" : "not_governed", registeredSessions: registered, qualifiedSessions: qualified,
      invalidRegistrations: invalidCount, latestRegistrationAt: latest === null ? null : new Date(latest).toISOString(), note: CLAUDE_NOT_GOVERNED_NOTE };
  } finally {
    ledger.close();
  }
}
