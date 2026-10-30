import YAML from "yaml";
import { loadTrustContext } from "../trust/trustContext.js";
import { join } from "node:path";
import { captureOrgPairs, captureOrgFiles, assertOrgPairsCurrent, orgPairBytes } from "../org/preparedOrgPairs.js";
import { verifyAuditorSignatureBytes } from "../org/orgSignatureBytes.js";
import { canonPath } from "../canon/canonLoader.js";
import { diagnosticBankPath } from "../diagnostic/bank/bankLoader.js";
import { cgxLatestGraphPath, cgxLatestPackPath } from "../cgx/cgxStore.js";
import { promptPolicyPath } from "../prompt/promptPolicyStore.js";
import { mechanicTargetsPath } from "../mechanic/targetsStore.js";
import { canonicalize } from "../utils/json.js";
import { collectAuditBinderLocalData, completeAuditBinderCollection, type AuditBinderCollectionInput } from "./binderCollector.js";
import { auditPolicyPath } from "./auditPolicyStore.js";
import { auditPolicySchema } from "./auditPolicySchema.js";
import { auditMapActivePath, auditMapBuiltinPath } from "./auditMapStore.js";
import { auditMapSchema } from "./auditMapSchema.js";
import { buildBinderProofs } from "./binderProofs.js";
import { inCheckPass } from "../utils/checkPass.js";

export function captureAuditBinderPolicies(workspace: string, includeBuiltin: boolean) {
  const policyPath = auditPolicyPath(workspace), mapPath = auditMapActivePath(workspace), builtinPath = auditMapBuiltinPath(workspace);
  const before = captureOrgPairs(includeBuiltin ? [policyPath, mapPath, builtinPath] : [policyPath, mapPath]);
  const checked = (path: string, kind: "BUNDLE" | "COMPLIANCE_MAPS") => {
    const body = orgPairBytes(before, path), sig = orgPairBytes(before, `${path}.sig`);
    if (body === null || sig === null || !verifyAuditorSignatureBytes(workspace, kind, body, sig).valid)
      throw new Error("audit policy or map signature is invalid");
    return body;
  };
  const policy = auditPolicySchema.parse(YAML.parse(checked(policyPath, "BUNDLE").toString("utf8")) as unknown);
  const map = auditMapSchema.parse(YAML.parse(checked(mapPath, "COMPLIANCE_MAPS").toString("utf8")) as unknown);
  if (includeBuiltin) checked(builtinPath, "COMPLIANCE_MAPS");
  return { policy, map, inputPaths: Object.freeze(before.members.map(row => row.path)), assertCurrent: inCheckPass(() => {
    assertOrgPairsCurrent(before); checked(policyPath, "BUNDLE"); checked(mapPath, "COMPLIANCE_MAPS"); if (includeBuiltin) checked(builtinPath, "COMPLIANCE_MAPS"); assertOrgPairsCurrent(before);
  }) };
}
/** All local facts/selected window rows are observed before the first actual notary await. */
export function prepareAuditBinderCollection(input: AuditBinderCollectionInput, assertOriginal: () => void, includeProofs: boolean) {
  const params = structuredClone(input);
  if (params.trust === undefined) try { params.trust = structuredClone(loadTrustContext()); } catch { /* Existing conformance reader returns unavailable when the operator context cannot load. */ }
  params.nowTs = Number.isFinite(Number(params.nowTs)) ? Number(params.nowTs) : Date.now();
  const cgx = params.scope.type === "AGENT" ? cgxLatestPackPath(params.workspace, params.scope.id)
    : cgxLatestGraphPath(params.workspace, { type: "workspace", id: "workspace" });
  // Exact consumed binding/proof members. This is not a workspace inventory or whole-Ledger CAS.
  const fixed = captureOrgFiles([canonPath(params.workspace), diagnosticBankPath(params.workspace), cgx, promptPolicyPath(params.workspace),
    mechanicTargetsPath(params.workspace), join(params.workspace, ".amc", "transparency", "log.jsonl"),
    join(params.workspace, ".amc", "transparency", "log.seal.json"), join(params.workspace, ".amc", "transparency", "log.seal.sig"),
    join(params.workspace, ".amc", "transparency", "merkle", "current.root.json"), join(params.workspace, ".amc", "transparency", "merkle", "current.root.sig")]);
  assertOriginal();
  const local = collectAuditBinderLocalData(params, true), observed = canonicalize(local);
  const proofs = includeProofs ? buildBinderProofs({ workspace: params.workspace, includeEventKinds: local.includedEventKinds }) : null;
  const assertCurrent = inCheckPass(() => {
    assertOriginal(); assertOrgPairsCurrent(fixed);
    // Re-read only this operation's used projection and exact selected time-window rows; new unrelated valid rows may progress.
    if (canonicalize(collectAuditBinderLocalData(params, true)) !== observed) throw new Error("audit collection inputs changed while signing");
    if (proofs !== null && canonicalize(buildBinderProofs({ workspace: params.workspace, includeEventKinds: local.includedEventKinds })) !== canonicalize(proofs))
      throw new Error("audit inclusion proof inputs changed while signing");
    assertOriginal(); assertOrgPairsCurrent(fixed);
  });
  assertCurrent();
  const inputPaths = Object.freeze([...fixed.members.map(row => row.path),
    ...["evidence.sqlite", "evidence.sqlite-wal", "evidence.sqlite-shm", "ops-policy.yaml", "trust.yaml", "tools.yaml", "budgets.yaml",
      "approval-policy.yaml", "assurance/policy.yaml", "bridge.yaml", "adapters.yaml", "bench/imports/registries.yaml",
      "mechanic/tuning.yaml", "forecast/scheduler.json", "assurance/scheduler.json"].flatMap(path => {
        const body = join(params.workspace, ".amc", path); return path.endsWith(".sqlite") || path.includes(".sqlite-") ? [body] : [body, `${body}.sig`];
      })]);
  return { proofs, inputPaths, assertCurrent, async collect() {
    const collected = await completeAuditBinderCollection(structuredClone(local), params.workspace);
    assertCurrent(); return collected;
  } };
}
