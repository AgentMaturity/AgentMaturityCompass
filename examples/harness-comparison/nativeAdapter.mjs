// Actions only. The independent oracle decides whether persisted results satisfy the case.
import { randomBytes, createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { VERSION, jsonFile, verifyInventory, runtime, briefRows, requiredJson } from "./nativeCommon.mjs";

const [cli, workspace, fixtureFile, inventoryFile] = process.argv.slice(2);
const fixture = jsonFile(fixtureFile), inventory = verifyInventory(inventoryFile);
if (inventory.cli !== cli || !fixture.id || !fixture.kind) throw new Error("Native fixture identity mismatch");
const passphrase = randomBytes(32).toString("base64url");
writeFileSync(join(workspace, ".native-vault-fixture"), passphrase, { mode: 0o600, flag: "wx" });
const native = await runtime(cli, workspace, passphrase);
const receipt = { schemaVersion: VERSION, classification: "offline-native-stub-conformance", fixtureId: fixture.id,
  commands: [], sessions: [], snapshots: {}, monitorFingerprint: null };
const call = async (label, args) => { const value = await native.run(label, args); receipt.commands.push(value); return value; };
const prompt = Array.from({ length: fixture.repeat ?? 1 }, () => fixture.prompt).join("\n");
const runArgs = (text, extra = []) => ["agent-loop", "run", "--provider", "stub", "--tools", "none", "--json", ...extra, text];
const open = async (label, text, extra = []) => {
  const value = requiredJson(await call(label, runArgs(text, extra)));
  if (typeof value.sessionId !== "string" || !value.sessionId) throw new Error("Native CLI omitted the session identity");
  if (!receipt.sessions.includes(value.sessionId)) receipt.sessions.push(value.sessionId);
  return value.sessionId;
};
try {
  const init = await call("init", ["init", "--trust-boundary", "isolated", "--profile", "ci"]);
  if (init.exitCode !== 0) throw new Error("Native workspace initialization failed");
  const { readFileSync } = await import("node:fs");
  receipt.monitorFingerprint = createHash("sha256").update(readFileSync(join(workspace, ".amc/keys/monitor_ed25519.pub"))).digest("hex");
  if (fixture.kind === "sdk-resume") {
    const result = await native.runSdk(fixtureFile); receipt.commands.push(result);
    const sdk = requiredJson(result);
    if (typeof sdk.sessionId !== "string" || !sdk.sessionId) throw new Error("SDK fixture omitted its actual session identity");
    receipt.sessions.push(sdk.sessionId);
    receipt.snapshots.before = sdk.before;
  } else if (fixture.kind === "crash") {
    const args = runArgs(prompt, ["--think-ms", "20000", "--keep-open"]), child = native.start(args, 30000);
    let pending;
    try {
      const deadline = Date.now() + 10000;
      while (Date.now() < deadline) {
        const rows = native.rows();
        const request = rows.find(row => row.event_type === "request/header");
        if (request) { pending = request.session_id; break; }
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      if (!pending || child.pid === null) throw new Error("Crash fixture did not observe a durable native request before its deadline");
      receipt.sessions.push(pending);
      receipt.snapshots.before = briefRows(native.rows(pending));
      // Only the process group created above, inside the disposable fixture, is interrupted.
      process.kill(-child.pid, "SIGKILL");
      const outcome = await child.done;
      receipt.commands.push({ label: "crash", args, ...outcome, json: null });
      if (outcome.signal !== "SIGKILL" || !outcome.treeExitProven || outcome.stdout.droppedBytes || outcome.stderr.droppedBytes) throw new Error("Crash fixture could not prove its interrupted process had settled");
    } finally { child.terminate("dispose"); await child.done; }
    if (fixture.staleWaitMs !== 61000) throw new Error("Crash fixture must observe the ordinary recovery freshness window");
    const waiting = performance.now();
    await new Promise(resolve => setTimeout(resolve, fixture.staleWaitMs));
    receipt.recoveryWaitMs = performance.now() - waiting;
    requiredJson(await call("recover", ["session", "recover", pending, "--close", "--json"]));
  } else if (fixture.kind === "resume" || fixture.kind === "fork") {
    const parent = await open("first", prompt, fixture.kind === "resume" ? ["--keep-open"] : []);
    receipt.snapshots.before = briefRows(native.rows(parent));
    await open("second", `${fixture.prompt}: continued`, [fixture.kind === "resume" ? "--session" : "--fork-from", parent]);
  } else if (fixture.kind === "compaction" || fixture.kind === "stale-edit") {
    const id = await open("first", prompt, ["--keep-open"]);
    receipt.snapshots.before = briefRows(native.rows(id));
    const listing = requiredJson(await call("origins-before", ["session", "compact", id, "--list", "--json"]));
    const entry = listing.entries.find(entry => entry.role === "user" && entry.kind === "text" && entry.bytes > Buffer.byteLength(fixture.replacement));
    if (!entry) throw new Error("Fixture has no eligible measured user origin");
    writeFileSync(join(workspace, "reviewed-summary.txt"), fixture.replacement, { mode: 0o600, flag: "wx" });
    const args = ["session", "compact", id, "--origins", entry.originEventId, "--expect-head", listing.headEventHash,
      "--reason", "Explicit offline fixture summary", "--replace", "--summary-file", join(workspace, "reviewed-summary.txt"), "--json"];
    requiredJson(await call("compact", args));
    receipt.snapshots.afterCompaction = briefRows(native.rows(id));
    if (fixture.kind === "stale-edit") {
      await call("stale-edit", args);
      receipt.snapshots.afterRefusal = briefRows(native.rows(id));
    }
    requiredJson(await call("origins-after", ["session", "compact", id, "--list", "--json"]));
    await open("second", `${fixture.prompt}: continued`, ["--session", id]);
  } else {
    const extra = fixture.kind === "echo" ? ["--tools", "echo"]
      : fixture.kind === "step-bound" ? ["--tools", "echo", "--max-steps", "1"]
      : fixture.kind === "retry" ? ["--fail-first", "1"]
      : fixture.kind === "cancel" ? ["--think-ms", "5000", "--cancel-after", "250"] : [];
    const id = await open("first", prompt, extra);
    if (fixture.kind === "tamper") {
      requiredJson(await call("positive-agent-verifier", ["agent-loop", "verify", id, "--json"]));
      requiredJson(await call("positive-ledger-verifier", ["session", "verify", "--expect-monitor", receipt.monitorFingerprint, "--json"]));
      const rows = native.rows(id), target = rows.find(row => row.event_type === "request/header");
      if (!target) throw new Error("Tamper fixture has no actual recorded request");
      receipt.snapshots.before = briefRows(rows);
      receipt.tamperedEventId = target.id;
      receipt.triggersBefore = native.triggers();
      const db = new native.Database(join(workspace, ".amc/evidence.sqlite"), { fileMustExist: true });
      try {
        const update = () => db.prepare("UPDATE evidence_events SET writer_sig = ? WHERE id = ?").run("offline-fixture-invalid-signature", target.id);
        try { update(); }
        catch (error) {
          if (!(error instanceof Error) || error.message !== "evidence immutable fields changed") throw error;
          receipt.immutableGuardRefused = true;
        }
        if (!receipt.immutableGuardRefused) throw new Error("Ordinary fixture mutation was not refused by the immutable-field guard");
        const guard = db.prepare("SELECT name, sql FROM sqlite_master WHERE type = 'trigger' AND tbl_name = 'evidence_events'").all()
          .filter(row => row.sql.includes("evidence immutable fields changed"));
        if (guard.length !== 1) throw new Error("Fixture cannot identify its exact immutable-update guard");
        // Model privileged offline file corruption only in this disposable fixture.
        // Ordinary API/SQL mutation was already proven refused; restore the schema before any verifier reads it.
        db.exec(`DROP TRIGGER "${guard[0].name.replaceAll('"', '""')}"`);
        try {
          const result = update();
          if (result.changes !== 1) throw new Error("Tamper fixture did not change exactly one synthetic workspace row");
        } finally { db.exec(guard[0].sql); }
      } finally { db.close(); }
      receipt.triggersAfter = native.triggers();
    }
  }
  verifyInventory(inventoryFile);
} catch (error) {
  // A failed fixture is visible to the oracle, not silently relabeled as unsupported.
  receipt.executionError = error instanceof Error ? error.message : "Native fixture action failed";
} finally {
  try { await native.dispose(); }
  catch { receipt.executionError = "Native fixture subprocess cleanup was not proven"; }
}
process.stdout.write(JSON.stringify(receipt) + "\n");
