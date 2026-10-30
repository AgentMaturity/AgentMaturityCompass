import { randomUUID } from "node:crypto";
import * as gatewayConfigs from "../gateway/config.js";
import * as fleetConfigs from "../fleet/registry.js";
import * as actionPolicies from "../governor/actionPolicyEngine.js";
import * as toolsConfigs from "../toolhub/toolhubValidators.js";
import { ActionPolicyPublicationError } from "../governor/actionPolicyStore.js";
import { ConfigSignaturePublicationError, captureConfigSignatureAuthority } from "../config/configSignaturePair.js";
import { assertOrgPairsCurrent, captureOrgPairs, type OrgPairsSnapshot } from "../org/preparedOrgPairs.js";
import { getAgentPaths } from "../fleet/paths.js";
import { assertOwnerMode } from "../mode/mode.js";
import { verifyGatewayConfigSignature, signGatewayConfig } from "../gateway/config.js";
import { signActionPolicy, verifyActionPolicySignature } from "../governor/actionPolicyEngine.js";
import { signToolsConfig, verifyToolsConfigSignature } from "../toolhub/toolhubValidators.js";
import {
  resolveAgentId
} from "../fleet/paths.js";
import {
  signAgentConfig,
  signFleetConfig,
  verifyAgentConfigSignature,
  verifyFleetConfigSignature
} from "../fleet/registry.js";
import { openLedger } from "../ledger/ledger.js";
import { sha256Hex } from "../utils/hash.js";

export interface SignatureStatusRow {
  kind: "gateway" | "fleet" | "agent" | "action-policy" | "tools";
  valid: boolean;
  reason: string | null;
  path: string;
  sigPath: string;
}

export interface FixSignaturesResult {
  agentId: string;
  statuses: SignatureStatusRow[];
  resigned: Array<{ kind: "gateway" | "fleet" | "agent" | "action-policy" | "tools"; sigPath: string }>;
  auditEventId: string | null;
}

export function inspectSignatures(workspace: string, agentId?: string): FixSignaturesResult {
  const resolvedAgentId = resolveAgentId(workspace, agentId);
  const gateway = verifyGatewayConfigSignature(workspace);
  const actionPolicy = verifyActionPolicySignature(workspace);
  const tools = verifyToolsConfigSignature(workspace);
  const fleet = verifyFleetConfigSignature(workspace);
  const agent = verifyAgentConfigSignature(workspace, resolvedAgentId);
  return {
    agentId: resolvedAgentId,
    statuses: [
      {
        kind: "gateway",
        valid: gateway.valid,
        reason: gateway.reason,
        path: gateway.configPath,
        sigPath: gateway.sigPath
      },
      {
        kind: "action-policy",
        valid: actionPolicy.valid,
        reason: actionPolicy.reason,
        path: actionPolicy.path,
        sigPath: actionPolicy.sigPath
      },
      {
        kind: "tools",
        valid: tools.valid,
        reason: tools.reason,
        path: tools.path,
        sigPath: tools.sigPath
      },
      {
        kind: "fleet",
        valid: fleet.valid,
        reason: fleet.reason,
        path: fleet.path,
        sigPath: fleet.sigPath
      },
      {
        kind: "agent",
        valid: agent.valid,
        reason: agent.reason,
        path: agent.configPath,
        sigPath: agent.sigPath
      }
    ],
    resigned: [],
    auditEventId: null
  };
}

export function fixSignatures(workspace: string, agentId?: string): FixSignaturesResult {
  const inspected = inspectSignatures(workspace, agentId);
  const resigned: Array<{ kind: "gateway" | "fleet" | "agent" | "action-policy" | "tools"; sigPath: string }> = [];

  for (const row of inspected.statuses) {
    if (row.valid) {
      continue;
    }
    if (row.kind === "gateway") {
      resigned.push({ kind: "gateway", sigPath: signGatewayConfig(workspace) });
    } else if (row.kind === "action-policy") {
      resigned.push({ kind: "action-policy", sigPath: signActionPolicy(workspace) });
    } else if (row.kind === "tools") {
      resigned.push({ kind: "tools", sigPath: signToolsConfig(workspace) });
    } else if (row.kind === "fleet") {
      resigned.push({ kind: "fleet", sigPath: signFleetConfig(workspace).sigPath });
    } else {
      resigned.push({ kind: "agent", sigPath: signAgentConfig(workspace, inspected.agentId).sigPath });
    }
  }

  let auditEventId: string | null = null;
  if (resigned.length > 0) {
    const ledger = openLedger(workspace);
    const sessionId = randomUUID();
    const payload = JSON.stringify({
      auditType: "CONFIG_RESIGNED",
      severity: "LOW",
      agentId: inspected.agentId,
      resigned,
      ts: Date.now()
    });
    try {
      ledger.startSession({
        sessionId,
        runtime: "unknown",
        binaryPath: "amc-fix-signatures",
        binarySha256: sha256Hex("amc-fix-signatures")
      });
      const appended = ledger.appendEvidenceWithReceipt({
        sessionId,
        runtime: "unknown",
        eventType: "audit",
        payload,
        payloadExt: "json",
        inline: true,
        meta: {
          auditType: "CONFIG_RESIGNED",
          severity: "LOW",
          agentId: inspected.agentId,
          resigned,
          trustTier: "OBSERVED"
        },
        receipt: {
          kind: "guard_check",
          agentId: inspected.agentId,
          providerId: "unknown",
          model: null,
          bodySha256: sha256Hex(Buffer.from(payload, "utf8"))
        }
      });
      auditEventId = appended.id;
      ledger.sealSession(sessionId);
    } finally {
      ledger.close();
    }
  }

  const refreshed = inspectSignatures(workspace, inspected.agentId);
  return {
    ...refreshed,
    resigned,
    auditEventId
  };
}

export class FixSignaturesPublicationError extends Error {
  readonly code = "FIX_SIGNATURES_PARTIAL";
  constructor(readonly phase: string, readonly resigned: readonly FixSignaturesResult["resigned"][number][], readonly publishedPaths: readonly string[],
    readonly auditEventId: string | null, readonly auditSessionId: string | null, cause: unknown) {
    super("fix-signatures did not complete; inspect recorded config and audit progress before retrying", { cause });
    this.name = "FixSignaturesPublicationError";
  }
}
/** Maintained bulk path: select and pin invalid targets once, prepare every real signature before the first config write. */
export async function fixSignaturesAsync(workspace: string, agentId?: string): Promise<FixSignaturesResult> {
  assertOwnerMode(workspace, "fix-signatures");
  const requestedAgent = agentId, inspected = inspectSignatures(workspace, requestedAgent), selected = inspected.statuses.filter(row => !row.valid);
  if (selected.length === 0) return inspected;
  const originalAgent = inspected.agentId, snapshots = new Map<SignatureStatusRow["kind"], OrgPairsSnapshot>(
    selected.map(row => [row.kind, captureOrgPairs([row.path])]));
  const currentSelection = inspectSignatures(workspace, originalAgent);
  for (const row of selected) {
    const checked = currentSelection.statuses.find(candidate => candidate.kind === row.kind);
    if (checked === undefined || checked.valid || checked.path !== row.path || checked.sigPath !== row.sigPath)
      throw new Error("selected invalid config signatures changed before preparation; retry");
    assertOrgPairsCurrent(snapshots.get(row.kind)!);
  }
  const original = captureConfigSignatureAuthority(workspace);
  const assertCurrent = (ownPair?: SignatureStatusRow["kind"]) => {
    assertOwnerMode(workspace, "fix-signatures");
    if (resolveAgentId(workspace, requestedAgent) !== originalAgent
      || selected.some(row => row.kind === "agent" && getAgentPaths(workspace, originalAgent).agentConfig !== row.path))
      throw new Error("fix-signatures agent selection changed while signing");
    original.assertCurrent();
    for (const row of selected) if (row.kind !== ownPair) assertOrgPairsCurrent(snapshots.get(row.kind)!);
  };
  assertCurrent();
  type Prepared = { row: SignatureStatusRow; assertCurrent(): void; publish(): string };
  const prepared: Prepared[] = [], resigned: FixSignaturesResult["resigned"] = [], published: string[] = [];
  let phase = "prepare", auditEventId: string | null = null, auditSessionId: string | null = null;
  try {
    for (const row of selected) {
      assertCurrent();
      const previous = snapshots.get(row.kind)!;
      if (row.kind === "gateway") {
        const real = await gatewayConfigs.prepareGatewayConfigPair(workspace, undefined, { previous, beforePublish: () => assertCurrent(row.kind) });
        prepared.push({ row, assertCurrent: real.assertCurrent, publish: () => real.publish().sigPath });
      } else if (row.kind === "action-policy") {
        const real = await actionPolicies.prepareActionPolicyPair(workspace, undefined, { beforePublish: () => assertCurrent(row.kind), assertInputsCurrent: () => assertOrgPairsCurrent(previous) });
        prepared.push({ row, assertCurrent: real.assertCurrent, publish: () => real.publish().signaturePath });
      } else if (row.kind === "tools") {
        const real = await toolsConfigs.prepareToolsConfigPair(workspace, undefined, { beforePublish: () => assertCurrent(row.kind), assertInputsCurrent: () => assertOrgPairsCurrent(previous) });
        prepared.push({ row, assertCurrent: real.assertCurrent, publish: () => real.publish().sigPath });
      } else if (row.kind === "fleet") {
        const real = await fleetConfigs.prepareFleetConfigPair(workspace, undefined, { previous, beforePublish: () => assertCurrent(row.kind) });
        prepared.push({ row, assertCurrent: real.assertCurrent, publish: () => real.publish().sigPath });
      } else {
        const real = await fleetConfigs.prepareAgentConfigPair(workspace, originalAgent, { previous, beforePublish: () => assertCurrent(row.kind) });
        prepared.push({ row, assertCurrent: real.assertCurrent, publish: () => real.publish().sigPath });
      }
      assertCurrent();
    }
    phase = "publish";
    for (const real of prepared) {
      assertCurrent();
      const sigPath = real.publish();
      published.push(...(real.row.kind === "fleet" || real.row.kind === "agent" ? [real.row.path, sigPath] : [sigPath]));
      // Tentative negative comparison state only: the actual publisher must validate its own expected output before another write.
      snapshots.set(real.row.kind, captureOrgPairs([real.row.path]));
      real.assertCurrent(); assertCurrent();
      resigned.push({ kind: real.row.kind, sigPath });
    }
    phase = "audit-open"; assertCurrent();
    const ledger = openLedger(workspace);
    auditSessionId = randomUUID();
    const payload = JSON.stringify({ auditType: "CONFIG_RESIGNED", severity: "LOW", agentId: originalAgent, resigned, ts: Date.now() });
    try {
      phase = "audit-session"; assertCurrent();
      ledger.startSession({ sessionId: auditSessionId, runtime: "unknown", binaryPath: "amc-fix-signatures", binarySha256: sha256Hex("amc-fix-signatures") });
      phase = "audit-event"; assertCurrent();
      const appended = ledger.appendEvidenceWithReceipt({ sessionId: auditSessionId, runtime: "unknown", eventType: "audit", payload, payloadExt: "json", inline: true,
        meta: { auditType: "CONFIG_RESIGNED", severity: "LOW", agentId: originalAgent, resigned, trustTier: "OBSERVED" },
        receipt: { kind: "guard_check", agentId: originalAgent, providerId: "unknown", model: null, bodySha256: sha256Hex(Buffer.from(payload, "utf8")) } });
      auditEventId = appended.id; phase = "audit-seal"; assertCurrent(); ledger.sealSession(auditSessionId);
    } catch (cause) {
      try { ledger.close(); } catch (closeCause) { throw new AggregateError([cause, closeCause], "config audit failed and its ledger handle also failed to close"); }
      throw cause;
    }
    phase = "audit-close"; ledger.close();
    phase = "inspect"; assertCurrent();
    return { ...inspectSignatures(workspace, originalAgent), resigned, auditEventId };
  } catch (cause) {
    if (cause instanceof ConfigSignaturePublicationError || cause instanceof ActionPolicyPublicationError || cause instanceof toolsConfigs.ToolsConfigPublicationError)
      published.push(...cause.publishedPaths);
    throw new FixSignaturesPublicationError(phase, Object.freeze([...resigned]), Object.freeze([...new Set(published)]),
      auditEventId, auditSessionId, cause);
  }
}
