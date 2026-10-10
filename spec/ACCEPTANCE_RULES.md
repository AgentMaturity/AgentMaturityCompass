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

1. Split on `.` into exactly two parts; decode the payload; parse with this schema. AMC's own check
   (`parseReceipt`, used by `verifyReceipt`) does so since P1-03; a signed member the schema does not name is accepted
   and left out of the parsed payload.
2. Signature over the decoded payload bytes as received, never re-serialized.
3. Issuer admission: the monitor key, purpose `receipt`.
4. Binding: `event_hash` names the ledger row the receipt is for, and `body_sha256` the request or response body.
   A receipt proves the row was written; it says nothing about the work's outcome.

## receipt

One state of one execution. AMC emits it since P1-03, always with `kind: "action_state"`, as the receipt on a signed
`ACTION_STATE` audit row whose payload is the canonical `amc.action-receipt/v1` record; `body_sha256` is that record's
sha256 and `event_hash` names the row. Signed bytes are the canonical payload, as for `legacy-receipt`. Rules the
schema cannot express (docs/RECEIPTS.md):

- Every receipt of one execution has the same `executionId` and `idempotencyKey`.
- States follow `ALLOWED_TRANSITIONS` (`src/actions/receiptStates.ts`): `requested` → `authorized`, `denied` or
  `cancelled`; `authorized` → `started`, `denied` or `cancelled`; `started` → `completed` or `outcome_unknown` (never
  `cancelled` once dispatched); `outcome_unknown` → `completed` through reconciliation only. A receipt may repeat its
  predecessor's state only to mark the evidence incomplete. Any other order fails satisfaction.
- A `completed` or `cancelled` receipt that follows `outcome_unknown` for the same execution must carry
  `reconciliation`, whose `fromReceiptId` names the `outcome_unknown` receipt. So must a `completed` receipt that marks a
  `completed` execution's evidence complete again (P1-04); its `fromReceiptId` names the receipt it follows.
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
- `timestampAuthorities` (optional, P1-25): `anchorId`s are unique, and each `rootCertificatePem` is exactly one PEM
  X.509 certificate. A timestamp token counts only through a path to one of them (docs/TRUSTED_TIME.md).
- `transparencyLogs` (optional, P1-26): `logId`s are unique, and each `publicKeyPem` is an Ed25519 or ECDSA P-256,
  P-384 or P-521 SPKI key. A public log checkpoint counts only when a C2SP signed-note signature under that key, with
  `origin` as key name and first line, verifies (docs/PUBLIC_ANCHORING.md).

## verifier-report

What AMC's verify commands return with `--json` (docs/TRUST_LIST.md). `integrity`, `issuerAdmission`, `scope`,
`freshness`, `completeness` and `satisfaction` are separate results; the last four stay `not-evaluated` until P1-06,
except where a record's own section fills them (A4 project record).
`trusted` is AMC's summary (integrity and issuer admission pass and the ledger is not unanchored); a consumer must
read the separate results and not `trusted` alone. Status values are spelled `pass`, `fail` and `not-evaluated`
(hyphen). `overrides` lists any allow flag used; an override never makes a report trusted. The optional `time`
(P1-25) keeps `claimedAt` (what the artifact says) apart from `attested` (an RFC 3161 token that verified against a
pinned TSA anchor); `basis` is `claimed`, `attested-upper-bound` or `attested-window`, and `freshness` fails with
`BACKDATED_CLAIM` or `POSTDATED_CLAIM` when the claim lies outside the window widened by the token's accuracy and the
tolerance (5 minutes). The optional `anchoring.public` (P1-26) says whether the artifact's transparency checkpoint is
held by a public log the verifier pinned: `anchored` (with `backend` and `logIndex`), `not-anchored`, or `invalid`,
which is also an integrity error (docs/PUBLIC_ANCHORING.md).

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

## A4 project record

One A4 Forge project (docs/A4_FORGE.md) as the ledger stores it: the head row `a4_projects`, the transition chain
`a4_transitions`, the side tables the chain names (`a4_revisions`, `a4_gates`, `a4_decisions`, `a4_members`,
`a4_comments`, `a4_evidence_refs`, `a4_releases`, `a4_deployments`), each transition's audit row and every ledger row
a `ledger_event` ref names. It travels as an `a4-record` JSON export (`amc.a4-record/v1`: the rows column by column,
exactly as stored) or as the A4 slice of an `.amcbundle`, whose signed `manifest.json` lists each project with the head
it exported (`a4.projects[].headSeq`, `headDigest`) and `a4.containsSyntheticExamples`. `a4_requests` (idempotency)
and `a4_effects` (liveness) are bookkeeping no transition names and are never exported. Inside a workspace,
`verifyA4Chain` and `amc verify all` (check `a4-projects`) apply the integrity rules; `verifyA4Bundle`
(`src/a4/a4Verify.ts`) applies all of them to an export. Normative fixtures, each with its expected verdict:
`tests/fixtures/contracts/a4-record/` (moving to `spec/fixtures/v1/a4-record/` with P1-06).

Canonical form. Every digest below is sha256 over the UTF-8 bytes of the canonical form above: sorted keys with
integer-like keys first, ECMAScript number text, **not RFC 8785**. Every JSON column (`body_json`, `spec_json`,
`request_json`, `intent_json`, `decision_json`, `meta_json` and the rest) is stored as that exact text. Hash a column as
stored; never parse and re-serialize it first.

Trust. Keys carried in an export only locate a signer. The monitor key is admitted for `ledger-row` and the auditor key
for `artifact-seal` from a trust list the verifier pinned (on the CLI, `amc a4 verify --trust-list`, P1-65). An API or
MCP route uses the server operator's trust context only: `GET /api/v1/a4/projects/:id/verify` takes no query parameter
and no body, so `?trustList=` is 400 `QUERY_INVALID` and a body is 400. With no admitted key a report states integrity
only: issuer admission fails, the ledger is unanchored and scope, freshness, completeness and satisfaction are
`not-evaluated` (`ISSUER_NOT_ADMITTED`).

Integrity (`integrity: fail` with the code named):

1. Chain (`A4_CHAIN_INVALID`). Transitions are ordered by `seq` from 0 with no gap. `prev_digest` is `GENESIS` at seq 0
   and the previous transition's `body_digest` after it. `body_digest = sha256(body_json)`. The body states its own
   columns (`projectId`, `seq`, `kind`, `stage`, `revisionNo`, `actorKey`, `actorUsername`, `ts`, `prevDigest`,
   `readinessSha256`), `kind` is in the closed v1 set, and the head row equals the last transition (`head_seq`,
   `head_digest`, `verified_seq`, `verified_digest`, and the head columns equal the last body's `headAfter`). The head
   row itself is unsigned: a record proves a prefix. A tail cut back together with its head shows only against a later
   signed statement, such as the bundle manifest (`A4_SLICE_HEAD_MISMATCH`) or the workspace ledger.
2. Audit rows. Each `evidence_event_id` resolves to an `audit` row whose meta has `auditType: "A4_STATE"`,
   `source: "a4-store"`, `trustTier: "SELF_REPORTED"` and this transition's `projectId` and `seq`
   (`A4_AUDIT_ROW_UNBOUND`). Its `payload_sha256` equals `body_digest` and its inline payload, when present, is
   `body_json`. Its `event_hash` recomputes as in evidence-event rule 3 and its `writer_sig` verifies under a monitor
   key (`A4_EVIDENCE_ROW_INVALID`); its receipt binds `body_sha256 = body_digest` and that `event_hash`. An `A4_STATE`
   row claiming `OBSERVED` or `OBSERVED_HARDENED` is `TRUST_TIER_INFLATED`: the store never emits OBSERVED. A pruned
   inline payload (`payload_pruned = 1`) is `payload_pruned`, bound by digest: a warning, never a failure. In an
   `a4-record` each ledger row is checked on its own and its place in the workspace chain is not evaluated; a bundle's
   ledger prefix is verified whole.
3. Envelopes. `GATE_REQUESTED`, `GATE_DECIDED`, `RELEASE`, `DEPLOYMENT` and `ROLLBACK` carry an `A4_RECORD` envelope
   (`A4_ENVELOPE_MISSING`) whose `digestSha256` is `body_digest` and whose signature verifies under an auditor key
   (`A4_ENVELOPE_INVALID`). An envelope counts only within its key's validity window and while the key is absent from
   the distrust list; a key that is expired, revoked, distrusted or not yet valid is `KEY_ROTATED_OUT`, not evaluated,
   never valid.
4. Side rows, the completeness root (`A4_SIDE_ROW_MISMATCH`, `A4_SIDE_ROW_UNNAMED`). Each body's `sideRows` names
   `{ table, key, sha256 }` for every row its transition inserted. The named row exists, carries that transition's
   `evidence_event_id`, and `sha256 = sha256(canonical row without evidence_event_id)`; every side row recomputes from
   the transition body that names it. The set of side rows in each table equals the set the chain names, compared as
   key sets, never as counts. A missing or extra side row fails integrity and completeness both.
5. Gate policy (`A4_GATE_POLICY_MISMATCH`). `CREATED` and `GATE_POLICY_CHANGED` carry
   `gatePolicyDigest = sha256(canonical gatePolicy)`. The policy in force at a transition is the latest
   `GATE_POLICY_CHANGED` before it, else seq 0's `CREATED` (`gatePolicyDigestOf`); every gate's `gate_policy_digest`
   is the one in force at its `GATE_REQUESTED`.
6. Gate binding (`A4_GATE_BINDING_INVALID`). `binding_digest = approvalRequestBindingDigest(request_json)`: sha256 of
   the canonical request with `status` set to `"PENDING"` (`src/approvals/approvalChainStore.ts`).
7. Intent (`A4_INTENT_MISMATCH`). `intent_json` is canonical, `request.boundHashes.intentHash = sha256(intent_json)`,
   and every slot recomputes from the rows as they stood before the gate's `GATE_REQUESTED`: the bound revision's
   `spec_digest` (a `policy` gate: sha256 of the canonical `proposedGatePolicy` in its request body) and resource
   digests, the member set digest (sha256 of the canonical list of `{ key, roles }`, sorted by key, roles sorted, latest
   member event per principal, removed principals dropped), the evidence-ref digests of the revision
   (`sha256(canonical [refKind, refId, sha256])` in seq order), the policy digest in force, and the excluded keys (the
   requester, the revision's author unless a `policy` gate, and a `completion` gate's builders; sorted, unique). The
   readiness binding digest is the workspace's statement at request time, from live facts no export carries: it must
   be one value in the gate row, the intent and the `GATE_REQUESTED` body. The intent is recomputed only when every
   side row matched (rule 4).
8. Bound items (`A4_BOUND_ITEMS`). A gate's `bound_items_json` is exactly the set its readiness digest covers
   (`A4_BOUND_ITEMS[stage]` when it opened). It never holds a gate-derived item (`gate.direction`, `gate.completion`,
   `gate.required_reviews`, `approvals.fresh`, `sod`) or an environment fact (`signing.available`,
   `members.candidates`), so a first APPROVE never moves the digest a second approver binds: the second vote lands on
   the same `binding_digest` and `readiness_sha256` (fixture `second-vote-lands`). A bound item that is NOT_EVALUATED is
   still bound; decide is refused while a mandatory one is. An acknowledged item (`ACKNOWLEDGED`) is bound with its acknowledgement
   and stays WAITING; it is never cleared and lapses after 90 days.
9. Self-approval (`A4_SELF_APPROVAL_UNDERIVED`). A decision with `self_approved = 1` needs recorded facts with
   `selfApprovalAllowed: true` and `regulated: false`, on a chain not ratcheted before it. The ratchet
   (`ratchetedFromChain`): once any transition recorded two or more active principals (or an unreadable count), or any
   gate held two distinct approvers, the project never self-approves again.
10. Lanes and tiers (`A4_LANE_CLAIM_MISMATCH`, `TRUST_TIER_INFLATED`). The lane of an evidence ref is a function of
    its claim kind, the referenced row's tier and its method (`laneForClaimKind`): `observed` needs claim kind
    `observed`, an OBSERVED or OBSERVED_HARDENED tier and `runtime_observation` or `executed_test`; `verified` needs
    `independently_reviewed`; everything else is `recommendation` or `implementation`, self_reported or
    synthetic_example. A ledger_event ref's `trust_tier` equals the tier recomputed from the referenced row's meta
    through the reader contract (`effectiveTrustTier`); a stored tier above it is `TRUST_TIER_INFLATED`, a difference a
    trust-list change explains is the warning `TRUST_TIER_CHANGED`. A verified-lane ref is re-admitted at every read
    and downgraded (`A4_REF_DOWNGRADED`, a warning) when its issuer is not admitted now. AMC's own integrity verdicts
    are a section of the report, never a lane, a ref or a claim kind.
11. Effects and requests. Every `EFFECT_FINISHED` records a passing check for exactly the resource slots its gate's
    intent bound (`A4_EFFECT_SLOT_MISMATCH`); a workspace verify also refuses a stored request response that holds a
    credential (`A4_REQUEST_SECRET`).
12. Bundles. Every project with rows in a bundle's ledger is listed in its signed manifest (`A4_SLICE_UNLISTED`), and
    the head each listing names is the exported one (`A4_SLICE_HEAD_MISMATCH`).

Scope (`scope: fail`): every exported row names the project (`A4_SCOPE_FOREIGN_ROW`), the head row and the `CREATED`
body name one agent (`A4_SCOPE_AGENT`), and every row a `ledger_event` ref names is a row of that agent
(`A4_SCOPE_FOREIGN_AGENT`).

Freshness (`freshness: fail`): a decision whose `request_digest`, or whose record's `requestDigestSha256`, is not its
gate's `binding_digest`, or that carries none, is stale and counts for nothing (`DECISION_NOT_BOUND`; fixture
`stale-approval`). A gate is superseded by the first later transition in the published set (`A4_SUPERSEDING_KINDS`,
derivation `gateSupersededBy`): `REVISION`, `CHANGES_REQUESTED`, `REOPEN`, `GATE_POLICY_CHANGED`, `MEMBER`, `HOLD`
unless a later `RESUME` clears it, `EVIDENCE_REF` and `ACKNOWLEDGED` on the gate's own revision, `GATE_CONSUMED` for
that gate only, `RELEASE`, `TUNE` and `RETIRE`. A decision recorded after that transition counts for nothing toward
satisfaction.

Completeness (`completeness: fail`): every side row the chain names is present and unchanged (rule 4), and every
`ledger_event` ref resolves to a row in the export with the ref's digest (`REF_DANGLING`, `REF_DIGEST_MISMATCH`;
fixtures `dangling-evidence-ref`, `deleted-evidence-ref`). A file ref (stage output, artifact) is bound by its sha256;
its bytes are not part of an export (warning `FILE_REFS_BOUND_BY_DIGEST`). A comment row carries
`body_sha256 = sha256(salt || body)` with the 32-byte salt inside the ciphertext, and `blob_ref = sha256(ciphertext)`:
the body never leaves the encrypted blob store.

Satisfaction (`satisfaction`), evaluated only when integrity and completeness pass under admitted keys:

- A gate counts only decisions bound to it (freshness) and recorded before any superseding transition. A consumed gate
  met its request's `requiredApprovals` with distinct approvers (`QUORUM_NOT_MET`).
- Every counted APPROVE passes separation of duties as of its own seq (`SOD_VIOLATION`, `src/a4/a4SoD.ts`): never the
  gate's requester or an excluded key, never the revision's author (except on a `policy` gate, whose proposal the
  requester authored), and on a completion gate never a principal with a build transition on the revision (a `STEP` to
  `built` or an `EFFECT_STARTED`; fixture `builder-approved-own-revision`). A gate's counted decisions share one
  `auth_source` (`one_plane`).
- `not-evaluated` with `SINGLE_USER_WORKSPACE` when a decision has `self_approved = 1`, or the project was created in a
  single-user workspace and never ratcheted; with `SYNTHETIC_VALUES` when a gate binds a `synthetic_example` ref. Such
  refs are exported, retained and labelled (`containsSyntheticExamples: true`); `assertNotExample` stays on the
  attestation, certificate and signed-audit paths and never runs on an export.
- **Two local users are not evidence of two people.** Every LOCAL_USER key is minted under one workspace signing
  authority. A regulated quorum of LOCAL_USER keys only is `SOD_DEGRADED_SELF_PROVISIONED` (`not-evaluated`), and a
  user record whose `createdBy` is `null` is self-provisioned, never independently reviewed.
- Every gate decision is evaluated with `review.independent = false`: a pass means the counted decisions are bound,
  SoD-distinct and quorate, never that an independent reviewer approved. Each is `self_reported`.

The derived values a verifier recomputes rather than reads: the in-force gate-policy digest (rule 5), the ratchet and
`selfApprovalAllowed` (rule 9), the lanes and tiers (rule 10), and the readiness `bindingDigest` scope, which excludes
`evaluatedAt`, `allowed`, the gate-derived items and only the three unbound environment facts (vault lock on envelope
writes, read-only mode, presence).

## The `amc standard` artifacts and external evidence

`amcbench`, `amcprompt`, `amccert`, `amcaudit`, `amcpass`, `amcproof`, `registry.bench` and `registry.passport` are
generated from the zod schemas `amc standard validate` uses. Those schemas ignore unknown keys, so the published ones
do too. Shape validation is separate from artifact verification (`amc passport verify`, `amc bench verify` and the
other verify commands), which checks signatures, proof bindings and revocation. `external-evidence` keeps its
hand-written strict schema and its `$id`; its rules are in docs/EXTERNAL_EVIDENCE_PROFILE.md.
