import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { versions } from "node:process";
import type { DoctorCheck } from "./doctorRules.js";

export interface DoctorSqliteDatabase {
  prepare(sql: string): { get(): unknown };
  close(): unknown;
}
export type DoctorSqliteConstructor = new (path: string) => DoctorSqliteDatabase;

/**
 * The folder whose node_modules holds better-sqlite3, where `npm rebuild` must run: the AMC package for a global install,
 * the runtime folder for the desktop launchers' `npm install --prefix` runtime, where npm hoists it above the AMC package
 * (the same folder src/storage/nativeGuard.ts rebuilds in).
 */
function sqliteProjectRoot(): string | null {
  try { return resolve(dirname(createRequire(import.meta.url).resolve("better-sqlite3/package.json")), "..", ".."); } catch { return null; }
}

const REBUILD_WHERE = "in the folder whose node_modules holds better-sqlite3 (the AMC package for a global install, the runtime folder for the desktop app)";
const rebuildCommand = (root: string | null): string => root === null ? `npm rebuild better-sqlite3 ${REBUILD_WHERE}` : `cd "${root}" && npm rebuild better-sqlite3`;

/** Requiring better-sqlite3 loads JS; constructing it actually loads the addon. */
export function nativeModuleCheck(load: () => DoctorSqliteConstructor = () => createRequire(import.meta.url)("better-sqlite3"),
  locate: () => string | null = sqliteProjectRoot): DoctorCheck {
  try {
    const Database = load();
    const database = new Database(":memory:");
    try {
      const result = database.prepare("SELECT 1 AS amc_probe").get();
      if (result === null || typeof result !== "object" || (result as { amc_probe?: unknown }).amc_probe !== 1) {
        throw new Error("Native SQLite query did not return the expected result");
      }
    } finally { database.close(); }
    return { id: "native-modules", status: "PASS", message: "better-sqlite3 native binding opened, queried and closed an in-memory database" };
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("NODE_MODULE_VERSION")) return {
      id: "native-modules", status: "FAIL",
      message: `better-sqlite3 was compiled for a different Node version (running Node ${versions.node})`,
      fixHint: `Run: ${rebuildCommand(locate())}, or reinstall AMC with this Node version active`
    };
    // Dependency errors can contain absolute paths or injected loader text.
    // The diagnostic needs an actionable category, not a raw exception dump.
    return { id: "native-modules", status: "FAIL", message: "better-sqlite3 could not complete its native in-memory database probe",
      fixHint: `Run: ${rebuildCommand(locate())} with the Node version used by amc; then rerun amc doctor. Reinstall AMC if the rebuild fails.` };
  }
}
