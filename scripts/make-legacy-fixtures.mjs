#!/usr/bin/env node
/** Generate private, byte-exact v1.1.1 observations. Never publishes fixtures or runs in CI. */
import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { closeSync, copyFileSync, constants, existsSync, lstatSync, mkdirSync, mkdtempSync, openSync, readFileSync, readdirSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cleanSourceRuntimeEnvironment } from "./clean-source-check.mjs";

const COMMIT = "ff53902225ff276c55558d5ca17a8fc60b780655";
const PACKAGE_SHA = "025fa4072bba848a9af7a928f41642560dea80317ec9f17ac5b6d58c82d394ab";
const LOCK_SHA = "de11478321f06884f9626e9a25cd434122e5952018f7813d7179506bc494129d";
const LIMIT = 1_000_000;
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const write = (path, value) => writeFileSync(path, value, { flag: "wx", mode: 0o600 });
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;
function pin(path) {
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`Expected regular file: ${path}`);
  return { path, physicalPath: realpathSync(path), bytes: stat.size, sha256: sha(readFileSync(path)), dev: stat.dev, inode: stat.ino, nlink: stat.nlink };
}
function args() {
  const values = { buildRecords: [] };
  for (let i = 2; i < process.argv.length; i += 2) {
    const key = process.argv[i], value = process.argv[i + 1];
    if (!value || !isAbsolute(value)) throw new Error(`Expected absolute value after ${key}`);
    if (key === "--legacy-source" && !values.source) values.source = realpathSync(value);
    else if (key === "--run-parent" && !values.parent) values.parent = realpathSync(value);
    else if (key === "--build-record") values.buildRecords.push(realpathSync(value));
    else throw new Error(`Unknown or duplicate argument: ${key}`);
  }
  if (!values.source) throw new Error("Required: --legacy-source <absolute built v1.1.1 checkout>");
  return values;
}

async function main() {
  const options = args();
  const work = mkdtempSync(join(options.parent ?? tmpdir(), "amc-legacy-1.1.1-"));
  const workspace = join(work, "workspace"), home = join(work, "home"), exports = join(work, "exports");
  const logs = join(work, "logs"), staging = join(work, "corpus-staging"), temporary = join(work, "tmp");
  const rawOriginals = join(work, "raw-originals");
  for (const path of [workspace, home, exports, logs, staging, temporary, rawOriginals]) mkdirSync(path, { mode: 0o700 });
  console.log(`Retained legacy generation root: ${work}`);
  const env = cleanSourceRuntimeEnvironment(process.env, home);
  const passphrase = randomBytes(32).toString("base64url");
  env.AMC_VAULT_PASSPHRASE = passphrase;
  for (const key of ["TMPDIR", "TMP", "TEMP"]) env[key] = temporary;
  env.NO_COLOR = "1";
  env.COPYFILE_DISABLE = "1";
  const commands = [], gaps = [], candidates = [], sourcePins = [], buildRecords = [], generatedInputs = [];
  const cli = join(options.source, "dist", "cli.js");
  let fatal = null, fatalExit = null, ledgerSnapshot = null;
  const gap = (step, reason) => gaps.push({ step, reason });
  async function run(label, command, argv, cwd = workspace) {
    const index = commands.length + 1;
    const stdoutPath = join(logs, `${index}-${label}.stdout`), stderrPath = join(logs, `${index}-${label}.stderr`);
    const out = openSync(stdoutPath, "wx", 0o600), err = openSync(stderrPath, "wx", 0o600);
    const record = { index, label, command, argv, cwd, startedAt: new Date().toISOString() };
    try {
      await new Promise((done) => {
        let child;
        try { child = spawn(command, argv, { cwd, env, stdio: ["ignore", out, err] }); }
        catch (error) { record.launchError = String(error); done(); return; }
        record.pid = child.pid ?? null;
        child.once("error", (error) => { record.launchError = String(error); });
        child.once("close", (code, signal) => { record.exitCode = code; record.signal = signal; done(); });
      });
    } finally {
      closeSync(out); closeSync(err);
      record.finishedAt = new Date().toISOString();
      record.stdout = pin(stdoutPath); record.stderr = pin(stderrPath);
      commands.push(record);
      write(join(logs, `${index}-${label}.json`), json(record));
    }
    if (record.launchError || record.signal || !Number.isInteger(record.exitCode)) {
      fatalExit = 70; throw new Error(`Command did not close naturally: ${label}`);
    }
    if (record.exitCode > 1) { fatalExit = record.exitCode; throw new Error(`Unexpected exit ${record.exitCode}: ${label}`); }
    if (record.exitCode !== 0) gap(label, "Natural exit 1; retained original streams; no success or retry claimed.");
    return record;
  }
  const runCli = (label, argv) => run(label, process.execPath, [cli, ...argv]);
  const text = (record) => {
    if (record.stdout.bytes >= LIMIT) throw new Error(`Structured output exceeds bound: ${record.label}`);
    return readFileSync(record.stdout.path, "utf8");
  };
  const observe = (step, fn) => {
    try { return fn(); } catch (error) { gap(step, String(error)); return null; }
  };
  function candidate(name, path, origin = "byte-exact old CLI output") {
    if (!existsSync(path)) { gap(name, "No output file was emitted."); return; }
    const row = pin(path);
    if (readFileSync(path).includes(Buffer.from(passphrase))) throw new Error(`Private passphrase in output: ${name}`);
    if (/-----BEGIN (?:[A-Z]+ )*PRIVATE KEY-----/.test(readFileSync(path).toString("utf8"))) throw new Error(`Private key in output: ${name}`);
    candidates.push({ name, origin, source: row });
  }
  try {
    const head = await run("source-head", "git", ["--no-optional-locks", "rev-parse", "HEAD"], options.source);
    const status = await run("source-status", "git", ["--no-optional-locks", "status", "--porcelain=v1", "--untracked-files=no"], options.source);
    if (head.exitCode || text(head).trim() !== COMMIT || status.exitCode || text(status) !== "") throw new Error("Legacy checkout is not tracked-clean at the required commit.");
    for (const [path, expected] of [["package.json", PACKAGE_SHA], ["package-lock.json", LOCK_SHA]]) {
      const row = pin(join(options.source, path));
      if (row.sha256 !== expected) throw new Error(`Historical input changed: ${path}`);
      sourcePins.push(row);
    }
    for (const path of ["cli", "assurance/assuranceRunner", "bundles/bundle", "cert/trustCertificate", "dogfood/maturityEvidence", "diagnostic/questionBank", "domains/domainCliIntegration", "fleet/paths", "ledger/ledger", "passport/passportArtifact"]) {
      sourcePins.push(pin(join(options.source, "src", `${path}.ts`)), pin(join(options.source, "dist", `${path}.js`)));
    }
    sourcePins.push(pin(join(options.source, "node_modules", "better-sqlite3", "build", "Release", "better_sqlite3.node")));
    for (const path of options.buildRecords) buildRecords.push(pin(path));
    const init = await runCli("init", ["init", "--trust-boundary", "isolated", "--profile", "dev"]);
    if (init.exitCode !== 0) throw new Error("Old initialization failed; dependent generation not attempted.");
    const input = join(work, "eval-input.json");
    write(input, json({ results: [{ id: "legacy-import-case", name: "synthetic import case", pass: true, score: 1, input: "fixture input", output: "fixture output" }] }));
    generatedInputs.push({ kind: "new synthetic operator input to old importer", ...pin(input) });
    await runCli("operator-import", ["eval", "import", "--format", "openai", "--file", input, "--agent", "default", "--trust-tier", "OBSERVED", "--json"]);
    const driver = join(work, "supplemental.mjs");
    write(driver, `import {pathToFileURL} from 'node:url';\nimport {writeFileSync} from 'node:fs';\nimport {join} from 'node:path';\nconst [root,workspace,out,kind]=process.argv.slice(2);\nconst load=(p)=>import(pathToFileURL(join(root,'dist',p)).href);\nif(kind==='seed'){const {generateDogfoodMaturityEvidence}=await load('dogfood/maturityEvidence.js');const {questionBank}=await load('diagnostic/questionBank.js');const result=generateDogfoodMaturityEvidence({workspace,agent:{id:'legacy-seeded',name:'Legacy fixture',domain:'general',role:'assistant',task:'fixture only',targetMaturity:1},questions:[questionBank[0]]});console.log(JSON.stringify({derivedObservation:true,selectedQuestionId:questionBank[0].id,result}));}\nif(kind==='domain'){const {buildDomainReportForAgent}=await load('domains/domainCliIntegration.js');const result=buildDomainReportForAgent({agentId:'legacy-fixture',domain:'governance',outputPath:join(out,'domain-report.md')});console.log(JSON.stringify({derivedObservation:true,domain:result.assessment.domain,outputPath:result.outputPath}));}\nif(kind==='ledger'){const {openLedger}=await load('ledger/ledger.js');const ledger=openLedger(workspace);try{const sessions=ledger.getSessionsBetween(0,Date.now()+1).map(s=>({session_id:s.session_id,binary_path:s.binary_path}));const events=ledger.getAllEvents().map(e=>({session_id:e.session_id,event_hash:e.event_hash,meta_json:e.meta_json,payloadInline:typeof e.payload_inline==='string',payloadPath:e.payload_path,canonicalPayloadPath:e.canonical_payload_path,blobRef:e.blob_ref}));if(events.some(e=>!e.payloadInline||e.payloadPath!==null||e.canonicalPayloadPath!==null||e.blobRef!==null))throw new Error('Pre-assessment ledger has non-inline payload dependencies; no snapshot admitted.');writeFileSync(join(out,'ledger-observation.json'),JSON.stringify({derivedObservation:true,boundary:'before-diagnostic-and-assurance',inlineOnly:true,sessions,events},null,2)+'\\n',{flag:'wx',mode:0o600});}finally{ledger.close();}}\n`);
    generatedInputs.push({ kind: "new driver calling pinned old exported source APIs", ...pin(driver) });
    let ledgerObservation = null;
    for (const kind of ["seed", "domain", "ledger"]) {
      const record = await run(`old-source-${kind}`, process.execPath, [driver, options.source, workspace, exports, kind]);
      if (kind === "ledger") ledgerObservation = record;
    }
    candidate("domain-report.md", join(exports, "domain-report.md"), "Byte-exact old exported domain builder output; no paid CLI entitlement claim.");
    candidate("ledger-observation.json", join(exports, "ledger-observation.json"), "Derived actual old public ledger getter observations; not an independently emitted historical report.");
    const db = join(workspace, ".amc", "evidence.sqlite"), wal = `${db}-wal`;
    if (ledgerObservation?.exitCode !== 0) gap("ledger-snapshot", "Inline-only ledger observation failed; no snapshot copied.");
    else if (existsSync(wal)) gap("ledger-snapshot", "WAL still exists after natural child close; no checkpoint, removal or snapshot claim.");
    else {
      const sourceAtClosure = pin(db), snapshotPath = join(exports, "evidence.sqlite");
      copyFileSync(db, snapshotPath, constants.COPYFILE_EXCL);
      const snapshot = pin(snapshotPath);
      if (snapshot.bytes !== sourceAtClosure.bytes || snapshot.sha256 !== sourceAtClosure.sha256) throw new Error("Pre-assessment ledger snapshot differs from naturally closed source.");
      ledgerSnapshot = { boundary: "before-diagnostic-and-assurance", sourceAtClosure, snapshot, walAbsent: true, observationCommandIndex: ledgerObservation.index, observationPid: ledgerObservation.pid };
      candidate("evidence.sqlite", snapshotPath, "Byte-exact naturally closed old inline R2/R4 ledger snapshot before diagnostic and assurance; later full workspace ledger remains retained.");
    }
    const diagnostic = await runCli("diagnostic", ["--agent", "default", "run", "--score-only", "--json"]);
    let runId = null, reportPath = null;
    if (diagnostic.exitCode === 0) observe("diagnostic-shape", () => {
      const summary = JSON.parse(text(diagnostic));
      if (typeof summary.runId !== "string" || !/^[a-f0-9-]{36}$/.test(summary.runId)) throw new Error("No valid actual diagnostic runId.");
      runId = summary.runId;
      const found = [join(workspace, ".amc", "runs", `${runId}.json`), join(workspace, ".amc", "agents", "default", "runs", `${runId}.json`)].filter(existsSync);
      if (found.length !== 1) throw new Error("Expected one actual diagnostic report in finite default locations.");
      reportPath = found[0]; candidate("diagnostic-report.json", reportPath);
      const report = JSON.parse(readFileSync(reportPath, "utf8"));
      const levels = report.layerScores?.map((row) => row.avgFinalLevel);
      if (!Array.isArray(levels) || !levels.length || !levels.every(Number.isFinite) || levels.reduce((a, b) => a + b, 0) / levels.length !== 3) gap("genuine-L3", "Actual diagnostic does not have mean level exactly L3; original bytes and seal retained unchanged.");
    });
    await runCli("assurance", ["assurance", "run", "--scope", "agent", "--id", "default", "--pack", "injection", "--mode", "sandbox"]);
    observe("assurance-output", () => {
      const found = [join(workspace, ".amc", "reports", "assurance"), join(workspace, ".amc", "agents", "default", "reports", "assurance")].flatMap((dir) => existsSync(dir) ? readdirSync(dir).filter((name) => name.endsWith(".json")).map((name) => join(dir, name)) : []);
      if (found.length !== 1) throw new Error("Expected one actual assurance report in finite default locations.");
      const report = JSON.parse(readFileSync(found[0], "utf8"));
      if (`${report.assuranceRunId}.json` !== basename(found[0]) || report.evidenceStatus !== undefined) throw new Error("Unexpected old assurance report shape.");
      candidate("assurance-report.json", found[0]);
    });
    await runCli("trust-certificate", ["cert", "generate", "--agent", "default", "--output", join(exports, "trust-certificate.json")]);
    candidate("trust-certificate.json", join(exports, "trust-certificate.json"));
    await runCli("passport-init", ["passport", "init"]);
    await runCli("passport", ["passport", "create", "--scope", "agent", "--id", "default", "--out", join(exports, "passport.amcpass")]);
    candidate("passport.amcpass", join(exports, "passport.amcpass"));
    if (runId && reportPath) {
      await runCli("bundle", ["bundle", "export", "--agent", "default", "--run", runId, "--out", join(exports, "run.amcbundle")]);
      candidate("run.amcbundle", join(exports, "run.amcbundle"));
      const ci = await runCli("ci-init", ["ci", "init", "--agent", "default"]);
      const policies = [join(workspace, ".amc", "gatePolicy.json"), join(workspace, ".amc", "agents", "default", "gatePolicy.json")].filter(existsSync);
      if (ci.exitCode === 0 && policies.length === 1) {
        await runCli("diagnostic-certificate", ["certify", "--agent", "default", "--run", runId, "--policy", policies[0], "--out", join(exports, "run.amccert")]);
        candidate("run.amccert", join(exports, "run.amccert"));
      } else gap("diagnostic-certificate", "No unique actual signed default gate policy; no weakened policy or substitute certificate.");
    } else gap("bundle-and-diagnostic-certificate", "No usable actual diagnostic output; dependent exports not attempted.");
    for (const row of candidates.filter((row) => /\.(amcbundle|amcpass|amccert)$/.test(row.name))) {
      const listed = await run(`list-${row.name}`, "tar", ["-tzf", row.source.path]);
      if (listed.exitCode !== 0) throw new Error(`Cannot list generated container: ${row.name}`);
      const names = text(listed).trim().split("\n");
      if (names.some((name) => isAbsolute(name) || name.split("/").includes("..") || /(^|\/)(?:\.amc\/keys|vault\.amcvault|local-vault-passphrase)(\/|$)/.test(name))) throw new Error(`Unsafe container member path: ${row.name}`);
      row.memberList = pin(listed.stdout.path);
    }
  } catch (error) { fatal = String(error); gap("generator", fatal); }
  try {
    const head = await run("source-head-final", "git", ["--no-optional-locks", "rev-parse", "HEAD"], options.source);
    const status = await run("source-status-final", "git", ["--no-optional-locks", "status", "--porcelain=v1", "--untracked-files=no"], options.source);
    if (head.exitCode || text(head).trim() !== COMMIT || status.exitCode || text(status) !== "") throw new Error("Final legacy source is not tracked-clean at the required commit.");
    for (const before of sourcePins) {
      const after = pin(before.path);
      if (["physicalPath", "bytes", "sha256", "dev", "inode", "nlink"].some((key) => after[key] !== before[key])) throw new Error(`Old source/runtime changed: ${before.path}`);
    }
  } catch (error) { fatal ??= String(error); gap("source-final-preservation", String(error)); }
  let archive = null;
  if (!fatal && candidates.length) try {
    for (const row of candidates) {
      const current = pin(row.source.path);
      if (current.bytes !== row.source.bytes || current.sha256 !== row.source.sha256) throw new Error(`Generated original changed before storage: ${row.name}`);
      const destination = join(rawOriginals, row.name);
      copyFileSync(row.source.path, destination, constants.COPYFILE_EXCL);
      row.rawCopy = pin(destination);
      if (row.rawCopy.bytes !== row.source.bytes || row.rawCopy.sha256 !== row.source.sha256) throw new Error(`Raw copy changed: ${row.name}`);
    }
    const archivePath = join(exports, "originals.tar.gz");
    const packed = await run("pack-originals", "tar", ["-czf", archivePath, "-C", rawOriginals, ...candidates.map((row) => row.name)]);
    if (packed.exitCode !== 0) throw new Error("Outer archive command failed; raw originals remain retained.");
    archive = pin(archivePath);
  } catch (error) { fatal ??= String(error); gap("lossless-storage", String(error)); }
  const generationLog = commands.map((row) => `${row.index} ${row.label}: exit=${row.exitCode ?? "none"} signal=${row.signal ?? "none"} stdout=${row.stdout.sha256} stderr=${row.stderr.sha256}`).join("\n") + "\n";
  const provenance = { schema: "amc-legacy-fixture-generation/2", oldCommit: COMMIT, source: options.source, retainedRoot: work, node: pin(process.execPath), nodeVersion: process.version, generator: pin(fileURLToPath(import.meta.url)), sourcePins, buildRecords, generatedInputs, commands, candidates, ledgerSnapshot, storage: { format: "tar-gzip", rawOriginals, rawOriginalBytes: candidates.reduce((sum, row) => sum + row.source.bytes, 0), archive, decodedHashAuthority: "candidates[].source.bytes and sha256; rawCopy must match each original", decodedHashesVerified: false, rootDecodedHashReviewRequired: true }, gaps, fatal, completeSpecCorpusClaimed: false, publicationApproved: false, archiveContentAndLinkReviewRequiredBeforePublication: true, rawWorkspaceKeysOrVaultCopied: false, notes: ["Actual generated observations only; synthetic import input is operator-authored.", "Embedded public verification keys/signatures remain exact. Legacy claims never upgraded.", "All roots and streams retained. No retries, timeout, forced closure, cleanup or repository publication.", "Archive member listing is a path check only; root must review bounded contents and link types before publication."] };
  let provenanceBytes = json(provenance);
  const total = (archive?.bytes ?? 0) + Buffer.byteLength(provenanceBytes) + Buffer.byteLength(generationLog);
  // Reserve metadata growth for the final staging fields and a possible size-gap record.
  const admitted = !fatal && archive !== null && total + 2048 < LIMIT;
  if (admitted) {
    const destination = join(staging, "originals.tar.gz");
    copyFileSync(archive.path, destination, constants.COPYFILE_EXCL);
    if (pin(destination).sha256 !== archive.sha256) throw new Error("Outer archive copy changed.");
  }
  else gap("corpus-staging", fatal || !archive ? "No admissible outer archive; generated originals and raw copies remain retained." : `Observed encoded corpus ${total} bytes plus 2048-byte final-metadata reserve reaches exclusive ${LIMIT}-byte limit; no original omitted or truncated to fit.`);
  provenanceBytes = json({ ...provenance, gaps, stagingOriginalsAdmitted: admitted, proposedCorpusBytes: total });
  write(join(staging, "provenance.json"), provenanceBytes); write(join(staging, "generation.log"), generationLog);
  const staged = readdirSync(staging).map((name) => pin(join(staging, name)));
  const stagedBytes = staged.reduce((sum, row) => sum + row.bytes, 0);
  write(join(work, "generation-summary.json"), json({ oldCommit: COMMIT, retainedRoot: work, staging, stagedBytes, belowLimit: stagedBytes < LIMIT, originalsAdmitted: admitted, gaps, fatal, staged }));
  console.log(json({ retainedRoot: work, staging, originalsAdmitted: admitted, stagedBytes, gaps: gaps.length, completeSpecCorpusClaimed: false }));
  process.exitCode = fatalExit ?? (fatal || gaps.length || stagedBytes >= LIMIT ? 1 : 0);
}

main().catch((error) => { console.error(String(error)); process.exitCode = 1; });
