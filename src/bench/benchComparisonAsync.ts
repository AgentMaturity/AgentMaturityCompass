import { resolve } from "node:path";
import { resolveAgentId } from "../fleet/paths.js";
import { canonicalize } from "../utils/json.js";
import { sha256Hex } from "../utils/hash.js";
import { captureOrgPairs, assertOrgPairsCurrent, prepareOrgPairsAsync, OrgPairsPublicationError, type OrgPairsOptions } from "../org/preparedOrgPairs.js";
import { appendTransparencyEntryAsync } from "../transparency/asyncWorkspaceAppend.js";
import { benchComparisonWithInputs,loadImportedBenchObjects,type createBenchComparison } from "./benchComparer.js";
import { captureBenchData } from "./benchCollector.js";
import { captureBenchAuthority,BenchProducerPublicationError } from "./benchAuthority.js";
import { benchComparisonLatestPath } from "./benchPolicyStore.js";
export async function createBenchComparisonAsync(params:Parameters<typeof createBenchComparison>[0],options:OrgPairsOptions={}){
  const input={...params},workspace=input.workspace,authority=captureBenchAuthority(workspace,options),path=benchComparisonLatestPath(workspace),previous=captureOrgPairs([path]);
  const scopeType=input.scope==="workspace"?"WORKSPACE":input.scope==="node"?"NODE":"AGENT",scopeId=scopeType==="AGENT"?resolveAgentId(workspace,input.id||"default"):scopeType==="NODE"?input.id:"workspace";
  const local=captureBenchData({workspace,scopeType,scopeId,windowDays:30,policy:authority.policy}),population=structuredClone(loadImportedBenchObjects(workspace)),populationBefore=canonicalize(population);
  const comparison=benchComparisonWithInputs(input,local.collected.bench,population,authority.policy),bytes=Buffer.from(JSON.stringify(comparison,null,2));
  const selected=()=>{authority.assertCurrent();local.assertCurrent();if(canonicalize(loadImportedBenchObjects(workspace))!==populationBefore)throw new Error("selected bench comparison population changed while signing");authority.assertCurrent();};
  let paths:readonly string[]=[],logs:string[]=[];
  try{selected();const prepared=await prepareOrgPairsAsync(workspace,[{path,bytes}],{beforePublish:selected},previous);const saved=prepared.publish()[0]!;paths=[saved.path,saved.sigPath];
    prepared.assertCurrent(); const published=captureOrgPairs([path]);
    const beforeLog=()=>{selected();prepared.assertCurrent();};beforeLog();
    const transparency=await appendTransparencyEntryAsync({workspace,type:"BENCH_COMPARISON_CREATED",agentId:input.scope==="agent"?resolveAgentId(workspace,input.id):"workspace",artifact:{kind:"amcbench",sha256:sha256Hex(bytes),id:`comparison:${comparison.scope.type}:${comparison.scope.idHash}`}},{beforeCommit:beforeLog});logs.push(transparency.hash);
    // The successful own log changes collector log inputs; keep original authority and exact published pair after that effect.
    authority.assertCurrent();assertOrgPairsCurrent(published);return {comparison,path:saved.path,sigPath:saved.sigPath,transparencyHash:transparency.hash};
  }catch(cause){if(cause instanceof OrgPairsPublicationError)paths=cause.publishedPaths.map(path=>resolve(workspace,path));throw new BenchProducerPublicationError(Object.freeze([...paths]),Object.freeze([...logs]),cause);}
}
