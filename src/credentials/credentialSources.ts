/**
 * Where a credential came from, and what that implies about writing it.
 *
 * The layer vocabulary is the whole precedence model. It is stated once, here,
 * because the two rules that hang off it — "the inherited process environment
 * always wins" and "therefore the process environment is not writable" — are
 * the same rule seen from two sides, and a codebase that restates them
 * separately eventually disagrees with itself.
 */

/**
 * The four layers a credential can be answered from, highest precedence first.
 *
 *   env          the process environment AMC inherited. READ-ONLY: AMC did not
 *                put it there and cannot durably remove it, so it wins and
 *                cannot be written through.
 *   file         AMC's own credentials store in the AMC home. The writable one.
 *   project-env  the workspace `.env`, contributed by the repository.
 *   user-env     the operator's personal `.env`, contributed by the machine.
 */
export type CredentialSource = "env" | "file" | "project-env" | "user-env";

/**
 * Precedence, strongest first.
 *
 * Declared as data rather than as a chain of `if`s so the resolver can rank
 * layers instead of trusting the order it was handed them in. A caller that
 * assembles layers in the wrong order must not be able to change which one
 * answers.
 */
export const CREDENTIAL_SOURCE_PRECEDENCE = ["env", "file", "project-env", "user-env"] as const;

/**
 * The one layer AMC reads but never writes.
 *
 * A write "into" the process environment would apply to this process only and
 * would vanish on exit, while the operator's shell keeps supplying the old
 * value — a rotation that appears to succeed and silently does not. Rejecting
 * the write is the honest outcome.
 */
export const READ_ONLY_CREDENTIAL_SOURCE = "env" as const satisfies CredentialSource;

/** Runtime narrowing for values crossing a boundary (parsed config, IPC). */
export function isCredentialSource(value: unknown): value is CredentialSource {
  return (
    typeof value === "string" &&
    (CREDENTIAL_SOURCE_PRECEDENCE as readonly string[]).includes(value)
  );
}

/** Rank in the precedence order; lower wins. */
export function credentialSourceRank(source: CredentialSource): number {
  return CREDENTIAL_SOURCE_PRECEDENCE.indexOf(source);
}

/**
 * True when the layer currently answering for a ref also blocks writes to it.
 *
 * Only the inherited environment does. A value coming from `project-env` or
 * `user-env` does NOT block a write, because the file layer outranks both — the
 * write would take effect on the next resolve, which is what the operator asked
 * for.
 */
export function shadowsWrites(
  source: CredentialSource | null
): source is typeof READ_ONLY_CREDENTIAL_SOURCE {
  return source === READ_ONLY_CREDENTIAL_SOURCE;
}

/** The complement of {@link shadowsWrites}; unconfigured refs are writable. */
export function isWritableUnder(source: CredentialSource | null): boolean {
  return !shadowsWrites(source);
}

/**
 * Everything a UI may learn about a credential.
 *
 * There is deliberately no room in this shape for a value, and no index
 * signature through which one could travel. `configured` and `writable` are
 * derived from `source` by {@link describeCredential} rather than accepted from
 * a caller, so the three fields cannot contradict each other and the total
 * information content is two bits plus a four-way enum.
 */
export interface CredentialDescription {
  /** Whether some layer supplies a non-empty value. */
  readonly configured: boolean;
  /** The layer that answers, or null when nothing does. */
  readonly source: CredentialSource | null;
  /** Whether `set`/`unset` would be honoured rather than rejected. */
  readonly writable: boolean;
}

type AssertTrue<T extends true> = T;
type ExactKeys<Actual, Expected> = [Actual] extends [Expected]
  ? [Expected] extends [Actual]
    ? true
    : false
  : false;

/**
 * Compile-time seal on the description shape.
 *
 * Adding any field to `CredentialDescription` — `value`, `preview`, `raw`,
 * anything — turns `npm run typecheck` red. The point is that "describe() never
 * returns a value" stops being a promise a reviewer has to re-check on every
 * future edit and becomes something the build enforces.
 */
type _DescriptionFieldsAreClosed = AssertTrue<
  ExactKeys<keyof CredentialDescription, "configured" | "source" | "writable">
>;

/**
 * The only way to build a {@link CredentialDescription}.
 *
 * It takes the answering layer and nothing else. A caller holding a resolved
 * secret has no parameter to put it in, so a leak here is not a mistake someone
 * can make in a hurry — it requires editing this function and defeating the
 * compile-time seal above.
 */
export function describeCredential(source: CredentialSource | null): CredentialDescription {
  return Object.freeze({
    configured: source !== null,
    source,
    writable: isWritableUnder(source)
  });
}
