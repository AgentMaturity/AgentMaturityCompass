# Human first-use model revision declarations

Contract: `amc-human-first-use-model-revision/1`, September 11, 2026.
AMC-1512 / AMC-1518. **SOURCE AND REGRESSIONS AUTHORED; UNEXECUTED / UNQUALIFIED.**
This guide describes the implemented source interface, not a qualified release,
an observed study or authorization to run any command. The current hold includes
tests, checks, builds, imports, fixtures, acceptance, providers and human sessions.

## Version selection

| Interface | Legacy default | Credential-only opt-in | Prospective model-revision opt-in |
| --- | --- | --- | --- |
| Capture | `2026-09-09.1` | `2026-09-10.1` | `2026-09-11.1` |
| Intake study | `2026-09-09` | `2026-09-10` | `2026-09-11` |
| Credential block | Absent | Version `1` | Same version `1` |
| Revision identity block | Absent | Absent | Version `1` |

The new version is selected only by the separate `prepare` argument
`--capture-version 2026-09-11.1`, on either capture or guided observer. Omitting
the flag retains the legacy default; new fields do not select a version by
inspection. No extra flag is added to intake: its input explicitly declares
`schemaVersion`. A study uses one schema; a journal uses one immutable version.

The exact common task/protocol, assistance policy, recording rules and observation
window remain separate from version selection. This change does not select a
provider, acquire credentials, resolve a model, or establish what actually ran.

## Exact model declaration

Only the new preparation model adds `revisionIdentity` to the existing keys:
`kind`, `provider`, `id`, `revision`, `settingsSha256`, `credentialState`.
There is still no `used` or `credentials` block in preparation. The preparation
envelope and planned-session/harness/environment keys otherwise remain unchanged.

`revisionIdentity` has exactly `version`, `status`, `reference`, and `reason`.
Every key is required, even when the value must be null. `version` is string `1`.

| Status | `model.revision` | `reference` | `reason` |
| --- | --- | --- | --- |
| `declared-immutable` | Nonempty bounded declared immutable revision | Null or actual original reference label | Null |
| `unknown` | Explicit null | Null or actual original reference label | Nonempty explanation of the unknown immutable revision |
| `not-applicable` | Null; keyless-demo only | Null | Null |

Provider and requested `model.id` remain required in live/local preparation.
The settings digest still refers to retained sanitized settings. Unknown immutable
revision does not make other missing required identity/settings evidence optional.
Keyless demos retain null provider/id/revision/settings, not-required credentials,
no actual use, and now explicitly declare revision identity not-applicable.

Revision and reference strings are bounded at 256 characters. Reasons use the
existing 2048-character text limit. Required text is nonempty; control characters,
unknown keys, missing members, unsupported versions and contradictory branches
are refused. The existing duplicate-key JSON admission remains in use. These are
source limits, not measured data sizes or exercised acceptance results.

`reference` may be mutable or unclassified. It is neither a verified pin nor a
provider response observation. `model.id` remains the originally requested label.
Do not substitute a returned label, request ID, settings digest or the literal
string `unknown` for an unavailable immutable revision. Declare null and explain.
The implementation does not use label heuristics or a blacklist to authenticate
immutability: even a plausible declared-immutable string is still a declaration.

### Synthetic shape illustration, not preparation or observation

The following model fragment deliberately supplies no provider, candidate,
participant, settings hash, timestamp or observed result. It is not a complete
valid input and must not be used to populate an actual study:

```json
{
  "revision": null,
  "revisionIdentity": {
    "version": "1",
    "status": "unknown",
    "reference": null,
    "reason": "Synthetic explanation of an undisclosed immutable revision."
  }
}
```

## Immutable baseline and credential chronology

Preparation clones and preserves the model declaration with the full roster.
Capture projection carries that original revision/identity unchanged into the
new study model alongside `used` and the existing credential evidence block.
Later discovery does not rewrite the baseline. Corrections replace only a
session's effective event sequence and retain prior revisions; they cannot
replace a prepared model, identity, roster or study configuration.

The new version inherits credential contract `1`: immutable credential starting
state; ordered `credential-change` data `{from,to,actor}`; explicit `model-use`
data `{credentialState}`; and all five close completeness flags including
credentials. No returned-model or sidecar field is added to either event.
Use must match the state at that point. Later repair cannot support earlier use;
later loss does not erase supported earlier use. Capture requires use before the
useful-result occurrence, including equal timestamps. Reduced intake cannot
recover cross-event order when those timestamps are equal; retain the journal.

An operator configuration change counts once as assistance. Unknown actors and
incomplete assistance coverage preserve null assistance; later known help does
not repair the unknown total. Incomplete credential coverage remains a separate
admission blocker. Unknown immutable model identity is not credential coverage
and never bypasses these requirements.

The immutability here is an API/journal contract, not protection against someone
rewriting every retained byte and hash. Preserve independently retained original
heads and provenance. Direct intake validates the supplied declarations; it does
not recover an original plan that was omitted or falsified upstream.

## Admission is not comparison or provider authentication

A new-version record may retain null immutable revision with status unknown and
an explanation, including after declared actual use. Completed, failed, incomplete
and no-use outcomes remain distinct. Unknown revision alone is not an invalid
observation or a reason to recode a task as failed. Other missing evidence,
invalid declarations, recording admission and existing useful-result rules still
apply. No useful-result timestamp/action count is invented for failure.

The new cohort key retains the original protocol/environment/model/settings/
credential-start fields, and extends them with model-revision contract version,
status and reference. Private reason text is not part of matching. Direct input
strings are not normalized, case-folded or alias-resolved; differing references
remain separate. The guided terminal uses its established trimmed text input,
so the operator must review the exact displayed declaration before saving.

Unknown revision groups remain visible with
`unknown-immutable-model-revision` and insufficient-evidence, with their summaries
withheld. Existing null identity reasons may also appear. Equal unknown aliases
and sufficient declared cohort sizes cannot create a fixed-model match. A valid
unknown extra stratum keeps the whole comparison insufficient even beside a known
matched subgroup. Invalid/missing human rows retain the existing aggregation block.
Failed/no-use rows remain in population accounting rather than being discarded.

For the new schema, comparative output explicitly includes:

| Field | Meaning |
| --- | --- |
| `modelMatchBasis` | `declared-immutable-planning-identities` only for a sufficient overall declared match; otherwise `insufficient-provenance`. Each cohort also names its own planning-identity basis independently of its other eligibility limits. |
| `servedModelMatch` | Always `not-established` by this collector. |
| `modelIdentityAuthenticated` | Always false. |

`humanParticipationAuthenticated` remains false; ranking and superiority claims
remain null. The old versions do not receive these new report fields or changed
cohort identities. An intake CLI exit 0 still means valid records and sufficient
declared cohorts only. A new unknown-revision cohort returns the existing
insufficient disposition/exit 2, not a pass. No CLI was run to write this guide.

Independent review must still reconcile every actual request's requested/returned
labels, supported served revision, provider activity and use/answer/recording
correspondence. Planned-string agreement alone is not a served-model match.
This source does not read a review sidecar or promote its verdicts automatically.

## Prospective only: no migration into this version

New model-revision drafts include `migration: null`. A nonnull migration object
is refused with `migration-version`, even if it resembles the credential-only
migration shape. The existing `migrate` command accepts no target-version option
and continues to fork eligible legacy preparations only into credential capture
`2026-09-10.1`. It does not classify old revision strings as immutable or unknown.

Existing legacy-to-credential source-head/disjoint/create-only restrictions and
the migration-aware correction floor are unchanged. Observed and corrected-empty
legacy journals remain ineligible. Mixed journal versions, untyped relabels and
new-model migration sources are refused. On a cold-read refusal, preserve the
whole original journal; do not export a valid-looking prefix or fabricate a report.

No observed old session may be relabelled or restarted as original first use.
An unobserved plan may be independently reviewed for a genuinely prospective new
preparation under separate authority; the original and its relation must remain
retained. This implementation supplies no automatic conversion or deletion path.

## Guided preparation and full-roster export

The new wizard explicitly asks declared-immutable versus unknown. Unknown skips
the immutable revision text question, keeps null, asks for an optional reference
and requires an explanatory reason. A bare unknown response to other required
fields remains unready; it is not a way to invent settings or authorization.
The explicit file-input route and edit-session route use the same core version
rules. Both require full-roster review before create. Old-version prompt order
and defaults remain unchanged. Blank input, EOF and pause never create an identity
declaration, model use or journal without explicit confirmation.

All roster entries remain in capture status/export. Closed admissible unknown-
revision records can export; a missing, open or inadmissible row blocks the whole
study, with no successful subset. Unknown identity does not suppress recording,
credential coverage, consent, action, refusal or full-window requirements.
Completed blocked reports are different from pre-output refusal or partial I/O.
Retain actual outputs and failures, not an imagined complete bundle.

## Privacy and qualification boundary

The original reason remains private in preparation/journal/study evidence. The
public intake projection replaces it with `reasonRecorded`, like other narratives.
Rejected model blocks project as null; unknown keys are not echoed in errors.
Allowed reference labels and private observer terminal output can still contain
sensitive text. This is not a secret detector or anonymizer; do not paste secrets.

Implemented source paths: `scripts/human-first-use-capture.mjs`,
`scripts/human-first-use-intake.mjs`, `scripts/human-first-use-observer.mjs`.
Actual-path regression source: `tests/humanFirstUseModelRevision.test.ts`.
The standalone earlier characterization/proposal and existing credential tests
remain preserved. The new cases specify legacy serialization/cohort compatibility,
typed refusal, used/no-use unknowns, comparison limits, full roster, migration
isolation, cold reads, public CLI functions and guided review/cancellation.
They are authored assertions, not executed tests or mutation-qualified coverage.

Authoring receipt:
`AMC_OS/RESEARCH/2026-09-11-amc-1512-model-revision-implementation/`.
The retained transfer/2 and credential-review-binding/1 mappings remain pinned to
their original credential-only applicability. Do not silently retarget their
templates to this schema. The next bounded integration is an explicitly labelled
model-revision mapping/applicability addendum that preserves their history and
keeps requested baseline separate from per-request served-model review.
No sidecar ingestion, provider resolver, live evidence, issue Done, Phase A
completion, source/package/platform/release qualification or execution authority
is conferred by these source and guide changes.
