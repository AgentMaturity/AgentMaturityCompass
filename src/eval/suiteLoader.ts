/**
 * Loads an eval suite and snapshots its fixtures BEFORE any attempt runs (SH-OBS-04). Attempts write under the
 * workspace, so every grader input comes from this in-memory snapshot, never from a directory an agent could touch;
 * the digests are pinned in the results file.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import YAML from "yaml";
import { sha256Hex } from "../utils/hash.js";
import { suiteSchema, type EvalSuite } from "./suiteSchema.js";

const MAX_FIXTURE_BYTES = 50 * 1024 * 1024;

export interface FixtureFile { readonly relativePath: string; readonly bytes: Buffer; readonly sha256: string; readonly mode: number }

export interface LoadedSuite {
  readonly path: string;
  readonly suite: EvalSuite;
  readonly suiteSha256: string;
  /** Per task id, the fixture files in snapshot order. */
  readonly fixtures: ReadonlyMap<string, readonly FixtureFile[]>;
}

function insideRoot(root: string, candidate: string): boolean {
  const rel = relative(root, candidate);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

function snapshotDir(root: string, budget: { left: number }): FixtureFile[] {
  const out: FixtureFile[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = join(dir, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`fixture ${relative(root, full)} is a symlink; fixtures hold plain files only`);
      if (entry.isDirectory()) { walk(full); continue; }
      if (!entry.isFile()) continue;
      const bytes = readFileSync(full);
      budget.left -= bytes.length;
      if (budget.left < 0) throw new Error(`fixtures exceed ${MAX_FIXTURE_BYTES} bytes`);
      out.push({ relativePath: relative(root, full).split(sep).join("/"), bytes, sha256: sha256Hex(bytes), mode: statSync(full).mode & 0o777 });
    }
  };
  walk(root);
  return out;
}

export function loadEvalSuite(path: string): LoadedSuite {
  const absolute = resolve(path);
  const raw = readFileSync(absolute);
  let parsed: unknown;
  try { parsed = YAML.parse(raw.toString("utf8")); } catch (error) { throw new Error(`suite ${absolute} is not valid YAML: ${error instanceof Error ? error.message : String(error)}`); }
  const result = suiteSchema.safeParse(parsed);
  if (!result.success) throw new Error(`suite ${absolute} is invalid: ${result.error.issues.map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`).join("; ")}`);
  const suiteDir = dirname(absolute);
  const budget = { left: MAX_FIXTURE_BYTES };
  const fixtures = new Map<string, readonly FixtureFile[]>();
  for (const task of result.data.tasks) {
    if (task.fixture === undefined) continue;
    const dir = resolve(suiteDir, task.fixture.dir);
    if (!insideRoot(suiteDir, dir)) throw new Error(`task ${task.id}: fixture ${task.fixture.dir} is outside the suite directory`);
    if (!statSync(dir, { throwIfNoEntry: false })?.isDirectory()) throw new Error(`task ${task.id}: fixture directory ${task.fixture.dir} does not exist`);
    fixtures.set(task.id, snapshotDir(dir, budget));
  }
  return { path: absolute, suite: result.data, suiteSha256: sha256Hex(raw), fixtures };
}

/** Pinned digests of everything a run depends on, for the results file. */
export function fixtureDigests(loaded: LoadedSuite): Record<string, Record<string, string>> {
  return Object.fromEntries([...loaded.fixtures.entries()].map(([taskId, files]) => [taskId, Object.fromEntries(files.map((file) => [file.relativePath, file.sha256]))]));
}
