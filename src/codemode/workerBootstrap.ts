/**
 * The program the worker actually runs (P4.5).
 *
 * Exported as a string rather than a module, because it is evaluated inside a
 * fresh `Worker` and must not carry AMC's own module graph in with it.
 *
 * WHAT THIS IS AND IS NOT. It is a FAULT boundary: a fresh worker per run, so
 * a program that crashes, spins or exhausts memory takes nothing with it, and
 * `terminate()` reclaims it.
 *
 * It is NOT a security boundary, and pretending otherwise would be the most
 * dangerous thing in this phase. Measured: a Node worker can `require("node:fs")`
 * and write anywhere, `require("node:child_process")` and spawn, and open
 * sockets. `vm` is no better — Node's own documentation says it is not a
 * security mechanism. So a program that ignores the `tools` binding and calls
 * `fs.writeFileSync` directly is COMPLETELY ungoverned by the tool pipeline.
 *
 * What stops it is the P4.4 sandbox, which applies to the whole process
 * including its worker threads — measured: a worker's write outside the
 * workspace is refused with EPERM while a write inside succeeds. That is why
 * `CodeModeRunner` refuses to run unconfined rather than treating confinement
 * as an optional extra.
 */
export const WORKER_BOOTSTRAP = String.raw`
const { parentPort, workerData } = require("node:worker_threads");

// Captured before the program runs. The program is untrusted code sharing this
// realm, and it can replace JSON.stringify, Promise, or Map with something
// that lies. Everything the host protocol depends on is taken now, so a
// program cannot make the harness misreport what it did.
const capturedStringify = JSON.stringify;
const capturedParse = JSON.parse;
const CapturedPromise = Promise;
const CapturedMap = Map;
const post = parentPort.postMessage.bind(parentPort);

const pending = new CapturedMap();
let nextCallId = 0;

parentPort.on("message", (message) => {
  if (!message || message.kind !== "call-result") return;
  const settle = pending.get(message.id);
  if (!settle) return;
  pending.delete(message.id);
  if (message.ok) settle.resolve(message.value);
  else settle.reject(new Error(message.error));
});

/**
 * One tool call, dispatched to the host.
 *
 * Arguments are round-tripped through the captured JSON functions before they
 * leave. A structured-clone of a live object could carry getters and proxies
 * across, so the host would decide policy on one value and the tool would run
 * on whatever the getter returned next.
 */
function callTool(name, args) {
  const id = nextCallId++;
  return new CapturedPromise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    let detached;
    try {
      detached = capturedParse(capturedStringify(args === undefined ? {} : args));
    } catch (error) {
      pending.delete(id);
      reject(new Error("tool arguments must be JSON-serialisable"));
      return;
    }
    post({ kind: "call", id, name, args: detached });
  });
}

const tools = new Proxy({}, {
  get(_target, name) {
    if (typeof name !== "string") return undefined;
    return (args) => callTool(name, args);
  }
});

(async () => {
  try {
    // Yes: untrusted source, compiled and run. That is the feature, not an
    // oversight -- Code Mode exists to execute a model-written program, and a
    // warning about this line is describing the point of the phase. What makes
    // it defensible is stated at the top of this file and enforced elsewhere:
    // a fresh worker per run for faults, and the P4.4 OS sandbox for
    // everything else. The program is assumed hostile; it is NOT assumed to be
    // contained by this file.
    const run = new Function("tools", '"use strict";\nreturn (async () => {' + workerData.source + "\n})();");
    const value = await run(tools);
    post({ kind: "done", value: value === undefined ? null : capturedParse(capturedStringify(value)) });
  } catch (error) {
    post({ kind: "failed", message: error && error.message ? String(error.message) : String(error) });
  }
})();
`;
