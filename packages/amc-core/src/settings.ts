/**
 * Live settings: schema defaults → base layer → user layer, with provenance.
 *
 * The substrate later phases' "change it without a restart" behaviours assume —
 * a budget, a policy threshold or a redaction rule adjusted under a running
 * agent. Three properties make that safe rather than merely convenient:
 *
 *   Provenance. Every effective value reports which layer produced it. A
 *   setting that cannot say where it came from cannot be audited, and in a
 *   product that scores evidence provenance that is not a detail.
 *
 *   Optimistic concurrency. Writes carry the revision they were computed
 *   against and are rejected if the store moved underneath. Two operators
 *   editing the same workspace is the normal case, not the exception.
 *
 *   Secret redaction. Values whose schema marks them secret are never returned
 *   by a read; writes address them by path so an operator can set one without
 *   ever having read it. A settings dump is exactly the artifact that ends up
 *   pasted into an issue.
 */
import Schema from "@amc/schemastery";

/** Which layer an effective value came from. */
export type SettingsLayer = "schema" | "base" | "user";

export interface SettingValue<T = unknown> {
  value: T;
  /** The layer that produced this value. */
  source: SettingsLayer;
  /** True when the schema marks this path secret; `value` is then redacted. */
  secret: boolean;
}

export interface SettingsSnapshot {
  /** Monotonic; every accepted write increments it. */
  revision: number;
  values: Record<string, SettingValue>;
}

export interface SettingsWrite {
  /** Dotted path, e.g. "gateway.budgetUsd". */
  path: string;
  value: unknown;
  /**
   * Revision the caller computed this write against.
   *
   * Omitting it is allowed but unsafe: a blind write silently discards a
   * concurrent change. Callers that read-modify-write should always pass it.
   */
  expectedRevision?: number;
}

export class SettingsConflictError extends Error {
  constructor(readonly expected: number, readonly actual: number) {
    super(
      `settings changed underneath this write (expected revision ${expected}, store is at ${actual}). ` +
        `Re-read and re-apply.`
    );
    this.name = "SettingsConflictError";
  }
}

export class SettingsPathError extends Error {
  constructor(path: string, reason: string) {
    super(`invalid settings path "${path}": ${reason}`);
    this.name = "SettingsPathError";
  }
}

/** Marks a dotted path as secret; its value is redacted on read. */
export type SecretPaths = readonly string[];

const REDACTED = "«redacted»";

function readPath(source: unknown, path: string): unknown {
  let cursor: unknown = source;
  for (const segment of path.split(".")) {
    if (cursor === null || typeof cursor !== "object") return undefined;
    cursor = (cursor as Record<string, unknown>)[segment];
  }
  return cursor;
}

/** Returns a copy of `source` with `path` set, never mutating the input. */
function writePath(source: Record<string, unknown>, path: string, value: unknown): Record<string, unknown> {
  const segments = path.split(".");
  const out: Record<string, unknown> = { ...source };
  let cursor = out;
  for (let index = 0; index < segments.length - 1; index += 1) {
    const segment = segments[index]!;
    const existing = cursor[segment];
    const next = existing && typeof existing === "object" ? { ...(existing as Record<string, unknown>) } : {};
    cursor[segment] = next;
    cursor = next;
  }
  cursor[segments[segments.length - 1]!] = value;
  return out;
}

/** Every dotted leaf path in a plain object. */
function leafPaths(source: unknown, prefix = ""): string[] {
  if (source === null || typeof source !== "object" || Array.isArray(source)) {
    return prefix ? [prefix] : [];
  }
  const out: string[] = [];
  for (const [key, value] of Object.entries(source as Record<string, unknown>)) {
    out.push(...leafPaths(value, prefix ? `${prefix}.${key}` : key));
  }
  return out;
}

export interface SettingsStoreOptions {
  /** Schemastery schema; supplies defaults and validates writes. */
  schema: Schema;
  /** Layer beneath the user's, e.g. a profile or deployment default. */
  base?: Record<string, unknown>;
  /** The operator-editable layer. */
  user?: Record<string, unknown>;
  /** Dotted paths whose values are redacted on read. */
  secrets?: SecretPaths;
}

/**
 * In-memory settings store with layered resolution.
 *
 * Persistence is deliberately not here. The file format, its comment
 * preservation and its watcher belong with the config surface in P1.4; this
 * owns the resolution and concurrency semantics those will call into, so the
 * rules live in one place rather than being reimplemented per writer.
 */
export class SettingsStore {
  #revision = 0;
  #base: Record<string, unknown>;
  #user: Record<string, unknown>;
  readonly #schema: Schema;
  readonly #secrets: Set<string>;

  constructor(options: SettingsStoreOptions) {
    this.#schema = options.schema;
    this.#base = options.base ?? {};
    this.#user = options.user ?? {};
    this.#secrets = new Set(options.secrets ?? []);
  }

  get revision(): number {
    return this.#revision;
  }

  /** Schema defaults, as the lowest layer. */
  #defaults(): Record<string, unknown> {
    try {
      return (this.#schema(undefined) ?? {}) as Record<string, unknown>;
    } catch {
      // A schema with required fields cannot produce defaults alone; the base
      // and user layers supply them.
      return {};
    }
  }

  /**
   * Effective settings with per-value provenance.
   *
   * Secret values are redacted here rather than at the caller: a redaction the
   * caller has to remember is a redaction that eventually gets forgotten.
   */
  snapshot(): SettingsSnapshot {
    const defaults = this.#defaults();
    const layers: [SettingsLayer, Record<string, unknown>][] = [
      ["schema", defaults],
      ["base", this.#base],
      ["user", this.#user]
    ];

    const paths = new Set<string>();
    for (const [, layer] of layers) for (const path of leafPaths(layer)) paths.add(path);

    const values: Record<string, SettingValue> = {};
    for (const path of [...paths].sort()) {
      let resolved: SettingValue | undefined;
      for (const [source, layer] of layers) {
        const candidate = readPath(layer, path);
        if (candidate === undefined) continue;
        resolved = { value: candidate, source, secret: this.#secrets.has(path) };
      }
      if (!resolved) continue;
      values[path] = resolved.secret ? { ...resolved, value: REDACTED } : resolved;
    }

    return { revision: this.#revision, values };
  }

  /** The user layer as stored — secrets included. For persistence only. */
  userLayer(): Record<string, unknown> {
    return structuredClone(this.#user);
  }

  /**
   * Applies one path write to the user layer.
   *
   * Validates the whole resulting object against the schema, not just the leaf:
   * a setting can be individually valid and jointly wrong, and the schema is
   * where that relationship is expressed.
   */
  set(write: SettingsWrite): SettingsSnapshot {
    if (write.path.length === 0 || write.path.split(".").some((segment) => segment.length === 0)) {
      throw new SettingsPathError(write.path, "empty path segment");
    }
    if (write.expectedRevision !== undefined && write.expectedRevision !== this.#revision) {
      throw new SettingsConflictError(write.expectedRevision, this.#revision);
    }

    const candidate = writePath(this.#user, write.path, write.value);
    const merged = { ...this.#defaults(), ...this.#base, ...candidate };
    this.#schema(merged);

    this.#user = candidate;
    this.#revision += 1;
    return this.snapshot();
  }
}
