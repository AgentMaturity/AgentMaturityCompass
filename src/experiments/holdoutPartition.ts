import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";

const HOLDOUT_PARTITION_METHOD = "seeded-stratified-v1" as const;
const DEFAULT_HOLDOUT_SEED = "42";
const DEFAULT_VALIDATION_FRACTION = 0.5;

interface HoldoutStratum {
  /** The domain the cases share (a Fixer failure class). */
  stratum: string;
  searchIds: string[];
  /** Held-out cases of the same stratum; empty when the stratum has fewer than two cases. */
  validationIds: string[];
}

/** A search/validation split of one case population, drawn per stratum. The digest covers every other field. */
export interface HoldoutPartition {
  method: typeof HOLDOUT_PARTITION_METHOD;
  seed: string;
  validationFraction: number;
  strata: HoldoutStratum[];
  digest: string;
}

const sortedIds = (ids: Iterable<string>): string[] => [...ids].sort((a, b) => a.localeCompare(b));

function partitionDigest(partition: Omit<HoldoutPartition, "digest">): string {
  return sha256Hex(canonicalize({ method: partition.method, seed: partition.seed, validationFraction: partition.validationFraction, strata: partition.strata }));
}

/**
 * Split each stratum by a seeded hash order: at least one case of a stratum with two or more cases is held out, and at
 * least one stays in search. The same population, seed and fraction always yield the same digest.
 */
export function buildHoldoutPartition(input: {
  population: ReadonlyArray<{ id: string; stratum: string }>;
  seed?: string;
  validationFraction?: number;
}): HoldoutPartition {
  const seed = input.seed ?? DEFAULT_HOLDOUT_SEED;
  const validationFraction = input.validationFraction ?? DEFAULT_VALIDATION_FRACTION;
  if (seed.trim().length === 0) throw new Error("The holdout partition seed is empty.");
  if (!(validationFraction > 0 && validationFraction < 1)) throw new Error("The holdout validation fraction must lie strictly between 0 and 1.");
  const byStratum = new Map<string, string[]>();
  const seen = new Set<string>();
  for (const row of input.population) {
    if (row.id.trim().length === 0 || row.stratum.trim().length === 0) throw new Error("A partition case has an empty ID or stratum.");
    if (seen.has(row.id)) throw new Error(`Duplicate case ID in the partition population: ${row.id}`);
    seen.add(row.id);
    byStratum.set(row.stratum, [...(byStratum.get(row.stratum) ?? []), row.id]);
  }
  const strata = sortedIds(byStratum.keys()).map((stratum) => {
    const order = sortedIds(byStratum.get(stratum)!)
      .map((id) => ({ id, key: sha256Hex(`${HOLDOUT_PARTITION_METHOD}\0${seed}\0${stratum}\0${id}`) }))
      .sort((a, b) => a.key.localeCompare(b.key) || a.id.localeCompare(b.id))
      .map((row) => row.id);
    const held = order.length < 2 ? 0 : Math.min(order.length - 1, Math.max(1, Math.floor(order.length * validationFraction)));
    return { stratum, searchIds: sortedIds(order.slice(held)), validationIds: sortedIds(order.slice(0, held)) };
  });
  const body = { method: HOLDOUT_PARTITION_METHOD, seed, validationFraction, strata };
  return { ...body, digest: partitionDigest(body) };
}

/** Problems with a stored partition: digest, duplicate or overlapping IDs, and (when given) exact population membership. */
export function holdoutPartitionProblems(partition: HoldoutPartition, populationIds?: readonly string[]): string[] {
  const problems: string[] = [];
  if (partition.method !== HOLDOUT_PARTITION_METHOD) problems.push(`unknown partition method ${String(partition.method)}`);
  if (!Array.isArray(partition.strata)) return [...problems, "partition has no strata"];
  if (partitionDigest(partition) !== partition.digest) problems.push("partition digest does not match its contents");
  const all = partition.strata.flatMap((row) => [...row.searchIds, ...row.validationIds]);
  const duplicates = sortedIds(new Set(all.filter((id, index) => all.indexOf(id) !== index)));
  if (duplicates.length > 0) problems.push(`partition repeats or overlaps case(s): ${duplicates.join(", ")}`);
  if (populationIds) {
    const members = new Set(all);
    const missing = populationIds.filter((id) => !members.has(id));
    const extra = all.filter((id) => !populationIds.includes(id));
    if (missing.length > 0 || extra.length > 0) problems.push("partition membership does not match the case population");
  }
  return problems;
}
