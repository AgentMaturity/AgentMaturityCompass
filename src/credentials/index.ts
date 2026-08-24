/**
 * The credentials seam — public surface.
 *
 * Consumers (the gateway's outbound auth, the assurance responder, and the LLM
 * adapters that arrive with P3.1) import from here. Providers implement
 * `CredentialsService` and reuse the rules in this directory rather than
 * restating them, so precedence, the empty-is-absent rule and the
 * never-a-value-in-describe rule have exactly one definition each.
 */
export {
  CREDENTIAL_REF_PATTERN,
  type CredentialRef,
  credentialRef,
  credentialRefName,
  isCredentialRefName
} from "./credentialRef.js";
export {
  CREDENTIAL_SOURCE_PRECEDENCE,
  READ_ONLY_CREDENTIAL_SOURCE,
  type CredentialDescription,
  type CredentialSource,
  credentialSourceRank,
  describeCredential,
  isCredentialSource,
  isWritableUnder,
  shadowsWrites
} from "./credentialSources.js";
export {
  assertSettableCredentialValue,
  isCredentialValuePresent,
  normalizeCredentialValue
} from "./credentialValue.js";
export {
  CREDENTIAL_LAYER_ORDER,
  type CredentialLayer,
  type CredentialResolution,
  describeCredentialLayers,
  resolveCredentialLayers
} from "./credentialResolution.js";
export {
  CredentialsError,
  type CredentialsErrorCode,
  DuplicateCredentialLayerError,
  EmptyCredentialValueError,
  InvalidCredentialRefError,
  ShadowedWriteError,
  assertUnshadowedWrite
} from "./credentialsErrors.js";
export type { CredentialsService } from "./credentialsService.js";

// ── The local layered store ──────────────────────────────────────────────
//
// The provider behind the seam: process env (read-only, wins) > the AMC-owned
// `.credentials.yaml` (writable, 0600, watched) > project `.env` > user `.env`.
export {
  type CredentialsUpdate,
  type CredentialsUpdateCause,
  type LocalCredentialsOptions,
  LocalCredentialsService
} from "./localCredentialsService.js";
export {
  AMC_HOME_ENV,
  CREDENTIALS_FILENAME,
  CREDENTIALS_PATH_ENV,
  type CredentialsPaths,
  type CredentialsPathsInput,
  resolveAmcHome,
  resolveCredentialsPaths
} from "./credentialsPaths.js";
// Only the two modes are re-exported from the permission module: they are what
// an operator-facing message quotes. The assertions themselves have exactly one
// caller (the snapshot loader) and stay internal, so there is no second way to
// decide whether a store is safe to read.
export { OWNER_ONLY_DIR_MODE, OWNER_ONLY_FILE_MODE } from "./credentialsFilePermissions.js";
export {
  type CredentialsFileParseReason,
  type CredentialsFilePosition,
  CredentialsFileParseError,
  CredentialsFilePermissionsError
} from "./credentialsStoreErrors.js";
