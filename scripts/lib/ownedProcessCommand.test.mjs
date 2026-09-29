import assert from "node:assert/strict";
import { test } from "node:test";
import { runOwnedCommand } from "./ownedProcessCommand.mjs";

const supported = process.platform !== "win32";
const gone = pid => {
  try { process.kill(pid, 0); return false; }
  catch (error) { if (error.code === "ESRCH") return true; throw error; }
};

test("timeout reaps an owned grandchild retaining pipes after its parent exits", { skip: !supported, timeout: 5_000 }, async () => {
  const fixture = `
    const {spawn}=require('node:child_process');
    const child=spawn(process.execPath,['-e',"process.on('SIGTERM',()=>{});setInterval(()=>{},1000)"],{stdio:['ignore',1,2]});
    console.log(child.pid); child.unref();
  `;
  const result = await runOwnedCommand(process.execPath, ["-e", fixture], { timeoutMs: 300, terminateGraceMs: 50, closeWaitMs: 1_000 });
  assert.equal(result.stopReason, "timeout"); assert.equal(result.closed, true); assert.equal(result.cleanupError, undefined);
  const grandchildPid = Number(result.stdout.trim()); assert.ok(Number.isSafeInteger(grandchildPid) && grandchildPid > 0);
  assert.equal(gone(grandchildPid), true); assert.equal(gone(-result.processGroupId), true);
});

test("abort waits for its owned process group to exit", { skip: !supported, timeout: 5_000 }, async () => {
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 100);
  try {
    const result = await runOwnedCommand(process.execPath, ["-e", "setInterval(()=>{},1000)"], { signal: controller.signal, timeoutMs: 2_000 });
    assert.equal(result.stopReason, "aborted"); assert.equal(result.closed, true); assert.equal(result.cleanupError, undefined);
    assert.equal(gone(-result.processGroupId), true);
  } finally { clearTimeout(timer); }
});

test("successful commands preserve output without false cleanup failures", { skip: !supported, timeout: 5_000 }, async () => {
  const result = await runOwnedCommand(process.execPath, ["-e", "console.log('completed')"]);
  assert.equal(result.code, 0); assert.equal(result.stdout, "completed\n"); assert.equal(result.stopReason, undefined);
  assert.equal(result.closed, true); assert.equal(result.cleanupError, undefined);
});

test("spawn failures settle without an owned process-group ID", { skip: !supported, timeout: 5_000 }, async () => {
  const result = await runOwnedCommand("/does-not-exist/amc-acceptance-fixture", []);
  assert.equal(result.stopReason, "spawn-error"); assert.match(result.spawnError, /ENOENT/);
  assert.equal(result.processGroupId, null); assert.equal(result.closed, true); assert.equal(result.cleanupError, undefined);
});
