import Database from "better-sqlite3";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  getHookIntegrationStatus,
  type HookIntegrationStatus,
  type HookMode,
  type HookProvider,
} from "../adapters/hookIntegration.js";
import { verifyEvidenceEventIntegrity, type EvidenceLedgerReader } from "../ledger/ledger.js";
import type { EvidenceEvent } from "../types.js";
import { vaultStatus } from "../vault/vault.js";
import { hookActionEvidenceMetaSchema } from "./hookActionLifecycle.js";

export type HookHealthStatus = "not_installed" | "awaiting_first_event" | "observed" | "fail_closed";
export type HookHealthReasonCode =
  | "HOOK_NOT_INSTALLED"
  | "HOOK_INSTALLATION_DRIFTED"
  | "HOOK_INSTALLATION_EXPIRED"
  | "HOOK_INSTALLATION_INVALID"
  | "HOOK_EVENT_NOT_OBSERVED"
  | "HOOK_EVENT_METADATA_INVALID"
  | "HOOK_EVIDENCE_INTEGRITY_FAILED"
  | "HOOK_EVIDENCE_UNAVAILABLE";

export interface HookHealthLastEvent {
  eventId: string;
  eventHash: string;
  eventType: "action.requested" | "action.completed" | "action.failed" | "action.denied";
  actionId: string;
  observedAt: string;
  receiptId: string;
  receiptSha256: string;
  integrity: "verified";
}

export interface HookHealthDiagnostic {
  schemaVersion: "2026-07-13";
  provider: HookProvider;
  agentId: string | null;
  mode: HookMode | null;
  status: HookHealthStatus;
  failClosed: boolean;
  reasonCodes: HookHealthReasonCode[];
  installation: {
    state: HookIntegrationStatus["state"];
    configOwned: boolean;
    manifestValid: boolean;
    leaseValid: boolean;
    expiresAt: string | null;
  };
  evidence: {
    state: "missing" | "verified" | "invalid" | "unavailable";
    eventCount: number;
    lastEvent: HookHealthLastEvent | null;
  };
  repairCommands: string[];
  derivedDiagnostic: true;
  recorded: false;
  proofEligible: false;
  claimBoundary: string;
}

interface IndexedEvidenceEvent extends EvidenceEvent {
  row_id: number;
}

const REASON_ORDER: HookHealthReasonCode[] = [
  "HOOK_INSTALLATION_INVALID",
  "HOOK_INSTALLATION_EXPIRED",
  "HOOK_INSTALLATION_DRIFTED",
  "HOOK_EVIDENCE_UNAVAILABLE",
  "HOOK_EVENT_METADATA_INVALID",
  "HOOK_EVIDENCE_INTEGRITY_FAILED",
  "HOOK_EVENT_NOT_OBSERVED",
  "HOOK_NOT_INSTALLED",
];

const CLAIM_BOUNDARY = "Verified hook events are historical observations, not current liveness, provider availability, execution success beyond the event, or maturity proof.";

function parseMetadata(event: EvidenceEvent): unknown {
  try {
    return JSON.parse(event.meta_json) as unknown;
  } catch {
    return null;
  }
}

function candidateTargetsAgent(metadata: unknown, agentId: string): boolean {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return false;
  const row = metadata as Record<string, unknown>;
  return row.sourceProtocol === "aep" && row.agentId === agentId;
}

function expectedEvidenceType(sourceEventType: HookHealthLastEvent["eventType"]): "tool_action" | "tool_result" {
  return sourceEventType === "action.requested" ? "tool_action" : "tool_result";
}

function installationReason(state: HookIntegrationStatus["state"]): HookHealthReasonCode | null {
  if (state === "drifted") return "HOOK_INSTALLATION_DRIFTED";
  if (state === "expired") return "HOOK_INSTALLATION_EXPIRED";
  if (state === "invalid") return "HOOK_INSTALLATION_INVALID";
  return null;
}

function repairCommands(
  provider: HookProvider,
  state: HookHealthStatus,
  reasons: ReadonlySet<HookHealthReasonCode> = new Set(),
): string[] {
  if (state === "not_installed") {
    return [`amc connect hooks install --provider ${provider} --agent <agent-id>`];
  }
  if (state === "awaiting_first_event") {
    return [`amc connect hooks health --provider ${provider}`];
  }
  if (state === "fail_closed") {
    const commands = [
      `amc connect hooks status --provider ${provider}`,
      `amc connect hooks install --provider ${provider} --dry-run`,
    ];
    if (reasons.has("HOOK_EVIDENCE_UNAVAILABLE")) commands.unshift("amc vault unlock");
    return commands;
  }
  return [];
}

function baseDiagnostic(status: HookIntegrationStatus): Omit<HookHealthDiagnostic, "status" | "failClosed" | "reasonCodes" | "evidence" | "repairCommands"> {
  return {
    schemaVersion: "2026-07-13",
    provider: status.provider,
    agentId: status.agentId,
    mode: status.mode,
    installation: {
      state: status.state,
      configOwned: status.configOwned,
      manifestValid: status.manifestValid,
      leaseValid: status.leaseValid,
      expiresAt: status.expiresTs === null ? null : new Date(status.expiresTs).toISOString(),
    },
    derivedDiagnostic: true,
    recorded: false,
    proofEligible: false,
    claimBoundary: CLAIM_BOUNDARY,
  };
}

function finalize(input: {
  installation: HookIntegrationStatus;
  reasons: Set<HookHealthReasonCode>;
  evidence: HookHealthDiagnostic["evidence"];
}): HookHealthDiagnostic {
  const installationFailure = installationReason(input.installation.state);
  if (installationFailure) input.reasons.add(installationFailure);

  const failClosed = [...input.reasons].some((reason) => [
    "HOOK_INSTALLATION_DRIFTED",
    "HOOK_INSTALLATION_EXPIRED",
    "HOOK_INSTALLATION_INVALID",
    "HOOK_EVENT_METADATA_INVALID",
    "HOOK_EVIDENCE_INTEGRITY_FAILED",
    "HOOK_EVIDENCE_UNAVAILABLE",
  ].includes(reason));
  const status: HookHealthStatus = failClosed
    ? "fail_closed"
    : input.evidence.state === "verified"
      ? "observed"
      : "awaiting_first_event";
  const reasonCodes = REASON_ORDER.filter((reason) => input.reasons.has(reason));
  return {
    ...baseDiagnostic(input.installation),
    status,
    failClosed,
    reasonCodes,
    evidence: input.evidence,
    repairCommands: repairCommands(input.installation.provider, status, input.reasons),
  };
}

export function inspectHookHealth(input: { workspace: string; provider: HookProvider }): HookHealthDiagnostic {
  const workspace = resolve(input.workspace);
  const installation = getHookIntegrationStatus({ workspace, provider: input.provider });
  if (installation.state === "not-installed") {
    return {
      ...baseDiagnostic(installation),
      status: "not_installed",
      failClosed: false,
      reasonCodes: ["HOOK_NOT_INSTALLED"],
      evidence: { state: "missing", eventCount: 0, lastEvent: null },
      repairCommands: repairCommands(installation.provider, "not_installed"),
    };
  }

  const reasons = new Set<HookHealthReasonCode>();
  const installationFailure = installationReason(installation.state);
  if (installationFailure) reasons.add(installationFailure);
  if (!installation.agentId) {
    reasons.add("HOOK_INSTALLATION_INVALID");
    return finalize({
      installation,
      reasons,
      evidence: { state: "unavailable", eventCount: 0, lastEvent: null },
    });
  }

  const databasePath = join(workspace, ".amc", "evidence.sqlite");
  if (!existsSync(databasePath)) {
    reasons.add("HOOK_EVENT_NOT_OBSERVED");
    return finalize({
      installation,
      reasons,
      evidence: { state: "missing", eventCount: 0, lastEvent: null },
    });
  }

  let database: Database.Database | null = null;
  try {
    database = new Database(databasePath, { readonly: true, fileMustExist: true });
    database.pragma("query_only = ON");
    const reader: EvidenceLedgerReader = { workspace, db: database };
    const rows = database.prepare(
      "SELECT rowid AS row_id, * FROM evidence_events WHERE event_type IN ('tool_action', 'tool_result') ORDER BY rowid ASC",
    ).all() as IndexedEvidenceEvent[];
    const tail = database.prepare(
      "SELECT id, blob_ref FROM evidence_events ORDER BY rowid DESC LIMIT 1",
    ).get() as { id: string; blob_ref: string | null } | undefined;

    const matching: Array<{ event: IndexedEvidenceEvent; metadata: ReturnType<typeof hookActionEvidenceMetaSchema.parse> }> = [];
    let malformedMatchingEvent = false;
    for (const event of rows) {
      const metadata = parseMetadata(event);
      if (!candidateTargetsAgent(metadata, installation.agentId)) continue;
      const parsed = hookActionEvidenceMetaSchema.safeParse(metadata);
      if (!parsed.success) {
        malformedMatchingEvent = true;
        continue;
      }
      if (parsed.data.provider !== installation.provider) continue;
      if (event.event_type !== expectedEvidenceType(parsed.data.sourceEventType)) {
        malformedMatchingEvent = true;
        continue;
      }
      matching.push({ event, metadata: parsed.data });
    }

    if (malformedMatchingEvent) reasons.add("HOOK_EVENT_METADATA_INVALID");
    const latest = matching.at(-1) ?? null;
    const encryptedEvidenceNeedsVault = !vaultStatus(workspace).unlocked
      && Boolean(tail?.blob_ref || latest?.event.blob_ref);
    if (encryptedEvidenceNeedsVault) {
      reasons.add("HOOK_EVIDENCE_UNAVAILABLE");
      return finalize({
        installation,
        reasons,
        evidence: { state: "unavailable", eventCount: matching.length, lastEvent: null },
      });
    }

    if (tail) {
      const tailIntegrity = verifyEvidenceEventIntegrity({ ledger: reader, eventId: tail.id });
      if (!tailIntegrity.ok) reasons.add("HOOK_EVIDENCE_INTEGRITY_FAILED");
    }

    if (!latest) {
      if (!malformedMatchingEvent) reasons.add("HOOK_EVENT_NOT_OBSERVED");
      return finalize({
        installation,
        reasons,
        evidence: {
          state: malformedMatchingEvent || reasons.has("HOOK_EVIDENCE_INTEGRITY_FAILED") ? "invalid" : "missing",
          eventCount: matching.length,
          lastEvent: null,
        },
      });
    }

    const latestIntegrity = verifyEvidenceEventIntegrity({
      ledger: reader,
      eventId: latest.event.id,
      requireReceipt: true,
      requireSealedSession: true,
    });
    if (!latestIntegrity.ok) reasons.add("HOOK_EVIDENCE_INTEGRITY_FAILED");
    const evidenceInvalid = malformedMatchingEvent || reasons.has("HOOK_EVIDENCE_INTEGRITY_FAILED");
    return finalize({
      installation,
      reasons,
      evidence: {
        state: evidenceInvalid ? "invalid" : "verified",
        eventCount: matching.length,
        lastEvent: evidenceInvalid ? null : {
          eventId: latest.event.id,
          eventHash: latest.event.event_hash,
          eventType: latest.metadata.sourceEventType,
          actionId: latest.metadata.actionId,
          observedAt: new Date(latest.event.ts).toISOString(),
          receiptId: latest.metadata.receipt_id,
          receiptSha256: latest.metadata.receipt_sha256,
          integrity: "verified",
        },
      },
    });
  } catch {
    reasons.add("HOOK_EVIDENCE_UNAVAILABLE");
    return finalize({
      installation,
      reasons,
      evidence: { state: "unavailable", eventCount: 0, lastEvent: null },
    });
  } finally {
    database?.close();
  }
}
