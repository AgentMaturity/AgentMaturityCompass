# Catalog content governance

> **Draft, awaiting Sid's approval (P1-34).** The roles, cadence and rules below are proposals until Sid approves this
> document and confirms the cadence. The people come from decision D-08, which has not named any expert yet, so no
> review record exists and every catalog record is `experimental`. Nothing in this document or the code behind it
> promotes content.

AI agents wrote and refuted most of AMC's regulatory content, and some of the law it cites changes monthly. This
document sets the rules that keep the catalog honest at scale: named human reviewers, two-person review, dated currency
reviews, a public append-only changelog and a tracked list of facts to re-verify. The code in `src/catalog/governance/`
enforces what a machine can check; the people supply the judgement.

What a signed review proves is who approved what and when. It does not prove the content is right. Catalog output stays
evidence of conformity, never proof of compliance.

## Roles

| Role | Who | What they do |
|---|---|---|
| Author | Human or AI agent | Drafts a control, pack, crosswalk or citation. |
| Refuter | Human or AI agent | Argues against a draft: wrong law, wrong date, untestable statement. F5 was a refutation round. |
| Domain lead | Named human expert, credentialed for the station | Approves the substance for the domain (finance first, then health). |
| Legal reviewer | Named human with legal credentials | Approves citations: instrument, clause, edition, dates and status. |
| Risk owner | Named human | Accepts the residual risk the control leaves. |
| Second reviewer | Named human | The second independent pair of eyes. |

AI agents may draft and refute. They never approve: a review record's reviewer is a named human whose own key the
operator pinned for `catalog-review`, and a record declaring any other identity kind is refused.

## The two-person rule

`reviewed` support needs verified approvals from at least two distinct pinned reviewers, one of them credentialed for
one of the subject's domains (stations). A citation also needs an approval from a credentialed legal reviewer. Content an AI
drafted needs a human approval that names the draft in its `aiInputs` (kind `draft`, confirmed). Any verified objection
(`reject` or `request_changes`) blocks the quorum until it is resolved by new records. `meetsReviewQuorum(subject,
records, ctx)` encodes this; P1-33 calls it for admission criteria 2 and 9.

"Credentialed" means listed in the D-08 expert roster for that domain (or for `legal`), keyed by the reviewer's
trust-list subject. The roster is an input to the quorum check, not a field a record can declare. Until D-08 supplies
the experts, their pinned keys and the roster, no quorum can be met, so no control can compile as reviewed.

### Independence and conflicts of interest

A reviewer may not review a subject they authored or a change they made: the verifier refuses a record whose signing
reviewer (trust-list subject) or declared name matches the subject's authors (its git authors, names or emails). Every record
states `reviewer.credential` and `reviewer.conflictsDeclared`; both must be non-blank, and "none" is a declaration, not
a blank.

## Review records

A review record is a JSON file at `catalog/reviews/<subject-id>/<version>/<record-id>.json`. Records are governance
data, not catalog content: they never change a digest. The format (`reviewRecordSchema`, strict at every level):

| Field | Meaning |
|---|---|
| `recordVersion` | `1` |
| `id` | The record id, also its file name. |
| `subject` | `{ kind: control \| pack \| crosswalk \| citation, id, version, digest }`: exactly what was reviewed. |
| `role` | `domain_lead`, `legal_reviewer`, `risk_owner` or `second_reviewer`. |
| `reviewer` | `{ name, credential, affiliation, conflictsDeclared, identity: { userId, kind: "human" } }`. |
| `decision` | `approve`, `reject` or `request_changes`. |
| `scope` | What was checked: `statement`, `applicability`, `citations`, `tests`, `evidence`, `crosswalk`. |
| `aiInputs` | `[{ kind: draft \| refutation \| f5_verdict, ref, confirmed }]`: the AI material the reviewer relied on. |
| `notes` | Free text. |
| `decidedAt`, `nextReviewDue` | `YYYY-MM-DD`. `decidedAt` is the signing time the record claims. |
| `signature` | `{ publicKeyPem, value }`: Ed25519 over sha256 of `amc.catalog-review/v1`, a zero byte and the canonical record without `signature`. |

A record is a declaration until `verifyReviewRecord(record, ctx)` checks it against the operator's trust
(`loadTrustContext`, read with the server's clock). It is valid only when:

1. it parses (human identity, non-blank credential and conflicts);
2. its signature verifies under the key it names, and a signed trust list pins that key for `catalog-review` at the
   verification time (the operator's m-of-n root policy applies to the list). A `--pubkey` pin, workspace keys,
   `--allow-unpinned`, another purpose, a revoked or distrusted key, or a `decidedAt` after the verification time or
   before the key's validity admits nothing;
3. `reviewer.identity.userId` equals that trust-list entry's `subject`: the reviewer comes from the signature, never
   from a field;
4. the reviewer authored neither the subject nor the change;
5. every `f5_verdict` input marked confirmed has a row in `catalog/governance/f5-confirmations.yaml` naming this record.

Anything else is `unverified` (`GOV_REVIEW_SIGNATURE_INVALID`, `GOV_REVIEW_SIGNER_UNPINNED`,
`GOV_REVIEW_REVIEWER_UNKNOWN`, `GOV_REVIEW_SELF_REVIEW`, `GOV_REVIEW_F5_UNCONFIRMED`, `GOV_REVIEW_RECORD_INVALID`) and
moves nothing. A valid record whose subject digest has moved since is `expired`: any edit to the subject needs a new
review.

### How to record a decision

1. Sid adds each reviewer's public key to the operator's signed trust list for `catalog-review`, with the reviewer as
   its `subject`, and the reviewer to the D-08 roster with their domains. AMC never holds a reviewer's private key
   (`getSigningKey` refuses `catalog-review`).
2. Compute the subject's digest from the catalog lock (`amc catalog compile` writes `catalog.lock.json`; a control's
   digest is its `controls[]` row).
3. Each reviewer writes their record and signs it with their own key (`signReviewRecord`), never on someone else's
   behalf, and adds it under `catalog/reviews/`.
4. Append the changelog entry that names the records, and update the control's `review` block and `support` in the same
   change. CI checks the rest.

There is no review UI or signing command yet (P2-22).

## Currency reviews

Every reviewed control has a next review date (`nextReviewDue(subject, register)`), counted from its recorded
`review.reviewedAt`:

- **Monthly (30 days)** when any citation is a US state's (jurisdiction starting `US-`), is EU guidance (its S5 register
  entry is EU with `bindingForce: voluntary`; an EU citation with no register entry counts too, since nothing shows it
  is binding), or is an Indian draft (jurisdiction `IN`, `statusType: draft`). This is where the law is moving.
- **Quarterly (90 days)** otherwise, which equals the S5 register's `policy.reviewWindowDays`; a shorter window wins.
- **Never later** than any cited S5 register entry's own next review (`lastReviewed + reviewWindowDays`) or an earlier
  `review.nextReview` the record carries.

Monthly review of every US state citation is real expert load; budget expert hours for it.

### How expiry works

`npm run check:catalog-currency` (in CI; `--as-of YYYY-MM-DD` and `--json` for scripts) reports:

| Code | Severity | When |
|---|---|---|
| `GOV_REVIEW_DUE_SOON` | warning | The next review is within 14 days (the due day included). |
| `GOV_REVIEW_OVERDUE` | error for reviewed and qualified, warning otherwise | The next review has passed. |
| `GOV_REVIEW_STALE` | error for reviewed and qualified, warning for any other recorded review | The review date is missing, unparsable or in the future, or the next review cannot be scheduled (an unknown register entry). Stale is never current. |
| `GOV_REVIEW_UNVERIFIED` | error | Reviewed or qualified content without a valid quorum of review records signed by pinned reviewers. |
| `GOV_REVERIFY_OPEN` | error | Reviewed or qualified content cites an instrument an open re-verify item affects. |
| `GOV_REGISTER_STATUS_REVIEW` | warning | A register entry's stated status should have changed by now (P1-18). |

Currency only ever makes support stricter, and its clock is the server's date, never a record field. Expiry routes
content to review and never rewrites anything. A compilation (`compilePlan`) treats reviewed or qualified content as
`experimental` in that plan's requirement row, with the reason, when its review is overdue or stale or when it has no
verified quorum (no caller passes review authority yet, so today every row is experimental). The YAML is not
edited, and the control's digest, the lock and every stored `ControlResult` (which pin `controlVersion` and
`controlDigest`) stay byte-identical.

## The changelog

`catalog/CHANGELOG.md` is public and append-only. When the catalog digest changes, the change appends exactly one entry
naming the new catalog id, version and digest and every added, changed or retired control, with a reason and, for
content that is reviewed or qualified before or after the change, the review record ids. Experimental content changes
without review records. Earlier text is never edited, truncated or reordered. `npm run check:catalog-changelog` compares
the catalog and changelog at the merge base with the PR's base branch against the change and prints the entry it
expects when one is missing.

An entry is a block in the Markdown, fenced exactly like this, with one line of canonical JSON (keys sorted, no spaces,
as `canonicalize` writes it):

````
```amc-catalog-change
{"catalog":{"digest":"sha256:…","id":"amc.catalog","version":"0.2.0"},"controls":[{"change":"changed","id":"L0-ADV-01","reason":"…","reviewRecordIds":["…"],"version":"0.2.0"}],"entryVersion":1}
```
````

- A control new to the lock is `added`; one whose support moves to `retired` is `retired`; any other change to a
  control's version, pack or digest is `changed`. The version is the control's current version.
- A control that disappears from the lock is refused (`GOV_CHANGELOG_REMOVAL_UNRESOLVED`): retire it instead.
- A digest change with no control change (vocabulary, producers, registers, packs) still needs an entry, with `controls: []`.
- Each catalog id and version appears once, so a content change bumps `catalog.yaml`'s version.
- No other fenced block may appear in the changelog; prose and headings may.

The guard's codes (`GOV_CHANGELOG_*`) name the first failure: history changed, a malformed block or entry, a missing or
extra entry, a catalog or control mismatch, missing review ids or an unresolved removal. Review ids in an entry are
references; the records behind them are what `verifyReviewRecord` checks.

## F5 verdicts

F5's per-question verdicts (keep, rewrite, merge, drop) are AI output. A verdict changes catalog content only when a
human review record confirms it and `catalog/governance/f5-confirmations.yaml` lists it (station, pack id, question id,
verdict, confirming record id). An `aiInputs` entry `{ kind: "f5_verdict", ref: "<station>/<packId>/<questionId>",
confirmed: true }` must match such a row. Unconfirmed verdicts never change content. No verdict is confirmed yet; P0-26
handles F5's drops with Sid.

## Facts to re-verify before publishing

`catalog/governance/reverify-before-publishing.yaml` tracks the strategy's facts to re-check against the primary source,
each with `id`, `fact`, `sourceToCheck`, `owner`, `status` (`open`, `confirmed`, `changed`), `checkedAt`,
`reviewRecordId` and `affects` (S5 register ids, or instrument names where no entry exists). All fifteen are open. Keep
an item open while the primary text does not exist; a secondary source never closes it. Closing one needs a date and a
review record. A reviewed or qualified control citing an instrument an open item affects fails `GOV_REVERIFY_OPEN`.

## Standards and licensing

`catalog/governance/standards-licences.md` lists the licensed standards the crosswalks and reviews need, with access and
cost for Sid to fill. Catalog content stays MIT until decision D-04 (the strategy recommends CC BY 4.0). Content links
ISO and CEN clauses by number and never reproduces their text (P1-09 enforces).

## What is not done

- D-08: no expert is named, so there is no roster, no review record and no reviewed content.
- Sid approves this document and the cadence.
- P1-33 wires `meetsReviewQuorum` into admission; P2-22 adds a review UI.
- The re-verify items, F5 confirmations and standards costs need people, not code.

Initial implementation by Codex (currency, changelog guard and review-record schema slices); completed and reconciled
with the P1-09/P1-14/P1-18 catalog by Claude.
