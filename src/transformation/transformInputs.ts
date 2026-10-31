import { lstatSync, statSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { getAgentPaths } from "../fleet/paths.js";
import { loadOrgConfig, nodeAgentIds } from "../org/orgStore.js";
import { parseWindowToMs } from "../utils/time.js";
import { sha256Hex } from "../utils/hash.js";

type Scope = { type: "AGENT"; agentId: string } | { type: "NODE"; nodeId: string };
type JsonRow = { path: string; body: Record<string, unknown> };
function bytes(path: string): string {
  try {
    const before = lstatSync(path), target = statSync(path);
    if (!target.isFile()) return `non-file:${before.dev}:${before.ino}:${before.mode}:${target.dev}:${target.ino}:${target.mode}`;
    const data = readFileSync(path), after = lstatSync(path), lastTarget = statSync(path);
    if (before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size || before.mtimeMs !== after.mtimeMs
      || target.dev !== lastTarget.dev || target.ino !== lastTarget.ino || target.size !== lastTarget.size || target.mtimeMs !== lastTarget.mtimeMs)
      throw new Error("transformation input changed while being read");
    return `${after.dev}:${after.ino}:${after.mode & 0o777}:${lastTarget.dev}:${lastTarget.ino}:${lastTarget.mode & 0o777}:${sha256Hex(data)}`;
  } catch (cause) { const code = (cause as NodeJS.ErrnoException).code; if (code === "ENOENT") return "absent"; if (code === "EACCES" || code === "EPERM") return `unreadable:${code}`; throw cause; }
}
function jsonRows(dir: string, strict = false, sorted = true): JsonRow[] {
  let names: string[];
  try { names = readdirSync(dir).filter(name => name.endsWith(".json")); if (sorted) names.sort((a, b) => a.localeCompare(b)); }
  catch (cause) { if ((cause as NodeJS.ErrnoException).code === "ENOENT") return []; throw cause; }
  return names.flatMap(name => {
    const path = join(dir, name);
    try { const body = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>; return body === null && !strict ? [] : [{ path, body }]; }
    catch (cause) { if (strict) throw cause; return []; }
  });
}

/** Fixed transformation selectors. Each final re-selection pins raw bytes only for records that can alter the consumed result. */
export class TransformInputCapture {
  private readonly assertions: (() => void)[] = [];
  select(selector: () => string[]): void {
    const capture = () => selector().map(path => [path, bytes(path)]);
    const original = JSON.stringify(capture());
    this.assertions.push(() => { if (JSON.stringify(capture()) !== original)
      throw new Error("transformation selected evidence or input bytes changed while signing; retry"); });
  }
  file(path: string): void { this.select(() => [path]); }
  pair(path: string): void { this.select(() => [path, `${path}.sig`]); }
  diagnostic(workspace: string, agentId: string, window?: { start: number; end: number }): void {
    this.select(() => {
      const rows = jsonRows(getAgentPaths(workspace, agentId).runsDir, false, window === undefined).filter(row => window === undefined
        || (Number(row.body.ts) >= window.start && Number(row.body.ts) <= window.end && row.body.status === "VALID"))
        .sort((a, b) => Number(b.body.ts) - Number(a.body.ts));
      const row = window === undefined ? rows.find(row => row.body.status === "VALID") ?? rows[0] : rows[0];
      return row === undefined ? [] : [row.path];
    });
  }
  outcome(workspace: string, agentId: string, window?: { start: number; end: number }, planner = false): void {
    this.select(() => {
      const dir = planner ? join(workspace, ".amc", "agents", agentId, "outcomes", "reports")
        : join(getAgentPaths(workspace, agentId).rootDir, "outcomes", "reports");
      if (window !== undefined) {
        const row = jsonRows(dir, false, false).filter(row => Number(row.body.ts ?? 0) >= window.start && Number(row.body.ts ?? 0) <= window.end)
          .sort((a, b) => Number(b.body.ts ?? 0) - Number(a.body.ts ?? 0))[0];
        return row === undefined ? [] : [row.path];
      }
      try { const name = readdirSync(dir).filter(name => name.endsWith(".json")).sort((a, b) => a.localeCompare(b)).at(-1);
        return name === undefined ? [] : [join(dir, name)]; }
      catch (cause) { if ((cause as NodeJS.ErrnoException).code === "ENOENT") return []; throw cause; }
    });
  }
  assurance(workspace: string, agentId: string, start: number, end: number, neededPacks?: readonly string[]): void {
    this.select(() => {
      const picked = new Map<string, { ts: number; path: string }>();
      for (const row of jsonRows(join(getAgentPaths(workspace, agentId).reportsDir, "assurance"), true)) {
        const ts = row.body.ts as number;
        if (row.body.agentId !== agentId || ts < start || ts > end) continue;
        for (const pack of row.body.packResults as { packId: string }[]) {
          if (neededPacks !== undefined && !neededPacks.includes(pack.packId)) continue;
          const prior = picked.get(pack.packId);
          if (prior === undefined || ts > prior.ts) picked.set(pack.packId, { ts, path: row.path });
        }
      }
      return [...new Set([...picked.values()].map(row => row.path))].sort();
    });
  }
  attestation(workspace: string, scope: Scope, taskId: string, valid: (value: unknown) => boolean): void {
    this.select(() => {
      const root = scope.type === "AGENT" ? join(workspace, ".amc", "agents", scope.agentId, "transform")
        : join(workspace, ".amc", "org", "transform", scope.nodeId);
      const row = jsonRows(join(root, "attestations"), false, false).filter(row => valid(row.body)).filter(row => row.body.taskId === taskId)
        .sort((a, b) => Number(b.body.createdTs) - Number(a.body.createdTs))[0];
      return row === undefined ? [] : [row.path];
    });
  }
  assertCurrent = (): void => { for (const assertion of this.assertions) assertion(); };
}

export function captureTransformPlanInputs(workspace: string, scope: Scope, window: string, asOfTs: number, needsTargets: boolean) {
  const reads = new TransformInputCapture();
  for (const name of ["transform-map.yaml", "action-policy.yaml", "tools.yaml", "budgets.yaml", "approval-policy.yaml"])
    reads.pair(join(workspace, ".amc", name));
  const target = (agentId: string) => reads.select(() => {
    const primary = join(getAgentPaths(workspace, agentId).targetsDir, "default.target.json"), legacy = join(workspace, ".amc", "targets", "default.target.json");
    return [bytes(primary) !== "absent" ? primary : legacy];
  });
  if (scope.type === "AGENT") {
    reads.diagnostic(workspace, scope.agentId); reads.outcome(workspace, scope.agentId, undefined, true);
    reads.select(() => [getAgentPaths(workspace, scope.agentId).contextGraph]);
    if (needsTargets) target(scope.agentId);
  } else {
    reads.pair(join(workspace, ".amc", "org.yaml")); reads.pair(join(workspace, ".amc", "fleet.yaml"));
    const config = loadOrgConfig(workspace), agents = nodeAgentIds(config, scope.nodeId);
    const windows = [...new Set([window, ...(needsTargets ? ["14d"] : [])])].map(raw => ({ start: asOfTs - parseWindowToMs(raw), end: asOfTs }));
    for (const agentId of agents) {
      let included = false;
      for (const bounds of windows) {
        reads.diagnostic(workspace, agentId, bounds);
        const hasRun = jsonRows(getAgentPaths(workspace, agentId).runsDir, false, false).some(row => row.body.status === "VALID" && Number(row.body.ts) >= bounds.start && Number(row.body.ts) <= bounds.end);
        if (hasRun) { included = true; reads.outcome(workspace, agentId, bounds); reads.assurance(workspace, agentId, bounds.start, bounds.end); }
      }
      if (!included) continue;
      reads.select(() => [getAgentPaths(workspace, agentId).agentConfig, getAgentPaths(workspace, agentId).agentConfigSig]); target(agentId);
      // Every incident is consumed by activeFreezeStatus's integrity/active aggregate; malformed predecessors affect that aggregate too.
      reads.select(() => {
        const dir = join(getAgentPaths(workspace, agentId).rootDir, "incidents");
        try { return readdirSync(dir).filter(name => name.endsWith(".json") || name.endsWith(".json.sig")).sort().map(name => join(dir, name)); }
        catch (cause) { if ((cause as NodeJS.ErrnoException).code === "ENOENT") return []; throw cause; }
      });
    }
  }
  reads.assertCurrent(); return reads;
}

export function captureTransformRelatedFiles(paths: readonly string[]) {
  const reads = new TransformInputCapture(); for (const path of [...new Set(paths)]) reads.file(path);
  return reads.assertCurrent;
}
