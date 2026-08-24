/**
 * The failure vocabulary of the credentials seam.
 *
 * Every message in this file obeys one rule: it may name a *reference* and it
 * may name a *fix*, but it must never carry a credential value. Errors are the
 * likeliest place for a secret to escape, because they get logged, attached to
 * evidence events, printed to terminals and pasted into bug reports — all the
 * places a value must never reach.
 */
import type { CredentialRef } from "./credentialRef.js";
import { CREDENTIAL_SOURCE_PRECEDENCE, type CredentialSource, shadowsWrites } from "./credentialSources.js";

/**
 * Every code this seam can raise.
 *
 * The first four are contract failures — a caller passed something the model
 * forbids. The last two are store failures: the AMC-owned file exists but
 * cannot be trusted or cannot be read. They share the union, and therefore the
 * `code` discriminant, so a consumer catching `CredentialsError` gets one
 * switch rather than one per provider.
 */
export type CredentialsErrorCode =
  | "AMC_CREDENTIAL_REF_INVALID"
  | "AMC_CREDENTIAL_SHADOWED_WRITE"
  | "AMC_CREDENTIAL_VALUE_EMPTY"
  | "AMC_CREDENTIAL_LAYERS_DUPLICATED"
  | "AMC_CREDENTIAL_FILE_PERMISSIONS"
  | "AMC_CREDENTIAL_FILE_UNPARSABLE";

/**
 * Base for everything this seam throws.
 *
 * `code` is a constructor parameter rather than a subclass field so callers get
 * one stable discriminant without each subclass re-declaring a property the
 * base already owns.
 */
export class CredentialsError extends Error {
  readonly code: CredentialsErrorCode;

  constructor(code: CredentialsErrorCode, message: string) {
    super(message);
    this.name = "CredentialsError";
    this.code = code;
  }
}

/**
 * Thrown when a string is not a usable credential reference.
 *
 * The offending text is deliberately withheld. The single most likely way to
 * reach this error is passing a secret VALUE where a NAME belongs — the exact
 * mistake the branded ref exists to prevent — so echoing the input back would
 * turn the guard against the thing it guards. `nameLength` is reported because
 * it is what an operator needs to tell a typo from a paste, and a length alone
 * discloses nothing usable.
 */
export class InvalidCredentialRefError extends CredentialsError {
  readonly nameLength: number;

  constructor(nameLength: number, pattern: RegExp) {
    super(
      "AMC_CREDENTIAL_REF_INVALID",
      `not a valid credential reference (length ${nameLength}); a reference names an ` +
        `environment variable and must match ${pattern.source}. The text is withheld ` +
        `on purpose: a string that fails this rule is most often a secret value passed ` +
        `where a reference name belongs.`
    );
    this.name = "InvalidCredentialRefError";
    this.nameLength = nameLength;
  }
}

/**
 * Thrown when a write targets a ref the inherited process environment answers.
 *
 * Loud rather than silent because the alternative is worse than useless: the
 * write would land in the file layer, `resolve` would keep returning the
 * environment's value, and an operator would believe a key was rotated when
 * every subsequent request still carries the old one.
 */
export class ShadowedWriteError extends CredentialsError {
  readonly ref: CredentialRef;
  readonly shadowingSource: CredentialSource;

  constructor(ref: CredentialRef, shadowingSource: CredentialSource) {
    super(
      "AMC_CREDENTIAL_SHADOWED_WRITE",
      `cannot write credential ${ref}: it is supplied by the ${shadowingSource} layer, ` +
        `which takes precedence over every layer AMC can write. The write was refused ` +
        `rather than stored, because a stored copy would never be read. Fix: unset ` +
        `${ref} in the environment that launched amc, then retry.`
    );
    this.name = "ShadowedWriteError";
    this.ref = ref;
    this.shadowingSource = shadowingSource;
  }
}

/**
 * Thrown when a write would store a value that resolves as absent.
 *
 * The store is a strict reference→non-empty-string mapping. Accepting an empty
 * write would create an entry that `resolve` reports as unconfigured, so the
 * store and the resolver would disagree about what exists. `unset` is the
 * operation that means "no value".
 */
export class EmptyCredentialValueError extends CredentialsError {
  readonly ref: CredentialRef;

  constructor(ref: CredentialRef) {
    super(
      "AMC_CREDENTIAL_VALUE_EMPTY",
      `cannot set credential ${ref} to an empty or whitespace-only value: an empty ` +
        `value is indistinguishable from an absent one everywhere else in this seam. ` +
        `Use unset(${ref}) to remove it.`
    );
    this.name = "EmptyCredentialValueError";
    this.ref = ref;
  }
}

/**
 * Thrown when a resolution is handed the same layer twice.
 *
 * Precedence is only well-defined over distinct layers. Two entries claiming
 * `file` would make the answer depend on array order, which is precisely the
 * dependence {@link resolveCredentialLayers} exists to remove, so this is a
 * caller bug and is reported as one instead of being quietly de-duplicated.
 */
export class DuplicateCredentialLayerError extends CredentialsError {
  readonly duplicated: CredentialSource;

  constructor(duplicated: CredentialSource) {
    super(
      "AMC_CREDENTIAL_LAYERS_DUPLICATED",
      `credential layer ${duplicated} was supplied more than once; each of ` +
        `${CREDENTIAL_SOURCE_PRECEDENCE.join(", ")} may appear at most once.`
    );
    this.name = "DuplicateCredentialLayerError";
    this.duplicated = duplicated;
  }
}

/**
 * The shadowed-write gate.
 *
 * Deliberately a free function over a freshly observed source rather than a
 * method over a cached one: the inherited environment can change between the
 * moment a write is requested and the moment it reaches the front of the write
 * queue, so this must be evaluated again against a re-read source immediately
 * before the bytes are written, not once at the door.
 */
export function assertUnshadowedWrite(ref: CredentialRef, source: CredentialSource | null): void {
  if (shadowsWrites(source)) {
    throw new ShadowedWriteError(ref, source);
  }
}
