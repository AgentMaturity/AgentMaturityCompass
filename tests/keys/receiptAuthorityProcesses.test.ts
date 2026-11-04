/** Requires root's fresh build. Actual owned POSIX processes only; no real SDK/cloud access. */
import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterEach, expect, test, vi } from "vitest";
import { verifyLedgerIntegrity } from "../../src/ledger/ledgerVerification.js";
import { openLedger } from "../../src/ledger/ledger.js";
import { verifyReceipt } from "../../src/receipts/receipt.js";
import { publicPem } from "./providerFakes.js";
import { spawnOwnedNode } from "../helpers/ownedNodeGroup.js";
import { RECEIPT_OWNER_PASS, cleanupReceiptAuthorityFixtures, makeReceiptAuthorityFixture } from "../helpers/receiptAuthorityFixture.js";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../.."), PASS = RECEIPT_OWNER_PASS;
const owned: Array<ReturnType<typeof spawnOwnedNode>> = [];
afterEach(async () => { try { await Promise.all(owned.splice(0).map(child => child.stop())); } finally { cleanupReceiptAuthorityFixtures(); vi.unstubAllEnvs(); } });
const deniedSdkLoader = 'data:text/javascript,' + encodeURIComponent('export async function resolve(s,c,n){if(["@aws-sdk/client-kms","@google-cloud/kms","@azure/keyvault-keys","@azure/identity","pkcs11js"].includes(s))throw new Error("owned receipt child forbids real SDK access");return n(s,c)}');
function child(workspace: string, body: string) {
  const program = `import { writeFileSync, existsSync, renameSync } from 'node:fs'; import { randomUUID } from 'node:crypto';\n` +
    `const publish = path => { writeFileSync(path + '.tmp', String(process.pid)); renameSync(path + '.tmp', path); };\n` +
    `import { openLedger } from ${JSON.stringify(pathToFileURL(join(root, "dist/ledger/ledger.js")).href)};\n` +
    `import { unlockVault } from ${JSON.stringify(pathToFileURL(join(root, "dist/vault/vault.js")).href)};\n` +
    `import { sha256Hex } from ${JSON.stringify(pathToFileURL(join(root, "dist/utils/hash.js")).href)};\n` +
    `const workspace=${JSON.stringify(workspace)}; unlockVault(workspace,${JSON.stringify(PASS)}); const ledger=openLedger(workspace);\n` +
    `try { ${body} } finally { if(ledger.db.inTransaction)ledger.db.exec('ROLLBACK');ledger.close(); }`;
  const process = spawnOwnedNode(["--experimental-loader", deniedSdkLoader, "--input-type=module", "-e", program], { cwd: root, env: { ...globalThis.process.env } }); owned.push(process); return process;
}
async function ready(path: string, handle: ReturnType<typeof child>) {
  const end = performance.now() + 5000;
  while (!existsSync(path) && performance.now() < end) {
    const value = await Promise.race([handle.closed.then(result => ({ closed: result })), new Promise<null>(done => setTimeout(() => done(null), 15))]);
    if (value !== null) throw new Error(`owned receipt child closed before barrier: ${value.closed.stderr}`);
  }
  expect(existsSync(path), "owned child reached actual ready barrier").toBe(true); expect(Number(readFileSync(path, "utf8"))).toBe(handle.child.pid);
}
const posix = process.platform === "win32" ? test.skip : test;
posix("a real other-process SQL writer makes receipt owner publication refuse natively without waiting or replacing keyset", async () => {
  const f = makeReceiptAuthorityFixture(), readyFile = join(f.root, "sql-ready"), release = join(f.root, "sql-release");
  const held = child(f.workspace, `ledger.db.exec('BEGIN IMMEDIATE');publish(${JSON.stringify(readyFile)});while(!existsSync(${JSON.stringify(release)}))await new Promise(r=>setTimeout(r,10));ledger.db.exec('COMMIT');console.log(JSON.stringify({released:true}));`);
  try {
    await ready(readyFile, held); const before = f.state(), at = performance.now(), outcome = await f.own().then(value => ({ value }), error => ({ error }));
    expect(outcome).toHaveProperty("error"); if ("error" in outcome) expect(outcome.error).toMatchObject({ code: "SQLITE_BUSY" });
    expect(performance.now() - at).toBeLessThan(3000); expect(f.state()).toEqual(before);
    writeFileSync(release, "release"); expect(await held.wait()).toMatchObject({ code: 0, signal: null });
    await f.own(); f.evidence(); expect(verifyLedgerIntegrity(f.workspace, { trust: f.trust() }).chain.ok).toBe(true);
  } finally { writeFileSync(release, "release"); await held.stop(); }
}, 30_000);
posix("two actual cold processes append independent receipts at the live SQL head with no remote signer", async () => {
  const f = makeReceiptAuthorityFixture(); await f.own(); const before = f.fake.requests.length, go = join(f.root, "append-go");
  const children = [0, 1].map(index => {
    const readyFile = join(f.root, `append-ready-${index}`), handle = child(f.workspace,
      `publish(${JSON.stringify(readyFile)});while(!existsSync(${JSON.stringify(go)}))await new Promise(r=>setTimeout(r,10));` +
      `const sessionId='cold-receipt-'+randomUUID();ledger.startSession({sessionId,runtime:'unknown',binaryPath:'owned',binarySha256:sha256Hex('owned')});` +
      `const text='cold-'+${index};const out=ledger.appendEvidenceWithReceipt({sessionId,runtime:'unknown',eventType:'audit',inline:true,payload:text,meta:{trustTier:'OBSERVED'},receipt:{kind:'guard_check',agentId:'default',providerId:'owned',model:null,bodySha256:sha256Hex(text)}});ledger.sealSession(sessionId);console.log(JSON.stringify(out));`);
    return { readyFile, handle };
  });
  try {
    await Promise.all(children.map(row => ready(row.readyFile, row.handle))); writeFileSync(go, "go");
    const results = await Promise.all(children.map(row => row.handle.wait()));
    for (const result of results) {
      expect(result).toMatchObject({ code: 0, signal: null }); const output = JSON.parse(result.stdout.trim().split("\n").at(-1)!) as { receipt: string };
      expect(verifyReceipt(output.receipt, [publicPem(f.a)]).ok).toBe(true); expect(result.stderr).not.toContain("forbids real SDK access");
    }
    const ledger = openLedger(f.workspace, { readonly: true }); try { expect(ledger.getAllEvents().filter(row => row.payload_inline?.startsWith("cold-"))).toHaveLength(2); } finally { ledger.close(); }
    expect(f.fake.requests).toHaveLength(before); expect(verifyLedgerIntegrity(f.workspace, { trust: f.trust() }).chain.ok).toBe(true);
  } finally { writeFileSync(go, "release"); await Promise.all(children.map(row => row.handle.stop())); }
}, 30_000);
