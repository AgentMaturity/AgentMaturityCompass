/**
 * Provider register and exit drill (P2-26 slice D). The register lists the providers an agent depends on, from
 * configuration (the signed gateway config's upstreams, the key providers bound to signing purposes, and the evidence
 * store), each with its exit: an alternate declared in a change envelope, or a safe stop. P1-27's AIBOM can replace
 * the configuration read when it carries these entries.
 *
 * The drill disables provider A at the gateway with a provider-scoped stop_all kill, checks that model calls to A
 * fail closed, then asks whether an alternate may take over: only one the agent's change envelope admits does; an
 * undeclared one (or any, with no envelope) is blocked as an out-of-envelope change. It releases the kill and writes a
 * signed amc.drill/1 receipt. DORA's exit-plan duty (register row eu-dora) is the motivation; AMC claims no conformity.
 */
import { randomUUID } from "node:crypto";
import { loadActiveCompiledPolicy } from "../catalog/compiler/activate.js";
import { loadGatewayConfig } from "../gateway/config.js";
import { boundProviderKey } from "../keys/keyset.js";
import { activeChangeEnvelope, evaluateChangeEnvelope, ledgerTestPassed } from "./changeEnvelope.js";
import type { AgentVersionManifest } from "../lifecycle/versionManifest.js";
import { activateKillSwitch, killSwitchDenial, releaseKillSwitch } from "./killSwitch.js";
import { signDrillReceipt, type SignedDrillReceipt } from "./killSwitchDrill.js";

interface ProviderRegisterEntry {
  providerId: string;
  kind: "model" | "key" | "storage";
  source: string;
  exit: { kind: "alternate"; alternate: string } | { kind: "safe_stop" };
}

const KEY_PURPOSES = ["artifact-seal", "ledger-row", "config-signature"] as const;

/** Model upstreams, key providers and storage from configuration; an alternate only where an envelope declares one. */
function buildProviderRegister(workspace: string, agentId: string): ProviderRegisterEntry[] {
  const { envelope } = activeChangeEnvelope(workspace, agentId);
  const declared = envelope?.allowed.filter((entry) => entry.component === "model" && entry.rule === "digest_in_set").flatMap((entry) => entry.values) ?? [];
  let upstreams: string[] = [];
  try { upstreams = Object.keys(loadGatewayConfig(workspace).upstreams); } catch { upstreams = []; }
  const model = upstreams.map((providerId): ProviderRegisterEntry => {
    const alternate = declared.find((value) => !value.startsWith(`${providerId}/`));
    return { providerId, kind: "model", source: "gateway.yaml upstreams",
      exit: alternate === undefined ? { kind: "safe_stop" } : { kind: "alternate", alternate } };
  });
  const keys = KEY_PURPOSES.map((purpose): ProviderRegisterEntry => {
    let provider = "file";
    try { provider = boundProviderKey(workspace, purpose)?.binding.provider ?? "file"; } catch { provider = "unknown"; }
    return { providerId: `${provider}:${purpose}`, kind: "key", source: "keyset bindings", exit: { kind: "safe_stop" } };
  });
  return [...model, ...keys, { providerId: "sqlite-ledger", kind: "storage", source: ".amc/evidence.sqlite", exit: { kind: "safe_stop" } }];
}

export interface ProviderExitDrillBody {
  schema: "amc.drill/1"; drillId: string; kind: "provider_exit";
  provider: string; disabledAt: string; liftedAt: string;
  /** Model calls to the disabled provider were refused. */
  failClosed: boolean;
  alternate: { model: string; outcome: "switched" | "blocked_out_of_envelope" | "blocked_no_envelope"; envelopeId: string | null; reasons: string[] } | null;
  register: ProviderRegisterEntry[];
  result: "pass" | "fail";
  basis: string;
}

/**
 * Runs the drill for `agentId`. `alternate`, when given, is the provider and model the agent would switch to, with
 * every other component as the envelope's baseline pins it; the drill records whether the envelope admits the switch. Passes when calls to A fail closed and the alternate's outcome is the one
 * the envelope dictates. Never leaves the kill active.
 */
export async function runProviderExitDrill(p: {
  workspace: string; agentId: string; provider: string; alternate?: { providerId: string; model: string }; owner?: string; nowTs?: number;
}): Promise<SignedDrillReceipt<ProviderExitDrillBody>> {
  const drillId = `drill_${randomUUID().replace(/-/g, "")}`;
  const owner = p.owner ?? "drill-owner";
  const kill = await activateKillSwitch({ workspace: p.workspace, issuedBy: owner, scope: { kind: "provider", id: p.provider }, mode: "stop_all",
    reason: `provider exit drill ${drillId}`, incidentId: drillId });
  let failClosed: boolean;
  let alternate: ProviderExitDrillBody["alternate"] = null;
  try {
    failClosed = killSwitchDenial(p.workspace, { kind: "model", agentId: p.agentId, providerId: p.provider }) !== null;
    if (p.alternate) {
      const model = `${p.alternate.providerId}/${p.alternate.model}`;
      const { envelope, problem } = activeChangeEnvelope(p.workspace, p.agentId);
      if (envelope === null && problem === null) {
        alternate = { model, outcome: "blocked_no_envelope", envelopeId: null, reasons: ["no change envelope declares an alternate"] };
      } else {
        let regulated: boolean;
        try { regulated = loadActiveCompiledPolicy(p.workspace) !== null; } catch { regulated = true; }
        // Judged as a regulated workspace would be, with the recorded test results: the drill shows what a switch would meet.
        const live: AgentVersionManifest | null = envelope === null ? null
          : { ...envelope.baseline, model: { providerId: p.alternate.providerId, model: p.alternate.model, providerReportedVersion: null } };
        const decision = live === null
          ? { outcome: "block" as const, envelopeId: null, reasons: [problem ?? "no envelope"] }
          : evaluateChangeEnvelope({ live, envelope, envelopeProblem: problem, regulated: true, nowTs: p.nowTs ?? Date.now(),
          testPassed: ledgerTestPassed(p.workspace) });
        alternate = { model, outcome: decision.outcome === "allow_in_envelope" ? "switched" : "blocked_out_of_envelope", envelopeId: decision.envelopeId,
          reasons: [...decision.reasons, ...(regulated ? [] : ["workspace not regulated: outside the drill an out-of-envelope switch is a warning"])] };
      }
    }
  } finally {
    await releaseKillSwitch({ workspace: p.workspace, releasedBy: owner, killId: kill.killId, incidentId: drillId });
  }
  const body: ProviderExitDrillBody = {
    schema: "amc.drill/1", drillId, kind: "provider_exit", provider: p.provider, disabledAt: new Date(kill.issuedTs).toISOString(),
    liftedAt: new Date().toISOString(), failClosed, alternate, register: buildProviderRegister(p.workspace, p.agentId),
    result: failClosed ? "pass" : "fail",
    basis: "Designed to support an ICT third-party exit plan (register row eu-dora); no conformity claim."
  };
  return signDrillReceipt(p.workspace, body);
}
