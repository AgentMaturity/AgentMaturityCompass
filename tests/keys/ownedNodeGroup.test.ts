// Proposed destination: tests/keys/ownedNodeGroup.test.ts. Actual POSIX-owned children and grandchildren only.
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { spawnOwnedNode } from "../helpers/ownedNodeGroup.js";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
async function waitFor(path: string) {
  const end = performance.now() + 5_000;
  while (!existsSync(path)) { if (performance.now() >= end) throw new Error("owned descendant did not reach its handshake"); await new Promise<void>(done => setTimeout(done, 10)); }
}
function expectGone(pid: number) {
  expect(() => process.kill(pid, 0)).toThrowError(expect.objectContaining({ code: "ESRCH" }));
}
function forceOnlyOwnedGroup(pid: number | undefined) {
  if (pid === undefined) return;
  try { process.kill(-pid, "SIGKILL"); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error; }
}
async function bounded<T>(work: Promise<T>, milliseconds: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { return await Promise.race([work, new Promise<never>((_done, reject) => { timer = setTimeout(() => reject(new Error("owned cleanup oracle did not complete")), milliseconds); })]); }
  finally { clearTimeout(timer); }
}
async function independentCleanup(owned: ReturnType<typeof spawnOwnedNode>): Promise<void> {
  forceOnlyOwnedGroup(owned.child.pid); await bounded(owned.closed, 2_000);
  const end = performance.now() + 2_000;
  while (owned.child.pid !== undefined) {
    try { process.kill(-owned.child.pid, 0); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ESRCH") return; throw error; }
    if (performance.now() >= end) throw new Error("owned oracle process group did not disappear");
    await new Promise<void>(done => setTimeout(done, 20));
  }
}
function fixture(nested: "sync" | "unref") {
  const root = mkdtempSync(join(tmpdir(), "amc-owned-node-group-")); roots.push(root);
  const ready = join(root, "grandchild.pid"), grandchild = join(root, "grandchild.mjs"), parent = join(root, "parent.mjs");
  writeFileSync(grandchild, `import { writeFileSync } from "node:fs";
process.on("SIGTERM",()=>{}); writeFileSync(${JSON.stringify(ready)}, String(process.pid)); setInterval(()=>{},1000);`);
  writeFileSync(parent, nested === "sync" ? `import { spawnSync } from "node:child_process";
process.on("SIGTERM",()=>{}); spawnSync(process.execPath,[${JSON.stringify(grandchild)}],{stdio:"inherit"});`
    : `import { spawn } from "node:child_process";
spawn(process.execPath,[${JSON.stringify(grandchild)}],{stdio:"ignore"}).unref();`);
  return { root, ready, parent };
}

test.skipIf(process.platform === "win32")("bounded cleanup awaits close and kills a SIGTERM-resistant synchronous parent plus grandchild", async () => {
  const f = fixture("sync"), owned = spawnOwnedNode([f.parent]);
  try {
    await waitFor(f.ready); const descendant = Number(readFileSync(f.ready, "utf8"));
    expect(Number.isInteger(descendant) && descendant > 0).toBe(true); expect(owned.child.pid).toBeDefined();
    const stopError = await bounded(owned.stop().then(() => null, (failure: unknown) => failure), 4_000);
    // Assert actual liveness before awaiting close: a missing escalation must fail ESRCH, not the oracle timeout.
    expectGone(owned.child.pid!); expectGone(descendant); expect(stopError).toBeNull();
    const result = await bounded(owned.closed, 2_000);
    expect(result.signal).toBe("SIGKILL");
    expect(() => process.kill(-owned.child.pid!, 0)).toThrowError(expect.objectContaining({ code: "ESRCH" }));
  } finally { await independentCleanup(owned); }
}, 10_000);

test.skipIf(process.platform === "win32")("a naturally closed direct child still has its live same-group descendant cleaned up", async () => {
  const f = fixture("unref"), owned = spawnOwnedNode([f.parent]);
  try {
    await waitFor(f.ready); const descendant = Number(readFileSync(f.ready, "utf8"));
    expect((await bounded(owned.closed, 2_000)).code).toBe(0); // A helper that returns on child.exitCode would leak this descendant.
    process.kill(descendant, 0); await bounded(owned.stop(), 4_000); expectGone(descendant);
    expect(() => process.kill(-owned.child.pid!, 0)).toThrowError(expect.objectContaining({ code: "ESRCH" }));
  } finally { await independentCleanup(owned); }
}, 10_000);
