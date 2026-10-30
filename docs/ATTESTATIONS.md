# In-toto attestations

AMC can issue a run's result as an in-toto Statement v1. The statement is wrapped in a DSSE envelope, signed and carried in a Sigstore bundle. It binds the result to the agent's AIBOM ([AIBOM.md](AIBOM.md)) and to the run report by their SHA-256 digests. Standard tooling can check it: `amc-verify` with a pinned trust list, or Sigstore's verifier with the public key.

**What an attestation proves.** A valid signature proves which key signed the statement and that neither the statement nor the bytes it names changed since. It does not prove that the statement is true, that the agent behaved well, or that the AIBOM is complete. The predicate says so in its `notice` field. A statement signed with a workspace key is a local audit trail. It becomes portable evidence only when a verifier pins that key in a trust list it trusts ([TRUST_LIST.md](TRUST_LIST.md)).

## Producing one

```bash
amc bundle export --run <runId> --out run.amcbundle --attest
```

`--attest` adds two files to the bundle before its manifest is signed, so the manifest lists both:

- `attestations/aibom.cdx.json`: the agent's AIBOM.
- `attestations/control-results.sigstore.json`: the signed statement in a Sigstore bundle.

Without `--attest`, `amc bundle export` is unchanged.

The statement's subjects are `attestations/aibom.cdx.json` and `run.json` in the bundle. Its claim is taken from those same `run.json` bytes: the run's seal-checked claim envelope, which a run whose seal fails cannot raise. The ledger slice (`evidence/evidence.sqlite`) is cited by digest as evidence.

## Claim kinds

- A result built on synthetic example evidence is never attested. `buildControlResultsStatement` refuses it with `SYNTHETIC_NOT_ATTESTABLE`, and `amc bundle export` already refuses example runs.
- The statement carries the weakest claim kind of the evidence it is built on: `observed` or `self_reported` for a workspace run.
- Only a key admitted for `independent-attestation` may state `independently_reviewed` (`INDEPENDENT_REVIEW_KEY_REQUIRED`). Workspace vaults never hold that key, so `amc bundle export` cannot produce it. `amc-verify` likewise admits an `independently_reviewed` statement only from an `independent-attestation` key.

## Formats

### Statement

```json
{
  "_type": "https://in-toto.io/Statement/v1",
  "subject": [
    { "name": "attestations/aibom.cdx.json", "digest": { "sha256": "<64 hex>" } },
    { "name": "run.json", "digest": { "sha256": "<64 hex>" } }
  ],
  "predicateType": "https://agentmaturity.co/attestations/control-results/v0.1",
  "predicate": {
    "claimKind": "self_reported",
    "scope": { "tenant": null, "deployment": null, "workspace": "default", "agent": "default", "snapshot": "<sha256 of run.json>",
      "profile": "<methodology id>", "profileVersion": "<methodology version>",
      "window": { "start": "<RFC 3339>", "end": "<RFC 3339>" }, "exclusions": [] },
    "controls": [{ "controlId": "amc.diagnostic", "dimensions": { "result": "not_evaluated", "applicability": { "state": "applicable" },
      "evidence": "untrusted", "enforcement": { "state": "none" }, "review": "pending" } }],
    "evidence": [{ "sha256": "<64 hex>", "kind": "ledger-slice" }],
    "verifierReport": null,
    "issuedAt": "<RFC 3339>", "expiresAt": "<issuedAt + 90 days>",
    "notice": "A signature proves who issued this statement and that it is unchanged, not that the statement is true or that the agent behaved well."
  }
}
```

- `controls`: the five status dimensions (P0-08). A `pass` needs applicable and sufficient evidence, as in the control-result contract. A diagnostic run yields one control, `amc.diagnostic`, whose dimensions are the run's claim envelope.
- `tenant` and `deployment` are `null` because AMC records neither for a workspace run. A verifier that expects them reports `SCOPE_MISMATCH`.
- `verifierReport` is `null`: no verifier report is attached yet.
- The predicate type is versioned `v0.1` until the Core Spec (P1-30) is accepted. A published version is never reused for another shape. `https://agentmaturity.co/attestations/verifier-report/v0.1` is reserved for a statement that wraps a verifier report, and is not emitted yet.

### DSSE envelope and Sigstore bundle

The DSSE v1.0 signature covers the pre-authentication encoding:

```
"DSSEv1" SP LEN(payloadType) SP payloadType SP LEN(payload) SP payload
```

Lengths are byte counts in ASCII decimal. `payloadType` is `application/vnd.in-toto+json`. The signature is Ed25519, made with the workspace's `artifact-seal` purpose key ([KEY_LIFECYCLE.md](KEY_LIFECYCLE.md)), and its `keyid` is the AMC key id: SHA-256 of the canonical SPKI PEM.

The Sigstore bundle is v0.3 (`application/vnd.dev.sigstore.bundle.v0.3+json`), key-based, in the JSON form `@sigstore/bundle` emits:

```json
{ "mediaType": "application/vnd.dev.sigstore.bundle.v0.3+json",
  "verificationMaterial": { "publicKey": { "hint": "<keyid>" }, "timestampVerificationData": {} },
  "dsseEnvelope": { "payload": "<base64 statement>", "payloadType": "application/vnd.in-toto+json",
    "signatures": [{ "sig": "<base64>", "keyid": "<64 hex>" }] } }
```

It has no transparency-log entry and no timestamp. Signing needs no network.

## Verifying

### With `amc-verify` (the standalone verifier)

```bash
amc-verify verify control-results.sigstore.json --trust-list <list.json> --trust-root <root key id> \
  --expect-subject <agent id> --evidence-dir <dir holding aibom.cdx.json, run.json and evidence.sqlite> --json
```

The trust list must pin the signing key for `artifact-seal`. A valid statement exits 3, not 0: integrity, issuer, scope, freshness and completeness pass, and satisfaction is `NOT_RECOMPUTABLE`, because a verifier cannot recompute the declared result from these bytes. A changed AIBOM matches no subject digest, so completeness fails (`EVIDENCE_MISSING`, exit 1). The rules are in [STANDALONE_VERIFIER.md](STANDALONE_VERIFIER.md), and the normative cases are `spec/fixtures/v1/dsse-*`.

### With Sigstore tooling

The bundle verifies offline with `@sigstore/verify` given the public key, with the log, certificate and timestamp thresholds set to 0. This was checked with the copies bundled in npm 11.10.1 (`qualification/2026-10-12-P1-27/sigstore-crosscheck.json`). Other Sigstore clients may require a transparency-log entry by default.

### With AMC

`amc bundle verify` checks the bundle's signed manifest, which lists both attestation files. In code, `envelopeFromSigstoreBundle`, `verifyDsse` and `subjectMismatches` (`src/attest/`) check the envelope and the subjects against keys and bytes you supply.

## Keyless signing (opt-in, not exercised)

`src/attest/sigstoreBundle.ts` has a keyless seam: `loadSigstoreKeyless` and `signStatementKeyless`, with a Fulcio signer, a Rekor witness and, when a TSA URL is given, a TSA witness. Keyless signing:

- needs network access and an ambient OIDC identity (in CI);
- publishes an entry in a public transparency log;
- returns a bundle that names its identity basis.

It also needs `@sigstore/sign` and `@sigstore/bundle`, which await dependency review, and without them it refuses. AMC's tests mock it and never contact Sigstore. `amc bundle export` does not offer it yet. Making it an operator choice on the CLI is a follow-up once the dependency is approved.

## Limits

- One control per run: AMC does not yet attest per-control results for a diagnostic run.
- The AIBOM reflects signed configuration, not runtime observation; see [AIBOM.md](AIBOM.md).
- The statement has no sequence number, so a verifier detects a superseded statement only by its expiry (90 days).
