/** `amc incident show <id> --clocks` (P2-26): the clocks recorded at open, with notice drafts. Moved out of cli.ts. */
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type Database from "better-sqlite3";
import { incidentNoticeDrafts } from "./incidents/noticeDraft.js";

/** Prints the clock runtime and drafts as JSON, or with `packet` writes one Markdown draft per clock there. */
export function printIncidentClocks(workspace: string, db: Database.Database, id: string, packet: string | undefined): void {
  const { runtime, drafts } = incidentNoticeDrafts({ workspace, db, incidentId: id, nowTs: Date.now() });
  if (!packet) return void console.log(JSON.stringify({ ...runtime, noticeDrafts: drafts.map((draft) => draft.json) }, null, 2));
  const dir = resolve(workspace, packet);
  mkdirSync(dir, { recursive: true });
  for (const draft of drafts) writeFileSync(join(dir, `${id}.${draft.json.clockId}.notice.md`), draft.markdown, "utf8");
  console.log(`${drafts.length} notice draft(s) in ${dir}; AMC does not file notices`);
}
