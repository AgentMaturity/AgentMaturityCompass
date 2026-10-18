/** Pure P1-34 structural guard. Declared review references never authenticate an approval. */
import { z } from "zod";
import { canonicalize } from "../../utils/json.js";
import { controlDigest } from "../digest.js";
import type { CatalogLockfile } from "../lockfile.js";
import type { ControlRecord } from "../types.js";

export type CatalogChangelogIssueCode =
  | "GOV_CHANGELOG_INPUT_INVALID" | "GOV_CHANGELOG_TEXT_INVALID" | "GOV_CHANGELOG_HISTORY_CHANGED"
  | "GOV_CHANGELOG_LOCK_INVALID" | "GOV_CHANGELOG_LOCK_CONTROL_DUPLICATE"
  | "GOV_CHANGELOG_SNAPSHOT_INVALID" | "GOV_CHANGELOG_SNAPSHOT_DUPLICATE" | "GOV_CHANGELOG_SNAPSHOT_MISMATCH"
  | "GOV_CHANGELOG_BLOCK_INVALID" | "GOV_CHANGELOG_BLOCK_BOUNDARY" | "GOV_CHANGELOG_ENTRY_INVALID"
  | "GOV_CHANGELOG_ENTRY_DUPLICATE" | "GOV_CHANGELOG_ENTRY_CONTROL_DUPLICATE" | "GOV_CHANGELOG_REVIEW_REF_DUPLICATE"
  | "GOV_CHANGELOG_REMOVAL_UNRESOLVED" | "GOV_CHANGELOG_DIGEST_CONFLICT"
  | "GOV_CHANGELOG_ENTRY_COUNT" | "GOV_CHANGELOG_CATALOG_MISMATCH" | "GOV_CHANGELOG_CONTROL_COVERAGE"
  | "GOV_CHANGELOG_CONTROL_VERSION_MISMATCH" | "GOV_CHANGELOG_CONTROL_CHANGE_MISMATCH";

export interface CatalogChangelogIssue {
  code: CatalogChangelogIssueCode;
  side?: "previous" | "current";
}
export interface CatalogChangelogResult {
  /** Structural append-only/change coverage only, never approval or full lock verification. */
  ok: boolean;
  issues: CatalogChangelogIssue[];
}
export interface CatalogChangelogInput {
  previousLock: CatalogLockfile;
  currentLock: CatalogLockfile;
  previousControls: readonly ControlRecord[];
  currentControls: readonly ControlRecord[];
  previousText: string;
  currentText: string;
}

const text = z.string().min(1).refine((value) => value.trim().length > 0);
const controlId = z.string().regex(/^L[0-3](-[A-Z0-9]{2,8}){1,2}-[0-9]{2,3}$/);
const digest = z.string().regex(/^sha256:[0-9a-f]{64}$/);
const catalogSchema = z.strictObject({ id: text, version: text, digest });
const pinSchema = z.strictObject({ id: controlId, version: text, pack: text, digest });
// Validate only fields this guard uses; the caller validates the full lock and source records.
const lockProjectionSchema = z.object({ lockfileVersion: z.literal(1), catalog: catalogSchema, controls: z.array(pinSchema) });
const recordHeaderSchema = z.object({ id: controlId, version: text, support: z.enum(["experimental", "reviewed", "qualified", "retired"]) });
const entrySchema = z.strictObject({
  entryVersion: z.literal(1),
  catalog: catalogSchema,
  controls: z.array(z.strictObject({
    id: controlId, version: text, change: z.enum(["added", "changed", "retired"]),
    reason: text, reviewRecordIds: z.array(text).min(1)
  }))
});
export type CatalogChangeEntry = z.infer<typeof entrySchema>;
type GuardLock = z.infer<typeof lockProjectionSchema>;
type ParsedEntry = { start: number; entry: CatalogChangeEntry };
const OPEN = "```amc-catalog-change";
const CLOSE = "```";

function fail(code: CatalogChangelogIssueCode, side?: CatalogChangelogIssue["side"]): CatalogChangelogResult {
  return { ok: false, issues: [{ code, ...(side === undefined ? {} : { side }) }] };
}

function bindControls(lock: GuardLock, controls: readonly ControlRecord[]): Map<string, ControlRecord> | CatalogChangelogIssueCode {
  if (!Array.isArray(controls)) return "GOV_CHANGELOG_SNAPSHOT_INVALID";
  const pins = new Map<string, GuardLock["controls"][number]>();
  for (const pin of lock.controls) {
    if (pins.has(pin.id)) return "GOV_CHANGELOG_LOCK_CONTROL_DUPLICATE";
    pins.set(pin.id, pin);
  }
  const records = new Map<string, ControlRecord>();
  for (const record of controls) {
    const header = recordHeaderSchema.safeParse(record);
    if (!header.success) return "GOV_CHANGELOG_SNAPSHOT_INVALID";
    if (records.has(header.data.id)) return "GOV_CHANGELOG_SNAPSHOT_DUPLICATE";
    const pin = pins.get(header.data.id);
    if (!pin || pin.version !== header.data.version) return "GOV_CHANGELOG_SNAPSHOT_MISMATCH";
    try {
      if (controlDigest(record) !== pin.digest) return "GOV_CHANGELOG_SNAPSHOT_MISMATCH";
    } catch {
      return "GOV_CHANGELOG_SNAPSHOT_INVALID";
    }
    records.set(header.data.id, record);
  }
  return records.size === pins.size ? records : "GOV_CHANGELOG_SNAPSHOT_MISMATCH";
}

/** v1 permits prose and this one fence kind, with one canonical JSON line per block. */
function parseEntries(raw: string): ParsedEntry[] | CatalogChangelogIssueCode {
  const lines = raw.split("\n");
  const entries: ParsedEntry[] = [];
  const identities = new Set<string>();
  let offset = 0;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]!;
    const start = offset;
    offset += line.length + 1;
    if (!/^[ \t]*(`{3,}|~{3,})/.test(line) && !line.includes(OPEN)) continue;
    if (line !== OPEN) return "GOV_CHANGELOG_BLOCK_INVALID";
    const body = lines[i + 1];
    const close = lines[i + 2];
    if (body === undefined || close !== CLOSE) return "GOV_CHANGELOG_BLOCK_INVALID";
    let value: unknown;
    try {
      value = JSON.parse(body);
      // Reject duplicate JSON keys and alternate encodings without a second JSON parser.
      if (canonicalize(value) !== body) return "GOV_CHANGELOG_BLOCK_INVALID";
    } catch {
      return "GOV_CHANGELOG_BLOCK_INVALID";
    }
    const parsed = entrySchema.safeParse(value);
    if (!parsed.success) return "GOV_CHANGELOG_ENTRY_INVALID";
    const entry = parsed.data;
    const identity = canonicalize([entry.catalog.id, entry.catalog.version]);
    if (identities.has(identity)) return "GOV_CHANGELOG_ENTRY_DUPLICATE";
    identities.add(identity);
    const ids = new Set<string>();
    for (const control of entry.controls) {
      if (ids.has(control.id)) return "GOV_CHANGELOG_ENTRY_CONTROL_DUPLICATE";
      ids.add(control.id);
      const references = new Set<string>();
      for (const ref of control.reviewRecordIds) {
        if (references.has(ref)) return "GOV_CHANGELOG_REVIEW_REF_DUPLICATE";
        references.add(ref);
      }
    }
    entries.push({ start, entry });
    offset += body.length + 1 + close.length + 1;
    i += 2;
  }
  return entries;
}

export function checkCatalogChangelog(input: CatalogChangelogInput): CatalogChangelogResult {
  if (!input || typeof input !== "object") return fail("GOV_CHANGELOG_INPUT_INVALID");
  if (typeof input.previousText !== "string" || typeof input.currentText !== "string") return fail("GOV_CHANGELOG_TEXT_INVALID");
  if (!input.currentText.startsWith(input.previousText)) return fail("GOV_CHANGELOG_HISTORY_CHANGED");
  const previous = lockProjectionSchema.safeParse(input.previousLock);
  if (!previous.success) return fail("GOV_CHANGELOG_LOCK_INVALID", "previous");
  const current = lockProjectionSchema.safeParse(input.currentLock);
  if (!current.success) return fail("GOV_CHANGELOG_LOCK_INVALID", "current");
  const before = bindControls(previous.data, input.previousControls);
  if (typeof before === "string") return fail(before, "previous");
  const after = bindControls(current.data, input.currentControls);
  if (typeof after === "string") return fail(after, "current");

  const oldEntries = parseEntries(input.previousText);
  if (typeof oldEntries === "string") return fail(oldEntries, "previous");
  const allEntries = parseEntries(input.currentText);
  if (typeof allEntries === "string") return fail(allEntries, "current");
  const appended = allEntries.filter((block) => block.start >= input.previousText.length);
  if (allEntries.length - appended.length !== oldEntries.length) return fail("GOV_CHANGELOG_BLOCK_BOUNDARY");

  const oldPins = new Map(previous.data.controls.map((pin) => [pin.id, pin]));
  const newPins = new Map(current.data.controls.map((pin) => [pin.id, pin]));
  for (const id of oldPins.keys()) {
    if (!newPins.has(id)) return fail("GOV_CHANGELOG_REMOVAL_UNRESOLVED");
  }
  const expected = new Map<string, { version: string; change: CatalogChangeEntry["controls"][number]["change"] }>();
  for (const pin of newPins.values()) {
    const old = oldPins.get(pin.id);
    if (!old) expected.set(pin.id, { version: pin.version, change: "added" });
    else if (before.get(pin.id)!.support !== "retired" && after.get(pin.id)!.support === "retired") {
      expected.set(pin.id, { version: pin.version, change: "retired" });
    } else if (old.version !== pin.version || old.pack !== pin.pack || old.digest !== pin.digest) {
      expected.set(pin.id, { version: pin.version, change: "changed" });
    }
  }

  const changed = previous.data.catalog.digest !== current.data.catalog.digest;
  if (!changed && (expected.size > 0 || previous.data.catalog.id !== current.data.catalog.id
    || previous.data.catalog.version !== current.data.catalog.version)) return fail("GOV_CHANGELOG_DIGEST_CONFLICT");
  if (appended.length > 1 || (changed && appended.length !== 1)) return fail("GOV_CHANGELOG_ENTRY_COUNT");
  if (appended.length === 0) return { ok: true, issues: [] };
  const entry = appended[0]!.entry; // Only after count and duplicate validation.
  if (canonicalize(entry.catalog) !== canonicalize(current.data.catalog)) return fail("GOV_CHANGELOG_CATALOG_MISMATCH");
  if (entry.controls.length !== expected.size) return fail("GOV_CHANGELOG_CONTROL_COVERAGE");
  for (const control of entry.controls) {
    const actual = expected.get(control.id);
    if (!actual) return fail("GOV_CHANGELOG_CONTROL_COVERAGE");
    if (control.version !== actual.version) return fail("GOV_CHANGELOG_CONTROL_VERSION_MISMATCH");
    if (control.change !== actual.change) return fail("GOV_CHANGELOG_CONTROL_CHANGE_MISMATCH");
  }
  return { ok: true, issues: [] };
}
