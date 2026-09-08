// Invoke the public export selected by the installed package's exports map.
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { directory, jsonFile, runtime, briefRows, loadPassphrase } from "./nativeCommon.mjs";
const [cli, workspace, fixtureFile] = process.argv.slice(2), root = dirname(dirname(cli)), fixture = jsonFile(fixtureFile);
const pkg = jsonFile(join(root, "package.json"));
const exported = pkg.exports?.["./sdk/native"];
const target = typeof exported === "string" ? exported : exported?.import ?? exported?.default;
if (typeof target !== "string" || !target.startsWith("./") || target.includes("..")) throw new Error("Installed package has no supported public native SDK export");
const { AMCNativeClient } = await import(pathToFileURL(join(root, target)).href);
const native = await runtime(cli, workspace, loadPassphrase(workspace));
const options = { workspace, provider: "stub", tools: "none", maxSteps: 2, timeoutMs: 20000,
  command: [process.execPath, "--import", join(directory, "nativeNoNetwork.mjs"), cli],
  env: { AMC_VAULT_PASSPHRASE: loadPassphrase(workspace) } };
let first, second, result;
try {
  first = await AMCNativeClient.start(options);
  const session = await first.newSession();
  const turn = session.prompt(fixture.prompt);
  const updates = [];
  for await (const update of turn) updates.push(update);
  const firstResult = await turn.result;
  await session.release();
  const before = briefRows(native.rows(session.sessionId));
  await first.close();
  second = await AMCNativeClient.start(options);
  const loaded = await second.resumeSession(session.sessionId);
  const next = loaded.prompt(`${fixture.prompt}: continued`);
  const nextUpdates = [];
  for await (const update of next) nextUpdates.push(update);
  const secondResult = await next.result;
  const verified = await loaded.closeAndVerify();
  result = { sessionId: session.sessionId, before, updates, nextUpdates, firstResult, secondResult,
    history: loaded.history, verified, publicExport: "./sdk/native" };
} finally {
  const outcomes = await Promise.allSettled([first?.close(), second?.close(), native.dispose()]);
  if (outcomes.some(outcome => outcome.status === "rejected")) throw new Error("SDK fixture client cleanup did not complete");
}
process.stdout.write(JSON.stringify(result) + "\n");
