// Coding probe for the pilot oracle. The code it evaluates is written by a model under test and is untrusted.
// The boundary is the container containedProbe.mjs starts (no network, no mounts, read-only, nobody); this file
// reads its input on stdin and is passed to Node as -e there. The vm layer is defense in depth only:
// - a fresh context per call with code generation from strings disabled; only the task's own modules link, by relative specifier;
// - dynamic import rejects with an error created inside the context, so no host-realm object reaches context code;
// - return values, arguments and thrown names are read through own data descriptors after refusing proxies,
//   so no target getter, toJSON or proxy trap runs from this realm.
import { posix } from "node:path";
import { isDeepStrictEqual, types } from "node:util";
import vm from "node:vm";

// A rejection raised by context code (for example an awaited import) is the target's own and must not end the probe.
process.on("unhandledRejection", () => {});
const ERROR_NAMES = new Set(["TypeError", "RangeError", "SyntaxError"]);

/** Plain data from own data descriptors only; throws on a proxy, accessor, foreign prototype or bound breach. */
function plainCopy(value, prototypes, budget = { left: 8192 }, depth = 0) {
  if (--budget.left < 0 || depth > 32) throw new Error("bound");
  if (value === null || typeof value === "string" || typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value))) return value;
  if (typeof value !== "object" || types.isProxy(value)) throw new Error("plain-data-required");
  const array = Array.isArray(value);
  if (Object.getPrototypeOf(value) !== (array ? prototypes.array : prototypes.object)) throw new Error("plain-data-required");
  const descriptors = Object.getOwnPropertyDescriptors(value), result = array ? [] : {};
  for (const key of Reflect.ownKeys(descriptors)) {
    if (array && key === "length") continue;
    const descriptor = descriptors[key];
    if (typeof key !== "string" || !Object.hasOwn(descriptor, "value") || !descriptor.enumerable) throw new Error("plain-data-required");
    if (array && (!/^(0|[1-9]\d*)$/.test(key) || Number(key) >= value.length)) throw new Error("plain-data-required");
    Object.defineProperty(result, key, { value: plainCopy(descriptor.value, prototypes, budget, depth + 1), enumerable: true, writable: true, configurable: true });
  }
  if (array && result.length !== value.length) throw new Error("sparse-array");
  return result;
}

/** A thrown value's name, from data descriptors on it or its prototypes; anything else is "Error". */
function errorName(error) {
  let level = error;
  for (let depth = 0; depth < 8 && level !== null && (typeof level === "object" || typeof level === "function"); depth += 1) {
    if (types.isProxy(level)) return "Error";
    const descriptor = Object.getOwnPropertyDescriptor(level, "name");
    if (descriptor) return Object.hasOwn(descriptor, "value") && ERROR_NAMES.has(descriptor.value) ? descriptor.value : "Error";
    level = Object.getPrototypeOf(level);
  }
  return "Error";
}

async function run(input, call) {
  const context = vm.createContext(Object.create(null), { codeGeneration: { strings: false, wasm: false } });
  const inContext = (code) => new vm.Script(code).runInContext(context);
  const [object, array] = inContext("[Object.prototype, Array.prototype]");
  const refuseImport = inContext("() => Promise.reject(new Error('imports-not-supported'))");
  const modules = new Map();
  const load = (name) => {
    if (!modules.has(name)) {
      if (typeof input.sources[name] !== "string") throw new Error("missing-module");
      modules.set(name, new vm.SourceTextModule(input.sources[name], { context, identifier: name, importModuleDynamically: refuseImport }));
    }
    return modules.get(name);
  };
  // Link failures stay in this realm: the module never evaluates, so no context code can observe them.
  const link = (specifier, referencing) => {
    if (!/^\.\.?\//.test(specifier)) throw new Error("imports-not-supported");
    return load(posix.normalize(posix.join(posix.dirname(referencing.identifier), specifier)));
  };
  let fn, args;
  try {
    const root = load(call.module);
    await root.link(link);
    await root.evaluate({ timeout: 250 });
    const descriptor = Object.getOwnPropertyDescriptor(root.namespace, call.export);
    fn = descriptor && Object.hasOwn(descriptor, "value") ? descriptor.value : undefined;
    if (typeof fn !== "function" || types.isProxy(fn)) throw new Error("missing-export");
    args = inContext(`(${JSON.stringify(call.args)})`);
  } catch { return { id: call.id, outcome: "load-failed", mutated: false }; }
  let row;
  try {
    const value = Reflect.apply(fn, undefined, args); // args is a fresh context array of own data elements
    try { row = { id: call.id, outcome: "returned", valueJson: JSON.stringify(plainCopy(value, { object, array })) }; }
    catch { row = { id: call.id, outcome: "invalid-output" }; }
  } catch (error) { row = { id: call.id, outcome: "threw", errorName: errorName(error) }; }
  // Input immutability, compared through descriptors against the trusted original.
  try { row.mutated = !isDeepStrictEqual(plainCopy(args, { object, array }), call.args); } catch { row.mutated = true; }
  return row;
}

const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
const input = JSON.parse(Buffer.concat(chunks).toString("utf8"));
const rows = [];
for (const call of input.calls) rows.push(await run(input, call));
process.stdout.write(JSON.stringify({ rows }) + "\n");
