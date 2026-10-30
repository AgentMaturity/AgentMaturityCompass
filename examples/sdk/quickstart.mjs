/**
 * TypeScript SDK quickstart (P1-40): from `amc init --coding` to a verified synthetic action.
 *
 * Every line it prints is synthetic. The stub provider runs no model: it makes one scripted fs.write call (hello.txt in
 * this workspace) that the signed tool policy, the firewall and the evidence log govern exactly as they govern a real
 * provider's call. Verification checks the integrity and authorship of the recorded evidence against the monitor key
 * you pinned, never the quality of an answer.
 *
 * Run it in a workspace made by `amc init --coding`, with AMC_VAULT_PASSPHRASE set and AMC_EXPECTED_MONITOR_FINGERPRINT
 * set to the fingerprint `amc init` printed:  node quickstart.mjs [workspace]
 */
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { AMCNativeClient } from "agent-maturity-compass/sdk/native";

const workspace = resolve(process.argv[2] ?? process.cwd());
if (!process.env.AMC_EXPECTED_MONITOR_FINGERPRINT) {
  console.error("Set AMC_EXPECTED_MONITOR_FINGERPRINT to the monitor key fingerprint amc init printed; verification refuses an unpinned key.");
  process.exit(1);
}

const started = Date.now();
const agent = await AMCNativeClient.start({ workspace, provider: "stub", tools: "workspace" });
let session;
let call;
let receipt;
try {
  session = await agent.newSession();
  // The stub reads this exact shape as the one call to make; any other prompt calls its first offered tool.
  const task = JSON.stringify({ tool: "fs.write", arguments: { path: "hello.txt", content: "hello from the AMC SDK quickstart (synthetic stub run)\n" } });
  const result = await session.prompt(task).result;
  call = result.updates.filter((u) => u.update.sessionUpdate === "tool_call_update").at(-1)?.update;
  // Closes the runtime, seals the session, then a fresh verifier reads the signed log.
  receipt = await session.closeAndVerify();
} finally {
  await agent.close();
}

const written = existsSync(join(workspace, "hello.txt"));
console.log("[synthetic] provider stub: no model ran; a scripted demonstration, never a real-model result (claim kind synthetic_example)");
console.log(`[synthetic] session ${session.sessionId}`);
console.log(`[synthetic] governed tool call fs.write hello.txt: ${call?.status ?? "not made"}; hello.txt written: ${written ? "yes" : "no"}`);
console.log(`[synthetic] verification: ${receipt.state}, ${receipt.scope} (integrity and authorship of the recorded evidence, not answer quality)`);
console.log(`[synthetic] receipt sha256: ${createHash("sha256").update(JSON.stringify(receipt.report)).digest("hex")}`);
console.log(`[synthetic] wall time: ${((Date.now() - started) / 1000).toFixed(1)}s`);
if (call?.status !== "completed" || !written) process.exitCode = 1;
