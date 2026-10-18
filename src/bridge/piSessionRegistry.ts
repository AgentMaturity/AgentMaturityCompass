/**
 * Pi session registrations (P1-22): a lease-holder attestation, made with the installation's hook lease, that AMC's Pi
 * extension is running in a Pi session. In control mode the extension registers each Pi session at `session_start`,
 * through the hook control route, with Pi's version, its session id and the SHA-256 of its own module. AMC itself then
 * measures the installed `.pi/extensions/amc.js`, AMC's extension module and the bound Pi install on disk, compares
 * them with the signed installation manifest, and records a signed registration bound to that session and to that
 * manifest. Any mismatch refuses the registration. What this does not prove: a process holding the lease can still
 * register without Pi running, and AMC cannot prove Pi executed the hook; it proves only that every allowed call went
 * through AMC with a signed receipt. Claims derive from registrations under the current installation: a Pi session
 * without one is not governed, its calls are denied, and nothing reads "enforced" for it. AMC cannot see a Pi session
 * in which Pi did not load the extension at all; it is reported as not governed. New registrations are capped per lease
 * and per workspace (hookIntake.ts), never per session, so churning sessions cannot reset a cap; a fault of AMC's own
 * writer while recording a verified registration latches the workspace's hooks (hookAuditLatch.ts).
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { piSessionSha256 } from "../adapters/pi/piIdentity.js";
import { cachedFileSha256, clearPiDigestCache, measurePiInstall, type PiInstall } from "../adapters/pi/piInstall.js";
import { isQualifiedPiVersion } from "../adapters/pi/piVersions.js";
import { getPurposeKeyHistory } from "../keys/signingKeys.js";
import { hashBinaryOrPath, openLedger, verifyEvidenceEventIntegrity } from "../ledger/ledger.js";
import { verifySignedFileWithAuditor } from "../org/orgSigner.js";
import { verifyReceipt } from "../receipts/receipt.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import { writerFault } from "./hookAuditLatch.js";
import { admitRegistration } from "./hookIntake.js";
import { HookControlError } from "./hookProviders.js";

export const NOT_GOVERNED_NOTE = "AMC cannot see sessions where Pi did not load the extension; they are reported as not governed.";
const MAX_REGISTRATION_BYTES = 16_384;
const RECORD_KIND = "amc.pi-session-registration/v1";
const PROVIDER_ID = "hook-registration:pi";
const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);

const registrationInputSchema = z.strictObject({
  hook_event_name: z.literal("session_start"),
  pi: z.strictObject({
    version: z.string().min(1).max(64),
    mode: z.enum(["tui", "rpc", "json", "print"]),
    sessionId: z.string().min(1).max(512),
    extensionSha256: sha256Schema,
  }),
});

const recordSchema = z.strictObject({
  kind: z.literal(RECORD_KIND),
  agentId: z.string().min(1),
  piSessionSha256: sha256Schema,
  piVersion: z.string().min(1),
  extensionSha256: sha256Schema,
  /** AMC's own measurement of the bound Pi install at registration (piInstall.ts). */
  piInstallSha256: sha256Schema,
  /** The signed installation manifest the registration was made under; a reinstall starts with no registrations. */
  manifestSha256: sha256Schema,
  mode: z.string().min(1),
  qualified: z.boolean(),
  requestSha256: sha256Schema,
});
type PiRegistrationRecord = z.infer<typeof recordSchema>;

export interface PiSessionRegistrationResult {
  registered: true;
  idempotentReplay: boolean;
  provider: "pi";
  record: PiRegistrationRecord;
  eventId: string;
  receipt: string;
  receiptId: string;
  receiptSha256: string;
}

export type PiSessionRegistration =
  | { readonly status: "registered"; readonly record: PiRegistrationRecord }
  | { readonly status: "missing" }
  | { readonly status: "invalid"; readonly reason: string };

type LedgerHandle = ReturnType<typeof openLedger>;

const eventIdFor = (agentId: string, sessionId: string, manifestSha256: string) =>
  `pi_registration_${sha256Hex(canonicalize({ agentId, session: piSessionSha256(sessionId), manifest: manifestSha256 })).slice(0, 44)}`;
const manifestPath = (workspace: string) => join(workspace, ".amc", "hooks", "pi.json");
const fileSha256 = cachedFileSha256;
const ledgerSessionFor = (eventId: string) => `pi-registration-session-${sha256Hex(eventId).slice(0, 36)}`;
const bodySha256 = (record: PiRegistrationRecord) => sha256Hex(Buffer.from(canonicalize(record), "utf8"));
const invalid = (message: string) => new HookControlError("HOOK_CONTROL_INPUT_INVALID", 400, message);

/** Whether a control-route body is a Pi session registration rather than a tool_call. */
export function isPiSessionStart(rawInput: string): boolean {
  try {
    return (JSON.parse(rawInput) as { hook_event_name?: unknown }).hook_event_name === "session_start";
  } catch {
    return false;
  }
}

const signedManifestSchema = z.object({
  mode: z.literal("control"), agentId: z.string().min(1), extensionSha256: sha256Schema, moduleSha256: sha256Schema, modulePath: z.string().min(1),
  piInstall: z.strictObject({ packageDir: z.string().min(1), version: z.string().min(1), sha256: sha256Schema }).nullable(),
});

/** The signed control installation and the SHA-256 of its manifest bytes; anything else refuses registration. */
function signedControlManifest(workspace: string): z.infer<typeof signedManifestSchema> & { manifestSha256: string } {
  const path = manifestPath(workspace);
  try {
    const bytes = readFileSync(path);
    if (!verifySignedFileWithAuditor(workspace, path).valid) throw new Error("unsigned");
    return { ...signedManifestSchema.parse(JSON.parse(bytes.toString("utf8"))), manifestSha256: sha256Hex(bytes) };
  } catch {
    throw invalid("Pi session registration needs a signed Pi control installation");
  }
}

/**
 * AMC's own measurements at registration: the installed extension file, AMC's extension module and the bound Pi install
 * must all be what the signed installation recorded, and the session must report the bound Pi's version.
 */
function measuredPi(workspace: string, manifest: ReturnType<typeof signedControlManifest>, reportedVersion: string): PiInstall {
  if (fileSha256(join(workspace, ".pi", "extensions", "amc.js")) !== manifest.extensionSha256) {
    throw invalid("the installed .pi/extensions/amc.js is not the file the signed installation wrote");
  }
  if (fileSha256(manifest.modulePath) !== manifest.moduleSha256) throw invalid("AMC's Pi extension module on disk is not the module the signed installation bound");
  if (!manifest.piInstall) throw invalid("the signed installation binds no Pi install; reinstall with Pi on PATH");
  const measured = measurePiInstall(manifest.piInstall.packageDir);
  if (!measured || measured.sha256 !== manifest.piInstall.sha256 || measured.version !== manifest.piInstall.version) {
    throw invalid("the Pi on disk is not the Pi the signed installation bound; reinstall to bind it");
  }
  if (reportedVersion !== measured.version) throw invalid(`this session reports Pi ${reportedVersion}, but the Pi on disk is ${measured.version}`);
  return measured;
}

/** One recorded registration, verified whole: the row's integrity, its signed receipt (receipt purpose) and its binding. */
function verifiedRegistration(ledger: LedgerHandle, eventId: string, agentId: string): PiSessionRegistration {
  const row = ledger.db.prepare("SELECT meta_json FROM evidence_events WHERE id = ? LIMIT 1").get(eventId) as { meta_json: string } | undefined;
  if (!row) return { status: "missing" };
  try {
    const meta = JSON.parse(row.meta_json) as { registration?: unknown; receipt?: unknown };
    const record = recordSchema.parse(meta.registration);
    const integrity = verifyEvidenceEventIntegrity({ ledger, eventId, requireReceipt: true, requireSealedSession: true });
    const receipt = verifyReceipt(String(meta.receipt), getPurposeKeyHistory(ledger.workspace, "receipt"));
    if (!integrity.ok || !receipt.ok || receipt.payload?.kind !== "work_accepted" || receipt.payload.providerId !== PROVIDER_ID
      || receipt.payload.agentId !== agentId || record.agentId !== agentId || receipt.payload.body_sha256 !== bodySha256(record)) {
      return { status: "invalid", reason: "the Pi session registration failed verification" };
    }
    return { status: "registered", record };
  } catch {
    return { status: "invalid", reason: "the Pi session registration failed verification" };
  }
}

/** Whether the extension file, AMC's module and the Pi install on disk are still what `record`'s installation bound. */
function stillOnDisk(workspace: string, manifestBytes: Buffer, record: PiRegistrationRecord): boolean {
  const manifest = signedManifestSchema.safeParse(JSON.parse(manifestBytes.toString("utf8")));
  return manifest.success && manifest.data.piInstall !== null
    && fileSha256(join(workspace, ".pi", "extensions", "amc.js")) === manifest.data.extensionSha256
    && fileSha256(manifest.data.modulePath) === record.extensionSha256
    && measurePiInstall(manifest.data.piInstall.packageDir)?.sha256 === record.piInstallSha256;
}

/**
 * The verified registration of Pi session `sessionId` for `agentId` under the current installation, read through an
 * open ledger. Every call rechecks the disk (cheaply, see cachedFileSha256): once the extension file, AMC's module or
 * the Pi install differs from what the session registered, the session is not governed.
 */
export function piSessionRegistration(ledger: LedgerHandle, agentId: string, sessionId: string): PiSessionRegistration {
  const path = manifestPath(ledger.workspace);
  if (!existsSync(path)) return { status: "missing" };
  const manifestBytes = readFileSync(path);
  const manifestSha256 = sha256Hex(manifestBytes);
  const found = verifiedRegistration(ledger, eventIdFor(agentId, sessionId, manifestSha256), agentId);
  if (found.status !== "registered") return found;
  if (found.record.manifestSha256 !== manifestSha256) return { status: "missing" };
  return stillOnDisk(ledger.workspace, manifestBytes, found.record) ? found
    : { status: "invalid", reason: "the AMC extension or Pi on disk changed after this session registered" };
}

/** Record (or replay) the registration of one Pi session. A different registration for a recorded session is a conflict. */
export function registerPiSession(input: { workspace: string; authenticatedAgentId: string; rawInput: string; now?: number;
  lease?: { leaseId: string } }): PiSessionRegistrationResult {
  if (Buffer.byteLength(input.rawInput, "utf8") > MAX_REGISTRATION_BYTES) throw invalid("Pi session registration is too large");
  let parsed: z.infer<typeof registrationInputSchema>;
  try {
    parsed = registrationInputSchema.parse(JSON.parse(input.rawInput));
  } catch {
    throw invalid("Pi session registration does not match its schema");
  }
  // A registration measures everything afresh.
  clearPiDigestCache();
  const manifest = signedControlManifest(input.workspace);
  if (manifest.agentId !== input.authenticatedAgentId) throw invalid("Pi session registration is for another agent's installation");
  if (manifest.moduleSha256 !== parsed.pi.extensionSha256) throw invalid("the running Pi extension is not the module the signed installation bound");
  const pi = measuredPi(input.workspace, manifest, parsed.pi.version);
  const record: PiRegistrationRecord = {
    kind: RECORD_KIND, agentId: input.authenticatedAgentId, piSessionSha256: piSessionSha256(parsed.pi.sessionId),
    piVersion: pi.version, extensionSha256: parsed.pi.extensionSha256, piInstallSha256: pi.sha256, manifestSha256: manifest.manifestSha256,
    mode: parsed.pi.mode, qualified: isQualifiedPiVersion(pi.version), requestSha256: sha256Hex(Buffer.from(input.rawInput, "utf8")),
  };
  const eventId = eventIdFor(input.authenticatedAgentId, parsed.pi.sessionId, manifest.manifestSha256);
  const sessionId = ledgerSessionFor(eventId);
  const ledger = openLedger(input.workspace);
  try {
    const existing = verifiedRegistration(ledger, eventId, input.authenticatedAgentId);
    if (existing.status === "invalid") throw new HookControlError("HOOK_CONTROL_LEDGER_UNAVAILABLE", 503, existing.reason);
    if (existing.status === "registered") {
      if (canonicalize(existing.record) !== canonicalize(record)) {
        throw new HookControlError("HOOK_CONTROL_REPLAY_CONFLICT", 409, "this Pi session is already registered differently");
      }
      const meta = JSON.parse((ledger.db.prepare("SELECT meta_json FROM evidence_events WHERE id = ?").get(eventId) as { meta_json: string }).meta_json) as
        { receipt: string; receipt_id: string; receipt_sha256: string };
      return { registered: true, idempotentReplay: true, provider: "pi", record, eventId, receipt: meta.receipt, receiptId: meta.receipt_id, receiptSha256: meta.receipt_sha256 };
    }
    const now = input.now ?? Date.now();
    admitRegistration({ workspace: input.workspace, agentId: input.authenticatedAgentId, leaseId: input.lease?.leaseId, session: eventId, provider: "Pi" }, now);
    try {
      ledger.startSession({ sessionId, runtime: "pi", binaryPath: "amc-bridge-pi-registration", binarySha256: hashBinaryOrPath("amc-bridge-pi-registration", "1") });
      const appended = ledger.appendEvidenceWithReceipt({
        id: eventId, ts: now, sessionId, runtime: "pi", eventType: "audit",
        payload: `${JSON.stringify(record, null, 2)}\n`, payloadExt: "json", inline: false,
        meta: { trustTier: "OBSERVED", registrationSchemaVersion: 1, agentId: input.authenticatedAgentId, provider: "pi", registration: record,
          bodySha256: bodySha256(record) },
        receipt: { kind: "work_accepted", agentId: input.authenticatedAgentId, providerId: PROVIDER_ID, model: null, bodySha256: bodySha256(record) },
      });
      ledger.sealSession(sessionId);
      return { registered: true, idempotentReplay: false, provider: "pi", record, eventId: appended.id, receipt: appended.receipt,
        receiptId: appended.receiptId, receiptSha256: appended.receiptSha256 };
    } catch (error) {
      // The registration was verified (signed installation, extension, AMC module and Pi install on disk) before AMC's writer was reached.
      throw writerFault(error, true, "the Pi session registration");
    }
  } finally {
    ledger.close();
  }
}

export interface PiGovernance {
  claim: "enforced_at_pi_tool_call" | "not_governed" | "observed" | "not_evaluated";
  registeredSessions: number;
  qualifiedSessions: number;
  invalidRegistrations: number;
  latestRegistrationAt: string | null;
  note: string;
}

/**
 * What AMC may claim for an agent's Pi sessions, from verified registrations under the current installation only:
 * "enforced at Pi's tool_call hook" for registered sessions of a qualified Pi, otherwise not governed. The installer's
 * status lowers the claim to not governed unless the installation itself is intact. Sessions Pi ran without the
 * extension are invisible.
 */
export function piGovernance(workspace: string, agentId: string): PiGovernance {
  const manifestSha256 = fileSha256(manifestPath(workspace));
  const ledger = openLedger(workspace);
  try {
    const rows = ledger.db.prepare("SELECT id, ts, meta_json FROM evidence_events WHERE event_type = 'audit' AND id LIKE 'pi_registration_%' ORDER BY ts ASC")
      .all() as Array<{ id: string; ts: number; meta_json: string }>;
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
    return { claim: qualified > 0 ? "enforced_at_pi_tool_call" : "not_governed", registeredSessions: registered, qualifiedSessions: qualified,
      invalidRegistrations: invalidCount, latestRegistrationAt: latest === null ? null : new Date(latest).toISOString(), note: NOT_GOVERNED_NOTE };
  } finally {
    ledger.close();
  }
}
