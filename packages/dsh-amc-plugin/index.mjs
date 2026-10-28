/**
 * AMC's gate for DeepSeek Harness tool calls (P2-17 part C), written against the DSH 0.2.1-rc.2 tool pipeline
 * (docs/source-reviews/P2-17-dsh-plugin.md in the AMC repository).
 *
 * Every tool call DSH dispatches runs the `tools/pre-execute` waterfall with frozen arguments, then the monotonic
 * guards. This plugin prepends a pre-execute listener that asks AMC through the injected `decide` transport, and
 * registers a guard that denies every call AMC did not allow. The guard makes the gate independent of listener order:
 * a listener ahead of AMC's that returns `allow` without calling `next()` skips AMC's listener, and the guard then
 * denies the call. A throwing listener makes DSH fail the call without dispatching it.
 *
 * Fails closed: an unqualified DSH version, missing arguments, a transport error or timeout, and any answer other than
 * an exact allow or deny all deny. It imports only Node built-ins, so it never loads a second Cordis kernel.
 *
 * Mounted from a DSH profile, the module's own `apply(ctx, config)` takes the entry `amc connect hooks install
 * --provider dsh` prints: the AMC workspace, the absolute path of AMC's transport (dist/adapters/dsh/dshControlClient.js),
 * DSH's version and the qualified versions. It imports the transport on the first call; a bad config or a failed
 * import denies every call.
 */
import { isAbsolute } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const name = "amc-governance";
export const inject = ["tools"];

export const DENY_NO_ARGUMENTS = "DSH did not supply tool arguments; AMC cannot evaluate this call";
export const DENY_UNAVAILABLE = "AMC control unavailable; action denied.";
export const DENY_MALFORMED = "AMC's answer is not a decision for this call; action denied.";
export const DENY_NOT_ALLOWED = "AMC did not allow this call; action denied.";

const nonEmpty = (value) => typeof value === "string" && value.trim().length > 0;

function withTimeout(promise, timeoutMs) {
  let timer;
  const expired = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`AMC did not answer within ${timeoutMs} ms`)), timeoutMs);
  });
  return Promise.race([promise, expired]).finally(() => clearTimeout(timer));
}

/**
 * @param {import("./index.d.mts").AmcDshPluginOptions} options
 * @returns {import("./index.d.mts").AmcDshPlugin}
 */
export function createAmcDshPlugin({ decide, observe, dshVersion, qualifiedVersions, timeoutMs = 10_000 }) {
  if (typeof decide !== "function") throw new TypeError("createAmcDshPlugin needs a decide transport");
  const qualified = new Set(qualifiedVersions);

  /** AMC's verdict for one execution, as a DSH PreToolDecision. */
  async function gate(exec) {
    if (!qualified.has(dshVersion)) return { kind: "deny", reason: `AMC has not qualified DSH ${dshVersion}; control denies the call.` };
    if (exec.arguments === undefined || exec.arguments === null) return { kind: "deny", reason: DENY_NO_ARGUMENTS };
    let answer;
    try {
      answer = await withTimeout(Promise.resolve(decide({
        tool: exec.name,
        arguments: exec.arguments,
        callId: exec.callId,
        rootCallId: exec.rootCallId,
        nested: exec.parent !== undefined,
        dshVersion,
      }, exec.signal)), timeoutMs);
    } catch {
      return { kind: "deny", reason: DENY_UNAVAILABLE };
    }
    const keys = answer !== null && typeof answer === "object" ? Object.keys(answer).sort().join(",") : "";
    if (keys === "decision" && answer.decision === "allow") return { kind: "allow" };
    if (keys === "decision,reason" && answer.decision === "deny" && nonEmpty(answer.reason)) return { kind: "deny", reason: answer.reason };
    return { kind: "deny", reason: DENY_MALFORMED };
  }

  return {
    name,
    inject,
    apply(ctx) {
      const allowedByAmc = new WeakSet();
      ctx.on("tools/pre-execute", async (exec, next) => {
        const verdict = await gate(exec);
        if (verdict.kind !== "allow") return verdict;
        allowedByAmc.add(exec);
        // Later listeners may still deny or ask; they cannot widen AMC's answer past the guard.
        return next();
      }, true);
      ctx.tools.guard((exec) => (allowedByAmc.has(exec) ? undefined : DENY_NOT_ALLOWED));
      if (typeof observe === "function") {
        // Privacy-minimal: name, call ids and whether it failed; never arguments or output. DSH contains observer failures.
        ctx.on("tools/result", (exec, result) => observe({ tool: exec.name, callId: exec.callId, rootCallId: exec.rootCallId, isError: result?.isError === true }));
      }
    },
  };
}

const validConfig = (config) => config !== null && typeof config === "object" && typeof config.workspace === "string" && isAbsolute(config.workspace)
  && typeof config.transport === "string" && isAbsolute(config.transport) && typeof config.dshVersion === "string"
  && Array.isArray(config.qualifiedVersions) && config.qualifiedVersions.every((version) => typeof version === "string");

/** Cordis entry point: the gate, asking AMC through the transport the config names. */
export function apply(ctx, config) {
  const valid = validConfig(config);
  let transport = null;
  const decide = async (request) => {
    if (!valid) throw new Error("the AMC DSH plugin config is invalid");
    transport ??= import(pathToFileURL(config.transport).href)
      .then((module) => module.createAmcDshTransport({ workspace: config.workspace, pluginPath: fileURLToPath(import.meta.url) }));
    return (await transport).decide(request);
  };
  createAmcDshPlugin({ decide, dshVersion: valid ? config.dshVersion : "unknown", qualifiedVersions: valid ? config.qualifiedVersions : [] }).apply(ctx);
}
