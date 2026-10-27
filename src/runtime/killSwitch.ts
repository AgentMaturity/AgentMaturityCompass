/**
 * The signed runtime kill switch (P2-26 slice B). An OWNER activates it through the API; issuedBy is the authenticated
 * principal and issuedTs the server clock, which the ledger row carries too. Each kill and each release is its own
 * signed file, written to `.amc/runtime/kill-switch/` and mirrored under the control checkpoint root outside the
 * workspace, so activation never reads, locks or rewrites existing workspace state (nothing there can block it), and
 * deleting the workspace copy lifts nothing while the mirror holds the record.
 *
 * Every protected effect reads killSwitchDenial: the tool pipeline's authorization stage and P1-02's recheck, toolhub
 * through activeFreezeStatus, and the gateway before model calls. A record that cannot be read or verified counts as
 * an active workspace stop_all and raises an alert: denial is the safe direction, and whoever can write the file can
 * already stop the pod. Lifting needs a signed OWNER release naming the incident. Break-glass never overrides a kill.
 */
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { verifyHexDigestAny } from "../crypto/keys.js";
import { workspaceOversightPublicKeys } from "../incidents/oversightRecord.js";
import { assertPurposePublicationCurrent, capturePurposePublication } from "../keys/purposePublication.js";
import { signWithPurposeKey } from "../keys/purposeProviders.js";
import { openLedger } from "../ledger/ledger.js";
import { controlCheckpointDir } from "../lifecycle/signedControlJournalRecords.js";
import { appendOpsAuditEvent } from "../ops/audit.js";
import type { ActionClass } from "../types.js";
import { writeFileAtomic } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";

export interface KillSwitchRecord {
  v: 1; killId: string;
  scope: { kind: "workspace" | "agent" | "tool_class" | "provider"; id: string };
  mode: "stop_new_effects" | "stop_all";
  reason: string; incidentId: string | null;
  issuedBy: string; issuedTs: number; signature: string;
}

export interface KillSwitchRelease {
  v: 1; release: true; killId: string; incidentId: string;
  releasedBy: string; releasedTs: number; signature: string;
}

export interface KillSwitchStatus {
  active: boolean;
  kills: KillSwitchRecord[];
  /** Files that could not be read or verified; each counts as an active workspace stop_all. */
  unverifiable: string[];
}

export type KillBoundary = { kind: "tool"; agentId: string; actionClass: ActionClass } | { kind: "model"; agentId: string; providerId: string | null };

const KILL_SWITCH_DENIAL_CODE = "kill_switch_active";
const SCOPES = ["workspace", "agent", "tool_class", "provider"] as const;
const MODES = ["stop_new_effects", "stop_all"] as const;
const ID = /^[A-Za-z0-9._:-]{1,128}$/;

const workspaceDir = (workspace: string) => join(workspace, ".amc", "runtime", "kill-switch");
/** The mirror outside the workspace; null when the checkpoint root is inside it (then only the workspace copy exists). */
function mirrorDir(workspace: string): string | null {
  try { return controlCheckpointDir(workspace, "kill-switch"); } catch { return null; }
}

const killDigest = (record: Omit<KillSwitchRecord, "signature">) => sha256Hex(canonicalize({ ...record, kind: "amc.kill-switch/v1" }));
const releaseDigest = (record: Omit<KillSwitchRelease, "signature">) => sha256Hex(canonicalize({ ...record, kind: "amc.kill-switch-release/v1" }));

function isKill(value: Record<string, unknown>): value is KillSwitchRecord & Record<string, unknown> {
  const scope = value.scope as KillSwitchRecord["scope"] | undefined;
  return value.v === 1 && typeof value.killId === "string" && !!scope && SCOPES.includes(scope.kind) && typeof scope.id === "string"
    && MODES.includes(value.mode as KillSwitchRecord["mode"]) && typeof value.reason === "string" && typeof value.issuedBy === "string"
    && Number.isFinite(value.issuedTs) && typeof value.signature === "string" && (value.incidentId === null || typeof value.incidentId === "string");
}
function isRelease(value: Record<string, unknown>): value is KillSwitchRelease & Record<string, unknown> {
  return value.v === 1 && value.release === true && typeof value.killId === "string" && typeof value.incidentId === "string"
    && typeof value.releasedBy === "string" && Number.isFinite(value.releasedTs) && typeof value.signature === "string";
}

const alerted = new Set<string>();
/** One alert per process per unverifiable file, raised after the current call so no admission path waits on the ledger. */
function alertUnverifiable(workspace: string, files: string[]): void {
  const fresh = files.filter((file) => !alerted.has(`${workspace}\0${file}`));
  if (fresh.length === 0) return;
  for (const file of fresh) alerted.add(`${workspace}\0${file}`);
  setImmediate(() => {
    try {
      appendOpsAuditEvent({ workspace, auditType: "KILL_SWITCH_UNVERIFIABLE", severity: "CRITICAL",
        payload: { files: fresh, treatedAs: "active workspace stop_all", denialCode: KILL_SWITCH_DENIAL_CODE } });
    } catch (error) {
      process.emitWarning(`kill switch: unverifiable records ${fresh.join(", ")} (alert not recorded: ${String(error)})`, "AmcKillSwitchWarning");
    }
  });
}

/** Every kill record in the workspace and the mirror, verified; any file that fails counts as active. */
export function killSwitchStatus(workspace: string): KillSwitchStatus {
  const files = [workspaceDir(workspace), mirrorDir(workspace)].flatMap((dir) => {
    if (dir === null || !existsSync(dir)) return [];
    try {
      return readdirSync(dir).filter((name) => !name.startsWith(".")).map((name) => join(dir, name));
    } catch {
      return [dir];
    }
  });
  if (files.length === 0) return { active: false, kills: [], unverifiable: [] };
  const unverifiable: string[] = [];
  const kills = new Map<string, KillSwitchRecord>();
  const releases = new Set<string>();
  let keys: string[] | null;
  try { keys = workspaceOversightPublicKeys(workspace); } catch { keys = null; }
  for (const file of files) {
    try {
      if (keys === null) throw new Error("verification keys unavailable");
      const value = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
      if (isKill(value)) {
        const { signature, ...unsigned } = value;
        if (!verifyHexDigestAny(killDigest(unsigned as Omit<KillSwitchRecord, "signature">), signature, keys)) throw new Error("bad signature");
        kills.set(value.killId, value);
      } else if (isRelease(value)) {
        const { signature, ...unsigned } = value;
        if (!verifyHexDigestAny(releaseDigest(unsigned as Omit<KillSwitchRelease, "signature">), signature, keys)) throw new Error("bad signature");
        releases.add(`${value.killId}\0${value.incidentId}`);
      } else {
        throw new Error("not a kill-switch record");
      }
    } catch {
      unverifiable.push(file);
    }
  }
  // A release counts only when it names the kill's own incident (or, for a kill opened without one, any incident).
  const active = [...kills.values()].filter((kill) => ![...releases].some((key) => {
    const [killId, incidentId] = key.split("\0");
    return killId === kill.killId && (kill.incidentId === null || kill.incidentId === incidentId);
  }));
  if (unverifiable.length > 0) alertUnverifiable(workspace, unverifiable);
  return { active: active.length > 0 || unverifiable.length > 0, kills: active, unverifiable };
}

function scopeMatches(kill: KillSwitchRecord, boundary: KillBoundary): boolean {
  switch (kill.scope.kind) {
    case "workspace": return true;
    case "agent": return kill.scope.id === boundary.agentId;
    case "tool_class": return boundary.kind === "tool" && kill.scope.id === boundary.actionClass;
    case "provider": return boundary.kind === "model" && kill.scope.id === boundary.providerId;
  }
}

/**
 * The denial reason for an effect at this boundary, or null. stop_new_effects keeps READ_ONLY tools and model calls
 * (the safe state: reads and reconciliation); stop_all refuses everything, model calls included. A record that cannot
 * be read fails closed: the status read throwing denies too.
 */
export function killSwitchDenial(workspace: string, boundary: KillBoundary): string | null {
  let status: KillSwitchStatus;
  try { status = killSwitchStatus(workspace); } catch (error) { return `${KILL_SWITCH_DENIAL_CODE}: kill switch state unreadable (${String(error)})`; }
  if (!status.active) return null;
  if (status.unverifiable.length > 0) return `${KILL_SWITCH_DENIAL_CODE}: unverifiable kill-switch record treated as an active stop_all`;
  const hit = status.kills.find((kill) => scopeMatches(kill, boundary)
    && (kill.mode === "stop_all" || (boundary.kind === "tool" && boundary.actionClass !== "READ_ONLY")));
  return hit ? `${KILL_SWITCH_DENIAL_CODE}: ${hit.killId} (${hit.scope.kind}:${hit.scope.id}, ${hit.mode})` : null;
}

/** The action classes a kill freezes for this agent, for activeFreezeStatus (toolhub's incident-freeze path). */
export function killSwitchFrozenClasses(workspace: string, agentId: string, allClasses: readonly ActionClass[]): { ids: string[]; classes: ActionClass[] } {
  let status: KillSwitchStatus;
  try { status = killSwitchStatus(workspace); } catch { return { ids: ["kill-switch:unreadable"], classes: [...allClasses] }; }
  if (!status.active) return { ids: [], classes: [] };
  if (status.unverifiable.length > 0) return { ids: ["kill-switch:unverifiable"], classes: [...allClasses] };
  const hits = status.kills.filter((kill) => kill.scope.kind === "workspace" || (kill.scope.kind === "agent" && kill.scope.id === agentId)
    || kill.scope.kind === "tool_class");
  const classes = hits.flatMap((kill) => kill.scope.kind === "tool_class" ? [kill.scope.id as ActionClass]
    : allClasses.filter((c) => kill.mode === "stop_all" || c !== "READ_ONLY"));
  return { ids: hits.map((kill) => `kill-switch:${kill.killId}`), classes: [...new Set(classes)] };
}

function publish(workspace: string, name: string, body: object): void {
  const bytes = `${JSON.stringify(body, null, 2)}\n`;
  const targets = [workspaceDir(workspace), mirrorDir(workspace)].filter((dir): dir is string => dir !== null);
  const failures: string[] = [];
  for (const dir of targets) {
    try {
      mkdirSync(dir, { recursive: true });
      writeFileAtomic(join(dir, name), bytes, 0o644);
    } catch (error) {
      failures.push(`${dir}: ${String(error)}`);
    }
  }
  // One durable copy is enough to deny; none at all is an error the caller must see.
  if (failures.length === targets.length) throw new Error(`kill switch record not written: ${failures.join("; ")}`);
}

async function signDigest(workspace: string, digest: string): Promise<string> {
  const captured = capturePurposePublication(workspace, "artifact-seal");
  const signed = await signWithPurposeKey(workspace, "artifact-seal", Buffer.from(digest, "hex"));
  assertPurposePublicationCurrent(workspace, captured, signed);
  return signed.signature.toString("base64");
}

function ledgerAudit(workspace: string, auditType: string, ts: number, meta: Record<string, unknown>): void {
  const ledger = openLedger(workspace);
  try {
    const sessionId = `kill-switch-${randomUUID()}`;
    ledger.startSession({ sessionId, runtime: "unknown", binaryPath: "amc-kill-switch", binarySha256: "amc-kill-switch" });
    ledger.appendEvidence({ sessionId, runtime: "unknown", eventType: "audit", ts, payload: JSON.stringify({ auditType, ...meta }), inline: true,
      meta: { auditType, trustTier: "OBSERVED", ...meta } });
  } finally {
    ledger.close();
  }
}

export interface ActivateKillSwitchInput {
  workspace: string;
  /** The authenticated principal; never a body field. */
  issuedBy: string;
  scope: KillSwitchRecord["scope"];
  mode: KillSwitchRecord["mode"];
  reason: string;
  incidentId: string | null;
  now?: () => number;
}

/** Signs and stores a kill, then records it in the ledger (which opens its incident through the detectors). */
export async function activateKillSwitch(input: ActivateKillSwitchInput): Promise<KillSwitchRecord> {
  if (!input.issuedBy.trim()) throw new Error("kill switch refused: no authenticated principal");
  if (!SCOPES.includes(input.scope.kind) || !ID.test(input.scope.id)) throw new Error("kill switch refused: scope must be workspace, agent, tool_class or provider with a plain id");
  if (!MODES.includes(input.mode)) throw new Error("kill switch refused: mode must be stop_new_effects or stop_all");
  if (!input.reason.trim()) throw new Error("kill switch refused: a reason is required");
  if (input.incidentId !== null && !ID.test(input.incidentId)) throw new Error("kill switch refused: incidentId is not a plain id");
  const unsigned: Omit<KillSwitchRecord, "signature"> = {
    v: 1, killId: `kill_${randomUUID().replace(/-/g, "")}`, scope: { ...input.scope }, mode: input.mode, reason: input.reason,
    incidentId: input.incidentId, issuedBy: input.issuedBy, issuedTs: (input.now ?? Date.now)()
  };
  const record: KillSwitchRecord = { ...unsigned, signature: await signDigest(input.workspace, killDigest(unsigned)) };
  publish(input.workspace, `${record.killId}.json`, record);
  ledgerAudit(input.workspace, "KILL_SWITCH_ACTIVATED", record.issuedTs,
    { killId: record.killId, scope: record.scope, mode: record.mode, incidentId: record.incidentId, issuedBy: record.issuedBy,
      agentId: record.scope.kind === "agent" ? record.scope.id : "workspace" });
  return record;
}

/** An OWNER's signed release of one active kill, linked to an incident. The route checks the OWNER role. */
export async function releaseKillSwitch(input: { workspace: string; releasedBy: string; killId: string; incidentId: string; now?: () => number }): Promise<KillSwitchRelease> {
  if (!input.releasedBy.trim()) throw new Error("kill switch release refused: no authenticated OWNER principal");
  if (!ID.test(input.incidentId)) throw new Error("kill switch release refused: the release must name the incident it closes");
  const kill = killSwitchStatus(input.workspace).kills.find((k) => k.killId === input.killId);
  if (!kill) throw new Error(`kill switch release refused: ${input.killId} is not an active, verified kill`);
  if (kill.incidentId !== null && kill.incidentId !== input.incidentId) {
    throw new Error(`kill switch release refused: ${input.killId} is linked to incident ${kill.incidentId}`);
  }
  const unsigned: Omit<KillSwitchRelease, "signature"> = {
    v: 1, release: true, killId: kill.killId, incidentId: input.incidentId, releasedBy: input.releasedBy, releasedTs: (input.now ?? Date.now)()
  };
  const release: KillSwitchRelease = { ...unsigned, signature: await signDigest(input.workspace, releaseDigest(unsigned)) };
  publish(input.workspace, `${release.killId}.release.json`, release);
  ledgerAudit(input.workspace, "KILL_SWITCH_RELEASED", release.releasedTs,
    { killId: release.killId, incidentId: release.incidentId, releasedBy: release.releasedBy, agentId: "workspace" });
  return release;
}
