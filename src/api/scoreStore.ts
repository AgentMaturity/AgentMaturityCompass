import { randomUUID } from "node:crypto";
import { join, resolve } from "node:path";
import type Database from "better-sqlite3";
import { ensureDir } from "../utils/fs.js";
import { closeSqlitePool, getOrCreateSqlitePool } from "../storage/sqlitePool.js";

export interface DiagAnswerRecord {
  value: number;
  notes?: string;
}

export interface DiagSession {
  id: string;
  agentId: string;
  answers: Record<string, DiagAnswerRecord>;
  createdAt: string;
  completedAt?: string;
}

const poolKeys = new Map<string, string>();

function normalizedWorkspace(workspace?: string): string {
  const raw = workspace && workspace.trim().length > 0 ? workspace : process.cwd();
  return resolve(raw);
}

function scoreDbPath(workspace: string): string {
  return join(workspace, ".amc", "score_sessions.sqlite");
}

function parsePoolSize(raw: string | undefined, fallback: number): number {
  if (!raw) {
    return fallback;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

function scorePoolSize(): number {
  return parsePoolSize(process.env.AMC_SCORE_SQLITE_POOL_SIZE ?? process.env.AMC_SQLITE_POOL_SIZE, 4);
}

function scorePoolKey(workspace: string): string {
  return `score:${workspace}:${scoreDbPath(workspace)}`;
}

function scorePool(workspace?: string) {
  const root = normalizedWorkspace(workspace);
  const key = scorePoolKey(root);
  poolKeys.set(root, key);

  ensureDir(join(root, ".amc"));
  return getOrCreateSqlitePool({
    key,
    dbPath: scoreDbPath(root),
    maxSize: scorePoolSize(),
    configureConnection: (db) => {
      db.pragma("journal_mode = WAL");
      db.pragma("synchronous = NORMAL");
      db.pragma("busy_timeout = 5000");
    },
    initialize: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS score_sessions (
          session_id TEXT PRIMARY KEY,
          agent_id TEXT NOT NULL,
          answers_json TEXT NOT NULL DEFAULT '{}',
          created_at TEXT NOT NULL,
          completed_at TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_score_sessions_created_at ON score_sessions(created_at);
        CREATE INDEX IF NOT EXISTS idx_score_sessions_completed_at ON score_sessions(completed_at);
      `);
    }
  });
}

function withScoreDb<T>(workspace: string | undefined, fn: (db: Database.Database) => T): T {
  return scorePool(workspace).withLease((db) => fn(db));
}

function parseAnswers(raw: string): Record<string, DiagAnswerRecord> {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: Record<string, DiagAnswerRecord> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value !== "object" || value === null) {
        continue;
      }
      const row = value as Record<string, unknown>;
      if (typeof row.value !== "number") {
        continue;
      }
      out[key] = {
        value: row.value,
        notes: typeof row.notes === "string" ? row.notes : undefined
      };
    }
    return out;
  } catch {
    return {};
  }
}

function hydrateSession(row: {
  session_id: string;
  agent_id: string;
  answers_json: string;
  created_at: string;
  completed_at: string | null;
}): DiagSession {
  return {
    id: row.session_id,
    agentId: row.agent_id,
    answers: parseAnswers(row.answers_json),
    createdAt: row.created_at,
    completedAt: row.completed_at ?? undefined
  };
}

export function createScoreSession(workspace: string | undefined, agentId: string): DiagSession {
  const nowIso = new Date().toISOString();
  const session: DiagSession = {
    id: randomUUID(),
    agentId,
    answers: {},
    createdAt: nowIso
  };
  withScoreDb(workspace, (db) => {
    db.prepare(
      `INSERT INTO score_sessions(session_id, agent_id, answers_json, created_at, completed_at)
       VALUES(@sessionId, @agentId, @answersJson, @createdAt, NULL)`
    ).run({
      sessionId: session.id,
      agentId: session.agentId,
      answersJson: JSON.stringify(session.answers),
      createdAt: session.createdAt
    });
  });
  return session;
}

export function getScoreSession(workspace: string | undefined, sessionId: string): DiagSession | null {
  return withScoreDb(workspace, (db) => {
    const row = db
      .prepare(
        `SELECT session_id, agent_id, answers_json, created_at, completed_at
         FROM score_sessions
         WHERE session_id = ?`
      )
      .get(sessionId) as
      | {
          session_id: string;
          agent_id: string;
          answers_json: string;
          created_at: string;
          completed_at: string | null;
        }
      | undefined;
    if (!row) {
      return null;
    }
    return hydrateSession(row);
  });
}

export function recordScoreAnswer(params: {
  workspace?: string;
  sessionId: string;
  questionId: string;
  value: number;
  notes?: string;
}): DiagSession | null {
  return withScoreDb(params.workspace, (db) => {
    db.exec("BEGIN IMMEDIATE");
    try {
      const row = db
        .prepare(
          `SELECT session_id, agent_id, answers_json, created_at, completed_at
           FROM score_sessions
           WHERE session_id = ?`
        )
        .get(params.sessionId) as
        | {
            session_id: string;
            agent_id: string;
            answers_json: string;
            created_at: string;
            completed_at: string | null;
          }
        | undefined;
      if (!row) {
        db.exec("ROLLBACK");
        return null;
      }

      const session = hydrateSession(row);
      session.answers[params.questionId] = {
        value: params.value,
        notes: params.notes
      };

      db.prepare(
        `UPDATE score_sessions
         SET answers_json = @answersJson
         WHERE session_id = @sessionId`
      ).run({
        sessionId: session.id,
        answersJson: JSON.stringify(session.answers)
      });
      db.exec("COMMIT");
      return session;
    } catch (error) {
      try {
        db.exec("ROLLBACK");
      } catch {
        // no-op: rollback best effort
      }
      throw error;
    }
  });
}

export function markScoreSessionCompleted(workspace: string | undefined, sessionId: string): void {
  withScoreDb(workspace, (db) => {
    db.prepare(
      `UPDATE score_sessions
       SET completed_at = COALESCE(completed_at, @completedAt)
       WHERE session_id = @sessionId`
    ).run({
      sessionId,
      completedAt: new Date().toISOString()
    });
  });
}

export function countActiveScoreSessions(workspace: string | undefined): number {
  return withScoreDb(workspace, (db) => {
    const row = db
      .prepare("SELECT COUNT(*) AS c FROM score_sessions WHERE completed_at IS NULL")
      .get() as { c: number };
    return Number(row.c ?? 0);
  });
}

export function scoreDbHealthy(workspace: string | undefined): boolean {
  try {
    return withScoreDb(workspace, (db) => {
      db.prepare("SELECT 1").get();
      return true;
    });
  } catch {
    return false;
  }
}

export function closeScoreSessionStores(workspace?: string): void {
  if (workspace && workspace.trim().length > 0) {
    const root = normalizedWorkspace(workspace);
    const key = poolKeys.get(root);
    if (key) {
      closeSqlitePool(key);
      poolKeys.delete(root);
    }
    return;
  }
  for (const [root, key] of poolKeys.entries()) {
    closeSqlitePool(key);
    poolKeys.delete(root);
  }
}
