// P2-35: a second AMC process for the A4 tests (two-process request races, an effect owner that dies). It runs the built
// A4 code (dist/) against the parent's workspace and prints one JSON line. Input is one JSON argument; nothing is
// read from the network. `wait` (an absolute ms timestamp) lines up concurrent children before they act.
import { Readable } from "node:stream";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const input = JSON.parse(process.argv[2]);
const dist = (path) => import(pathToFileURL(resolve(input.repo, "dist", path)).href);
const until = async (ts) => { while (Date.now() < ts) await new Promise((done) => setTimeout(done, 1)); };

const nativeTasks = { principalId: `session:LOCAL_USER:${input.userId}`, demo: false, nativeCsrfToken: null, service: {}, admissionActor: {},
  executionAllowed: () => true };

if (input.action === "post") {
  const { handleA4Route } = await dist("a4/a4Router.js");
  const text = JSON.stringify(input.body);
  const req = Object.assign(Readable.from([Buffer.from(text, "utf8")]), { headers: { "content-type": "application/json",
    "content-length": String(Buffer.byteLength(text)) }, url: input.path, method: "POST" });
  let status = 0, out = "";
  const res = { headersSent: false, setHeader: () => undefined, getHeader: () => undefined,
    writeHead(code) { status = code; this.headersSent = true; return this; }, end(chunk) { out += chunk ?? ""; } };
  await until(input.wait ?? 0);
  await handleA4Route(input.path, "POST", req, res, { workspace: input.workspace, nativeTasks, revalidateAuthority: () => true });
  process.stdout.write(`${JSON.stringify({ pid: process.pid, status, body: out === "" ? null : JSON.parse(out) })}\n`);
  process.exit(0);
}

if (input.action === "start-effect-then-die") {
  // Records EFFECT_STARTED as `complete` does, then exits before any executor runs: a crash after commit.
  const { resolveA4Principal } = await dist("a4/a4Identity.js");
  const { completeStage } = await dist("a4/a4Effects.js");
  const { openA4Store } = await dist("a4/a4Store.js");
  const resolved = resolveA4Principal({ workspace: input.workspace, nativeTasks, pathname: `/api/v1/a4/projects/${input.projectId}/stages/${input.stage}/complete`, method: "POST" });
  if (!resolved.ok) throw new Error(resolved.code);
  const store = openA4Store(input.workspace);
  const started = completeStage(store, input.projectId, { principal: resolved.principal, hostedRouter: false, hostMode: false, fullIntegrity: true,
    stage: input.stage, gateId: input.gateId, expectedHeadSeq: input.expectedHeadSeq });
  process.stdout.write(`${JSON.stringify({ pid: process.pid, attemptId: started.attemptId, seq: started.result.seq })}\n`);
  process.exit(0);
}

throw new Error(`unknown action ${input.action}`);
