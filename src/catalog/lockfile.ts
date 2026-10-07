/**
 * Catalog lockfile (P1-09): pins the catalog, pack, control, source, register, producer and vocabulary digests.
 * No timestamps, so two builds of one tree give byte-identical `JSON.stringify(lock, null, 2)`. P1-10 embeds it in
 * every compiled plan. A lock is a digest record, not a signature: it shows the content is unchanged, not that it is true.
 */
import { z } from "zod";
import { REGULATORY_REGISTER } from "../compliance/regulatory/index.js";
import { amcVersion } from "../version.js";
import { catalogDigest, controlDigest, digestOf, packDigest, producersDigest } from "./digest.js";
import type { LoadedCatalog } from "./loader.js";

const digest = z.string().regex(/^sha256:[0-9a-f]{64}$/);
const text = z.string().min(1);

export const catalogLockSchema = z.strictObject({
  lockfileVersion: z.literal(1),
  generatedBy: z.strictObject({ tool: z.literal("agent-maturity-compass"), version: text }),
  catalog: z.strictObject({ id: text, version: text, digest }),
  packs: z.array(z.strictObject({ id: text, version: text, support: z.enum(["experimental", "reviewed", "qualified", "retired"]), digest })),
  controls: z.array(z.strictObject({ id: text, version: text, pack: text, digest })),
  sources: z.array(z.strictObject({
    controlId: text, citationKey: text, registerId: text.nullable(), url: text, edition: text,
    sha256: z.string().regex(/^[0-9a-f]{64}$/).nullable(), retrievedAt: z.iso.date().nullable()
  })),
  register: z.strictObject({ path: z.literal("src/compliance/regulatory/register.json"), schemaVersion: z.literal(1), digest }),
  producers: z.strictObject({ digest }),
  vocabulary: z.strictObject({ digest })
});
export type CatalogLockfile = z.infer<typeof catalogLockSchema>;

const byId = <T extends { id: string }>(a: T, b: T) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** Builds the lock of a catalog that loaded without errors; throws otherwise. Run validateCatalog first. */
export function buildCatalogLock(cat: LoadedCatalog): CatalogLockfile {
  const loadErrors = cat.issues.filter((i) => i.severity === "error");
  if (!cat.manifest || !cat.vocabulary || loadErrors.length) {
    throw new Error(`catalog at ${cat.root} did not load cleanly (${loadErrors.length} errors${loadErrors[0] ? `, first: ${loadErrors[0].file} ${loadErrors[0].message}` : ""})`);
  }
  const packOf = new Map([...cat.packs.values()].flatMap(({ manifest }) => manifest.controls.map((id): [string, string] => [id, manifest.id])));
  const controls = [...cat.controls.values()].sort(byId);
  return {
    lockfileVersion: 1,
    generatedBy: { tool: "agent-maturity-compass", version: amcVersion },
    catalog: { id: cat.manifest.id, version: cat.manifest.version, digest: catalogDigest(cat) },
    packs: [...cat.packs.values()].map(({ manifest }) => ({ id: manifest.id, version: manifest.version, support: manifest.support, digest: packDigest(cat, manifest) })).sort(byId),
    controls: controls.map((r) => ({ id: r.id, version: r.version, pack: packOf.get(r.id) ?? "", digest: controlDigest(r) })),
    sources: controls.flatMap((r) => r.citations.map((c) => ({
      controlId: r.id, citationKey: c.key, registerId: c.registerId, url: c.url, edition: c.edition,
      sha256: c.retrieval.state === "verified" ? c.retrieval.contentSha256 : null,
      retrievedAt: c.retrieval.state === "verified" ? c.retrieval.retrievedAt : null
    }))),
    register: { path: "src/compliance/regulatory/register.json", schemaVersion: 1, digest: digestOf(REGULATORY_REGISTER) },
    producers: { digest: producersDigest(cat) },
    vocabulary: { digest: digestOf(cat.vocabulary) }
  };
}

/** Every pinned value keyed by a stable path; array rows are keyed by id, not position. `generatedBy` is informational. */
function flatten(lock: CatalogLockfile): Map<string, string> {
  const out = new Map<string, string>([["lockfileVersion", String(lock.lockfileVersion)]]);
  const put = (prefix: string, row: object) => { for (const [k, v] of Object.entries(row)) out.set(`${prefix}.${k}`, v === null ? "null" : String(v)); };
  for (const key of ["catalog", "register", "producers", "vocabulary"] as const) put(key, lock[key]);
  for (const p of lock.packs) put(`packs[${p.id}]`, p);
  for (const c of lock.controls) put(`controls[${c.id}]`, c);
  for (const s of lock.sources) put(`sources[${s.controlId}/${s.citationKey}]`, s);
  return out;
}

/** Compares a stored lock with a fresh build of `cat`; each mismatch names the exact path. */
export function verifyCatalogLock(lock: unknown, cat: LoadedCatalog): { ok: boolean; mismatches: Array<{ path: string; expected: string; actual: string }> } {
  const parsed = catalogLockSchema.safeParse(lock);
  if (!parsed.success) {
    return { ok: false, mismatches: parsed.error.issues.map((i) => ({ path: i.path.map(String).join(".") || "(lockfile)", expected: "a valid catalog lockfile", actual: i.message })) };
  }
  const expected = flatten(parsed.data);
  const actual = flatten(buildCatalogLock(cat));
  const mismatches = [...new Set([...expected.keys(), ...actual.keys()])].sort()
    .filter((path) => expected.get(path) !== actual.get(path))
    .map((path) => ({ path, expected: expected.get(path) ?? "(absent)", actual: actual.get(path) ?? "(absent)" }));
  return { ok: mismatches.length === 0, mismatches };
}
