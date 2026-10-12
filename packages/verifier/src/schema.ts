/**
 * Hand-written strict validators (no schema library). Each check throws `Invalid` with the first problem: an unexpected
 * key is UNKNOWN_FIELD, a version (or type tag) the verifier does not support is UNSUPPORTED_VERSION, anything else
 * MALFORMED. They accept exactly what AMC's zod contracts accept; tests/verifier/parityWithAmc.test.ts holds them to it.
 */
export type ShapeCode = "MALFORMED" | "UNKNOWN_FIELD" | "UNSUPPORTED_VERSION";

export class Invalid extends Error {
  constructor(readonly code: ShapeCode, readonly path: string, reason: string) {
    super(`${path || "(root)"}: ${reason}`);
    this.name = "Invalid";
  }
}

export type Check<T> = (value: unknown, path: string) => T;
const OPTIONAL = Symbol("optional");
type Optional<T> = Check<T | undefined> & { [OPTIONAL]: true };
type Out<S> = { [K in keyof S]: S[K] extends Check<infer T> ? T : never };

export function invalid(path: string, reason: string, code: ShapeCode = "MALFORMED"): never {
  throw new Invalid(code, path, reason);
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

// zod's z.iso.datetime(): a real calendar date, hh:mm with optional seconds and fraction, and "Z".
const DATE = "(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))";
const ISO_DATETIME = new RegExp(`^${DATE}T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$`);

export function str(opts: { min?: number; max?: number; length?: number; regex?: RegExp; check?: (value: string) => boolean; what?: string } = {}): Check<string> {
  return (value, path) => {
    if (typeof value !== "string") return invalid(path, "expected a string");
    if (opts.min !== undefined && value.length < opts.min) invalid(path, `shorter than ${opts.min}`);
    if (opts.max !== undefined && value.length > opts.max) invalid(path, `longer than ${opts.max}`);
    if (opts.length !== undefined && value.length !== opts.length) invalid(path, `length is not ${opts.length}`);
    if (opts.regex && !opts.regex.test(value)) invalid(path, `does not match ${opts.what ?? opts.regex.source}`);
    if (opts.check && !opts.check(value)) invalid(path, opts.what ?? "invalid value");
    return value;
  };
}

export const text = str();
export const nonEmpty = str({ min: 1 });
export const sha256 = str({ regex: /^[0-9a-f]{64}$/, what: "64 lowercase hex" });
export const isoTime = str({ regex: ISO_DATETIME, what: "an RFC 3339 UTC time" });
/** One spelling per instant (P1-08 records): the toISOString form. */
export const isoTimeExact = str({ regex: ISO_DATETIME, check: value => new Date(value).toISOString() === value, what: "a time in toISOString form" });

export function lit<T extends string | number | boolean>(expected: T, code: ShapeCode = "MALFORMED"): Check<T> {
  return (value, path) => (value === expected ? expected : invalid(path, `expected ${JSON.stringify(expected)}`, code));
}

export function oneOf<T extends string>(values: readonly T[]): Check<T> {
  return (value, path) => (typeof value === "string" && (values as readonly string[]).includes(value) ? value as T : invalid(path, `expected one of ${values.join(", ")}`));
}

/** A safe integer (zod's `.int()`), optionally bounded. */
export function int(opts: { min?: number; max?: number } = {}): Check<number> {
  return (value, path) => {
    if (typeof value !== "number" || !Number.isSafeInteger(value)) return invalid(path, "expected a safe integer");
    if (opts.min !== undefined && value < opts.min) invalid(path, `below ${opts.min}`);
    if (opts.max !== undefined && value > opts.max) invalid(path, `above ${opts.max}`);
    return value;
  };
}

export const bool: Check<boolean> = (value, path) => (typeof value === "boolean" ? value : invalid(path, "expected a boolean"));
export const anyRecord: Check<Record<string, unknown>> = (value, path) => (isRecord(value) ? value : invalid(path, "expected an object"));

export function nullable<T>(check: Check<T>): Check<T | null> {
  return (value, path) => (value === null ? null : check(value, path));
}

export function opt<T>(check: Check<T>): Optional<T> {
  const wrapped = ((value: unknown, path: string) => check(value, path)) as Optional<T>;
  wrapped[OPTIONAL] = true;
  return wrapped;
}

export function refine<T>(check: Check<T>, ok: (value: T) => boolean, reason: string): Check<T> {
  return (value, path) => {
    const parsed = check(value, path);
    return ok(parsed) ? parsed : invalid(path, reason);
  };
}

export function arr<T>(item: Check<T>, opts: { min?: number; max?: number } = {}): Check<T[]> {
  return (value, path) => {
    if (!Array.isArray(value)) return invalid(path, "expected an array");
    if (opts.min !== undefined && value.length < opts.min) invalid(path, `fewer than ${opts.min} items`);
    if (opts.max !== undefined && value.length > opts.max) invalid(path, `more than ${opts.max} items`);
    return value.map((entry, index) => item(entry, `${path}[${index}]`));
  };
}

/** A strict object: every declared key (unless optional) present and valid, then no undeclared key. */
export function obj<S extends Record<string, Check<unknown>>>(shape: S): Check<Out<S>> {
  return (value, path) => {
    if (!isRecord(value)) return invalid(path, "expected an object");
    const out: Record<string, unknown> = {};
    for (const [key, check] of Object.entries(shape)) {
      const at = path ? `${path}.${key}` : key;
      if (!Object.hasOwn(value, key)) {
        if ((check as Partial<Optional<unknown>>)[OPTIONAL]) continue;
        invalid(at, "missing");
      }
      out[key] = check(value[key], at);
    }
    const extra = Object.keys(value).find(key => !Object.hasOwn(shape, key));
    if (extra !== undefined) invalid(path ? `${path}.${extra}` : extra, "unknown field", "UNKNOWN_FIELD");
    return out as Out<S>;
  };
}

/** zod's discriminatedUnion over strict objects: the discriminator picks the variant. */
export function union<V extends Record<string, Check<unknown>>>(key: string, variants: V): Check<ReturnType<V[keyof V]>> {
  return (value, path) => {
    const tag = isRecord(value) ? value[key] : undefined;
    const variant = typeof tag === "string" && Object.hasOwn(variants, tag) ? variants[tag] : undefined;
    if (!variant) return invalid(path ? `${path}.${key}` : key, `expected one of ${Object.keys(variants).join(", ")}`);
    return variant(value, path) as ReturnType<V[keyof V]>;
  };
}

/** Runs a check and returns the problem instead of throwing. */
export function attempt<T>(check: Check<T>, value: unknown): { ok: true; value: T } | { ok: false; error: Invalid } {
  try {
    return { ok: true, value: check(value, "") };
  } catch (error) {
    if (error instanceof Invalid) return { ok: false, error };
    throw error;
  }
}
