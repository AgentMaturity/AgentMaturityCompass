import Database from "better-sqlite3";
import { join } from "node:path";
import { ensureDir } from "../utils/fs.js";
import { ensureSchema } from "./integrationQueueSchema.js";

function integrationQueuePath(workspace: string): string {
  return join(workspace, ".amc", "integration-delivery.sqlite");
}


export function openIntegrationQueueDb(workspace: string): Database.Database {
  ensureDir(join(workspace, ".amc"));
  const db = new Database(integrationQueuePath(workspace));
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");
  db.pragma("secure_delete = ON");
  const scrubbed = ensureSchema(db);
  if (scrubbed) {
    db.pragma("wal_checkpoint(TRUNCATE)");
  }
  return db;
}
