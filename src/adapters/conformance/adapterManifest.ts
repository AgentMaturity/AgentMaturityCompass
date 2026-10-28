/**
 * Adapter claim manifests (P2-17, conformance class "adapter"): what AMC may claim for one harness, hook by hook, at the
 * harness versions it qualified. An adapter claims enforcement only at a manifest hook with role "enforce"; everything
 * else is observed or listed in `notCovered`.
 *
 * Manifests live in docs/adapters/manifests/<adapter>.json. Each enforce hook names the cases of its qualification
 * record that back it: a dot path into the record (an array step may select by field, `pi[version={version}]`) and the
 * value that path must hold for every qualified version (`{version}` is substituted in both). The record must be hashed
 * by the `receipt.json` of its qualification folder, so a hand edit of the record fails the check.
 *
 * `loadAdapterManifests` is the read API for consumers (scripts/gen-harness-matrix.mjs; A4's IntegrationClaim, P2-37,
 * is a projection of a checked manifest). It never throws on a bad manifest: it returns the problems, and a manifest
 * with problems supports no claim.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { z } from "zod";
import { sha256Hex } from "../../utils/hash.js";

const ADAPTER_MANIFEST_SCHEMA = "amc.adapter-claim-manifest/v1";
const MANIFEST_DIR = "docs/adapters/manifests";

const caseSchema = z.strictObject({ id: z.string().min(1), path: z.string().min(1), expect: z.union([z.string(), z.number(), z.boolean(), z.null()]) });

const hookSchema = z.strictObject({
  name: z.string().min(1),
  role: z.enum(["enforce", "observe"]),
  tools: z.array(z.string().min(1)),
  /** What the harness does when this hook cannot run or AMC cannot answer. */
  onFailure: z.enum(["blocks", "proceeds", "unknown"]),
  /** The document or code that states the hook's contract at the pinned version. */
  source: z.string().min(1),
  cases: z.array(caseSchema),
});

const adapterClaimManifestSchema = z.strictObject({
  schema: z.literal(ADAPTER_MANIFEST_SCHEMA),
  adapter: z.enum(["pi", "claude-code", "codex", "dsh"]),
  harness: z.strictObject({ package: z.string().min(1), versions: z.array(z.string().min(1)), commit: z.string().min(1).optional() }),
  hooks: z.array(hookSchema),
  notCovered: z.array(z.string().min(1)),
  /** Date of the qualification run; null when no version is qualified. */
  qualifiedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  /** Repository path of the qualification record; null when no version is qualified. */
  receipt: z.string().min(1).nullable(),
});

export type AdapterClaimManifest = z.infer<typeof adapterClaimManifestSchema>;

export interface CheckedAdapterManifest {
  file: string;
  manifest: AdapterClaimManifest | null;
  /** SHA-256 of the qualification record, when it was read. */
  receiptSha256: string | null;
  /** Empty when every claim in the manifest is backed. */
  problems: string[];
}

/** The value at a dot path; a step `name[key=value]` picks the element of array `name` whose `key` equals `value`. */
export function resolveRecordPath(record: unknown, path: string): unknown {
  let node: unknown = record;
  // Split on dots outside brackets: a selector value may hold dots (`pi[version=1.0.2]`).
  for (const step of path.match(/[^.[\]]+(?:\[[^\]]*\])?/g) ?? []) {
    const select = /^([^[\]]+)\[([^=\]]+)=([^\]]*)\]$/.exec(step);
    const key = select ? select[1]! : step;
    node = node !== null && typeof node === "object" ? (node as Record<string, unknown>)[key] : undefined;
    if (select) node = Array.isArray(node) ? node.find((item) => item !== null && typeof item === "object" && String((item as Record<string, unknown>)[select[2]!]) === select[3]) : undefined;
  }
  return node;
}

const withVersion = <T>(value: T, version: string): T => (typeof value === "string" ? (value.split("{version}").join(version) as T) : value);

/** Every reason the manifest claims more than its record supports; `record` is the parsed qualification record or null. */
export function checkAdapterManifest(manifest: AdapterClaimManifest, record: unknown): string[] {
  const problems: string[] = [];
  const enforced = manifest.hooks.filter((hook) => hook.role === "enforce");
  if (enforced.length > 0 && (manifest.harness.versions.length === 0 || manifest.receipt === null || manifest.qualifiedAt === null)) {
    problems.push(`${manifest.adapter}: an enforce hook needs qualified versions, a qualification date and a receipt`);
  }
  for (const hook of enforced) {
    if (hook.onFailure !== "blocks") problems.push(`${manifest.adapter} ${hook.name}: enforce needs onFailure "blocks", not "${hook.onFailure}"`);
    if (hook.cases.length === 0) problems.push(`${manifest.adapter} ${hook.name}: enforce has no conformance case in the receipt`);
  }
  for (const hook of manifest.hooks) {
    for (const item of hook.cases) {
      for (const version of manifest.harness.versions) {
        const actual = record === null ? undefined : resolveRecordPath(record, withVersion(item.path, version));
        if (actual !== withVersion(item.expect, version)) {
          problems.push(`${manifest.adapter} ${hook.name} ${item.id} at ${version}: ${withVersion(item.path, version)} is ${JSON.stringify(actual)}, expected ${JSON.stringify(withVersion(item.expect, version))}`);
        }
      }
    }
  }
  return problems;
}

/** The record's bytes, refused unless the `receipt.json` beside it lists it with the same SHA-256. */
function readHashedRecord(root: string, path: string): { bytes: Buffer; sha256: string } | string {
  const file = join(root, path);
  if (!existsSync(file)) return `receipt ${path} does not exist`;
  const bytes = readFileSync(file);
  const sha256 = sha256Hex(bytes);
  const folderReceipt = join(dirname(file), "receipt.json");
  if (!existsSync(folderReceipt)) return `receipt ${path} has no receipt.json beside it`;
  const artifacts = (JSON.parse(readFileSync(folderReceipt, "utf8")) as { artifacts?: Array<{ path?: string; sha256?: string }> }).artifacts ?? [];
  const listed = artifacts.find((artifact) => artifact.path === path.slice(dirname(path).length + 1));
  if (!listed) return `receipt ${path} is not listed in ${dirname(path)}/receipt.json`;
  if (listed.sha256 !== sha256) return `receipt ${path} has SHA-256 ${sha256}, but ${dirname(path)}/receipt.json lists ${listed.sha256}`;
  return { bytes, sha256 };
}

/** Parses one manifest file and checks it against its qualification record. */
export function loadAdapterManifest(root: string, file: string): CheckedAdapterManifest {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(join(root, file), "utf8"));
  } catch (error) {
    return { file, manifest: null, receiptSha256: null, problems: [`${file}: not JSON (${(error as Error).message})`] };
  }
  const parsed = adapterClaimManifestSchema.safeParse(raw);
  if (!parsed.success) {
    return { file, manifest: null, receiptSha256: null, problems: parsed.error.issues.map((issue) => `${file}: ${issue.path.join(".")} ${issue.message}`) };
  }
  const manifest = parsed.data;
  if (manifest.receipt === null) return { file, manifest, receiptSha256: null, problems: checkAdapterManifest(manifest, null) };
  const record = readHashedRecord(root, manifest.receipt);
  if (typeof record === "string") return { file, manifest, receiptSha256: null, problems: [record, ...checkAdapterManifest(manifest, null)] };
  return { file, manifest, receiptSha256: record.sha256, problems: checkAdapterManifest(manifest, JSON.parse(record.bytes.toString("utf8"))) };
}

/** Every manifest under `<root>/docs/adapters/manifests`, sorted by file name. */
export function loadAdapterManifests(root: string): CheckedAdapterManifest[] {
  const dir = join(root, MANIFEST_DIR);
  return readdirSync(dir).filter((name) => name.endsWith(".json")).sort().map((name) => loadAdapterManifest(root, `${MANIFEST_DIR}/${name}`));
}
