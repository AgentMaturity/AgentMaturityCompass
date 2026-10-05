#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const entry = resolve(process.argv[2] ?? "dist/standalone-api.js");
const env = { ...process.env, PORT: "0", NODE_ENV: "production" };
delete env.AMC_INDUSTRY_PACKS_ADMIN_TOKEN;
const child = spawn(process.execPath, [entry], {
  cwd: process.cwd(), env, detached: process.platform !== "win32", stdio: ["ignore", "pipe", "pipe"]
});
let output = "", closed = false;
child.once("close", () => { closed = true; });
const terminal = once(child, "close");
terminal.catch(() => {});
const killOwned = signal => {
  if (!child.pid || closed) return;
  try {
    if (process.platform === "win32") child.kill(signal);
    else process.kill(-child.pid, signal);
  } catch (error) { if (error.code !== "ESRCH") throw error; }
};
const checks = [];
try {
  const origin = await new Promise((accept, reject) => {
    const timer = setTimeout(() => reject(new Error("API startup deadline exceeded")), 15_000);
    const finish = (error, value) => { clearTimeout(timer); error ? reject(error) : accept(value); };
    child.once("error", error => finish(error));
    child.once("exit", code => finish(new Error(`API exited before readiness: ${code}`)));
    child.stderr.on("data", bytes => { output = (output + bytes).slice(-8192); });
    child.stdout.on("data", bytes => {
      output = (output + bytes).slice(-8192);
      const match = output.match(/AMC API running on http:\/\/localhost:(\d+)/);
      if (match) finish(null, `http://127.0.0.1:${match[1]}`);
    });
  });
  const request = (path, options = {}) => fetch(`${origin}${path}`, { ...options, signal: AbortSignal.timeout(5000) });
  const health = await request("/api/health");
  const inventory = await health.json();
  assert.equal(health.status, 200);
  assert.equal(inventory.status, "ok");
  assert.ok(inventory.questions > 0 && inventory.assurancePacks > 0 && inventory.modules > 0);
  checks.push("production-entry-health");
  const score = await request("/api/quickscore", { method: "POST", body: JSON.stringify({ agentId: "installed", responses: { "SO-01": 5 } }) });
  assert.equal(score.status, 200);
  assert.equal((await score.json()).evidenceVerified, false);
  checks.push("legacy-self-report-score");
  const invalid = await request("/api/quickscore", { method: "POST", body: JSON.stringify({ responses: { "SO-01": "invalid" } }) });
  assert.equal(invalid.status, 400);
  checks.push("invalid-score-refused");
  const license = await request("/api/industry-packs/license/issue", { method: "POST", body: "{}" });
  assert.equal(license.status, 401);
  checks.push("unconfigured-license-admin-refused");
  const badge = await request("/api/badge/installed");
  assert.equal(badge.headers.get("x-amc-score-basis"), "placeholder-not-measured");
  checks.push("placeholder-badge-labelled");
} finally {
  killOwned("SIGTERM");
  await Promise.race([terminal, delay(1000)]);
  if (!closed) {
    killOwned("SIGKILL");
    await Promise.race([terminal, delay(2000)]);
  }
  assert.ok(closed, "Owned API process did not close");
}
console.log(JSON.stringify({ status: "passed", entry, checks, processClosed: closed, scope: "Local Node HTTP; no TLS, container or deployment qualification" }));
