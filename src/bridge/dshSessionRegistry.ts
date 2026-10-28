/**
 * DSH session registrations (P2-17): a lease-holder attestation, made with the installation's hook lease, that AMC's
 * DSH plugin is loaded in a DSH process. The plugin names one session per plugin instance (a random id it draws when
 * DSH loads it) and registers it before its first call, through the hook control route, with DSH's version and the
 * SHA-256 of the plugin module. AMC then measures the plugin module, AMC's transport module and the bound DSH install on
 * disk against the signed installation manifest (.amc/hooks/dsh.json) and records a signed registration bound to that
 * session and manifest. Any mismatch refuses it. Like Pi's (piSessionRegistry.ts), it does not prove DSH ran the plugin:
 * a process holding the lease can register without DSH, and a DSH process that never loaded the plugin is invisible.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { dshSessionSha256 } from "../adapters/dsh/dshIdentity.js";
import { measureDshInstall, type DshInstall } from "../adapters/dsh/dshInstall.js";
import { QUALIFIED_DSH_VERSIONS } from "../adapters/dsh/dshVersions.js";
import { cachedFileSha256, clearPiDigestCache } from "../adapters/pi/piInstall.js";
import { getPurposeKeyHistory } from "../keys/signingKeys.js";
import { hashBinaryOrPath, openLedger, verifyEvidenceEventIntegrity } from "../ledger/ledger.js";
import { verifySignedFileWithAuditor } from "../org/orgSigner.js";
import { verifyReceipt } from "../receipts/receipt.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import { writerFault } from "./hookAuditLatch.js";
import { admitRegistration } from "./hookIntake.js";
import { HookControlError } from "./hookProviders.js";

const MAX_REGISTRATION_BYTES = 16_384;
const RECORD_KIND = "amc.dsh-session-registration/v1";
const PROVIDER_ID = "hook-registration:dsh";
const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);

const registrationInputSchema = z.strictObject({
  hook_event_name: z.literal("session_start"),
  dsh: z.strictObject({ version: z.string().min(1).max(64), sessionId: z.string().uuid(), pluginSha256: sha256Schema }),
});

const recordSchema = z.strictObject({
  kind: z.literal(RECORD_KIND),
  agentId: z.string().min(1),
  dshSessionSha256: sha256Schema,
  dshVersion: z.string().min(1),
  pluginSha256: sha256Schema,
  moduleSha256: sha256Schema,
  dshInstallSha256: sha256Schema,
  manifestSha256: sha256Schema,
  qualified: z.boolean(),
  requestSha256: sha256Schema,
});
type DshRegistrationRecord = z.infer<typeof recordSchema>;

/** What the signed control installation binds (hookProviders/dsh.ts writes it). */
const dshBindingSchema = z.object({
  mode: z.literal("control"), agentId: z.string().min(1), pluginPath: z.string().min(1), pluginSha256: sha256Schema,
  modulePath: z.string().min(1), moduleSha256: sha256Schema,
  dshInstall: z.strictObject({ packageDir: z.string().min(1), version: z.string().min(1), sha256: sha256Schema }).nullable(),
});

export interface DshSessionRegistrationResult {
  registered: true;
  idempotentReplay: boolean;
  provider: "dsh";
  record: DshRegistrationRecord;
  eventId: string;
  receipt: string;
  receiptId: string;
  receiptSha256: string;
}

export type DshSessionRegistration =
  | { readonly status: "registered"; readonly record: DshRegistrationRecord }
  | { readonly status: "missing" }
  | { readonly status: "invalid"; readonly reason: string };

type LedgerHandle = ReturnType<typeof openLedger>;

const eventIdFor = (agentId: string, sessionId: string, manifestSha256: string) =>
  `dsh_registration_${sha256Hex(canonicalize({ agentId, session: dshSessionSha256(sessionId), manifest: manifestSha256 })).slice(0, 44)}`;
const manifestPath = (workspace: string) => join(workspace, ".amc", "hooks", "dsh.json");
const bodySha256 = (record: DshRegistrationRecord) => sha256Hex(Buffer.from(canonicalize(record), "utf8"));
const invalid = (message: string) => new HookControlError("HOOK_CONTROL_INPUT_INVALID", 400, message);

/** Whether a DSH control-route body is a session registration rather than a tool call. */
export function isDshSessionStart(rawInput: string): boolean {
  try {
    return (JSON.parse(rawInput) as { hook_event_name?: unknown }).hook_event_name === "session_start";
  } catch {
    return false;
  }
}

function signedControlManifest(workspace: string): z.infer<typeof dshBindingSchema> & { manifestSha256: string } {
  const path = manifestPath(workspace);
  try {
    const bytes = readFileSync(path);
    if (!verifySignedFileWithAuditor(workspace, path).valid) throw new Error("unsigned");
    return { ...dshBindingSchema.parse(JSON.parse(bytes.toString("utf8"))), manifestSha256: sha256Hex(bytes) };
  } catch {
    throw invalid("DSH session registration needs a signed DSH control installation");
  }
}

/** The plugin module, AMC's transport module and the bound DSH install on disk must be what the signed installation recorded. */
function measuredDsh(manifest: z.infer<typeof dshBindingSchema>, reportedVersion: string): DshInstall {
  if (cachedFileSha256(manifest.pluginPath) !== manifest.pluginSha256) throw invalid("the DSH plugin module on disk is not the module the signed installation bound");
  if (cachedFileSha256(manifest.modulePath) !== manifest.moduleSha256) throw invalid("AMC's DSH transport module on disk is not the module the signed installation bound");
  if (!manifest.dshInstall) throw invalid("the signed installation binds no DSH install; reinstall with dsh on PATH");
  const measured = measureDshInstall(manifest.dshInstall.packageDir);
  if (!measured || measured.sha256 !== manifest.dshInstall.sha256 || measured.version !== manifest.dshInstall.version) {
    throw invalid("the DSH on disk is not the DSH the signed installation bound; reinstall to bind it");
  }
  if (reportedVersion !== measured.version) throw invalid(`this session reports DSH ${reportedVersion}, but the DSH on disk is ${measured.version}`);
  return measured;
}

function verifiedRegistration(ledger: LedgerHandle, eventId: string, agentId: string): DshSessionRegistration {
  const row = ledger.db.prepare("SELECT meta_json FROM evidence_events WHERE id = ? LIMIT 1").get(eventId) as { meta_json: string } | undefined;
  if (!row) return { status: "missing" };
  try {
    const meta = JSON.parse(row.meta_json) as { registration?: unknown; receipt?: unknown };
    const record = recordSchema.parse(meta.registration);
    const integrity = verifyEvidenceEventIntegrity({ ledger, eventId, requireReceipt: true, requireSealedSession: true });
    const receipt = verifyReceipt(String(meta.receipt), getPurposeKeyHistory(ledger.workspace, "receipt"));
    if (!integrity.ok || !receipt.ok || receipt.payload?.kind !== "work_accepted" || receipt.payload.providerId !== PROVIDER_ID
      || receipt.payload.agentId !== agentId || record.agentId !== agentId || receipt.payload.body_sha256 !== bodySha256(record)) {
      return { status: "invalid", reason: "the DSH session registration failed verification" };
    }
    return { status: "registered", record };
  } catch {
    return { status: "invalid", reason: "the DSH session registration failed verification" };
  }
}

/**
 * The verified registration of DSH session `sessionId` for `agentId` under the current installation. Every call
 * rechecks the disk: once the plugin, AMC's transport or the DSH install differs from what the session registered, it
 * is not governed.
 */
export function dshSessionRegistration(ledger: LedgerHandle, agentId: string, sessionId: string): DshSessionRegistration {
  const path = manifestPath(ledger.workspace);
  if (!existsSync(path)) return { status: "missing" };
  const manifestBytes = readFileSync(path);
  const manifestSha256 = sha256Hex(manifestBytes);
  const found = verifiedRegistration(ledger, eventIdFor(agentId, sessionId, manifestSha256), agentId);
  if (found.status !== "registered" || found.record.manifestSha256 !== manifestSha256) return found.status === "registered" ? { status: "missing" } : found;
  const binding = dshBindingSchema.safeParse(JSON.parse(manifestBytes.toString("utf8")));
  const intact = binding.success && binding.data.dshInstall !== null && cachedFileSha256(binding.data.pluginPath) === found.record.pluginSha256
    && cachedFileSha256(binding.data.modulePath) === found.record.moduleSha256
    && measureDshInstall(binding.data.dshInstall.packageDir)?.sha256 === found.record.dshInstallSha256;
  return intact ? found : { status: "invalid", reason: "the AMC DSH plugin, its transport or DSH on disk changed after this session registered" };
}

/** Record (or replay) the registration of one DSH session. A different registration for a recorded session is a conflict. */
export function registerDshSession(input: { workspace: string; authenticatedAgentId: string; rawInput: string; now?: number;
  lease?: { leaseId: string } }): DshSessionRegistrationResult {
  if (Buffer.byteLength(input.rawInput, "utf8") > MAX_REGISTRATION_BYTES) throw invalid("DSH session registration is too large");
  let parsed: z.infer<typeof registrationInputSchema>;
  try {
    parsed = registrationInputSchema.parse(JSON.parse(input.rawInput));
  } catch {
    throw invalid("DSH session registration does not match its schema");
  }
  clearPiDigestCache();
  const manifest = signedControlManifest(input.workspace);
  if (manifest.agentId !== input.authenticatedAgentId) throw invalid("DSH session registration is for another agent's installation");
  if (manifest.pluginSha256 !== parsed.dsh.pluginSha256) throw invalid("the running DSH plugin is not the module the signed installation bound");
  const dsh = measuredDsh(manifest, parsed.dsh.version);
  const record: DshRegistrationRecord = {
    kind: RECORD_KIND, agentId: input.authenticatedAgentId, dshSessionSha256: dshSessionSha256(parsed.dsh.sessionId), dshVersion: dsh.version,
    pluginSha256: manifest.pluginSha256, moduleSha256: manifest.moduleSha256, dshInstallSha256: dsh.sha256, manifestSha256: manifest.manifestSha256,
    qualified: QUALIFIED_DSH_VERSIONS.includes(dsh.version), requestSha256: sha256Hex(Buffer.from(input.rawInput, "utf8")),
  };
  const eventId = eventIdFor(input.authenticatedAgentId, parsed.dsh.sessionId, manifest.manifestSha256);
  const sessionId = `dsh-registration-session-${sha256Hex(eventId).slice(0, 36)}`;
  const ledger = openLedger(input.workspace);
  try {
    const existing = verifiedRegistration(ledger, eventId, input.authenticatedAgentId);
    if (existing.status === "invalid") throw new HookControlError("HOOK_CONTROL_LEDGER_UNAVAILABLE", 503, existing.reason);
    if (existing.status === "registered") {
      if (canonicalize(existing.record) !== canonicalize(record)) throw new HookControlError("HOOK_CONTROL_REPLAY_CONFLICT", 409, "this DSH session is already registered differently");
      const meta = JSON.parse((ledger.db.prepare("SELECT meta_json FROM evidence_events WHERE id = ?").get(eventId) as { meta_json: string }).meta_json) as
        { receipt: string; receipt_id: string; receipt_sha256: string };
      return { registered: true, idempotentReplay: true, provider: "dsh", record, eventId, receipt: meta.receipt, receiptId: meta.receipt_id, receiptSha256: meta.receipt_sha256 };
    }
    const now = input.now ?? Date.now();
    admitRegistration({ workspace: input.workspace, agentId: input.authenticatedAgentId, leaseId: input.lease?.leaseId, session: eventId, provider: "DSH" }, now);
    try {
      ledger.startSession({ sessionId, runtime: "unknown", binaryPath: "amc-bridge-dsh-registration", binarySha256: hashBinaryOrPath("amc-bridge-dsh-registration", "1") });
      const appended = ledger.appendEvidenceWithReceipt({
        id: eventId, ts: now, sessionId, runtime: "unknown", eventType: "audit",
        payload: `${JSON.stringify(record, null, 2)}\n`, payloadExt: "json", inline: false,
        meta: { trustTier: "OBSERVED", registrationSchemaVersion: 1, agentId: input.authenticatedAgentId, provider: "dsh", registration: record,
          bodySha256: bodySha256(record) },
        receipt: { kind: "work_accepted", agentId: input.authenticatedAgentId, providerId: PROVIDER_ID, model: null, bodySha256: bodySha256(record) },
      });
      ledger.sealSession(sessionId);
      return { registered: true, idempotentReplay: false, provider: "dsh", record, eventId: appended.id, receipt: appended.receipt,
        receiptId: appended.receiptId, receiptSha256: appended.receiptSha256 };
    } catch (error) {
      throw writerFault(error, true, "the DSH session registration");
    }
  } finally {
    ledger.close();
  }
}
