/**
 * The empty-value-is-absent rule.
 *
 * One rule, one implementation. Every layer — process environment, the AMC
 * credentials file, a project `.env`, a user `.env` — can hand back a string
 * that is present but blank, and every one of them must mean the same thing by
 * it: *no credential is configured*. Restating the rule per layer is how a
 * codebase ends up with `!value` in one place, `value !== undefined` in another,
 * and a blank environment variable that shadows a real key in exactly one of
 * them.
 */
import type { CredentialRef } from "./credentialRef.js";
import { EmptyCredentialValueError } from "./credentialsErrors.js";

/**
 * Canonicalises a raw layer reading into a credential value, or `null` if the
 * layer does not actually configure one.
 *
 * Surrounding whitespace is stripped, not merely ignored for the presence test.
 * That is a deliberate choice with a cost: it means AMC does not transmit the
 * exact bytes the operator stored. It is taken because the realistic input is
 * `echo $KEY > .env` or a copy-paste, both of which append a newline, and the
 * two outcomes of keeping it are worse than the theoretical loss — a trailing
 * newline in an HTTP header value makes Node throw `ERR_INVALID_CHAR`, and a
 * stray space in a bearer token produces an opaque 401 that looks like a wrong
 * key. No provider issues a credential whose meaning depends on surrounding
 * whitespace. Because both reads and writes normalise through this function,
 * what the store holds is what a resolve returns.
 */
export function normalizeCredentialValue(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed.length === 0 ? null : trimmed;
}

/** The rule under its own name, for call sites that only need the verdict. */
export function isCredentialValuePresent(raw: string | null | undefined): boolean {
  return normalizeCredentialValue(raw) !== null;
}

/**
 * Gate for the write path: returns the value a `set` should store.
 *
 * The store is a strict reference→non-empty-string mapping, so an empty write
 * cannot be stored as an empty entry — that entry would resolve as absent, and
 * the store would then disagree with the resolver about whether the credential
 * exists. Refusing is louder and truer than writing something unreadable.
 *
 * @throws {EmptyCredentialValueError} which never echoes the value.
 */
export function assertSettableCredentialValue(ref: CredentialRef, value: string): string {
  const normalized = normalizeCredentialValue(value);
  if (normalized === null) {
    throw new EmptyCredentialValueError(ref);
  }
  return normalized;
}
