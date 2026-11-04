import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createWriteStream, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const root = process.cwd();
const expectedHead = process.argv[2];
const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();
if (process.versions.node.split(".")[0] !== "22" || git("rev-parse", "HEAD") !== expectedHead) throw new Error("Node/source pin mismatch");
const dirtySource = () => git("status","--porcelain","--untracked-files=all","--",".",":(exclude)qualification/**");
if(dirtySource()) throw new Error("Source must be clean before qualification: "+dirtySource());
const out = join(root, "qualification/2026-10-18-P2-30/checks");
const raw = "/Users/sid/AgentMaturityCompass-worktrees/codex-7f/evidence/p2-30/checks/post-governance";
mkdirSync(out,{recursive:true}); mkdirSync(raw,{recursive:true});
const state = { head: expectedHead, int: git("rev-parse","int"), node: process.version, tmpdir: process.env.TMPDIR, statusPorcelain: git("status","--porcelain"), fullSuite: "Required once on final merged source after non-suite checks; earlier runs preserved." };
writeFileSync(join(out,"post-governance-source-state.json"),JSON.stringify(state,null,2)+"\n");
const checks = [
 ["build","npm",["run","-s","build"]],
 ["focused","npx",["vitest","run","--maxWorkers=2","tests/catalog/stations/technology","tests/catalog/governance","tests/catalog/l0","tests/usRegister.test.ts","tests/wealthOverlay.test.ts","tests/regulatoryClocks.test.ts","tests/compilerStationDefaults.test.ts","tests/starterProfiles.test.ts","tests/industryGuides.test.ts","tests/industryGuidesGenerator.test.ts","tests/deepIndustryPacksStations.test.ts"]],

 ["typecheck","npm",["run","-s","typecheck"]],
 ["typecheck-tests","npm",["run","-s","typecheck:tests"]],
 ["lint","npm",["run","-s","lint"]],
 ["counts","npm",["run","-s","check:counts"]],
 ["docs-drift","npm",["run","-s","check:docs-drift"]],
 ["industry-guides","npm",["run","-s","check:industry-guides"]],
 ["regulatory-calendar","npm",["run","-s","check:regulatory-calendar"]],
 ["freeze","pnpm",["check:freeze","--","--base-ref","int"]],
 ["architecture-boundaries","npm",["run","-s","check:architecture-boundaries"]],
 ["gates","npm",["run","-s","check:gates"]],
 ["schemas","npm",["run","-s","check:schemas"]],
 ["api-ref","npm",["run","-s","check:api-ref"]],
 ["threat-model","npm",["run","-s","check:threat-model"]],
 ["citations","npm",["run","-s","check:citations"]],
 ["qualification","npm",["run","-s","check:qualification"]],
 ["release-notes","npm",["run","-s","release:notes","--","--check"]],
 ["catalog-currency","npm",["run","-s","check:catalog-currency"]],
 ["catalog-changelog","npm",["run","-s","check:catalog-changelog","--","--base-ref","int"]],
 ["catalog-changelog-main","node",["scripts/check-catalog-changelog.mjs"]],
 ["duplicates","npm",["run","-s","check:duplicates"]],
 ["dead-code","npm",["run","-s","check:dead-code"]],
 ["clean-source","npm",["run","-s","check:clean-source"]],

];
const results=[];
async function run(name,command,args) {
 const started=performance.now(), logPath=join(raw,`${name}.log`), log=createWriteStream(logPath);
 const child=spawn(command,args,{cwd:root,env:process.env,stdio:["ignore","pipe","pipe"]});
 child.stdout.pipe(log,{end:false});child.stderr.pipe(log,{end:false});
 const exit=await new Promise((resolve,reject)=>{child.on("error",reject);child.on("close",resolve)});
 await new Promise(resolve=>log.end(resolve));
 const bytes=readFileSync(logPath), body=bytes.toString("utf8");
 const row={name,cmd:[command,...args].join(" "),exit,durationMs:Math.round(performance.now()-started),head:expectedHead,rawLogPath:logPath,rawLogSha256:createHash("sha256").update(bytes).digest("hex"),rawLogBytes:bytes.length};
 results.push(row);writeFileSync(join(out,"post-governance-results.json"),JSON.stringify(results,null,2)+"\n");
 writeFileSync(join(out,`post-governance-${name}.log`),body.length<=200000?body:body.slice(0,20000)+"\n[Middle omitted; raw log path/hash retained.]\n"+body.slice(-180000));
 console.log(`${name}: exit ${exit}; ${row.durationMs} ms`);
 return row;
}
for (const [name,command,args] of checks) {
 if(git("rev-parse","HEAD")!==expectedHead)throw new Error("Source changed during checks");
 if (name === "focused" && dirtySource()) throw new Error("Source changed before tests: "+dirtySource());
 if (name === "counts") {
  const first=await run("counts-before-regeneration",command,args);
  if(first.exit!==0) await run("gen-counts","node",["scripts/gen-counts.mjs","--write"]);
 }
 await run(name,command,args);
}
process.exitCode=results.some(row=>row.exit!==0 && row.name!=="counts-before-regeneration")?1:0;
