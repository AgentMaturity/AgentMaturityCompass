import { realpathSync, statSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";

interface Location { names: readonly string[]; identity: string | null }
function location(path: string): Location {
  const absolute = resolve(path), suffix: string[] = [];
  let ancestor = absolute, canonical: string;
  for (;;) {
    try { canonical = join(realpathSync(ancestor), ...suffix.reverse()); break; }
    catch (cause) {
      if ((cause as NodeJS.ErrnoException).code !== "ENOENT") throw cause;
      const parent = dirname(ancestor); if (parent === ancestor) throw cause;
      suffix.push(basename(ancestor)); ancestor = parent;
    }
  }
  const stat = statSync(absolute, { throwIfNoEntry: false });
  return { names: [absolute, canonical], identity: stat?.isFile() ? `${stat.dev}:${stat.ino}` : null };
}
function overlaps(a: Location, b: Location): boolean {
  return a.names.some(name => b.names.includes(name)) || (a.identity !== null && a.identity === b.identity);
}
/** Refuse only known consumed-input/output collisions; this is not a filesystem authorization boundary. */
export function captureAuditOutputAliases(outputPaths: readonly string[], inputPaths: readonly string[]) {
  const outputs = [...new Set(outputPaths)], inputs = [...new Set(inputPaths)], originalInputs = inputs.map(location);
  const assertCurrent = () => {
    const destinations = outputs.map(location), consumed = [...originalInputs, ...inputs.map(location)];
    for (let index = 0; index < destinations.length; index += 1) {
      if (destinations.slice(0, index).some(other => overlaps(destinations[index]!, other))
        || consumed.some(input => overlaps(destinations[index]!, input)))
        throw new Error("audit output aliases another output or a known consumed input");
    }
  };
  assertCurrent(); return assertCurrent;
}
