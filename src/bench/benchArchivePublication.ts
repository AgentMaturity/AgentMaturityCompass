import { lstatSync, readFileSync, mkdtempSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { collectFiles } from "../utils/archiveFiles.js";
import { withControlFileLock } from "../lifecycle/controlFileLock.js";
import { ensureDir, writeFileAtomic } from "../utils/fs.js";
import { canonicalize } from "../utils/json.js";
import { sha256Hex } from "../utils/hash.js";
import { benchProofFileBytes } from "./benchProofs.js";
import type { BenchArtifact, BenchBuildMeta } from "./benchSchema.js";
import type { signBenchJson } from "./benchSigner.js";
import type { scanBenchForPii } from "./benchRedaction.js";
interface Destination {path:string;bytes:Buffer|null;mode:number|null;identity:string|null}
function read(path:string):Destination {
  try{const first=lstatSync(path);if(!first.isFile())throw new Error("bench destination must be a regular file");const bytes=readFileSync(path),last=lstatSync(path);
    if(first.dev!==last.dev||first.ino!==last.ino||first.mode!==last.mode||first.size!==last.size||first.mtimeMs!==last.mtimeMs)throw new Error("bench destination changed while read");
    return {path,bytes,mode:last.mode&0o777,identity:`${last.dev}:${last.ino}`};
  }catch(error){if((error as NodeJS.ErrnoException).code==="ENOENT")return {path,bytes:null,mode:null,identity:null};throw error;}
}
export function captureBenchArchiveTargets(file:string){return [resolve(file),`${resolve(file)}.sha256`].map(read);}
export function assertBenchArchiveTargets(before:readonly Destination[]){for(const old of before){const now=read(old.path);if(old.mode!==now.mode||old.identity!==now.identity||(old.bytes===null?now.bytes!==null:now.bytes===null||!old.bytes.equals(now.bytes)))throw new Error("selected bench destinations changed while signing; retry");}}
export class BenchArchiveWriteError extends Error{
  constructor(readonly completedPaths:readonly string[],cause:unknown){super("bench archive publication did not complete; successful writes are retained",{cause});this.name="BenchArchiveWriteError";}
}
export function publishBenchArchive(workspace:string,before:ReturnType<typeof captureBenchArchiveTargets>,bytes:Buffer,current:()=>void){
  const own=Buffer.from(bytes),checksum=Buffer.from(`${sha256Hex(own)}\n`);
  return withControlFileLock({root:join(workspace,".amc"),name:"org-auditor-pairs",operation:()=>{
    current();assertBenchArchiveTargets(before);const completed:string[]=[];
    try{for(const [index,data] of [own,checksum].entries()){const row=before[index]!;ensureDir(dirname(row.path));writeFileAtomic(row.path,data,row.mode??0o644);completed.push(row.path);}return captureBenchArchiveTargets(before[0]!.path);}
    catch(cause){throw new BenchArchiveWriteError(Object.freeze([...completed]),cause);}
  }});
}
export function benchArchiveBytes(input:{bench:BenchArtifact;signature:ReturnType<typeof signBenchJson>;signerPub:string;proofs:ReturnType<typeof benchProofFileBytes>;calculationManifest:Record<string,unknown>;piiScan:ReturnType<typeof scanBenchForPii>;buildMeta:BenchBuildMeta}){
  const temp=mkdtempSync(join(tmpdir(),"amc-bench-artifact-"));let failure:unknown;
  try{const root=join(temp,"amc-bench");for(const dir of [root,join(root,"checks"),join(root,"meta"),join(root,"proofs")])ensureDir(dir);
    const members=[{path:"bench.json",bytes:Buffer.from(JSON.stringify(input.bench))},{path:"bench.sig",bytes:Buffer.from(`${canonicalize(input.signature)}\n`)},{path:"signer.pub",bytes:Buffer.from(input.signerPub)},...input.proofs.files];
    const pii=Buffer.from(`${canonicalize(input.piiScan)}\n`),build=Buffer.from(`${canonicalize(input.buildMeta)}\n`);
    members.push({path:"meta/calculation-manifest.json",bytes:Buffer.from(`${canonicalize(input.calculationManifest)}\n`)},{path:"checks/pii-scan.json",bytes:pii},{path:"checks/pii-scan.sha256",bytes:Buffer.from(`${sha256Hex(pii)}\n`)},{path:"meta/build.json",bytes:build},{path:"meta/build.sha256",bytes:Buffer.from(`${sha256Hex(build)}\n`)});
    for(const row of members){const path=join(root,row.path);ensureDir(dirname(path));writeFileAtomic(path,row.bytes,0o644);}
    const files=collectFiles(temp),candidate=join(temp,".candidate.amcbench"),out=spawnSync("tar",["-czf",candidate,"-C",temp,...files],{encoding:"utf8"});
    if(out.status!==0)throw new Error("failed to create bench archive",{cause:out.error??new Error(out.stderr||out.stdout||"tar did not complete")});return readFileSync(candidate);
  // oxlint-disable-next-line no-unsafe-finally -- A cleanup failure must surface, with any primary failure, instead of reporting success.
  }catch(cause){failure=cause;throw cause;}finally{try{rmSync(temp,{recursive:true,force:true});}catch(cleanup){throw new Error("bench archive staging cleanup did not complete",{cause:failure===undefined?cleanup:new AggregateError([failure,cleanup])});}}
}
