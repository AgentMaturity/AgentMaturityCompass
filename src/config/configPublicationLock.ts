import { join } from "node:path";
import { withControlFileLock } from "../lifecycle/controlFileLock.js";

/** Publication and recovery only: never hold this lock while awaiting a provider. */
export function withAmcConfigPublicationLock<T>(workspace: string, operation: () => T): T {
  return withControlFileLock({ root: join(workspace, ".amc"), name: "amc-config", operation });
}
