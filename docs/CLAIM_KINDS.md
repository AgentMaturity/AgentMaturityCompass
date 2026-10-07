# Claim Kinds and Status Dimensions

Every AMC result carries a claim kind and five status dimensions. One shared service, `evaluateClaimEligibility` in `src/claims/eligibility/`, decides them from the result's provenance and evidence, and `renderClaimLabel` prints them with the same words on every surface. MCP, the API and Studio use it since P0-23 (see [Surfaces](#surfaces)); the CLI and reports keep their current output until they adopt it.

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
3. An empty event stream (except numeric self-answers), including a negative or non-numeric event count: evidence `incomplete`, result `not_evaluated`, no level. `EMPTY_EVIDENCE`.
4. Numeric self-answers: kind `self_reported`, evidence `incomplete`, level 1 at most (`SELF_REPORTED_LEVEL_CAP`); a regulated pass becomes `not_evaluated` (`SELF_REPORTED_NO_POSITIVE_STATUS`).
5. Keyword matches, unkeyed checksums and path-presence checks: level 1 at most; a regulated pass becomes `not_evaluated`. `WEAK_METHOD`.
6. A signature that does not verify (`signatureValid` is false, `SIGNATURE_INVALID`) or evidence from another tenant or scope (`CROSS_SCOPE_EVIDENCE`) makes evidence `untrusted`; contradictory evidence makes it `contradictory` (`CONTRADICTORY_EVIDENCE`); evidence older than the allowed age makes it `stale` (`STALE_EVIDENCE`), and so does evidence with a future or unknown timestamp when an allowed age is set. Each turns a pass into `not_evaluated`. A missing signature (`signatureValid` is null) does not by itself block a pass. When several apply, the evidence dimension shows the most serious, in the order untrusted, contradictory, stale, incomplete.
7. A regulated result whose events are not bound to the control: the result becomes `not_evaluated`, whether it was a pass or a fail. `UNBOUND_EVIDENCE`.
8. Kind for everything else: `independently_reviewed` only when the review is `approved`, the reviewer is independent (`REVIEW_NOT_INDEPENDENT` otherwise) and the issuer key is pinned (`ISSUER_NOT_PINNED` otherwise); `observed` when the method is a runtime observation or an executed test and the evidence includes an `OBSERVED` or `OBSERVED_HARDENED` tier; otherwise `self_reported`.
9. Applicability `not_applicable` makes the result `not_evaluated` (`NOT_APPLICABLE`). A regulated result with no applicability decision is `unresolved`, and an unresolved result cannot pass (`APPLICABILITY_UNRESOLVED`), because unknown applicability means not evaluated.

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

The certification-evidence statuses (`PASS`, `FAIL`, `NOT_EVALUATED`; they come from candidate 37c1466b and are not on main yet) and the compliance category statuses (`SATISFIED`, `PARTIAL`, `MISSING`, `NOT_EVALUATED`, `UNKNOWN`). The adapter reads a stored status alone, and in 1.x compliance reports `PARTIAL` and `MISSING` could come from missing evidence, so it maps them to not evaluated. Since P0-17 the compliance engine also writes a `result` field on every category, and there `PARTIAL` and `MISSING` mean a requirement failed (`result: fail`). A consumer of a 2.0 compliance report reads `result` rather than mapping the status; making the adapter prefer `result` is follow-up work for P0-22 and P0-23.

| Status | Result | Evidence |
| --- | --- | --- |
| `PASS` | `pass` | unchanged |
| `FAIL` | `fail` | unchanged |
| `NOT_EVALUATED` | `not_evaluated` | unchanged |
| `SATISFIED` | `pass` | unchanged |
| `PARTIAL` | `not_evaluated` | `incomplete` |
| `MISSING` | `not_evaluated` | `incomplete` |
| `UNKNOWN` | `not_evaluated` | `incomplete` |

Any other stored status is unrecognised and maps to result `not_evaluated` with evidence `incomplete`.

The industry-pack audit types `INDUSTRY_EVIDENCE_MISSING` and `INDUSTRY_EVIDENCE_SYNTHETIC` exist only on candidate 37c1466b, not on main, and no adapter maps them yet.

### Diagnostic runs

`envelopeForDiagnosticReport` keeps a run's real level (the mean of its layer levels), so surfaces that show diagnostic levels use it instead of the weak-method cap. A diagnostic run has no pass or fail of its own: it proposes a pass only when AMC's evidence-readiness gate (`evaluateDiagnosticEvidenceReadiness`) marks the run claim-eligible, and otherwise its result is `not_evaluated` with `EVIDENCE_NOT_CLAIM_READY`. A run that is not claim-ready has evidence `untrusted` when the gate finds it unverified (unsigned, invalid, failed verification, a crossed trust boundary, missing metadata or an import) or when it is labelled "UNRELIABLE — DO NOT USE FOR CLAIMS", and `incomplete` otherwise. A run whose status is `INVALID` or `UNSIGNED` also records `SIGNATURE_INVALID`, and a run with contradictions records `CONTRADICTORY_EVIDENCE`; neither can pass. The kind is `observed` only when the run's observed evidence coverage is above zero, otherwise `self_reported`.

### Other adapters

- `envelopeForSelfAssessment`: numeric answers; the proposed level is the lowest answer, then rule 4 applies.
- `envelopeForSyntheticExample`: always `synthetic_example` with no level.
- `envelopeForPathPresence`: a found path proposes a pass, then rule 5 applies.
- `envelopeForLegacyResult`: maps the stored uppercase status, then rule 2 applies.
- `envelopeForUnboundResult`: a surface result that no adapter binds to evidence yet. The result is `not_evaluated` with no level, and the first reason is `RESULT_NOT_BOUND` ("this result is not yet bound to claim-eligible evidence"), so the label never suggests the producer recorded nothing. The kind is `self_reported` unless the method is synthetic.

## Rendering

`renderClaimLabel(envelope)` returns `{ kindLabel, line, dimensions }`, for example:

```
Claim: Self-reported · Result: not evaluated (self-reported answers cannot pass a regulated control) · Evidence: incomplete · Enforcement: none · Review: pending · Applicability: unresolved
```

`claimFields(envelope)` returns `{ claimKind, statusDimensions, claimLabel }`, where `claimLabel` is the label line; MCP, the API and Studio attach exactly these fields. `formatClaimLabel(label, surface)` for `cli`, `mcp`, `api`, `studio` and `report` changes markup only, never words. `renderClaimLegend("text" | "markdown" | "html")` explains the four kinds, the five dimensions and "not evaluated". `REASON_TEXT` holds the one fixed sentence for each reason code.

## Surfaces

### MCP

All ten tools in `src/mcp/amcMcpServer.ts` return the result text, then a second text block with the claim line and `Claim kinds: see docs/CLAIM_KINDS.md`, and set `structuredContent` to the claim fields (`src/mcp/mcpClaimOutput.ts`). Agent tools use the agent's latest diagnostic run when this workspace's auditor key sealed it, and are not evaluated otherwise. The sector-pack tool uses the regulated self-assessment envelope. The compliance tool is a regulated result that is not evaluated. `amc_list_evidence` labels each event with `claimKindFromTrustTier` of its effective trust tier. See [MCP_SERVER.md](MCP_SERVER.md).

### API

`src/api/resultRouteRegistry.ts` lists the `/api/v1/` routes that return results, each with its producer, its shape (`single` or `list`) and its claim source. The dispatcher binds the matched route to the response and `apiSuccess` adds the claim fields beside a single result, or a `claim` object on each list item. A sealed diagnostic run carries its own envelope; every other listed result uses `envelopeForUnboundResult`. OpenAPI publishes `ClaimKind`, `StatusDimensions` and `ClaimResult`, generated from the zod schemas above. See [API_SURFACES.md](API_SURFACES.md).

### Studio

`src/studio/studioClaimOutput.ts` lists the Studio routes that feed result pages; Studio's JSON helper adds the claim fields to their 2xx bodies. The console shows each claim in a strip above the page (`src/console/assets/components/claimBadge.js`): the kind and result in a pill, the five dimensions in its tooltip, and a link to the legend, which the dashboard, transparency, compliance, assurance, passport and industry-packs pages show open. "Not evaluated" is a neutral pill with its reason, never 0 and never a failure. Pack-gate responses add `entitlementNote`, and claim fields are the same with or without entitlement.
