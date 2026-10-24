import { statSync } from "node:fs";
import { resolve } from "node:path";
import { sha256Hex } from "../utils/hash.js";
import { captureTransparencyState, assertTransparencyStateCurrent } from "../transparency/workspacePublication.js";
import { appendTransparencyEntryAsync } from "../transparency/asyncWorkspaceAppend.js";
import { prepareFileSignatureWithAuditor } from "../org/orgSigner.js";
import type { OrgPairsOptions } from "../org/preparedOrgPairs.js";
import { captureBenchData } from "./benchCollector.js";
import { benchArtifactData, normalizeBenchScope, type createBenchArtifact, type BenchCreateResult } from "./benchArtifact.js";
import { buildBenchProofs, benchProofFileBytes } from "./benchProofs.js";
import { benchArtifactSchema, benchBuildMetaSchema, benchSignatureSchema } from "./benchSchema.js";
import { captureBenchAuthority, BenchProducerPublicationError } from "./benchAuthority.js";
import { benchArchiveBytes, captureBenchArchiveTargets, assertBenchArchiveTargets, publishBenchArchive, BenchArchiveWriteError } from "./benchArchivePublication.js";
export async function createBenchArtifactAsync(params:Parameters<typeof createBenchArtifact>[0],options:OrgPairsOptions={}):Promise<BenchCreateResult>{
  const input=structuredClone(params),workspace=input.workspace,authority=captureBenchAuthority(workspace,options),outFile=resolve(workspace,input.outFile),before=captureBenchArchiveTargets(outFile);
  const {scopeType,scopeId}=normalizeBenchScope(input);
  const collected=captureBenchData({workspace,scopeType,scopeId,windowDays:Math.max(1,input.windowDays??30),policy:authority.policy,named:input.named,labels:input.labels});
  const proofState=captureTransparencyState(workspace,true),bundle=buildBenchProofs({workspace,includeEventKinds:collected.collected.includedEventKinds});assertTransparencyStateCurrent(proofState);
  const proofFiles=benchProofFileBytes(bundle),data=benchArtifactData(collected.collected,bundle),bench=benchArtifactSchema.parse({...data.bench,proofBindings:{...data.bench.proofBindings,transparencyRootSha256:proofFiles.transparencyRootSha256,merkleRootSha256:proofFiles.merkleRootSha256,includedEventProofIds:proofFiles.proofIds}});
  const buildMeta=benchBuildMetaSchema.parse(collected.collected.buildMeta),selected=()=>{authority.assertCurrent();collected.assertCurrent();assertTransparencyStateCurrent(proofState);authority.assertCurrent();};
  // Known selected policy/proof destinations must never be overwritten by the requested archive/checksum.
  const inputPaths=new Set([...authority.pair.members.map(row=>resolve(row.path)),...proofState.keys()].map(path=>resolve(path)));
  const noInputAlias=()=>{for(const row of before){if(inputPaths.has(row.path))throw new Error("bench outputs must differ from selected policy and proof inputs");
    if(row.identity!==null)for(const path of inputPaths){let identity:string|null=null;try{const stat=statSync(path);if(stat.isFile())identity=`${stat.dev}:${stat.ino}`;}catch(error){if((error as NodeJS.ErrnoException).code!=="ENOENT")throw error;}
      if(identity===row.identity)throw new Error("bench outputs must differ from selected policy and proof inputs");}}};noInputAlias();
  let paths:readonly string[]=[],logs:string[]=[];
  try{selected();const prepared=await prepareFileSignatureWithAuditor(workspace,"bench.json",Buffer.from(JSON.stringify(bench)),"BUNDLE");selected();prepared.assertCurrent();
    const signature=benchSignatureSchema.parse(JSON.parse(prepared.signatureBytes)),signerPub=signature.envelope?Buffer.from(signature.envelope.pubkeyB64,"base64").toString("utf8"):authority.descriptor.publicKeyPem;
    if(signerPub!==authority.descriptor.publicKeyPem)throw new Error("bench signer changed while preparing");
    const bytes=benchArchiveBytes({bench,signature,signerPub,proofs:proofFiles,calculationManifest:data.calculationManifest,piiScan:data.piiScan,buildMeta});
    const current=()=>{selected();prepared.assertCurrent();noInputAlias();},after=publishBenchArchive(workspace,before,bytes,current);paths=after.map(row=>row.path);
    const beforeLog=()=>{current();assertBenchArchiveTargets(after);};beforeLog();
    const transparency=await appendTransparencyEntryAsync({workspace,type:"BENCH_CREATED",agentId:scopeType==="AGENT"?scopeId:"workspace",artifact:{kind:"amcbench",sha256:sha256Hex(bytes),id:bench.benchId}},{beforeCommit:beforeLog});logs.push(transparency.hash);
    // The producer's own successful append changes the selected proof/log state. Do not mistake that effect for a stale-input failure.
    authority.assertCurrent();prepared.assertCurrent();assertBenchArchiveTargets(after);
    return {outFile,sha256:sha256Hex(bytes),bench,signature,piiScan:data.piiScan,buildMeta,transparencyHash:transparency.hash};
  }catch(cause){if(cause instanceof BenchArchiveWriteError)paths=cause.completedPaths;throw new BenchProducerPublicationError(Object.freeze([...paths]),Object.freeze([...logs]),cause);}
}
