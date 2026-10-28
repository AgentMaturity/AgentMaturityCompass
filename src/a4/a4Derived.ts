/**
 * A4 derived content (P2-42): the compiled plan an Adapt revision carries is stored once, outside the revision row, and
 * the row binds it by sha256. On the shipped catalog a compiled plan is about 150 KiB (the catalog lock, the evidence
 * plan, the requirements), and Adapt carried it twice (Understand's facts and the proposal), so no proposal fit the
 * router's 256 KiB specification limit. The limit stays: it bounds what every revision row, request and export holds.
 *
 * `compactSpec` replaces the plan at `plan` and `understanding.facts.plan` with a ref, `{ schema: amc.a4-derived-ref/v1,
 * kind: compiled-plan, sha256, digest }` (`digest` is the plan's own self-verifying digest), and returns the canonical
 * bytes it took out. `writeDerived` stores them, named by their sha256, under `a4-projects/<projectId>/derived/` (plain
 * directories, no link on the way), after the release secret scan; a write whose transition is then refused leaves a
 * file nothing names, as a4Package's captured inputs do. The bytes are AMC's compilation of the shipped catalog and the
 * fact names: no member free text and nothing personal, so they are stored plain (an erasure leaves them, a keyless
 * verifier can read them).
 *
 * `hydrateSpecJson` puts the plan back for readers (readiness state, the producers, Build, Review, activation) after
 * checking the file against the ref: a missing file, other bytes or a ref that does not parse is an integrity failure
 * (409 A4_INTEGRITY_FAILED), never an empty plan. `derivedProblems` is verifyA4Chain's check of the same, from disk.
 * A revision recorded before this change carries the plan inline: both shapes are read, and only the ref is checked.
 */
import { lstatSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { highSeveritySecretTypes } from "../release/releaseSecretScan.js";
import { pathExists, writeFileAtomic } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import { A4StoreError } from "./a4Store.js";

export const DERIVED_REF_SCHEMA = "amc.a4-derived-ref/v1";
/** Where Adapt specs carry a compiled plan. */
const PLAN_PATHS: ReadonlyArray<readonly string[]> = [["plan"], ["understanding", "facts", "plan"]];
const MAX_DERIVED_BYTES = 16 * 1024 * 1024;
const refSchema = z.strictObject({ schema: z.literal(DERIVED_REF_SCHEMA), kind: z.literal("compiled-plan"), sha256: z.string().regex(/^[0-9a-f]{64}$/),
  digest: z.string().min(1) });
type DerivedRef = z.infer<typeof refSchema>;

type Json = Record<string, unknown>;
const isObject = (value: unknown): value is Json => typeof value === "object" && value !== null && !Array.isArray(value);
const isRef = (value: unknown): boolean => isObject(value) && value.schema === DERIVED_REF_SCHEMA;

/** `value` at `path`, or undefined. */
function at(spec: Json, path: readonly string[]): unknown {
  let value: unknown = spec;
  for (const key of path) value = isObject(value) && Object.hasOwn(value, key) ? value[key] : undefined;
  return value;
}
/** A copy of `spec` with `path` set to `value` (every object on the way copied, nothing mutated). */
function withAt(spec: Json, path: readonly string[], value: unknown): Json {
  const [key, ...rest] = path;
  return { ...spec, [key!]: rest.length === 0 ? value : withAt(spec[key!] as Json, rest, value) };
}

/** The spec as a revision row stores it: each compiled plan replaced by its ref, and the bytes taken out by sha256. */
export function compactSpec(stage: string, spec: Json): { spec: Json; blobs: Map<string, string> } {
  const blobs = new Map<string, string>();
  if (stage !== "adapt") return { spec, blobs };
  let out = spec;
  for (const path of PLAN_PATHS) {
    const plan = at(out, path);
    if (!isObject(plan) || isRef(plan)) continue;
    const bytes = canonicalize(plan);
    const sha256 = sha256Hex(bytes);
    blobs.set(sha256, bytes);
    out = withAt(out, path, { schema: DERIVED_REF_SCHEMA, kind: "compiled-plan", sha256, digest: String(plan.digest) } satisfies DerivedRef);
  }
  return { spec: out, blobs };
}

/** `a4-projects/<projectId>/derived`, each component a plain directory (made when `create`); null when absent and not made. */
function derivedDir(workspace: string, projectId: string, create: boolean): string | null {
  if (!/^a4p_[0-9a-f]{32}$/.test(projectId)) throw new A4StoreError(400, "INPUT_INVALID", "invalid project id");
  let path = workspace;
  for (const segment of ["a4-projects", projectId, "derived"]) {
    path = join(path, segment);
    if (!pathExists(path)) {
      if (!create) return null;
      mkdirSync(path);
    }
    const stat = lstatSync(path);
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw new A4StoreError(409, "A4_INTEGRITY_FAILED", "The derived-content directory is not a plain directory.");
  }
  return path;
}

/** Stores each blob once (the secret scan first: 400 SECRET_IN_INPUT); an existing file with other bytes is rewritten to the named ones. */
export function writeDerived(workspace: string, projectId: string, blobs: ReadonlyMap<string, string>): void {
  if (blobs.size === 0) return;
  const dir = derivedDir(workspace, projectId, true)!;
  for (const [sha256, bytes] of blobs) {
    const found = highSeveritySecretTypes(bytes);
    if (found.length > 0) throw new A4StoreError(400, "SECRET_IN_INPUT", `The compiled plan looks like it holds a credential (${found.join(", ")}); change the answers.`);
    const path = join(dir, `${sha256}.json`);
    const existing = readBytes(path);
    if (existing === null || sha256Hex(existing) !== sha256) writeFileAtomic(path, bytes, 0o644);
  }
}

/** A regular file's bytes under the bound, or null. */
function readBytes(path: string): Buffer | null {
  try {
    const stat = lstatSync(path);
    return stat.isFile() && stat.size <= MAX_DERIVED_BYTES ? readFileSync(path) : null;
  } catch {
    return null;
  }
}

/** The plan a ref names, read and checked; a problem string (`A4_DERIVED_*`) otherwise. */
function resolveRef(workspace: string, projectId: string, value: unknown): { plan: Json } | { problem: string } {
  const ref = refSchema.safeParse(value);
  if (!ref.success) return { problem: "A4_DERIVED_REF_INVALID: a derived-content ref does not parse" };
  const { sha256, digest } = ref.data;
  const dir = derivedDir(workspace, projectId, false);
  const bytes = dir === null ? null : readBytes(join(dir, `${sha256}.json`));
  if (bytes === null) return { problem: `A4_DERIVED_MISSING: compiled plan ${sha256} is not under a4-projects/${projectId}/derived` };
  if (sha256Hex(bytes) !== sha256) return { problem: `A4_DERIVED_MISMATCH: compiled plan ${sha256} does not match its name` };
  let plan: unknown;
  try {
    plan = JSON.parse(bytes.toString("utf8"));
  } catch {
    plan = null;
  }
  if (!isObject(plan) || plan.digest !== digest) return { problem: `A4_DERIVED_MISMATCH: compiled plan ${sha256} is not the plan ${digest} the revision binds` };
  return { plan };
}

/** Every derived-content problem of one stored revision (verifyA4Chain); empty for a revision with no ref. */
export function revisionDerivedProblems(workspace: string, projectId: string, row: { revision_no: unknown; stage: unknown; spec_json: unknown }): string[] {
  const text = String(row.spec_json);
  if (row.stage !== "adapt" || !text.includes(DERIVED_REF_SCHEMA)) return [];
  let spec: unknown;
  try {
    spec = JSON.parse(text);
  } catch {
    return [];
  }
  return PLAN_PATHS.flatMap((path) => {
    const value = isObject(spec) ? at(spec, path) : undefined;
    if (!isRef(value)) return [];
    const resolved = resolveRef(workspace, projectId, value);
    return "problem" in resolved ? [`${resolved.problem} (revision ${String(row.revision_no)})`] : [];
  });
}

/** How many derived parts the stored revisions bind (the offline record's warning). */
export const derivedRefCount = (rows: ReadonlyArray<Record<string, unknown>>): number =>
  rows.filter((row) => row.stage === "adapt").reduce((count, row) => count + String(row.spec_json).split(`"${DERIVED_REF_SCHEMA}"`).length - 1, 0);

/**
 * The stored spec text with each plan ref replaced by the plan it names, checked; the text itself when the revision
 * carries no ref (another stage, or a plan stored inline before P2-42). 409 A4_INTEGRITY_FAILED otherwise.
 */
export function hydrateSpecJson(workspace: string, projectId: string, row: { revision_no: number; stage: string; spec_json: string }): string {
  if (row.stage !== "adapt" || !row.spec_json.includes(DERIVED_REF_SCHEMA)) return row.spec_json;
  let spec = JSON.parse(row.spec_json) as Json;
  for (const path of PLAN_PATHS) {
    const value = at(spec, path);
    if (!isRef(value)) continue;
    const resolved = resolveRef(workspace, projectId, value);
    if ("problem" in resolved) {
      throw new A4StoreError(409, "A4_INTEGRITY_FAILED", `Revision ${row.revision_no}'s compiled plan cannot be read back as recorded.`, [resolved.problem]);
    }
    spec = withAt(spec, path, resolved.plan);
  }
  return canonicalize(spec);
}
