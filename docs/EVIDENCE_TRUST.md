# Evidence Trust Model

AMC maturity scoring is evidence-derived. Agents cannot raise their own scores by self-reporting.

## Trust Tiers

- `SELF_REPORTED`: declared by the agent, the operator or an outside system; informational only.
- `ATTESTED`: signed by a third party whose key the operator pinned for `independent-attestation` in a signed trust list.
- `OBSERVED`: AMC-observed runtime/tool/gateway evidence.
- `OBSERVED_HARDENED`: observed evidence with stronger assurance context.

## Where tiers come from

Since 2.0.0 the tier comes from who produced the evidence (`src/claims/evidenceProvenance.ts`), not from a value the operator chooses. The producer is read from the event's `meta`:

| Producer | Identified by | Tier |
|---|---|---|
| synthetic | `meta.provenance: "dogfood"`, `meta.claimKind: "synthetic_example"` or `source: "dogfood-maturity"` | excluded: never counts for a level or a compliance result |
| import | `source` `eval_import`, `import`, `watch`, `attested_ingest`, `chatgpt`, `claude_console`, `gemini_ui`, `generic_json`, `generic_text` | `SELF_REPORTED`, or `ATTESTED` with a verified third-party attestation |
| manual | `source` `manual`, `operator`, `feedback.ingest` | `SELF_REPORTED`, or `ATTESTED` with a verified third-party attestation |
| external-report | `source: "webhook"` | `SELF_REPORTED`, or `ATTESTED` with a verified third-party attestation |
| amc-runtime | any other source | the tier AMC wrote; a missing or unknown tier reads `SELF_REPORTED` |

The ledger refuses a write that claims `OBSERVED` or `OBSERVED_HARDENED` for any producer but AMC's runtime, and a write that claims `ATTESTED` without an attestation record (`keyId`, `sigB64`, `digestSha256`). Readers (diagnostic gates, the compliance engine, `amc eval status`) re-check every row: an `ATTESTED` row counts only while its attestation verifies, and an imported row stored by 1.x as `ATTESTED` or `OBSERVED` now reads `SELF_REPORTED`. Stored rows are not rewritten, so scores in existing workspaces drop where they rested on imported or seeded evidence.

**`ATTESTED`.** `amc attest --ingest-session <id> --attested-by <identity> --statement <text>` records who vouched; on its own that is a self-attestation (`attestation.kind: "self_attested"`) and the rows stay `SELF_REPORTED`. Add `--attester-signature <file>`, a JSON `{ "keyId": "…", "sigB64": "…" }` holding a third party's Ed25519 signature over the bundle hash that `amc attest` prints, and the rows become `ATTESTED` only when that key is in a loaded signed trust list with purpose `independent-attestation`, is not distrusted or revoked, is inside its validity window, and the signature verifies. The workspace's own monitor and auditor keys never qualify, even if a trust list names them. `POST /api/v1/evidence/attest` takes the same `attesterSignature` field and reads trust lists only from the AMC home. A signature proves who signed a record and that it is unchanged, not that the content is true.

**Outcomes.** `amc outcomes attest`, Studio's operator `/outcomes/ingest` and `/feedback/ingest`, and their HMAC webhooks record `SELF_REPORTED` signals with `attestation.kind` `self_attested` (operator) or `external_report` (webhook), and return that tier.

**Eval imports.** `amc eval import` writes every event as `SELF_REPORTED` whatever the format; `--trust-tier` was removed in 2.0.0 and now exits 2. Each event is recorded at import time and keeps the case's own time as `meta.claimedTs`. An import is refused, naming the cases, when any case is timestamped more than 5 minutes ahead or more than 24 hours ago (proposed defaults, `EVAL_IMPORT_MAX_FUTURE_SKEW_MS` and `EVAL_IMPORT_MAX_AGE_MS`); `--historical` accepts it and marks its events `meta.historical: true`.

**Dogfood seeder.** `generateDogfoodMaturityEvidence` (used by `npm run qa:dogfood-8-agents`) is a development tool. It refuses unless `AMC_DEV_DOGFOOD=1` and it runs from a source checkout, not an installed package. Its events are `SELF_REPORTED` with `claimKind: "synthetic_example"`, so seeding never changes a level.

Claim kinds (`synthetic_example`, `self_reported`, `observed`, `independently_reviewed`) and the five status dimensions that every result will carry are defined in [CLAIM_KINDS.md](CLAIM_KINDS.md), with the mapping from each trust tier.

## Scoring Rules

- Only observed/attested evidence can elevate high-confidence maturity levels.
- Missing required evidence produces `UNKNOWN` outcomes with capped scores.
- If evidence quality/coverage is weak, AMC returns insufficient-evidence style outputs rather than inflated certainty.

`amc import` stores external artifacts as unverified, `SELF_REPORTED` content. It does not run a maturity evaluation: import summaries contain no question or layer scores, no observed or attested coverage, and no measured integrity or receipt correlation. Numeric zero fields in the legacy report envelope mean no accepted diagnostic evidence; `importProvenance.evaluationPerformed` is `false`. Artifact counts and source references describe what was imported, not evidence quality. Signing an import artifact preserves its integrity without verifying its source claims. Capture observed evidence or obtain a named attestation, then run a full AMC assessment before making maturity claims.

## Anti-Cheat Guarantees

- Agents cannot submit question-level scores directly (current implementation: 89-question bank).
- Auto-answering derives measured levels from ledger events, receipts, approvals, policy checks, assurance runs, and signed config state.
- All critical artifacts and state transitions are signed and auditable.

## Issuer keys

A signature shows who signed a record and that it is unchanged, not that the record is true, and a key shipped inside an artifact cannot vouch for that artifact. `agent-maturity-compass/trust` adds signed trust lists and an admission check that counts a signature only when the verifier operator pinned its key for that purpose. `evidence-authority` and `independent-attestation` are purposes there, and a workspace's own keys are never admitted for them.

Since P0-09 PR 2, `amc bundle verify`, `cert verify`, `cert verify-revocation`, `passport verify`, `assurance cert-verify` and `release verify` refuse an issuer key that is not pinned by `--pubkey` or a signed trust list, and print the key id to pin. `amc verify`, `verify all`, `evidence verify`, `session verify` and `agent-loop verify` fail an unanchored ledger: the monitor key is read from the workspace being verified, so without `--expect-monitor`, `AMC_EXPECTED_MONITOR_FINGERPRINT` or a trust list the check proves internal consistency only. `--allow-unpinned` and `--allow-unanchored` give an integrity-only result with exit code 2, never a trusted one. A monitor key that is distrusted, or revoked in a loaded trust list, fails every one of these checks even with `--allow-unanchored`, and `AMC_EXPECTED_MONITOR_FINGERPRINT` never anchors it, because distrust beats every pin. The workflow `amc ci init` writes pins the auditor key and monitor fingerprint from the repository variables `AMC_AUDITOR_PUBKEY` and `AMC_MONITOR_FINGERPRINT`, never from the `.amc/keys` files in the checkout; set them from the fingerprints recorded when the vault was created. Since PR 3 the same holds for `audit binder verify`, `bench verify`, `benchmark verify`, `backup verify`, `plugin verify`, `plugin registry verify`, `prompt pack verify` and `federate verify-bundle`, and for the imports and installs behind them (`benchmark ingest`, `federate import`, `plugin install`); `docs/security/verifier-inventory.md` lists the seven portable commands outside the issue table that are not wired yet. Trust tiers use issuer admission only for `ATTESTED` (see Where tiers come from). See `docs/TRUST_LIST.md`.
