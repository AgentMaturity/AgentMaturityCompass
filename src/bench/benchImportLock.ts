import { join } from "node:path";
import { withControlFileLock } from "../lifecycle/controlFileLock.js";
/** Existing cache/store and actual async import share only the final local publication boundary. */
export function withBenchImportLock<T>(workspace: string, operation: () => T): T {
  return withControlFileLock({ root: join(workspace, ".amc", "bench", "imports"), name: "bench-import-publication", operation });
}
