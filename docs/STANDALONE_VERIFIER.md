# Standalone verifier (`amc-verify`)

`amc-verify` checks AMC records without AMC: no workspace, no vault, no AMC home and no network. It reads the bytes of
one record plus trust that you supply (signed trust lists and the root keys you pinned) and reports six separate
results. It never trusts a key, authority or anchor that is named only inside the record it checks, and it has no flag
that admits an unpinned issuer.

A signed record proves who wrote it and that it is unchanged, not that its statement is true. `amc-verify` tells you
whether a pinned issuer signed the record, whether it is about what you are checking, whether it is current, whether the
evidence it depends on is present and consistent, and whether its declared result follows from that evidence under the
rules below. It does not re-run a control or check a claim against the world.

Status: the package is `agent-maturity-compass-verifier` in `packages/verifier` (unscoped, like the main package),
marked private. It is not published; publishing is Sid's. Interoperability is not claimed until an independently built verifier
(P3-03) passes the fixtures in `spec/fixtures/v1/`.

## Install and run

Node 20 or later. The package has no dependencies; its source imports only `node:` built-ins, its own modules and the
shared admission rule `src/trust/admissionRule.ts`, which it compiles in and which imports only `node:` built-ins
(`npm run check:architecture-boundaries` enforces both).

```bash
npm run build:verifier                         # tsc -p packages/verifier/tsconfig.json
cd packages/verifier && npm pack                                  # agent-maturity-compass-verifier-0.1.0.tgz
npm install --offline ./agent-maturity-compass-verifier-0.1.0.tgz # in any directory; nothing else is fetched
```

```bash
amc-verify verify attestation.json \
  --trust-list acme-trust-list.json --trust-root <root key sha256> \
  --as-of 2026-10-01T00:00:00Z \
  --expect-tenant tenant-a --expect-deployment payments-prod --expect-subject agent-payments --expect-profile finance-ops \
  --known-sequence agent-payments=7 \
  --evidence-dir ./evidence --json
```

| Flag | Meaning |
| --- | --- |
| `--trust-list <file>` | A signed trust list (docs/TRUST_LIST.md). Repeatable. At most 1 MiB. |
| `--trust-root <sha256>` | A pinned trust-list root key id. Repeatable. A list counts only with enough signatures by these roots. |
| `--root-threshold <n>` | How many distinct pinned roots must sign each trust list (default 1, at most the number of `--trust-root` keys). A list's own `rootThreshold` can raise it, never lower it. |
| `--as-of <RFC 3339>` | Every time comparison is made as of this instant. Default: now. |
| `--expect-tenant`, `--expect-deployment`, `--expect-subject`, `--expect-profile` | What the record must be about. A record without the field fails scope. |
| `--known-sequence <id>=<n>` | The highest sequence you already saw for an id (below). Repeatable. |
| `--evidence-dir <dir>` | Evidence files, addressed by the sha256 of their bytes; file names are ignored. Regular files only, at most 4,096 files of 64 MiB each and 256 MiB in all. |
| `--json` | Print the verifier report instead of the summary. |

Exit codes: **0** every dimension passes; **1** any dimension fails; **3** none fails but at least one is not
evaluated; **64** usage error (unreadable file, bad flag). A CI wrapper must not treat exit 3 as success: it means
something was not checked.

Library: `verifyArtifact(bytes, { trustLists, trustRoots, asOf, expectScope, knownSequences, evidence })` returns the
same report. It does no I/O. Bad options (a root that is not 64 hex, an invalid date) throw `TypeError`.

## Trust

1. You pin root key ids with `--trust-root` and the m-of-n with `--root-threshold`.
2. A supplied trust list counts only when every signature row on it verifies, at least `max(--root-threshold,
   rootThreshold)` distinct pinned roots that nothing distrusts signed it, it has not expired as of `--as-of`, and its
   sequence is not below `--known-sequence <listId>=<n>`. A root that any list signed by a pinned root distrusts counts
   towards no list. Of several lists with one `listId`, any below the highest supplied sequence is a rollback, and two
   different lists at one sequence are both refused; identical copies are one list. A list that fails contributes no
   entry, distrust or root key, and makes issuer admission fail (`TRUST_LIST_SIGNATURE_INVALID`, `TRUST_LIST_EXPIRED` or
   `ROLLBACK_DETECTED`), even if another list would admit the key. With several roots pinned and no `--root-threshold`,
   the report warns that one root's signature counts a list.
3. A key is admitted for a purpose only by an entry of a counted list, judged as of `--as-of`: distrust first (the
   package's built-in list, equal to AMC's `src/trust/amc-distrust.json`, plus every counted list's `distrust`, from its
   `distrustedFrom`), then a `key-compromise` revocation in any list, then the entry's purpose, validity window and any
   other revocation. A record that carries or names a key only tells the verifier which key to look up.
4. The time a record claims never decides admission. It is the record's own word, not a trusted timestamp, so a key
   revoked, distrusted or past its `validTo` as of `--as-of` is refused even for a record that claims an earlier
   signing time. To judge a record as of an earlier moment, set `--as-of`: the cut-off is the verifier's choice. The
   claimed time feeds freshness only (`timeBasis: "claimed"` until P1-25 adds attested time).
   This deviates from the P1-06 spec, which expected `revoked-superseded-earlier-claim` to pass with a warning; it is
   refused (`ISSUER_REVOKED`). Seam: once P1-25 adds RFC 3161 timestamps to these records, a signature that a token
   from a pinned TSA proves earlier than the revocation becomes a pass with a warning, by passing the attested time to
   the shared rule instead of `--as-of`.
5. P1-08 statements are verified as records; none is applied to admission. Only a counted trust list changes what is
   admitted.

AMC's own verifiers and `amc-verify` use one admission rule, `src/trust/admissionRule.ts` (distrust, validity window
and revocation at the verification time); the package compiles that file, which imports only Node built-ins. The one
difference: AMC's reports have no freshness result for it, so AMC refuses a claim after the verification time or before
`validFrom` as `not-yet-valid` in issuer admission, where `amc-verify` reports it under freshness
(`NOT_YET_VALID`, `CLAIMED_TIME_BEFORE_KEY_VALIDITY`). Both refuse the record.

## The six results

The report is AMC's `VerifierReportV1` (`spec/schemas/v1/verifier-report.schema.json`) with `verifier.name`
`amc-verify` and `reasonCodes`, the normative codes per dimension. They are evaluated in this order:

- **Integrity** runs first. If it fails, nothing else is read and the other five are `not-evaluated`. It is
  `not-evaluated` (and issuer admission fails) when a signature names a key no supplied list holds, so it cannot be
  checked.
- **Issuer admission** fails when any signature is not admitted or a list or anchor check fails. If it does not pass,
  scope, freshness and completeness are `not-evaluated`: the statement of an issuer you did not admit is not read.
- **Scope**, **freshness** and **completeness** are evaluated independently. Scope is `not-evaluated` when you gave
  no `--expect-*` flag and no evidence is foreign.
- **Satisfaction** is evaluated only when the other five pass. Empty or missing evidence never yields a pass.

| Dimension | Reason codes |
| --- | --- |
| integrity | `MALFORMED`, `UNKNOWN_FIELD`, `UNSUPPORTED_VERSION`, `DIGEST_MISMATCH`, `SIGNATURE_INVALID` |
| issuerAdmission | `ISSUER_NOT_PINNED`, `ISSUER_WRONG_PURPOSE`, `ISSUER_REVOKED`, `ISSUER_DISTRUSTED`, `KEY_NOT_YET_VALID`, `KEY_EXPIRED`, `TRUST_LIST_EXPIRED`, `TRUST_LIST_SIGNATURE_INVALID`, `UNANCHORED`, `ROLLBACK_DETECTED` |
| scope | `SCOPE_MISMATCH` (a field differs from `--expect-*`, or is absent), `FOREIGN_EVIDENCE` (evidence names another workspace or subject) |
| freshness | `ATTESTATION_EXPIRED`, `NOT_YET_VALID` (issued after `--as-of`), `REPLAYED_OR_SUPERSEDED` (sequence below the known one), `CLAIMED_TIME_BEFORE_KEY_VALIDITY` (backdated) |
| completeness | `EMPTY_EVIDENCE`, `EVIDENCE_MISSING`, `CONTRADICTORY_EVIDENCE`, `OUTCOME_UNKNOWN` |
| satisfaction | `CLAIMED_RESULT_FAILED`; `not-evaluated` with `NOT_RECOMPUTABLE` when a declared result cannot be recomputed |

Unknown fields, unsupported versions, unknown record types, repeated JSON keys, `__proto__` keys and invalid UTF-8 are
refused. Digests and key ids are compared in constant time.

## Record kinds (v1)

The kind is read from the record itself: an object with `type: "amc.scoped-attestation"`, `profile:
"amc.external-evidence"`, `list.type` or `statement.type`, an object with `dsseEnvelope` or `payloadType` (a DSSE
envelope, bare or in a Sigstore bundle), or a JSON string (a receipt token).

| Kind | Signed bytes and issuer | Scope | Freshness | Completeness | Satisfaction |
| --- | --- | --- | --- | --- | --- |
| Scoped attestation v2 (spec/schemas/v2/scoped-attestation; v1 is `UNSUPPORTED_VERSION`) | Ed25519 over sha256(`AMC_SCOPED_ATTESTATION_V2`, 0x00, canonical attestation without `signature`), by `issuerKeyId` admitted for `independent-attestation` | tenant `tenantId`, deployment `deployment.deploymentId`, subject `subjectId`, profile `profile.id`; evidence receipts must name `workspaceId` and `subjectId` | `issuedAt`, `expiresAt`, sequence per `subjectId` | the control results `controlResultsDigest` names, each control's cited receipts | below |
| State receipt (receipt v2 token, as a JSON string) | Ed25519 over the payload bytes, by a key admitted for `receipt`; anchored by its ledger row | subject `agentId` | `ts` | the body `body_sha256` names | `NOT_RECOMPUTABLE`: a receipt proves a row was written, not the outcome |
| External evidence profile v1 | docs/EXTERNAL_EVIDENCE_PROFILE.md; authority key admitted for `evidence-authority` within its entry's producers and capture methods | subject `session.id` | `normalization.ingestedAt` | events, original bytes (`source.originalSha256`), tool calls with results | the declared tier must not exceed what the admitted authority supports |
| Trust list | P0-09 bytes; the issuer is the pinned root set | none | `issuedAt` | the list itself | not evaluated |
| Key rotation (`amc.key-rotation`) | P1-08 bytes; authorized by the previous key as a counted list admits it for the purpose, or by pinned roots for `key-compromise` and a first key; `next` proves possession | none | `issuedAt` | first of its chain, or not evaluated | not evaluated |
| Root rotation (`amc.root-rotation`) | P1-08 bytes; `previousRoots` must be the pinned roots and sign `previousThreshold` times; the new set proves possession | none | `issuedAt` | first of its chain, or not evaluated | not evaluated |
| Revocation list (`amc.revocation-list`) | P1-08 bytes, by a key admitted for `revocation-list` | none | `issuedAt` | first of its chain, or not evaluated | not evaluated |
| DSSE in-toto statement (`dsse-intoto`, [ATTESTATIONS.md](ATTESTATIONS.md)) | Ed25519 over the DSSE v1.0 PAE of `application/vnd.in-toto+json` and the payload, by the key the trust lists hold for the signature's `keyid`, admitted for `artifact-seal` (`independent-attestation` when `claimKind` is `independently_reviewed`) | tenant `scope.tenant`, deployment `scope.deployment`, subject `scope.agent`, profile `scope.profile` | `issuedAt`, `expiresAt` | every subject digest and every `evidence` digest among the supplied bytes; no cited evidence is `EMPTY_EVIDENCE` | `CLAIMED_RESULT_FAILED` when a control declares `fail`, otherwise `NOT_RECOMPUTABLE` |

P1-08 records are accepted only in their one canonical byte encoding, and only the first record of a chain
(sequence 1) may name no predecessor (`MALFORMED` otherwise). A root rotation lowers the threshold when its new threshold
is below the higher of its stated and the pinned threshold, which needs `allowDecrease`. A rotation statement or revocation list never
changes a pin: the trust-list owner publishes a new list. The revocation list's `anchor` names a workspace
transparency entry and is not checked offline (a warning says so).

`--known-sequence` ids: an attestation's `subjectId`, a trust or revocation list's `listId`, a key rotation's
`<workspaceId>/<purpose>` and a root rotation's `rootSetId`. A lower sequence is `REPLAYED_OR_SUPERSEDED` for an
attestation and `ROLLBACK_DETECTED` for the P1-08 records.

### Scoped attestation evidence and satisfaction

`controlResultsDigest` is the sha256 of a JSON array of control results (spec/schemas/v1/control-result). Each control
result's `evidenceRefs` are sha256 digests of `amc.action-receipt/v1` records (the record a state receipt's
`body_sha256` names). Completeness fails when the array is absent (`EVIDENCE_MISSING`) or covers no control (controls
in `exclusions` are left out) or a control cites nothing (`EMPTY_EVIDENCE`), a cited item is absent or a receipt marks
its evidence incomplete (`EVIDENCE_MISSING`), receipts of one execution disagree on its terminal state or repeat a
sequence number, a control claims `independently_reviewed` without an `approved` review, or a control was evaluated
after the attestation was issued (`CONTRADICTORY_EVIDENCE`), or an execution's last receipt is not terminal
(`OUTCOME_UNKNOWN`). Malformed bound evidence is an integrity failure. Every excluded control is named, with its
rationale, in a warning.

The attestation's result is the conjunction of its control results. Satisfaction fails (`CLAIMED_RESULT_FAILED`) when a
control declares `fail`, or `pass` as `synthetic_example` or with a `rejected` or `expired` review. It is `not-evaluated` (`NOT_RECOMPUTABLE`) when a control
declares `not_evaluated`, passes only as `self_reported` (no positive status) or cites evidence of a kind v1 cannot read.
Otherwise it passes: every result is a pass by an observed or independently reviewed claim over evidence completeness
found present, settled and consistent. It does not re-run the controls.

### DSSE in-toto statements

The artifact is a key-based Sigstore bundle v0.3 (a public-key hint, no log entries, no timestamps, one DSSE signature
whose `keyid` equals the hint) or a bare DSSE envelope with one signature. A keyless bundle (certificate material) is
refused here; verify it with Sigstore tooling. A `payloadType` other than `application/vnd.in-toto+json` is
`UNSUPPORTED_VERSION`, as is a statement whose `_type` is not in-toto Statement v1 or whose `predicateType` is not
`https://agentmaturity.co/attestations/control-results/v0.1`. The `keyid` only selects among keys the supplied trust
lists hold: a key no list holds leaves integrity not evaluated and fails issuer admission (`ISSUER_NOT_PINNED`).

Supply the attested bytes with `--evidence-dir`: the AIBOM, the run report and the ledger slice the statement cites.
Evidence is addressed by digest, so a changed AIBOM matches no subject and completeness fails with `EVIDENCE_MISSING`.
The statement has no sequence number, so freshness is its expiry only. Satisfaction is never a pass: a declared result
cannot be recomputed from these bytes, so a valid statement exits 3.

### Receipt anchoring

A state receipt is anchored when the supplied evidence holds the exported ledger row (spec/schemas/v1/evidence-event)
whose `eventHash` is the receipt's `event_hash`, whose `payloadSha256` is its `body_sha256`, and whose
`writerSignature` (Ed25519 over the 32 bytes of `eventHash`) is by a key admitted for `ledger-row`. Otherwise issuer
admission fails with `UNANCHORED`: a ledger key the verifier did not pin proves internal consistency only. Only
`eventHash` is signed, and the export carries no pre-image to recompute it (spec/ACCEPTANCE_RULES.md, evidence-event
rule 3), so the row's other fields are unauthenticated; an anchored report says so in a warning. Legacy v1 receipts are
`UNSUPPORTED_VERSION`.

## Normative fixtures and conformance

`spec/fixtures/v1/` holds the normative cases (spec/fixtures/v1/README.md). A conforming verifier MUST produce the
dimension statuses and reason codes in each `expected.json`. Run any implementation against them:

```bash
node packages/verifier/conformance/run.mjs --cmd "node packages/verifier/bin/amc-verify.mjs"
npm run test:verifier-conformance   # the same, writing tmp/conformance-results.json
```

The runner writes `conformance-results.json` (`suite`, `version`, `implementation`, `ranAt`, `passed`, `failed`, and
per case `result` and `diff`). The CI job `verifier-conformance` is set up to install the packed package with no other
dependency and run it against the fixtures on Node 20, 22 and 24.

The conformance suite (P1-32, [CONFORMANCE_SUITE.md](CONFORMANCE_SUITE.md)) runs the same fixtures as its `verifier`
class through any command template and writes a `conformance-results` v1 record; the same CI job runs it too. This
fixture runner stays in the verifier's package for its own packed-tarball check.

## Limits

- `.amcbundle` archives carry a SQLite ledger, which a zero-dependency verifier cannot read on Node 20; verify them with
  `amc bundle verify` (P0-09). `amc-verify` refuses them as malformed rather than read part of them.
- Not yet: keyless Sigstore bundles and transparency-log entries (P1-27 verifies key-based DSSE bundles only), RFC 3161 timestamp tokens (P1-25; a trust list's
  `timestampAuthorities` are validated but unused), Merkle inclusion proofs and public-log receipts (P1-26),
  the producer, adapter and compiler conformance classes, which `packages/amc-conformance` runs (P1-32). A4 project records (`a4-record`) are checked by AMC's `verifyA4Bundle`.
- A chain predecessor (`previousSha256`, `previousStatementSha256`) is not fetched or checked; `--known-sequence` gives
  anti-rollback. The verifier keeps no state between runs: you supply the sequences you saw.
- Fixture keys are public by design. They are marked `TEST ONLY` and must never appear in a trust list outside the
  corpus.
