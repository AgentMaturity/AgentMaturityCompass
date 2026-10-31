import { captureOrgPairs, assertOrgPairsCurrent, captureOrgPairsAuthority, type OrgPairsSnapshot } from "../org/preparedOrgPairs.js";
import { prepareFileSignatureWithAuditor, signSerializedPayloadWithAuditor } from "../org/orgSigner.js";
import { auditSchedulerStateSchema, type AuditSchedulerState } from "./auditPolicySchema.js";
import { auditSchedulerPath } from "./auditPolicyStore.js";
import { publishAuditFiles, type AuditPublicationOptions } from "./binderPublication.js";

export function saveAuditSchedulerStateSync(workspace: string, state: AuditSchedulerState) {
  const original = captureOrgPairsAuthority(workspace), path = auditSchedulerPath(workspace), before = captureOrgPairs([path]);
  const body = Buffer.from(JSON.stringify(auditSchedulerStateSchema.parse(state), null, 2));
  const signature = Buffer.from(JSON.stringify(signSerializedPayloadWithAuditor(workspace, body.toString("utf8")), null, 2));
  publishAuditFiles(workspace, [{ path, bytes: body }, { path: `${path}.sig`, bytes: signature }], before, original);
  return { path, sigPath: `${path}.sig` };
}
export async function prepareAuditSchedulerState(workspace: string, state: AuditSchedulerState, options: AuditPublicationOptions = {}, previous?: OrgPairsSnapshot) {
  options = { ...options };
  const actor = options.beforePublish; actor?.();
  const original = captureOrgPairsAuthority(workspace), path = auditSchedulerPath(workspace), before = previous ?? captureOrgPairs([path]);
  const body = Buffer.from(JSON.stringify(auditSchedulerStateSchema.parse(structuredClone(state)), null, 2));
  const publicationInputs = () => { actor?.(); options.assertInputsCurrent?.(); options.assertOutputsSafe?.(Object.freeze([path, `${path}.sig`])); original(); };
  const gate = () => { options.assertPreparationInputsCurrent?.(); publicationInputs(); assertOrgPairsCurrent(before); };
  const signature = await prepareFileSignatureWithAuditor(workspace, path, body, "BUNDLE", gate);
  const writes = [{ path, bytes: body }, { path: `${path}.sig`, bytes: Buffer.from(signature.signatureBytes) }];
  const assertCurrent = () => { original(); signature.assertCurrent(); };
  return { path, sigPath: `${path}.sig`, writes, assertCurrent, publish() { publishAuditFiles(workspace, writes, before, () => { publicationInputs(); assertCurrent(); }, gate); return { path, sigPath: `${path}.sig` }; } };
}
export async function saveAuditSchedulerStateAsync(workspace: string, state: AuditSchedulerState, options: AuditPublicationOptions = {}) {
  return (await prepareAuditSchedulerState(workspace, state, options)).publish();
}
