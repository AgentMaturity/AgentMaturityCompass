// Reads actual SQLite rows and invokes fresh native verifier processes. Never trusts driverStatus as a verdict.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { VERSION, jsonFile, verifyInventory, runtime, loadPassphrase, briefRows } from "./nativeCommon.mjs";

const [cli, workspace, fixtureFile, inventoryFile] = process.argv.slice(2);
let inputBytes = 0, chunks = [];
for await (const chunk of process.stdin) { inputBytes += chunk.length; if (inputBytes > 2 * 1024 * 1024) throw new Error("Oracle input exceeds its bound"); chunks.push(chunk); }
const input = JSON.parse(Buffer.concat(chunks).toString("utf8")), fixture = jsonFile(fixtureFile);
const checks = [];
const check = (id, passed, evidence) => checks.push({ id, passed: Boolean(passed), evidence: String(evidence).slice(0, 2048) });
const hash = value => createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
const evidence = value => `Observed JSON sha256=${hash(value)}; ${JSON.stringify(value).slice(0, 1500)}`;
let native;
try {
  const inventory = verifyInventory(inventoryFile);
  if (inventory.cli !== cli) throw new Error("Oracle runtime identity mismatch");
  const receipt = JSON.parse(input.stdout);
  check("receipt-identity", receipt.schemaVersion === VERSION && receipt.fixtureId === fixture.id && input.taskId === fixture.id, evidence({ expected: fixture.id, actual: receipt.fixtureId }));
  check("actions-completed", !receipt.executionError, receipt.executionError ?? "All native fixture actions returned structured observations.");
  if (receipt.executionError) throw new Error("Fixture actions failed before independent verification");
  check("subprocesses-settled", receipt.commands.length > 1 && receipt.commands.every(row => row.treeExitProven && !row.stdout.droppedBytes && !row.stderr.droppedBytes), evidence(receipt.commands.map(row => ({ label: row.label, exit: row.exitCode, signal: row.signal, tree: row.treeExitProven }))));
  const command = label => receipt.commands.find(row => row.label === label);
  const meta = row => JSON.parse(row.meta_json);
  const count = (rows, type) => rows.filter(row => row.event_type === type).length;
  const prefix = (before, after) => before.length > 0 && before.every((row, index) => row.id === after[index]?.id && row.hash === after[index]?.hash && row.signatureSha256 === after[index]?.signatureSha256);
  native = await runtime(cli, workspace, loadPassphrase(workspace));
  const fingerprint = hash(readFileSync(join(workspace, ".amc/keys/monitor_ed25519.pub"), "utf8"));
  check("fixture-monitor-unchanged", fingerprint === receipt.monitorFingerprint, `Initialization fingerprint=${receipt.monitorFingerprint}; current=${fingerprint}. This is a fixture pin, not externally attested identity.`);
  const all = receipt.sessions.map(id => ({ id, rows: native.rows(id) }));
  check("real-native-evidence", all.length > 0 && all.every(({ rows }) => rows.length > 5 && rows[0].event_type === "session/open" && count(rows, "turn/start") > 0), evidence(all.map(({ id, rows }) => ({ id, events: rows.length, turns: count(rows, "turn/start") }))));
  check("ordered-native-envelopes", all.every(({ id, rows }) => rows.every((row, index) => {
    const envelope = meta(row).amcSession;
    return envelope?.sessionId === id && envelope.seq === index && envelope.prevSessionEventHash === (index ? rows[index - 1].event_hash : "SESSION_GENESIS") && row.writer_sig !== "unsigned";
  })), "Independently walked persisted session IDs, zero-based sequence numbers, previous hashes, and non-unsigned markers; cold verifiers below authenticate signatures.");
  const ledger = await native.run("oracle-ledger", ["session", "verify", "--expect-monitor", receipt.monitorFingerprint, "--json"]);
  const verifiers = [];
  for (const { id } of all) verifiers.push(await native.run("oracle-agent", ["agent-loop", "verify", id, "--json"]));
  const verifierErrors = row => row.label === "oracle-ledger" ? row.json?.errors
    : Array.isArray(row.json?.ledgerErrors) && Array.isArray(row.json?.sessionChainErrors)
      ? [...row.json.ledgerErrors, ...row.json.sessionChainErrors, ...(row.json.unsignedRowIds ?? []),
        ...(row.json.requests ?? []).filter(request => request.status !== "reconstructed").map(request => request.detail ?? request.status)] : null;
  const verifierFacts = [ledger, ...verifiers].map(row => ({ exit: row.exitCode, ok: row.json?.ok, errors: verifierErrors(row) }));
  if (fixture.kind === "tamper") {
    check("positive-control", ["positive-agent-verifier", "positive-ledger-verifier"].every(label => command(label)?.exitCode === 0 && command(label)?.json?.ok === true), "Both cold verifier entry points passed before the fixture-only mutation; original structured outcomes are retained in the adapter capture.");
    check("both-verifiers-refuse", verifierFacts.every(row => row.exit !== 0 && row.ok === false && Array.isArray(row.errors) && row.errors.length > 0), evidence(verifierFacts));
    const before = receipt.snapshots.before, after = briefRows(all[0].rows), changed = after.filter((row, index) => row.signatureSha256 !== before[index]?.signatureSha256);
    check("exact-signature-mutation", before.length === after.length && after.every((row, index) => row.id === before[index].id && row.hash === before[index].hash) && changed.length === 1 && changed[0].id === receipt.tamperedEventId, evidence({ changed: changed.map(row => row.id), rowsBefore: before.length, rowsAfter: after.length }));
  } else {
    check("cold-verifiers-pass", verifierFacts.every(row => row.exit === 0 && row.ok === true && Array.isArray(row.errors) && row.errors.length === 0), evidence(verifierFacts));
    check("closed-sessions", all.every(({ id }) => ledger.json?.sessions?.closed?.includes(id)), evidence(ledger.json?.sessions));
  }
  const rows = all.at(-1).rows, endings = rows.filter(row => row.event_type === "turn/end").map(meta);
  const calls = rows.filter(row => row.event_type === "tool/call"), results = rows.filter(row => row.event_type === "tool/result");
  if (fixture.kind === "echo") {
    check("echo-dispatched-once", calls.length === 1 && results.length === 1 && count(rows, "request/header") === 2, evidence({ calls: calls.length, results: results.length, requests: count(rows, "request/header") }));
    const { readEventPayload } = await import(pathToFileURL(join(native.root, "dist/session/eventPayload.js")).href);
    // Cold CLI processes unlock their own vaults. This process needs its own in-memory unlock for the independently read bytes.
    const { unlockVault } = await import(pathToFileURL(join(native.root, "dist/vault/vault.js")).href);
    unlockVault(workspace, loadPassphrase(workspace));
    const payload = results[0] && readEventPayload(workspace, results[0]);
    check("echo-bytes", payload?.status === "ok" && payload.bytes.toString("utf8").includes(fixture.prompt), payload?.status === "ok" ? `Actual tool-result bytes sha256=${hash(payload.bytes.toString("utf8"))}; expected fixture marker is present.` : "Tool-result payload unavailable.");
  } else if (fixture.kind === "none") {
    check("no-tool-dispatch", calls.length === 0 && results.length === 0 && count(rows, "request/header") === 1 && count(rows, "assistant/block") > 0, evidence({ calls: calls.length, results: results.length, requests: count(rows, "request/header"), assistantBlocks: count(rows, "assistant/block") }));
  } else if (fixture.kind === "step-bound") {
    check("step-bound-enforced", count(rows, "step/start") === 1 && count(rows, "request/header") === 1 && calls.length === 1 && endings.some(row => row.reason === "max_steps"), evidence({ steps: count(rows, "step/start"), requests: count(rows, "request/header"), calls: calls.length, endings }));
  } else if (fixture.kind === "retry") {
    const retries = rows.filter(row => row.event_type === "loop/retry").map(meta);
    check("one-real-retry", count(rows, "request/header") === 2 && count(rows, "request/failure") === 1 && retries.filter(row => row.decision === "retry").length === 1 && count(rows, "assistant/block") > 0, evidence({ requests: count(rows, "request/header"), failures: count(rows, "request/failure"), retries }));
  } else if (fixture.kind === "cancel") {
    check("signed-user-cancel", count(rows, "loop/cancel") === 1 && endings.some(row => row.reason === "cancelled" && row.cancelCause?.kind === "user" && row.interrupted === false), evidence({ cancellations: count(rows, "loop/cancel"), endings }));
  } else if (fixture.kind === "resume") {
    check("same-session-two-turns", all.length === 1 && count(rows, "turn/start") === 2 && count(rows, "request/header") === 2, evidence({ sessions: all.length, turns: count(rows, "turn/start"), requests: count(rows, "request/header") }));
    check("resume-preserves-prefix", prefix(receipt.snapshots.before, briefRows(rows)), `Original ${receipt.snapshots.before.length} event IDs, hashes and signatures are unchanged.`);
  } else if (fixture.kind === "fork") {
    const parent = all[0], lineage = meta(rows[0]).parentSession;
    check("fork-identity", all.length === 2 && parent.id !== all[1].id && lineage?.sessionId === parent.id && lineage?.finalEventHash === parent.rows.at(-1).event_hash && lineage?.seq === parent.rows.length - 1, evidence({ lineage, parent: parent.id, child: all.at(-1).id }));
    check("parent-unchanged", JSON.stringify(receipt.snapshots.before) === JSON.stringify(briefRows(parent.rows)), `Parent evidence fingerprint=${hash(briefRows(parent.rows))}.`);
  } else if (fixture.kind === "compaction" || fixture.kind === "stale-edit") {
    const before = command("origins-before").json, after = command("origins-after").json, compact = command("compact").json;
    const entry = before.entries.find(row => row.role === "user" && row.kind === "text");
    const actualBytes = Buffer.byteLength(Array.from({ length: fixture.repeat }, () => fixture.prompt).join("\n"));
    const summaryBytes = Buffer.byteLength(fixture.replacement), replacement = after.entries.find(row => row.originEventId === entry.originEventId);
    check("measured-compaction", entry.bytes === actualBytes && compact.replacedBytes === actualBytes && compact.replacementBytes === summaryBytes && compact.savedBytes === actualBytes - summaryBytes && compact.measurement === "payload-bytes-not-tokens" && replacement?.bytes === summaryBytes && replacement?.sha256 === hash(fixture.replacement), evidence({ actualBytes, summaryBytes, compact, replacement }));
    check("compaction-retains-evidence", prefix(receipt.snapshots.before, briefRows(rows)) && rows.some(row => row.id === entry.originEventId) && rows.some(row => row.id === compact.eventId), `Original origin=${entry.originEventId}; measured receipt=${compact.eventId}; original signed prefix retained.`);
    check("continues-after-compaction", count(rows, "turn/start") === 2 && count(rows, "request/header") === 2, evidence({ turns: count(rows, "turn/start"), requests: count(rows, "request/header") }));
    if (fixture.kind === "stale-edit") {
      const refusal = command("stale-edit");
      check("stale-head-refused", refusal.exitCode !== 0 && refusal.json?.ok === false && /head changed/i.test(refusal.json?.error ?? ""), evidence(refusal.json));
      check("refusal-no-mutation", JSON.stringify(receipt.snapshots.afterCompaction) === JSON.stringify(receipt.snapshots.afterRefusal), `Before and after refusal evidence fingerprint=${hash(receipt.snapshots.afterRefusal)}.`);
    }
  } else if (fixture.kind === "sdk-resume") {
    const sdk = command("sdk").json;
    check("public-sdk-lifecycle", sdk.publicExport === "./sdk/native" && sdk.sessionId === all[0].id && sdk.verified?.state === "verified" && sdk.verified?.report?.ok === true, evidence({ publicExport: sdk.publicExport, sessionId: sdk.sessionId, receiptState: sdk.verified?.state, ok: sdk.verified?.report?.ok }));
    check("sdk-committed-stream", sdk.updates.length > 0 && sdk.nextUpdates.length > 0 && [...sdk.updates, ...sdk.nextUpdates].every(update => update.sessionId === sdk.sessionId) && sdk.firstResult.verification === "not-verified" && sdk.secondResult.verification === "not-verified" && sdk.firstResult.text.includes(fixture.prompt) && sdk.secondResult.text.includes(`${fixture.prompt}: continued`), evidence({ updates: sdk.updates.length, nextUpdates: sdk.nextUpdates.length, runVerification: [sdk.firstResult.verification, sdk.secondResult.verification] }));
    check("sdk-history-replay", sdk.history.length > 0 && count(rows, "turn/start") === 2 && count(rows, "request/header") === 2 && prefix(receipt.snapshots.before, briefRows(rows)), evidence({ historyUpdates: sdk.history.length, turns: count(rows, "turn/start"), requests: count(rows, "request/header"), originalPrefix: receipt.snapshots.before.length }));
  } else if (fixture.kind === "crash") {
    const recovery = command("recover").json;
    check("real-dead-owner-recovery", command("crash").signal === "SIGKILL" && command("crash").treeExitProven && recovery.verdict === "RECOVERED" && recovery.wonClaim === true && recovery.syntheticTurnEnds === 1 && recovery.syntheticStepEnds === 1 && recovery.closed === true, evidence({ signal: command("crash").signal, recovery }));
    check("recovery-append-only", prefix(receipt.snapshots.before, briefRows(rows)), `Original interrupted prefix of ${receipt.snapshots.before.length} rows retained.`);
    check("no-recovery-redispatch", count(rows, "request/header") === 1 && calls.length === 0 && results.length === 0 && endings.some(row => row.interrupted === true && row.amcSession?.synthetic === true), evidence({ requests: count(rows, "request/header"), calls: calls.length, results: results.length, endings }));
  }
  verifyInventory(inventoryFile);
} catch (error) { check("oracle-completed", false, error instanceof Error ? error.message : "Independent oracle could not complete"); }
finally {
  if (native) try { await native.dispose(); } catch { check("oracle-cleanup", false, "Independent verifier process cleanup was not proven"); }
}
process.stdout.write(JSON.stringify({ schemaVersion: VERSION, verdict: checks.every(row => row.passed) ? "pass" : "fail", checks }) + "\n");
