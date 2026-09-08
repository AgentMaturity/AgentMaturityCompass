import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { AMCNativeClient } from "../src/sdk/nativeAgentClient.js";

test("a pre-aborted native initialization cannot spawn any child", async () => {
  const root = mkdtempSync(join(tmpdir(), "amc-native-preabort-"));
  const marker = join(root, "spawned"), file = join(root, "peer.mjs");
  writeFileSync(file, `import {writeFileSync} from 'node:fs'; writeFileSync(${JSON.stringify(marker)},'started');`);
  try {
    const abort = new AbortController(); abort.abort();
    await expect(AMCNativeClient.start({ workspace: root, provider: "stub", command: [process.execPath, file], startupSignal: abort.signal })).rejects.toThrow("startup was cancelled");
    expect(existsSync(marker)).toBe(false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("aborting a real hung initialization reaps its exact child without waiting for the request deadline", async () => {
  const root = mkdtempSync(join(tmpdir(), "amc-native-startabort-"));
  const marker = join(root, "peer.json"), file = join(root, "peer.mjs");
  writeFileSync(file, `import {writeFileSync} from 'node:fs';
process.stdin.setEncoding('utf8'); let pending='';
process.on('SIGTERM',()=>{}); process.stdin.on('end',()=>{});
process.stdin.on('data',chunk=>{pending+=chunk;const at=pending.indexOf('\\n'); if(at>=0){const frame=JSON.parse(pending.slice(0,at));writeFileSync(${JSON.stringify(marker)},JSON.stringify({pid:process.pid,method:frame.method,argv:process.argv.slice(2)}));}});
setInterval(()=>{},1000);
`);
  const abort = new AbortController(); let pid: number | undefined;
  let starting: Promise<AMCNativeClient> | undefined;
  try {
    starting = AMCNativeClient.start({ workspace: root, provider: "stub", command: [process.execPath, file],
      credentialsMode: "operator-only", expectedToolsDigest: "a".repeat(64), tools: "workspace", timeoutMs: 60_000, startupSignal: abort.signal });
    void starting.catch(() => undefined);
    const deadline = Date.now() + 5000;
    while (!existsSync(marker)) { if (Date.now() >= deadline) throw new Error("Actual fixture peer did not receive initialize"); await new Promise(done => setTimeout(done, 20)); }
    const observed = JSON.parse(readFileSync(marker, "utf8")) as { pid: number; method: string; argv: string[] };
    pid = observed.pid;
    expect(observed.method).toBe("initialize");
    expect(observed.argv).toContain("--credentials-mode");
    expect(observed.argv[observed.argv.indexOf("--credentials-mode") + 1]).toBe("operator-only");
    expect(observed.argv[observed.argv.indexOf("--expected-tools-digest") + 1]).toBe("a".repeat(64));
    const began = Date.now(); abort.abort();
    let boundedTimer: NodeJS.Timeout | undefined;
    try {
      const outcome = await Promise.race([
        starting.then(() => "unexpected-success" as const, () => "aborted" as const),
        new Promise<"fixture-deadline">((resolveDeadline) => { boundedTimer = setTimeout(() => resolveDeadline("fixture-deadline"), 12_000); })
      ]);
      expect(outcome).toBe("aborted");
    } finally { if (boundedTimer) clearTimeout(boundedTimer); }
    expect(Date.now() - began).toBeLessThan(12_000);
    expect(() => process.kill(pid!, 0)).toThrow();
  } finally {
    abort.abort();
    if (pid !== undefined) { try { process.kill(pid, "SIGKILL"); } catch { /* SDK already reaped it. */ } }
    if (starting) { try { await (await starting).close(); } catch { /* Expected refusal. */ } }
    rmSync(root, { recursive: true, force: true });
  }
}, 20_000);
