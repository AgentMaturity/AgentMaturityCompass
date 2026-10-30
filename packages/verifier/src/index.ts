/** @amc/verifier (working name): standalone, zero-dependency verification of AMC records against a pinned issuer. */
export { DIMENSIONS, KEY_PURPOSES, REASON_CODES, type Dimension, type DimensionStatus, type KeyPurpose, type ReasonCode } from "./codes.js";
export { exitCode, VERIFIER_NAME, VERIFIER_VERSION, type VerifierReport, type VerifierReport as VerifierReportV1 } from "./report.js";
export { verifyArtifact, type VerifyOptions } from "./verify.js";
export { admit, BUILT_IN_DISTRUST, trustContext, type Admission, type IssuerAdmission, type TrustContext } from "./trust.js";
export type { SignedTrustList, TrustList, TrustListEntry } from "./records/trustList.js";
export { attestationDigest } from "./kinds/attestation.js";
export { validateRecord, RECORD_KINDS, type RecordKind } from "./validate.js";
