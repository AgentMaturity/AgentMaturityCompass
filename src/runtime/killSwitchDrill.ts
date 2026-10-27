/**
 * The kill-switch drill (P2-26 slice B) and the signed amc.drill/1 receipt both drills write. The drill runs real tool
 * calls through the real pipeline against a fixture system of record (a JSONL file only the fixture tool appends to),
 * activates a workspace kill, attempts more calls, releases the kill with a signed OWNER release, and passes only when
 * the system of record shows zero effects after activation. The manual fallback (docs/runbooks/kill-switch.md) needs a
 * real cluster; the receipt records its rehearsal as pending until a person runs it and fills the note.
 */
import { randomUUID } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { verifyHexDigestAny } from "../crypto/keys.js";
import { workspaceOversightPublicKeys } from "../incidents/oversightRecord.js";
import { signWithPurposeKey } from "../keys/purposeProviders.js";
import { ToolPipeline } from "../tools/toolPipeline.js";
import { defineTool, ToolRegistry } from "../tools/toolRegistry.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import { activateKillSwitch, releaseKillSwitch } from "./killSwitch.js";

export interface SignedDrillReceipt<T extends object> {
  body: T & { schema: "amc.drill/1"; drillId: string }; digestSha256: string; signature: string;
  /** The signing key, for reference only: a receipt never vouches for itself; verify against the workspace's own key history. */
  signerPublicKeyPem: string;
}

/** Signs a drill receipt with the workspace's artifact-seal key; verifyDrillReceipt checks it against that key history. */
export async function signDrillReceipt<T extends object>(workspace: string, body: T & { schema: "amc.drill/1"; drillId: string }): Promise<SignedDrillReceipt<T>> {
  const digestSha256 = sha256Hex(canonicalize(body));
  const signed = await signWithPurposeKey(workspace, "artifact-seal", Buffer.from(digestSha256, "hex"));
  return { body, digestSha256, signature: signed.signature.toString("base64"), signerPublicKeyPem: signed.publicKeyPem };
}

export function verifyDrillReceipt<T extends object>(workspace: string, receipt: SignedDrillReceipt<T>): boolean {
  return receipt.digestSha256 === sha256Hex(canonicalize(receipt.body))
    && verifyHexDigestAny(receipt.digestSha256, receipt.signature, workspaceOversightPublicKeys(workspace));
}

const MANUAL_FALLBACK_PENDING = {
  status: "pending",
  note: "Rehearse docs/runbooks/kill-switch.md on a kind cluster (scale to zero, deny-all egress NetworkPolicy, provider key revocation) and record the result here; needs a person with a cluster."
} as const;

export interface KillSwitchDrillBody {
  schema: "amc.drill/1"; drillId: string; kind: "kill_switch";
  activatedAt: string; firstDeniedAt: string | null; liftedAt: string;
  actionsAttempted: number; actionsDenied: number; effectsAfterActivation: number;
  result: "pass" | "fail";
  killId: string;
  manualFallbackRehearsal: { status: "pending" | "done"; note: string };
}

/**
 * Runs the drill in `workspace`: one call before activation (it must take effect, proving the fixture works), then
 * `actions` calls under a workspace stop_new_effects kill, then a signed release. Never leaves the kill active.
 */
export async function runKillSwitchDrill(p: { workspace: string; actions?: number; owner?: string }): Promise<SignedDrillReceipt<KillSwitchDrillBody>> {
  const drillId = `drill_${randomUUID().replace(/-/g, "")}`;
  const dir = join(p.workspace, ".amc", "drills", drillId);
  mkdirSync(dir, { recursive: true });
  const systemOfRecord = join(dir, "system-of-record.jsonl");
  const registry = new ToolRegistry();
  registry.define(defineTool({ name: "drill.record_effect", description: "Appends one row to the drill's fixture system of record", actionClass: "WRITE_LOW",
    body: (execution) => { appendFileSync(systemOfRecord, `${JSON.stringify({ ts: Date.now(), callId: execution.callId })}\n`); return { output: "effect", effect: "applied" }; } }));
  const pipeline = new ToolPipeline({ registry, workspace: p.workspace });
  const attempt = () => pipeline.execute({ name: "drill.record_effect", agentId: "default", arguments: {}, requestedMode: "EXECUTE" });
  const effects = () => existsSync(systemOfRecord) ? readFileSync(systemOfRecord, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l) as unknown) : [];

  const baseline = await attempt();
  if (baseline.denied !== null || effects().length !== 1) throw new Error(`kill-switch drill: the fixture call did not take effect before activation (${baseline.denied?.reason ?? "no effect"})`);
  // Effects are counted by row, not by clock: a row in the activation's own millisecond must not be misattributed.
  const effectsBeforeActivation = effects().length;
  const owner = p.owner ?? "drill-owner";
  const kill = await activateKillSwitch({ workspace: p.workspace, issuedBy: owner, scope: { kind: "workspace", id: "workspace" },
    mode: "stop_new_effects", reason: `kill-switch drill ${drillId}`, incidentId: drillId });
  let denied = 0;
  let firstDeniedTs: number | null = null;
  const total = p.actions ?? 5;
  try {
    for (let i = 0; i < total; i += 1) {
      const outcome = await attempt();
      if (outcome.denied?.reason.includes("kill_switch_active")) {
        denied += 1;
        firstDeniedTs ??= Date.now();
      }
    }
  } finally {
    await releaseKillSwitch({ workspace: p.workspace, releasedBy: owner, killId: kill.killId, incidentId: drillId });
  }
  const liftedTs = Date.now();
  const effectsAfter = effects().length - effectsBeforeActivation;
  const body: KillSwitchDrillBody = {
    schema: "amc.drill/1", drillId, kind: "kill_switch", activatedAt: new Date(kill.issuedTs).toISOString(),
    firstDeniedAt: firstDeniedTs === null ? null : new Date(firstDeniedTs).toISOString(), liftedAt: new Date(liftedTs).toISOString(),
    actionsAttempted: total, actionsDenied: denied, effectsAfterActivation: effectsAfter,
    result: effectsAfter === 0 && denied === total ? "pass" : "fail", killId: kill.killId, manualFallbackRehearsal: { ...MANUAL_FALLBACK_PENDING }
  };
  return signDrillReceipt(p.workspace, body);
}
