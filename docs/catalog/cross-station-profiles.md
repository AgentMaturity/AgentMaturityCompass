# Cross-station profiles

Status: experimental composition planning (P2-28). Profiles describe combinations of stations; they do not add laws,
controls, qualified coverage or a compliance claim. The shipped catalog currently contains its Layer 0 seed only.
Station overlays must exist and apply to the deployment before they can contribute requirements.

## Selecting stations

`catalog/profiles/cross-station.json` contains nine two-station templates and one three-station example. The loader
validates each template using the canonical station taxonomy and includes these records in the catalog digest.
Use a template's `primary` and `stations` in the existing deployment profile facts. Keep their provenance and source
explicit; selecting a template does not turn an asserted fact into an observed or reviewed one.

| Profile | Primary | Other stations |
| --- | --- | --- |
| `banking-and-payments` | Wealth | Technology |
| `self-driving-connected-vehicles` | Mobility | Technology |
| `digital-health-devices` | Health | Technology |
| `payers-prior-authorization` | Health | Wealth |
| `public-sector-ai` | Governance | Technology |
| `education-technology` | Education | Technology |
| `sustainable-finance` | Wealth | Environment |
| `grid-utility-operations` | Environment | Technology |
| `ports-and-freight` | Mobility | Environment |
| `insurer-connected-cars` | Wealth | Mobility, Technology |

The first-listed station is primary in this data, following the issue's proposed convention. Sid's confirmation
remains pending. Primary station affects presentation and default ownership; it never overrides a stricter rule.
Unknown, duplicated or missing-primary station IDs are refused. Reordering a deployment's station list with the
same explicit primary does not change its normalized profile.

## Merge rules

The existing compiler first evaluates station and jurisdiction applicability. Layer 0 appears once; each requirement's
`pulledInBy` records every station that reaches it. Only controls not ruled out by applicability enter the merge.
Unknown applicability remains unknown and a mandatory unresolved requirement still blocks the plan.

Controls may add this optional field:

```yaml
merge:
  key: incident-notice.initial
  comparator: duration-max
  value: { amount: 24, unit: hours }
```

| Comparator | Effective value |
| --- | --- |
| `duration-max` | Shortest duration |
| `duration-min` | Longest duration |
| `count-min` | Largest non-negative integer |
| `boolean-required` | `true` over `false` |
| `enum-order` | Latest value in the shared weakest-first `order` list |

Durations reuse `ClockDuration`: hours, calendar days, work days and months. Hours and calendar days compare as elapsed
UTC time, with 24 hours per calendar day, matching the clock engine. Work days compare only with work days; months
only with months. No calendar or work-day conversion is guessed. Different comparators, incompatible units or
different enum orders are unresolved. The affected requirements become unresolved and the plan is blocked.

`effectiveMergeRules` records the chosen comparison value and control ID. `conflicts` retains the candidates,
resolution and rejected-exception reasons. Equal values break ties by sorted control ID. A comparison never removes
another control's independent binding, citation, evidence contract or manual duty. Runtime parameters continue through
the existing enforcement registry and strictness merge; descriptive merge metadata adds no new enforcement point.
Controls without merge metadata remain side by side.

## Signed reviewer exceptions

An optional deployment-profile `mergeExceptions` list can choose one candidate for a merge key. Each record contains
`id`, `mergeKey`, `chosenControlId`, `profileDigest`, `controlDigests`, `reviewer: { name, credential }`, `rationale`,
`expiresAt` and `signature`. Obtain the binding from `stationExceptionBinding` using the normalized deployment profile
and the scoped candidates. `signStationMergeException` signs the body using the existing `CONTROL_PLAN` signing route.
The digest excludes the signature and the profile binding excludes the merge-exception list to avoid circular hashes.

Compilation requires a verified envelope and an operator-loaded `TrustContext` pinning its issuer for
`config-signature`. The CLI loads that context from the operator's trust configuration. Neither a key inside the
record, `workspace-self`, an unpinned override nor reviewer name/credential text authorizes an exception.
The context must be evaluated at the compile's explicit `asOf`. Expired, unsigned, wrong-key, changed-profile and
changed-candidate records are rejected and listed; the normal strict comparison remains. Conflicting authorized
choices remain unresolved. Existing plan-signing and activation weakening checks still apply to `reviewer_exception`.
Signing identifies a key and preserves bytes; it does not establish independent legal review.

The readable plan diff includes conflicts, effective comparison rules and rejected exceptions. It shows a changed
choice or expired exception even when the independently enforced runtime parameters remain unchanged.

## Implementation boundary

This change adds no command path, overlay content, incident-clock entries or scoring behavior. It does not compose
legacy operating-profile configuration files or introduce the absent `src/domains/blueprints/stationProfile.ts`.
Their existing semantics remain intact. Tests, golden outputs, evaluations, builds, lint and CI are deferred under
the coding-only instruction; the change has no qualification receipt and the item is not marked Done.
