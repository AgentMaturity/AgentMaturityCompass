import { join } from "node:path";
import { getAgentPaths, resolveAgentId } from "../fleet/paths.js";
import { pathExists, readUtf8, writeFileAtomic } from "../utils/fs.js";

export interface DiagnosticRunAliasRecord {
  alias: string;
  runId: string;
  agentId: string;
  createdTs: number;
  updatedTs: number;
}

export interface DiagnosticRunAliasStore {
  schemaVersion: 1;
  agentId: string;
  aliases: DiagnosticRunAliasRecord[];
}

export interface SaveRunAliasInput {
  alias: string;
  runId: string;
  agentId?: string;
  now?: number;
}

const RESERVED_ALIASES = new Set(["latest"]);

export function normalizeRunAlias(input: string): string {
  const raw = input.trim().toLowerCase();
  if (!raw) {
    throw new Error("run alias is required.");
  }
  if (raw.includes("/") || raw.includes("\\") || raw.includes("..")) {
    throw new Error("run alias cannot contain path separators or traversal markers.");
  }

  const alias = raw.replace(/\s+/g, "-");
  if (RESERVED_ALIASES.has(alias)) {
    throw new Error(`"${alias}" is reserved for AMC report resolution.`);
  }
  if (!/^[a-z0-9][a-z0-9._-]{0,63}$/.test(alias)) {
    throw new Error("run alias must start with a letter or number and use only letters, numbers, dots, underscores, or dashes.");
  }
  return alias;
}

export function runAliasStorePath(workspace: string, agentId?: string): string {
  return join(getAgentPaths(workspace, agentId).rootDir, "run-aliases.json");
}

function emptyRunAliasStore(workspace: string, agentId?: string): DiagnosticRunAliasStore {
  return {
    schemaVersion: 1,
    agentId: resolveAgentId(workspace, agentId),
    aliases: []
  };
}

function parseRunAliasStore(workspace: string, agentId: string | undefined, raw: string): DiagnosticRunAliasStore {
  const parsed = JSON.parse(raw) as Partial<DiagnosticRunAliasStore>;
  if (parsed.schemaVersion !== 1 || !Array.isArray(parsed.aliases)) {
    throw new Error("run alias registry has an unsupported schema.");
  }
  const resolvedAgentId = resolveAgentId(workspace, agentId);
  const aliases: DiagnosticRunAliasRecord[] = [];
  for (const row of parsed.aliases) {
    if (!row || typeof row !== "object") {
      continue;
    }
    const candidate = row as Partial<DiagnosticRunAliasRecord>;
    if (typeof candidate.alias !== "string" || typeof candidate.runId !== "string") {
      continue;
    }
    try {
      const alias = normalizeRunAlias(candidate.alias);
      const runId = candidate.runId.trim();
      if (!runId) {
        continue;
      }
      aliases.push({
        alias,
        runId,
        agentId: resolvedAgentId,
        createdTs: typeof candidate.createdTs === "number" ? candidate.createdTs : 0,
        updatedTs: typeof candidate.updatedTs === "number" ? candidate.updatedTs : 0
      });
    } catch {
      continue;
    }
  }
  return {
    schemaVersion: 1,
    agentId: resolvedAgentId,
    aliases: aliases.sort((a, b) => a.alias.localeCompare(b.alias))
  };
}

export function loadRunAliasStore(workspace: string, agentId?: string): DiagnosticRunAliasStore {
  const file = runAliasStorePath(workspace, agentId);
  if (!pathExists(file)) {
    return emptyRunAliasStore(workspace, agentId);
  }
  return parseRunAliasStore(workspace, agentId, readUtf8(file));
}

function writeRunAliasStore(workspace: string, agentId: string | undefined, store: DiagnosticRunAliasStore): void {
  writeFileAtomic(runAliasStorePath(workspace, agentId), `${JSON.stringify(store, null, 2)}\n`, 0o644);
}

export function listRunAliases(workspace: string, agentId?: string): DiagnosticRunAliasRecord[] {
  return loadRunAliasStore(workspace, agentId).aliases;
}

export function aliasesForRun(workspace: string, runId: string, agentId?: string): string[] {
  const requestedRunId = runId.trim();
  return listRunAliases(workspace, agentId)
    .filter((row) => row.runId === requestedRunId)
    .map((row) => row.alias);
}

export function resolveRunAlias(workspace: string, alias: string, agentId?: string): DiagnosticRunAliasRecord | null {
  let normalized: string;
  try {
    normalized = normalizeRunAlias(alias);
  } catch {
    return null;
  }
  return listRunAliases(workspace, agentId).find((row) => row.alias === normalized) ?? null;
}

export function saveRunAlias(workspace: string, input: SaveRunAliasInput): DiagnosticRunAliasRecord {
  const alias = normalizeRunAlias(input.alias);
  const runId = input.runId.trim();
  if (!runId) {
    throw new Error("runId is required for a run alias.");
  }
  const agentId = resolveAgentId(workspace, input.agentId);
  const now = input.now ?? Date.now();
  const store = loadRunAliasStore(workspace, agentId);
  const existingIndex = store.aliases.findIndex((row) => row.alias === alias);
  const existing = existingIndex >= 0 ? store.aliases[existingIndex] : undefined;
  const record: DiagnosticRunAliasRecord = {
    alias,
    runId,
    agentId,
    createdTs: existing?.createdTs ?? now,
    updatedTs: now
  };

  if (existingIndex >= 0) {
    store.aliases[existingIndex] = record;
  } else {
    store.aliases.push(record);
  }
  store.aliases.sort((a, b) => a.alias.localeCompare(b.alias));
  writeRunAliasStore(workspace, agentId, store);
  return record;
}

export function removeRunAlias(workspace: string, alias: string, agentId?: string): boolean {
  const normalized = normalizeRunAlias(alias);
  const resolvedAgentId = resolveAgentId(workspace, agentId);
  const store = loadRunAliasStore(workspace, resolvedAgentId);
  const next = store.aliases.filter((row) => row.alias !== normalized);
  if (next.length === store.aliases.length) {
    return false;
  }
  writeRunAliasStore(workspace, resolvedAgentId, {
    ...store,
    aliases: next
  });
  return true;
}
