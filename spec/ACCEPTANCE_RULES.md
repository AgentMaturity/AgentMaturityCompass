# Acceptance rules for AMC records

Status: v1 draft (P1-01). This page says what a verifier checks for each record in `schemas/v1/`, in order, and what
result each failure gives. The Core Spec (P1-30) will cite it. Where a rule describes behaviour AMC does not have yet,
the rule says so and names the plan item that adds it.

## The checks, in order

A verifier runs these checks in this order and reports each one as its own result. It never merges them into one
verdict. A check whose input an earlier failure made untrustworthy is reported as not evaluated.

| # | Check | On failure |
| --- | --- | --- |
| 1 | **Strict parse** against the record's schema | `integrity: fail` (the record is not this record) |
| 2 | **Canonical form** of the bytes the record says were hashed or signed | `integrity: fail` |
| 3 | **Hash recomputation** from the stated pre-image | `integrity: fail` |
| 4 | **Signature** over exactly the stated bytes | `integrity: fail` |
| 5 | **Issuer admission**: the signing key is pinned for this purpose in a trust list the verifier pinned itself | `issuerAdmission: fail` with the key's status (`not-pinned`, `wrong-purpose`, `not-yet-valid`, `expired`, `revoked`, `distrusted`) |
| 6 | **Scope**: the record is about the deployment, subject and window being checked | `scope: fail` |
| 7 | **Freshness** at the verifier's `asOf` time | `freshness: fail` |
| 8 | **Completeness**: every record the claim depends on is present | `completeness: fail` |
| 9 | **Satisfaction**: the result the record states follows from its evidence under the rules below | `satisfaction: fail` |

Rules for every record:

- A signature proves who wrote a record and that it is unchanged, not that it is true.
- A key carried inside the record never vouches for the record. Keys are admitted only from a trust list the verifier
  pinned (docs/TRUST_LIST.md).
- Never strip, add or reorder fields of a signed record before verifying it. Parse a copy; verify the original bytes.
- Missing evidence means not evaluated, never pass. A result whose `claimKind` is `synthetic_example` never counts;
  a `self_reported` result never gives a positive regulated status (docs/CLAIM_KINDS.md).
- Unknown fields: a schema with `additionalProperties: false` refuses them because AMC refuses them. A schema without
  it (the `amc standard` artifacts, `legacy-receipt`, `signature-envelope`) describes a record AMC accepts with extra
  members; those members are not evidence of anything.

## Canonical form

`canonicalize(value)` (`src/utils/json.ts`) is `JSON.stringify` applied to a copy whose object keys were re-inserted in
`Array.prototype.sort()` order, recursively. Arrays keep their order. Two consequences a second implementation must
copy, because this is not RFC 8785 (JCS):

1. Keys are sorted by UTF-16 code units, but JavaScript then emits **integer-like keys first, in ascending numeric
   order** (`"9"` before `"10"`), whatever the sort said.
2. Numbers use ECMAScript number-to-string (`1.50` becomes `1.5`); strings use `JSON.stringify` escaping, so non-ASCII
   characters are written as themselves, in UTF-8.

Vector. Input (as a JavaScript value): `{ b: [2, { d: 1, c: "é" }], a: null, "10": true, "9": false, "B": 1.50 }`

```text
canonical: {"9":false,"10":true,"B":1.5,"a":null,"b":[2,{"c":"é","d":1}]}
sha256 of its UTF-8 bytes: be049feb25544cbaf5fead41ede37dfc528e19a0d49a90c2be2107769e333fa1
```

RFC for P1-30: adopt RFC 8785 for v2 records, or keep this form and specify it normatively with the integer-key rule.

## evidence-event

The row `amc evidence export --format json` writes, one per ledger event. AMC parses every row with this schema
before writing the export and refuses the whole export on the first violation:
`export refused: row <id> violates evidence-event v1: <path> <message>`.

1. Strict parse. `eventType` must be one of the published event types; an unknown type is refused.
2. Chain: in ledger order, each row's `prevEventHash` equals the previous row's `eventHash`; the first row's is
   `GENESIS`. With an agent filter (`agentFilter` not null) the export is a subset, so chain continuity is not
   evaluated from the export alone. `chainValid` and `chainExpectedPrevHash` are AMC's own reading, not evidence.
3. Hash recomputation. `eventHash = sha256(prevHash + canonicalMetadata + payloadSha256)` over UTF-8 text, where
   `canonicalMetadata` is the canonical form of
   `{ id, ts, session_id, runtime, event_type, payload_path, payload_inline, meta_json }`
   (`src/ledger/eventHash.ts`) and `meta_json` is the stored meta string with `receipt` and `receipt_sha256` removed,
   re-serialized with `JSON.stringify` in its stored key order (not canonical); unparseable meta is hashed as stored.
   The export does not carry `payload_path`, `payload_inline` or the stored meta string, so **a verifier holding only
   the export cannot recompute the hash: integrity of the hash is not evaluated** and needs the ledger (`amc verify`).
   `payload_path` is a local blob path, so the pre-image is not portable between machines either. RFC for P1-30 and
   P3-03: put a portable pre-image (payload digest, canonical meta) in the export and the hash.
4. Signature: `writerSignature` is base64 Ed25519 over the 32 bytes of `eventHash` (hex-decoded). `unsigned` means
   the workspace ran without signing: no issuer to admit, so issuer admission fails.
5. Issuer admission: the workspace monitor key, purpose `ledger-row`. The export does not carry the key.
6. Satisfaction: only rows whose `claimKind` is `observed` can support a positive result. `meta` is free-form producer
   metadata, the one extension point, and is never evidence by itself.

Vector (pre-image fields as stored; `prevHash` is `GENESIS`; payload is the inline text `hello`):

```text
meta_json stored:  {"trustTier":"OBSERVED","agentId":"agent-1","receipt":"dropped.before.hashing","receipt_sha256":"x"}
payloadSha256:     2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824
canonicalMetadata: {"event_type":"stdout","id":"evt-1","meta_json":"{\"trustTier\":\"OBSERVED\",\"agentId\":\"agent-1\"}","payload_inline":"hello","payload_path":null,"runtime":"amc","session_id":"session-1","ts":1767225600000}
eventHash:         7d81c2c4b940f5411fa454457be71c7d3e8ee15e086829ff3e5be415dd7b8ffe
```

## legacy-receipt

The receipt AMC mints today: `<base64url(payload bytes)>.<base64url(signature)>`, where the payload bytes are the
canonical form of the payload and the signature is Ed25519 over those bytes (not over a digest). `receiptSha256` is
sha256 of the whole receipt string.

1. Split on `.` into exactly two parts; decode the payload; strict parse. AMC's own check (`verifyReceipt`) today
   refuses only a malformed string, `v` other than 1, a missing `receipt_id`, `event_hash` or `body_sha256`, and a bad
   signature; the field types in the schema are the form AMC mints. P1-03 moves AMC's check onto this schema.
2. Signature over the decoded payload bytes as received, never re-serialized.
3. Issuer admission: the monitor key, purpose `receipt`.
4. Binding: `event_hash` names the ledger row the receipt is for, and `body_sha256` the request or response body.
   A receipt proves the row was written; it says nothing about the work's outcome.

## receipt

One state of one execution. Contract only: P1-03 emits it, signs it and fixes its signed bytes. Until then a verifier
reports a `v: 2` receipt's integrity as not evaluated. Rules the schema cannot express:

- Every receipt of one execution has the same `executionId` and `idempotencyKey`.
- States run `requested` → `authorized` or `denied` → `started` → `completed`, `cancelled` or `outcome_unknown`.
  Any other order fails satisfaction.
- A `completed` or `cancelled` receipt that follows `outcome_unknown` for the same execution must carry
  `reconciliation`, whose `fromReceiptId` names the `outcome_unknown` receipt.
- From `authorized` on, `authorizationRecordDigest` must equal the digest of the execution's authorization record.
- `enforcement.level: "enforced"` names the boundary that held; it is AMC's statement and is checked against the
  deployment's declared boundaries, never taken on trust.

## authorization-record

Contract only: P1-02 builds it at the enforcement point and defines its digest
(`sha256("AMC_AUTHZ_V1\0" + canonicalize(record))`, P1-02's specification). Rules the schema cannot express:

- `issuedAt` < `expiresAt`, and `expiresAt` is no later than any approval's `expiresAt`.
- Each approval's `actionClass` equals `action.actionClass`.
- `delegation.depth` is 0 exactly when `delegation.parentExecutionId` is null.
- `agentSuppliedMetadata` is what the agent said. It is untrusted and no rule may read it.
- Freshness: the record is valid only while `asOf` < `expiresAt`.

## control-result

Contract only: P1-11 emits it. The schema already refuses `pass` unless applicability is `applicable` and evidence is
`sufficient`. Rules the schema cannot express:

- A `pass` whose `claimKind` is `synthetic_example` fails satisfaction; a `pass` whose `claimKind` is `self_reported`
  gives no positive regulated status.
- Every entry in `evidenceRefs` resolves to a record the verifier holds; otherwise completeness fails.
- `exceptions` and `entitlement` never change the result. An expired exception (`expiresAt` ≤ `asOf`) covers nothing.

## claim-envelope

The envelope `evaluateClaimEligibility` returns (docs/CLAIM_KINDS.md); AMC parses with this schema. The claim kind is
one of `synthetic_example`, `self_reported`, `observed` or `independently_reviewed`; any other value, such as
`certified`, is refused. Rules the schema cannot express: a `SYNTHETIC_VALUES` reason means `result` is
`not_evaluated`; `independently_reviewed` requires an approved review by an independent reviewer whose key is pinned.

## scoped-attestation

A signed statement about one deployment snapshot, one profile and one window. Contract only: no AMC command emits it
yet; the registry (P3-04) issues it and the standalone verifier (P1-06) checks it. The schema's `signature` is the
reused signature envelope below. Proposed signed bytes, to be fixed by P1-06 before any attestation is issued: the
sha256 digest of the canonical form of the attestation without `signature`. Rules the schema cannot express:

- `window.start` < `window.end` ≤ `issuedAt` < `expiresAt`.
- `issuerKeyId` equals `signature.fingerprint` and is admitted for purpose `independent-attestation`. The workspace's
  own keys are never admitted for it.
- Scope: `deployment` and `snapshotDigest` match what the verifier is checking. Freshness: `asOf` < `expiresAt`.
- `controlResultsDigest` equals the digest of the control results the verifier holds; otherwise completeness fails.

## trust-list

The signed list every AMC verifier reads (docs/TRUST_LIST.md); AMC parses with this schema. Rules the schema cannot
express, all enforced by AMC (`src/trust/trustList.ts`):

- The file is at most 1 MiB and has no `__proto__` key.
- Each `publicKeyPem` is an Ed25519 SPKI key in canonical PEM form (Node's export, LF line endings), and `keyId` is
  sha256 of that PEM text. Note: this is the PEM text, not the DER key; see `signature-envelope`.
- `validTo` is after `validFrom`; `revokedAt` and `revocationReason` appear together; `evidence-authority` keys carry
  an `authority`; `purposes` and `keyId`s are unique.
- Signature: Ed25519 over `"AMC_TRUST_LIST_V1"` (ASCII), one `0x00` byte, then the canonical form of `list`, by a key
  whose `keyId` the verifier pinned as a trust-list root. The list is expired when `asOf` ≥ `list.expiresAt`.

## verifier-report

What AMC's verify commands return with `--json` (docs/TRUST_LIST.md). `integrity`, `issuerAdmission`, `scope`,
`freshness`, `completeness` and `satisfaction` are separate results; the last four stay `not-evaluated` until P1-06.
`trusted` is AMC's summary (integrity and issuer admission pass and the ledger is not unanchored); a consumer must
read the separate results and not `trusted` alone. Status values are spelled `pass`, `fail` and `not-evaluated`
(hyphen). `overrides` lists any allow flag used; an override never makes a report trusted.

## signature-envelope

The Ed25519 envelope AMC artifacts carry. AMC parses it without refusing unknown members, so the schema does not
refuse them; they are not signed and are not evidence.

1. `pubkeyB64` is base64 of the PEM text; `fingerprint` must equal sha256 of that decoded text **as carried**, not
   normalized. The same key in another PEM encoding gets another fingerprint.
2. The signature (`sigB64`) is Ed25519 over the 32 bytes of the artifact's sha256 digest (hex-decoded). Which bytes
   are digested is defined by each artifact.
3. A `NOTARY` signer's `notaryFingerprint`, when present, equals `fingerprint`.
4. Issuer admission against a pinned key; the envelope's own key never vouches for it.

RFC for P1-30: one key-id rule for every record (today trust lists hash the canonical PEM and envelopes hash the PEM
as carried).

## control-record, pack-manifest and catalog-lock

The Regulated Control Catalog (P1-09). `loadCatalog` parses each YAML file with these schemas after refusing anchors,
aliases, explicit tags, floats and unquoted dates; `validateCatalog` adds the cross-file rules. Rules the schemas cannot
express, all listed in docs/catalog/CONTROL_RECORD.md:

- Binding kind and points agree; `executed_adversarial` tests need at least 25 attempts; a mandatory enforced control
  needs a test with a positive and a negative fixture; evidence binds `controlId` and one scope field.
- `reviewed` and `qualified` controls need verified, legally reviewed citations, an approved expert review and, for
  AI-drafted content, `provenance.approvedBy`. Evidence producers cap the levels a control may list.
- Citation URLs are https on the shared official host list; register ids exist and agree with `statusType`; a
  superseded instrument is cited only as historical.
- A lock verifies only against a rebuild from the same tree: every digest, source row and the register digest must
  match. A matching lock shows the content is unchanged, not that it is true.

## The `amc standard` artifacts and external evidence

`amcbench`, `amcprompt`, `amccert`, `amcaudit`, `amcpass`, `amcproof`, `registry.bench` and `registry.passport` are
generated from the zod schemas `amc standard validate` uses. Those schemas ignore unknown keys, so the published ones
do too. Shape validation is separate from artifact verification (`amc passport verify`, `amc bench verify` and the
other verify commands), which checks signatures, proof bindings and revocation. `external-evidence` keeps its
hand-written strict schema and its `$id`; its rules are in docs/EXTERNAL_EVIDENCE_PROFILE.md.
