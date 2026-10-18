// Child process for the pilot coding oracle (run with --experimental-vm-modules). It links only the task's own
// modules by relative specifier inside a fresh vm context per call, with code generation from strings disabled.
// It is a bounded evaluator for trusted-fixture runs, not an OS sandbox; the parent enforces the wall-time limit.
import { posix } from "node:path";
import vm from "node:vm";

const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
const input = JSON.parse(Buffer.concat(chunks).toString("utf8"));
const rows = [];

for (const call of input.calls) {
  const context = vm.createContext(Object.create(null), { codeGeneration: { strings: false, wasm: false } });
  const [objectPrototype, arrayPrototype] = new vm.Script("[Object.prototype, Array.prototype]").runInContext(context);
  const modules = new Map();
  const load = (name) => {
    if (!modules.has(name)) {
      if (typeof input.sources[name] !== "string") throw new Error("missing-module");
      modules.set(name, new vm.SourceTextModule(input.sources[name], { context, identifier: name,
        importModuleDynamically: () => { throw new Error("imports-not-supported"); } }));
    }
    return modules.get(name);
  };
  const link = (specifier, referencing) => {
    if (!/^\.\.?\//.test(specifier)) throw new Error("imports-not-supported");
    return load(posix.normalize(posix.join(posix.dirname(referencing.identifier), specifier)));
  };
  // Own data properties of ordinary arrays and plain objects only: never a target getter, toJSON or prototype method.
  let budget = 8192;
  const copy = (value, depth = 0) => {
    if (--budget < 0 || depth > 16) throw new Error("output-bound");
    if (value === null || typeof value === "string" || typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value))) return value;
    const array = Array.isArray(value);
    if (typeof value !== "object" || Object.getPrototypeOf(value) !== (array ? arrayPrototype : objectPrototype)) throw new Error("plain-data-required");
    const descriptors = Object.getOwnPropertyDescriptors(value), result = array ? [] : {};
    for (const key of Reflect.ownKeys(descriptors)) {
      if (array && key === "length") continue;
      const descriptor = descriptors[key];
      if (typeof key !== "string" || !Object.hasOwn(descriptor, "value") || !descriptor.enumerable) throw new Error("plain-data-required");
      result[key] = copy(descriptor.value, depth + 1);
    }
    return result;
  };
  let row;
  try {
    const root = load(call.module);
    await root.link(link);
    await root.evaluate({ timeout: 250 });
    const fn = root.namespace[call.export];
    if (typeof fn !== "function") throw new Error("missing-export");
    const args = new vm.Script(`(${JSON.stringify(call.args)})`).runInContext(context);
    try {
      const value = fn(...args);
      try { row = { id: call.id, outcome: "returned", valueJson: JSON.stringify(copy(value)) }; } catch { row = { id: call.id, outcome: "invalid-output" }; }
    } catch (error) {
      const name = error?.name;
      row = { id: call.id, outcome: "threw", errorName: ["TypeError", "RangeError", "SyntaxError"].includes(name) ? name : "Error" };
    }
  } catch { row = { id: call.id, outcome: "load-failed" }; }
  rows.push(row);
}
process.stdout.write(JSON.stringify({ rows }) + "\n");
