/**
 * A DSSE envelope, bare or in a key-based Sigstore bundle v0.3, and the in-toto Statement v1 with AMC's control-results
 * predicate v0.1 it carries (P1-27). Mirrors src/attest/statement.ts and src/attest/sigstoreBundle.ts.
 */
import { anyRecord, arr, isoTime, lit, nonEmpty, nullable, obj, oneOf, opt, sha256 } from "../schema.js";
import { controlDimensions } from "./evidence.js";

export const INTOTO_PAYLOAD_TYPE = "application/vnd.in-toto+json";
export const SIGSTORE_BUNDLE_V03 = "application/vnd.dev.sigstore.bundle.v0.3+json";
export const CONTROL_RESULTS_PREDICATE = "https://agentmaturity.co/attestations/control-results/v0.1";
export const ATTESTATION_NOTICE = "A signature proves who issued this statement and that it is unchanged, not that the statement is true or that the agent behaved well.";

/** One signature only: AMC writes one, and a verifier that admitted any one of several would let the others ride along. */
export const dsseEnvelope = obj({ payloadType: nonEmpty, payload: nonEmpty, signatures: arr(obj({ keyid: sha256, sig: nonEmpty }), { min: 1, max: 1 }) });

/** Key-based only: no log entries, no timestamps and a public-key hint; a keyless (certificate) bundle is not admitted here. */
export const sigstoreDsseBundle = obj({
  mediaType: lit(SIGSTORE_BUNDLE_V03, "UNSUPPORTED_VERSION"),
  // Protobuf JSON omits an empty repeated field or writes it as []; either way it must be empty.
  verificationMaterial: obj({ publicKey: obj({ hint: sha256 }), tlogEntries: opt(arr(anyRecord, { max: 0 })),
    timestampVerificationData: opt(obj({ rfc3161Timestamps: opt(arr(anyRecord, { max: 0 })) })) }),
  dsseEnvelope
});

export const intotoStatement = obj({
  _type: lit("https://in-toto.io/Statement/v1", "UNSUPPORTED_VERSION"),
  subject: arr(obj({ name: nonEmpty, digest: obj({ sha256 }) }), { min: 1 }),
  predicateType: lit(CONTROL_RESULTS_PREDICATE, "UNSUPPORTED_VERSION"),
  predicate: obj({
    claimKind: oneOf(["self_reported", "observed", "independently_reviewed"] as const),
    scope: obj({
      tenant: nullable(nonEmpty), deployment: nullable(nonEmpty), workspace: nonEmpty, agent: nonEmpty, snapshot: sha256,
      profile: nonEmpty, profileVersion: nullable(nonEmpty), window: obj({ start: isoTime, end: isoTime }),
      exclusions: arr(obj({ controlId: nonEmpty, rationale: nonEmpty }))
    }),
    controls: arr(obj({ controlId: nonEmpty, dimensions: controlDimensions }), { min: 1 }),
    evidence: arr(obj({ sha256, kind: nonEmpty })),
    verifierReport: nullable(obj({ sha256 })),
    issuedAt: isoTime,
    expiresAt: isoTime,
    notice: lit(ATTESTATION_NOTICE)
  })
});
export type IntotoStatement = ReturnType<typeof intotoStatement>;
