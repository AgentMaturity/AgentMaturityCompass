# Claim Kinds and Status Dimensions

Every AMC result carries a claim kind and five status dimensions. One shared service, `evaluateClaimEligibility` in `src/claims/eligibility/`, decides them from the result's provenance and evidence, and `renderClaimLabel` prints them with the same words on every surface. CLI, MCP, API, Studio and reports keep their current output until each adopts the service.

AMC output is evidence of conformity. It is not a certificate.

## Claim kinds

| Kind | Label | Meaning |
| --- | --- | --- |
| `synthetic_example` | Synthetic example (not evidence) | Example values from a labelled example mode. Never evidence and never a level. |
| `self_reported` | Self-reported | Stated by the agent or its operator, or not backed by observed evidence. Numeric self-answers reach at most level 1 and never pass a regulated control. |
| `observed` | Observed | AMC observed the behaviour at runtime or in an executed test, backed by `OBSERVED` or `OBSERVED_HARDENED` evidence. |
| `independently_reviewed` | Independently reviewed | Approved by a reviewer who is independent of the producer and whose key is pinned. |

Results stored by AMC 1.x are labelled "Legacy (1.x), self-reported".

JSON consumers read `claimKind`. The label text is public output too, so changing its wording is a breaking change for text parsers.

## Status dimensions

| Dimension | Values |
| --- | --- |
| Applicability | `applicable`, `not_applicable` (with a rationale) or `unresolved` (with a reason) |
| Evidence | `sufficient`, `incomplete`, `stale`, `contradictory` or `untrusted` |
| Result | `pass`, `fail` or `not_evaluated` |
| Enforcement | `none`, `advisory`, `observed` or `enforced` at a named boundary |
| Review | `pending`, `approved`, `rejected` or `expired` |

"Not evaluated" means AMC could not decide from trustworthy evidence. It is never a pass, a partial result or a default score.

## Rules

A result is regulated when it asserts conformity with a law, regulation, standard or framework mapping. The rules run in this order, and each records a reason code on the envelope.

1. Synthetic values (`synthetic`): kind `synthetic_example`, result `not_evaluated`, evidence `incomplete`, no level. `SYNTHETIC_VALUES`.
2. A legacy 1.x result: kind `self_reported`, with the original version and tier kept in `provenance.legacy`. `LEGACY_1X_UNVERIFIED`.
3. An empty event stream (except numeric self-answers): evidence `incomplete`, result `not_evaluated`, no level. `EMPTY_EVIDENCE`.
4. Numeric self-answers: kind `self_reported`, evidence `incomplete`, level 1 at most (`SELF_REPORTED_LEVEL_CAP`); a regulated pass becomes `not_evaluated` (`SELF_REPORTED_NO_POSITIVE_STATUS`).
5. Keyword matches, unkeyed checksums and path-presence checks: level 1 at most; a regulated pass becomes `not_evaluated`. `WEAK_METHOD`.
6. An invalid or missing signature (`SIGNATURE_INVALID`) or evidence from another tenant or scope (`CROSS_SCOPE_EVIDENCE`) makes evidence `untrusted`; contradictory evidence makes it `contradictory` (`CONTRADICTORY_EVIDENCE`); evidence older than the allowed age makes it `stale` (`STALE_EVIDENCE`). Each turns a pass into `not_evaluated`. When several apply, the evidence dimension shows the most serious, in the order untrusted, contradictory, stale, incomplete.
7. A regulated result whose events are not bound to the control: a pass becomes `not_evaluated`. `UNBOUND_EVIDENCE`.
8. Kind for everything else: `independently_reviewed` only when the review is `approved`, the reviewer is independent (`REVIEW_NOT_INDEPENDENT` otherwise) and the issuer key is pinned (`ISSUER_NOT_PINNED` otherwise); `observed` when the method is a runtime observation or an executed test and the evidence includes an `OBSERVED` or `OBSERVED_HARDENED` tier; otherwise `self_reported`.
9. Applicability `not_applicable` makes the result `not_evaluated` (`NOT_APPLICABLE`). A regulated result with no applicability decision is `unresolved`, and an unresolved result cannot pass (`APPLICABILITY_UNRESOLVED`).

The service reads no clock, file or environment: callers pass `now`. Changing `now` can only change staleness.

Payment unlocks access, never a better result or a higher trust tier. The envelope copies `entitlement` through untouched, and no rule reads it.

## Mappings

### `TrustTier` (`src/types.ts`) and `TrustTier` (`src/score/evidenceIngestion.ts`)

`OutcomeSignalTrustTier` uses a subset of the same values and maps the same way.

| Tier | Claim kind | Note |
| --- | --- | --- |
| `OBSERVED` | `observed` | |
| `OBSERVED_HARDENED` | `observed` | |
| `ATTESTED` | `self_reported` | Adds `REVIEW_NOT_INDEPENDENT` until attestations are tied to a pinned third-party key. |
| `SELF_REPORTED` | `self_reported` | |
| `UNVERIFIED` | `self_reported` | Only in `src/score/evidenceIngestion.ts`. |

### `ClaimTier` (`src/score/claimProvenance.ts`)

`USER_VERIFIED` is an operator's own statement, so it is not an observation.

| Tier | Claim kind |
| --- | --- |
| `USER_VERIFIED` | `self_reported` |
| `DERIVED` | `self_reported` |
| `HYPOTHESIS` | `self_reported` |
| `SESSION_LOCAL` | `self_reported` |
| `REFERENCE_ONLY` | `self_reported` |

### Uppercase statuses

The certification-evidence statuses (`PASS`, `FAIL`, `NOT_EVALUATED`) and the compliance category statuses (`SATISFIED`, `PARTIAL`, `MISSING`, `UNKNOWN`). `PARTIAL` is not a result: missing evidence means not evaluated.

| Status | Result | Evidence |
| --- | --- | --- |
| `PASS` | `pass` | unchanged |
| `FAIL` | `fail` | unchanged |
| `NOT_EVALUATED` | `not_evaluated` | unchanged |
| `SATISFIED` | `pass` | unchanged |
| `PARTIAL` | `not_evaluated` | `incomplete` |
| `MISSING` | `not_evaluated` | `incomplete` |
| `UNKNOWN` | `not_evaluated` | `incomplete` |

Industry-pack audit findings map the same way: `INDUSTRY_EVIDENCE_MISSING` means evidence `incomplete` and result `not_evaluated`, and `INDUSTRY_EVIDENCE_SYNTHETIC` means kind `synthetic_example`.

### Diagnostic runs

`envelopeForDiagnosticReport` keeps a run's real level (the mean of its layer levels), so surfaces that show diagnostic levels use it instead of the weak-method cap. A run whose status is `INVALID` or `UNSIGNED` has evidence `untrusted` (`SIGNATURE_INVALID`). A run labelled "UNRELIABLE — DO NOT USE FOR CLAIMS" also has evidence `untrusted`. None of them can pass. The kind is `observed` only when the run's observed evidence coverage is above zero, otherwise `self_reported`.

### Other adapters

- `envelopeForSelfAssessment`: numeric answers; the proposed level is the lowest answer, then rule 4 applies.
- `envelopeForSyntheticExample`: always `synthetic_example` with no level.
- `envelopeForPathPresence`: a found path proposes a pass, then rule 5 applies.
- `envelopeForLegacyResult`: maps the stored uppercase status, then rule 2 applies.

## Rendering

`renderClaimLabel(envelope)` returns `{ kindLabel, line, dimensions }`, for example:

```
Claim: Self-reported · Result: not evaluated (self-reported answers cannot pass a regulated control) · Evidence: incomplete · Enforcement: none · Review: pending · Applicability: unresolved
```

`formatClaimLabel(label, surface)` for `cli`, `mcp`, `api`, `studio` and `report` changes markup only, never words. `renderClaimLegend("text" | "markdown" | "html")` explains the four kinds, the five dimensions and "not evaluated". `REASON_TEXT` holds the one fixed sentence for each reason code.
