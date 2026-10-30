/** Actual owned POSIX Journal processes. Root must build the composed product first. */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterEach, expect, test, vi } from "vitest";
import { recoverActionJournal } from "../../src/actions/actionRecovery.js";
import { verifyChainIn } from "../../src/actions/actionJournal.js";
import { parseReceiptAuthority, RECEIPT_AUTHORITY_CURRENT } from "../../src/keys/receiptAuthority.js";
import { PAYMENT_TOOL, FAULT_ARGUMENTS } from "../helpers/actionFaults.js";
import { spawnOwnedNode } from "../helpers/ownedNodeGroup.js";
import { JOURNAL_PASS, actionReceiptFixture, cleanupActionReceiptFixtures, type ActionReceiptFixture } from "../helpers/actionJournalReceiptFixture.js";
const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../.."), handles: Array<ReturnType<typeof spawnOwnedNode>> = [];
afterEach(async () => { try { await Promise.all(handles.splice(0).map(handle => handle.stop())); cleanupActionReceiptFixtures(); } finally { vi.useRealTimers(); vi.unstubAllEnvs(); } });
const posix = process.platform === "win32" ? test.skip : test;
const noSdk = "data:text/javascript," + encodeURIComponent('export async function resolve(s,c,n){if(["@aws-sdk/client-kms","@google-cloud/kms","@azure/keyvault-keys","@azure/identity","pkcs11js"].includes(s))throw new Error("owned journal forbids real provider access");return n(s,c)}');
const moduleUrl = (path: string) => JSON.stringify(pathToFileURL(join(repo, "dist", path)).href);
function child(f: ActionReceiptFixture, body: string) {
  const program = `import { writeFileSync,existsSync,renameSync } from 'node:fs'; import { randomUUID } from 'node:crypto';
import { Ledger } from ${moduleUrl("ledger/ledger.js")};
import { openActionJournal } from ${moduleUrl("actions/actionJournal.js")};
import { bindAuthorization } from ${moduleUrl("actions/authorize.js")};
import { unlockVault } from ${moduleUrl("vault/vault.js")};
const workspace=${JSON.stringify(f.workspace)};unlockVault(workspace,${JSON.stringify(JOURNAL_PASS)});
function publish(path){writeFileSync(path+'.tmp',String(process.pid));renameSync(path+'.tmp',path);}
function barrier(path){const deadline=Date.now()+10000;while(!existsSync(path)){if(Date.now()>=deadline)throw new Error('owned barrier deadline');Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,5);}}
function action(){const callId=randomUUID(),x={workspace,token:randomUUID(),callId,rootCallId:callId,parentToken:null,name:${JSON.stringify(PAYMENT_TOOL)},agentId:'default',actionClass:'FINANCIAL',requestedMode:'EXECUTE',effectiveMode:'EXECUTE',arguments:${JSON.stringify(FAULT_ARGUMENTS[PAYMENT_TOOL])}};
const b=bindAuthorization(x,{sessionId:'owned-process-session'});if(!b.ok)throw new Error('real binding refused:'+b.reason);return {id:b.record.executionId,record:b.record,digest:b.digest,request:{executionId:b.record.executionId,agentId:'default',toolName:${JSON.stringify(PAYMENT_TOOL)},actionClass:'FINANCIAL',sessionId:'owned-process-session',callId,parentExecutionId:null,idempotencyKey:b.record.idempotencyKey}};}
${body}`;
  const handle = spawnOwnedNode(["--experimental-loader", noSdk, "--input-type=module", "-e", program], { cwd: repo, env: { ...process.env } }); handles.push(handle); return handle;
}
async function ready(path: string, handle: ReturnType<typeof child>): Promise<void> {
  const deadline = performance.now() + 5000;
  while (!existsSync(path) && performance.now() < deadline) {
    const closed = await Promise.race([handle.closed.then(value => value), new Promise<null>(done => setTimeout(() => done(null), 10))]);
    if (closed !== null) throw new Error(`owned child exited before actual Journal barrier: ${closed.stderr}`);
  }
  expect(existsSync(path), "actual Journal barrier reached").toBe(true); expect(Number(readFileSync(path, "utf8"))).toBe(handle.child.pid);
}
const finalJson = (stdout: string) => JSON.parse(stdout.trim().split("\n").at(-1)!);

posix.each(["distinct", "same-execution"] as const)("two actual journal processes preserve live SQL ordering: %s", async kind => {
  const f = actionReceiptFixture(); await f.own(); const calls = f.fake.requests.length, go = join(f.root, "go");
  const children = [0, 1].map(index => {
    const path = join(f.root, `ready-${index}`), handle = child(f, `const journal=openActionJournal(workspace);try{
publish(${JSON.stringify(path)});barrier(${JSON.stringify(go)});
${kind === "distinct" ? `const a=action();journal.request(a.request);journal.authorize(a.id,a.digest);journal.start(a.id,a.record);journal.complete(a.id,{effect:'applied',outcomeDigest:'a'.repeat(64),externalRef:'owned',reasonCode:'completed'});console.log(JSON.stringify({id:a.id,ok:journal.verifyReceiptChain(a.id).ok}));`
: `try{journal.request({executionId:'owned-shared',agentId:'default',toolName:${JSON.stringify(PAYMENT_TOOL)},actionClass:'FINANCIAL',sessionId:null,callId:'same',parentExecutionId:null,idempotencyKey:null});console.log(JSON.stringify({won:true}));}catch(e){if(e.name!=='TransitionRefused')throw e;console.log(JSON.stringify({won:false,error:e.name}));}`}
}finally{journal.close();}`); return { path, handle };
  });
  try {
    await Promise.all(children.map(c => ready(c.path, c.handle))); writeFileSync(go, "go");
    const results = await Promise.all(children.map(c => c.handle.wait())); for (const result of results) expect(result).toMatchObject({ code: 0, signal: null });
    const outputs = results.map(result => finalJson(result.stdout));
    f.reader(ledger => {
      if (kind === "distinct") {
        expect(outputs.every(value => value.ok === true)).toBe(true); expect(new Set(outputs.map(value => value.id)).size).toBe(2);
        for (const value of outputs) expect(verifyChainIn(ledger, value.id, { trust: f.trust() }).ok).toBe(true);
        expect(ledger.db.prepare("SELECT COUNT(*) AS n FROM action_transitions").get()).toEqual({ n: 8 });
      } else {
        expect(outputs.map(value => value.won).sort()).toEqual([false, true]);
        expect(ledger.db.prepare("SELECT COUNT(*) AS n FROM action_transitions WHERE execution_id='owned-shared'").get()).toEqual({ n: 1 });
        expect(verifyChainIn(ledger, "owned-shared", { trust: f.trust() }).ok).toBe(true);
      }
    }); expect(f.fake.requests).toHaveLength(calls);
  } finally { writeFileSync(go, "release"); await Promise.all(children.map(c => c.handle.stop())); }
}, 30_000);
posix("actual journal insertion holding its outer SQL transaction makes owner cutover refuse natively", async () => {
  const f = actionReceiptFixture(); await f.own(); const entered = join(f.root, "journal-sql-held"), release = join(f.root, "journal-sql-release");
  const held = child(f, `const original=Ledger.prototype.appendEvidenceWithReceipt;Ledger.prototype.appendEvidenceWithReceipt=function(input){const out=original.call(this,input);publish(${JSON.stringify(entered)});barrier(${JSON.stringify(release)});return out;};
const journal=openActionJournal(workspace);try{journal.request({executionId:'held-journal',agentId:'default',toolName:${JSON.stringify(PAYMENT_TOOL)},actionClass:'FINANCIAL',sessionId:null,callId:'held',parentExecutionId:null,idempotencyKey:null});console.log(JSON.stringify({committed:journal.verifyReceiptChain('held-journal').ok}));}finally{journal.close();}`);
  try {
    await ready(entered, held); const keyset = readFileSync(join(f.workspace, ".amc/keys/keyset.json"));
    await expect(f.own()).rejects.toMatchObject({ code: "SQLITE_BUSY" }); expect(readFileSync(join(f.workspace, ".amc/keys/keyset.json"))).toEqual(keyset);
    writeFileSync(release, "release"); const result = await held.wait(); expect(result).toMatchObject({ code: 0, signal: null }); expect(finalJson(result.stdout).committed).toBe(true);
    await f.own(); const fresh = f.open(), a = f.action(); f.finish(fresh.journal, a); expect(fresh.journal.verifyReceiptChain(a.id).ok).toBe(true);
  } finally { writeFileSync(release, "release"); await held.stop(); }
}, 30_000);
posix("real exited action owner recovers once after ordinary child expiry renewal without repeating effect", async () => {
  const f = actionReceiptFixture(); await f.own({ hours: 1 / 60 }); const effect = join(f.root, "effect-count");
  const exited = child(f, `const journal=openActionJournal(workspace);try{const a=action();journal.request(a.request);journal.authorize(a.id,a.digest);journal.start(a.id,a.record);writeFileSync(${JSON.stringify(effect)},'1');console.log(JSON.stringify({id:a.id}));}finally{journal.close();}`);
  const result = await exited.wait(); expect(result).toMatchObject({ code: 0, signal: null }); const id = finalJson(result.stdout).id;
  const cert = parseReceiptAuthority(readFileSync(join(f.workspace, RECEIPT_AUTHORITY_CURRENT)));
  vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date(cert.authority.notAfter));
  try {
    await f.own(); const recovery = recoverActionJournal(f.workspace); expect(recovery).toEqual({ outcomeUnknown: [id], cancelled: [], integrityFailures: [] });
    expect(recoverActionJournal(f.workspace)).toEqual({ outcomeUnknown: [], cancelled: [], integrityFailures: [] }); expect(readFileSync(effect, "utf8")).toBe("1");
    f.reader(ledger => { const chain = verifyChainIn(ledger, id, { trust: f.trust() }); expect(chain.ok, chain.errors.join("; ")).toBe(true);
      expect(chain.receipts.map(row => row.state)).toEqual(["requested", "authorized", "started", "outcome_unknown"]); });
  } finally { vi.useRealTimers(); await exited.stop(); }
}, 30_000);
