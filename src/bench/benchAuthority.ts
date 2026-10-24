import YAML from "yaml";
import { captureOrgPairs, orgPairBytes, assertOrgPairsCurrent, captureOrgPairsAuthority, type OrgPairsOptions } from "../org/preparedOrgPairs.js";
import { verifyAuditorSignatureBytes } from "../org/orgSignatureBytes.js";
import { describePolicySigner, assertPolicySignerCurrent } from "../crypto/signing/signer.js";
import { capturePurposePublication } from "../keys/purposePublication.js";
import { boundProviderKey } from "../keys/keyset.js";
import { vaultStatus } from "../vault/vault.js";
import { benchPolicyPath } from "./benchPolicyStore.js";
import { benchPolicySchema } from "./benchPolicySchema.js";
/** Internal actual artifact/comparison operation, fixed BUNDLE and the existing two log kinds. */
export function captureBenchAuthority(workspace:string, options:OrgPairsOptions) {
  const logSigners=[describePolicySigner(workspace,"TRANSPARENCY_ROOT"),describePolicySigner(workspace,"MERKLE_ROOT")];
  if(logSigners.some(row=>row.mode==="VAULT"))capturePurposePublication(workspace,"artifact-seal");
  const fileLog=logSigners.some(row=>row.mode==="VAULT")&&boundProviderKey(workspace,"artifact-seal")===null;
  const current=captureOrgPairsAuthority(workspace,options.beforePublish), inputs=options.assertInputsCurrent, descriptor=Object.freeze({...describePolicySigner(workspace,"BUNDLE")});
  const path=benchPolicyPath(workspace), pair=captureOrgPairs([path]), bytes=orgPairBytes(pair,path), signature=orgPairBytes(pair,`${path}.sig`);
  if(bytes===null||signature===null||!verifyAuditorSignatureBytes(workspace,"BUNDLE",bytes,signature).valid)throw new Error("bench policy signature invalid");
  const policy=benchPolicySchema.parse(YAML.parse(bytes.toString("utf8")) as unknown);
  const assertCurrent=()=>{inputs?.();current();for(const signer of logSigners)assertPolicySignerCurrent(workspace,signer);assertOrgPairsCurrent(pair);
    if(fileLog&&!vaultStatus(workspace).unlocked)throw new Error("vault locked; unlock required for signing");};
  assertCurrent();return {policy,pair,descriptor,assertCurrent};
}
export class BenchProducerPublicationError extends Error {
  readonly code="BENCH_PUBLICATION_INCOMPLETE";
  constructor(readonly completedPaths:readonly string[],readonly completedLogHashes:readonly string[],cause:unknown){
    super("bench publication did not complete; successful file and log effects are retained",{cause});this.name="BenchProducerPublicationError";
  }
}
