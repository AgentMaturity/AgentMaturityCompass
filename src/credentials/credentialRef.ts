/**
 * The credential *reference* — a name, never a value.
 *
 * AMC's gateway config already carries env-var names rather than secrets
 * (`{ type: "bearer_env", env: "OPENAI_API_KEY" }`). That is the right model,
 * but today it is a convention: the field is a `string`, so nothing stops a
 * future edit from putting the key itself there, and nothing stops a resolved
 * secret from being handed to a function that wanted the name.
 *
 * `CredentialRef` turns the convention into a type. A plain `string` is not
 * assignable to it, so "config carries references, never values" is checked by
 * the compiler on every build instead of by a reviewer on a good day.
 */
import { InvalidCredentialRefError } from "./credentialsErrors.js";

// Module-private brand. `declare const` means it exists only in the type
// system, and not exporting it means no other module can name the property,
// so `CredentialRef` cannot be produced anywhere but here.
declare const CREDENTIAL_REF_BRAND: unique symbol;

/**
 * A validated reference to a credential.
 *
 * Still a `string` at runtime — it is used as a map key, a YAML key and an
 * environment-variable name — but nominally distinct at compile time.
 */
export type CredentialRef = string & { readonly [CREDENTIAL_REF_BRAND]: "amc.credentials.ref" };

/**
 * The reference grammar: a POSIX environment-variable name.
 *
 * Not an arbitrary identifier, because the highest-precedence layer *is* the
 * process environment. A reference that could not be an environment variable
 * name could never be supplied — or shadowed — by that layer, which would make
 * the precedence model quietly untrue for it.
 */
export const CREDENTIAL_REF_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

type AssertFalse<T extends false> = T;

/**
 * Compile-time proof that the brand is load-bearing.
 *
 * If `CredentialRef` is ever weakened to a bare `string` — by deleting the
 * brand, or by widening it — this alias fails to typecheck. Without it the
 * brand could be removed in a refactor and every call site would keep compiling
 * with nothing to show that the guarantee had gone.
 */
type _RawStringIsNotACredentialRef = AssertFalse<string extends CredentialRef ? true : false>;

/** True when `name` satisfies the reference grammar. */
export function isCredentialRefName(name: string): boolean {
  return CREDENTIAL_REF_PATTERN.test(name);
}

/**
 * The sole constructor for a {@link CredentialRef}.
 *
 * Validating rather than casting is the point: this is also the boundary
 * validator for names arriving from config files, YAML keys and CLI arguments,
 * so those paths get the same grammar as code-literal references.
 *
 * Known limit, stated rather than implied: the grammar rejects the punctuation
 * in the common secret shapes (`sk-...`, base64, JWTs, anything with `-`, `.`,
 * `/`, `+` or `=`), but a pure-hexadecimal token is a legal environment
 * variable name and will pass. The brand, not this regex, is what keeps values
 * out of reference positions; the regex only catches the careless cases early.
 *
 * @throws {InvalidCredentialRefError} which never echoes `name`.
 */
export function credentialRef(name: string): CredentialRef {
  if (!isCredentialRefName(name)) {
    throw new InvalidCredentialRefError(name.length, CREDENTIAL_REF_PATTERN);
  }
  return name as CredentialRef;
}

/**
 * Widens a reference back to a plain string.
 *
 * Exists so callers that need the name as a string — an env lookup, a log line
 * naming what is missing — do not reach for `as string` and normalise casting
 * around this type.
 */
export function credentialRefName(ref: CredentialRef): string {
  return ref;
}
