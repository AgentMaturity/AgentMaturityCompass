/**
 * Catalog digests (P1-09): `"sha256:" + sha256Hex(canonicalize(value))` over parsed, normalized records, so
 * formatting-only YAML edits (key order, indentation, quoting, folding) change nothing. Fixtures are hashed as bytes.
 * canonicalize is sorted-key JSON.stringify, not RFC 8785; catalog content holds no floats so others can reproduce it.
 */
import { canonicalize } from "../utils/json.js";
import { sha256Hex } from "../utils/hash.js";
import type { LoadedCatalog } from "./loader.js";
import type { ControlRecord, PackManifest } from "./types.js";

export const digestOf = (value: unknown): string => `sha256:${sha256Hex(canonicalize(value))}`;

export function controlDigest(record: ControlRecord): string {
  return digestOf(record);
}

const byKey = <T>(key: (row: T) => string) => (a: T, b: T) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0);

/** Covers the manifest, each listed control's id, version and digest, and the bytes of those controls' fixtures. */
export function packDigest(cat: LoadedCatalog, manifest: PackManifest): string {
  const controls = manifest.controls.flatMap((id) => {
    const record = cat.controls.get(id);
    return record ? [{ id, version: record.version, digest: controlDigest(record) }] : [];
  }).sort(byKey((c) => c.id));
  const fixtures = [...cat.fixtures.entries()]
    .filter(([ref]) => manifest.controls.includes(ref.split("/")[0] as string))
    .map(([, f]) => ({ path: f.path, sha256: f.sha256 }))
    .sort(byKey((f) => f.path));
  return digestOf({ manifest, controls, fixtures });
}

/** Producer records sorted by id, so moving a record within producers.yaml changes nothing. */
export function producersDigest(cat: LoadedCatalog): string {
  return digestOf([...cat.producers].sort(byKey((p) => p.id)));
}

/** Covers the catalog manifest, every pack digest, and the producer and vocabulary digests. */
export function catalogDigest(cat: LoadedCatalog): string {
  const packs = [...cat.packs.values()]
    .map(({ manifest }) => ({ id: manifest.id, version: manifest.version, digest: packDigest(cat, manifest) }))
    .sort(byKey((p) => p.id));
  const profiles = cat.crossStationProfiles?.map((p) => ({ ...p, stations: [...p.stations].sort() })).sort(byKey((p) => p.id));
  return digestOf({ manifest: cat.manifest, packs, producers: producersDigest(cat), vocabulary: digestOf(cat.vocabulary),
    ...(profiles?.length ? { crossStationProfiles: profiles } : {}) });
}
