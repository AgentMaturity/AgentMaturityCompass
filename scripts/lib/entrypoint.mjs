import { realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";

/**
 * True when Node runs the module at `moduleUrl` (pass `import.meta.url`) as its entry point, also through a
 * symlinked path: import.meta.url names the resolved file, so argv[1] is resolved before comparing.
 */
export function isEntrypoint(moduleUrl) {
  try {
    return Boolean(process.argv[1]) && moduleUrl === pathToFileURL(realpathSync(process.argv[1])).href;
  } catch {
    return false;
  }
}
