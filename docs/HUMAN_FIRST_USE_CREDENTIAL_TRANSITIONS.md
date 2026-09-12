# Human first-use credential transitions

> September 11, 2026 — credential contract `1` is also inherited by prospective
> capture `2026-09-11.1` / intake `2026-09-11`. Its separate typed model-revision
> declaration is documented in [Model revision](HUMAN_FIRST_USE_MODEL_REVISION.md).
> Existing credential migration still targets `2026-09-10.1`; execution remains held.

Contract guide: `amc-human-first-use-credentials/1`, authored 2026-09-10 for
AMC-1512 / AMC-1518. **SOURCE AND REGRESSION AUTHORING ONLY; UNEXECUTED / UNQUALIFIED.**
The examples below explain a contract, not permission to execute a command,
migrate a journal, generate fixtures, contact providers or observe participants.
The current execution hold remains in force, including help and import commands.

## Version selection, not silent replacement

| Surface | Legacy default | Explicit credential-transition version |
| --- | --- | --- |
| Capture journal | `2026-09-09.1` | `2026-09-10.1` |
| Exported intake study | `2026-09-09` | `2026-09-10` |
| `model.credentials.version` | Field absent | String `"1"` |

The common task/protocol stays version 1; it is not replaced by this credential
contract. `prepare` defaults to the legacy capture version. Explicit selection
is `--capture-version 2026-09-10.1`, supported by both the capture and guided
observer preparation commands. Every revision must match its original draft's
version. Unknown versions, in-place upgrades/downgrades and mixed revision
versions are refused. A study has one schema version for every session: old and
new session shapes cannot be pooled by relabelling the study envelope.

The legacy missing/unknown-start plus `model.used=true` export limitation remains
the legacy behavior. The new version represents a prospectively observed repair
without changing the starting condition. It does not retroactively make an old
journal or an unobserved transition admissible. The new regressions exercise
legacy behavior separately; no earlier test receipt qualifies this version.

## Immutable starting state and explicit observations

Preparation still accepts the exact input in
[Human first-use capture](HUMAN_FIRST_USE_CAPTURE.md): `studyId`, `preparedAt`,
`operator`, `protocol`, `task`, `observationWindowRule`, `assistancePolicy`, and
`plannedSessions`. Do not insert `captureVersion`, `migration`, `credentials`,
`used`, review fields or an authorization envelope into preparation input.
Version selection is a separate argument. Capture adds `migration: null` to a
new versioned draft; only the supported migration routine supplies its provenance.

Each planned model keeps its original `credentialState`: `configured`,
`not-required`, `missing`, or `unknown`. Neither later configuration, a useful
answer, nor a correction changes that planned value or the roster. A mistaken
plan is a protocol deviation, not a reason to rewrite history. This immutability
is a journal/API rule, not frozen JavaScript objects, OS-immutable storage,
authenticated preregistration or protection from wholesale journal rewriting.

At close, the new intake model adds exactly:

| Field in `model.credentials` | Meaning |
| --- | --- |
| `version` | String `"1"`, not a number or a future version. |
| `startingState` | Must equal the preserved `model.credentialState`; never the most recent state. |
| `coverageComplete` | Explicit boolean covering credential changes and actual-use observations across the entire measurement window. False is retained but blocks admission. |
| `observations` | Ordered credential-change/model-use event objects. Their order is not sorted, deduplicated or reconstructed from final state. |

These are declared states, not credential values, validity checks or provider
attestations. `configured` alone establishes no dispatch, real inference,
successful authentication or correct answer. `not-required` describes the
declared route requirement; it does not convert a keyless demonstration into
actual model use. Supporting provider/request/answer evidence remains separately
reviewed under [the evidence protocol](AMC_1512_EVIDENCE_PROTOCOL.md).

## Exact event additions

Both events use the existing strict envelope `{type, at, timing, data}`.
`at` is an actual declared UTC timestamp with milliseconds.
`timing` is `explicit-observed` or deliberately chosen `operator-declared-now`.
Invocation/persistence time is never automatic evidence of observation.

| Event | Exact data | Admission rule |
| --- | --- | --- |
| `credential-change` | `{from, to, actor}` | `from` matches the last declared state and differs from `to`. Both states use the four-state enum. |
| `model-use` | `{credentialState}` | State is `configured` or `not-required` and matches the state at this point in the retained sequence. |

Actors are `participant`, `operator`, `observation-only`, or `unknown`.
`observation-only` may resolve a previously `unknown` state. It must not conceal
a configuration action with an unknown actor, or turn a known missing state
into configured while asserting no intervention. Use the real actor or `unknown`.
Both events are refused in legacy journals; neither is valid for `keyless-demo`.

Record `start` before any observation. All events must be nondecreasing in time
and within the declared session window; no normal event follows `close`.
For a migrated preparation, observations cannot precede the migration declaration.
Equal timestamps retain sequence order: repair then use can be admitted, while
use then repair cannot borrow the later state even at the same timestamp.

Each declared actual model use needs its own observation; an answer alone is
not an inferred use event. `modelUsed: true` at close requires an actual-use
observation, and false contradicts any retained actual use. A completed first
useful result requires use at or before that result, with capture requiring it
earlier in the submitted sequence. A later use cannot repair an earlier result.
Use can be recorded when the task fails; model use is not model success.
Later credential loss does not erase a supported earlier use, but another use
after that loss requires its own supported state at that later point.

### Synthetic illustration — not a session or an observed result

With a planned `credentialState: "missing"`, the following fictional event
fragments illustrate a transition and use after a separately recorded start:

```json
[
  {
    "type": "credential-change",
    "at": "2026-09-01T10:00:03.000Z",
    "timing": "explicit-observed",
    "data": { "from": "missing", "to": "configured", "actor": "operator" }
  },
  {
    "type": "model-use",
    "at": "2026-09-01T10:00:04.000Z",
    "timing": "explicit-observed",
    "data": { "credentialState": "configured" }
  }
]
```

The resulting starting state remains missing. These fragments are incomplete
synthetic illustration, not preparation input, complete capture history,
provider evidence or human observation. Do not reuse their times as measurements.

## Assistance and coverage are not inferred away

An operator credential-change counts once as assistance automatically. Record
distinct advice/help as separate `assistance` events, but do not add a second
assistance event for the same configuration intervention. Participant changes
do not automatically count as assistance. A change with unknown actor makes the
assistance count null, even when the remaining assistance list is complete.
Explicitly incomplete assistance coverage also yields null, not zero.

Credential-change is not automatically a submitted-action event. Preserve the
existing action-counting rule by recording each intentionally submitted
operation separately; do not count internal automation, keystrokes or observation
entry itself as a participant action. Keep the same rule across harnesses.

New-version close `completeness` requires exactly five explicit booleans:
`actions`, `assistance`, `setupFailures`, `refusals`, and `credentials`.
True declares complete retained coverage for that category; no events with true
is an explicit declaration of none, not absence inferred from a blank list.
Partial/unknown credential coverage is false. Capture retains the observations
and a `credential-coverage-missing` blocker rather than fabricating missing uses.
The other close fields and observer attestations remain unchanged.

The guided observer adds the credential events only for the selected new journal
version. It shows the original and last-declared state separately; displayed
event counts are not proof of completeness. `useful-result` is not offered until
an actual-use event exists. Each proposed event still requires explicit review
and save against the displayed head. EOF, pause or Ctrl-C never invents a use,
consent, result or close; reconcile uncertain writes before any manual re-entry.

## Preparation-only migration

The supported migration is a **create-only fork**, not an in-place format edit.
`migratePreparationDraft` and `migrateCapture` require a legacy source at revision
zero, exactly its preparation history, and no session events. A journal with any
observation or correction is refused, including one whose correction emptied
the effective event list. Never delete revisions to make it preparation-only.

The operator supplies exactly `{declaredAt, reason, startingStatesUnchanged}`.
`declaredAt` is at/after the original preregistration; `reason` is nonempty;
`startingStatesUnchanged` must be true. Migration retains the original population,
identities, settings, starting states, rules and `preparedAt`. It adds provenance
containing `fromVersion`, `sourceHeadSha256`, and that declaration. The new
capture journal begins at revision zero with no observations; it is not a second
claim of first use. Keep the original preparation and reviewed head alongside it.

Future authorized command forms, **not executed during this authoring phase**:

```sh
# Explicit version selection; input remains the existing preparation schema.
node scripts/human-first-use-capture.mjs prepare \
  --input /absolute/private-study/preparation.json \
  --store /absolute/private-study/new-credential-journal \
  --capture-version 2026-09-10.1

# Guided preparation still requires full-roster review and explicit create.
node scripts/human-first-use-observer.mjs prepare \
  --input /absolute/private-study/preparation.json \
  --store /absolute/private-study/new-guided-credential-journal \
  --capture-version 2026-09-10.1

# Only an actually unobserved legacy preparation may be forked.
node scripts/human-first-use-capture.mjs migrate \
  --store /absolute/private-study/retained-legacy-preparation \
  --expect ACTUAL_REVIEWED_SOURCE_HEAD_SHA256 \
  --input /absolute/private-study/migration-declaration.json \
  --out /absolute/private-study/new-migrated-journal
```

The uppercase head and paths are illustrative placeholders, not admissible
evidence or recommended literal locations. Supply real reviewed values only at
the later authorized execution boundary. The guided observer has no migration
command; migration uses the reviewed low-level capture command above.

Migration first loads and admits the reviewed source, then re-reads the source
head before creating the destination. A changed head is a conflict, not a reason
to adopt a newer head silently. The destination must be new and disjoint from
the source: same path, ancestor/descendant overlap and existing output are refused.
No prior bytes are overwritten or deleted by the supported migration path.
This re-read is not an atomic lock on all filesystem writers. Use private stable
directories and reconcile the retained source/fork; hostile concurrency and all
possible interleavings are not qualified by a source inspection or one regression.

### Refusals and safe recovery

| Condition | Source refusal/blocker | Required disposition |
| --- | --- | --- |
| Observed or corrected legacy journal | `migration-observed` | Keep original events, recording and blocked export. No retrospective conversion or deletion. |
| Non-legacy migration source | `migration-version` | Retain its declared version; do not downgrade or force migration. |
| Stale or advancing reviewed head | `revision-conflict` | Read/reconcile retained revisions; never blind-retry at a substituted head. |
| False unchanged-start declaration | `migration-baseline` | Do not repair or relabel the baseline. Resolve the real protocol deviation. |
| Migration before preregistration | `migration-order` | Correct only genuinely mistaken declarations through reviewed provenance, not fabricated times. |
| Overlap or existing destination | `output-overlap` / `output-exists-or-unavailable` | Preserve original/partial output and select a genuinely new disjoint destination. |
| Revision-version mismatch | `version` | Preserve versions; no in-place upgrade or silent downgrade. |
| Unsupported use at that point | `credential-use-conflict` | Retain the actual evidence gap outside an inadmissible event; never borrow a later state or invent an observation. |
| Incomplete credential observation | `credential-coverage-missing` | Retain partial observations and blocked export; do not declare completeness without evidence. |

Not every invalid candidate can be appended: shape/order contradictions are
refused before persistence. Preserve the original observation/candidate privately
and resolve it with the study owner rather than changing facts to satisfy the
schema. Core-valid closes with coverage/evidence blockers remain closed-blocked.
An already observed legacy cohort cannot be restarted under a new ID and called
its original first use. This guide offers no automatic migration of such evidence.

## Export, comparison and evidence boundaries

Versioned export uses intake schema `2026-09-10`. A failed/incomplete task with no
use can remain admissible with missing starting credentials and null useful-result
metrics. Unknown assistance is supported. No-shows, open sessions, incomplete
credential coverage, missing recordings and other inadmissible entries keep the
entire export blocked: `report.json` plus all retained journal revisions, without
`study.json` or a successful subset. Distinct recording bytes and existing
containment/hash rules are unchanged. An existing export is never overwritten.

Cohorts retain starting credential state, not repaired/final state. The credential
contract version separates new cohorts from legacy cohorts. Unknown starting
state still prevents matched comparison, even when later use is known; it is not
retroactively configured. Actual use, failure, repair and assistance are outcomes,
not excuses to remove planned entries. AMC-only evidence is not a matched
AMC/DSH/Pi study, and automated records never count as genuine human evidence.

Recording hashes and journal links bind supplied bytes relative to retained
references. They authenticate neither humans, consent, clocks, first use, model
identity, remote inference nor answer correctness. Credentials are enum-only in
this block, and unknown fields are rejected without echoing their contents;
other allowed narratives/labels are not a general secret-detection system.
Do not paste secrets or identifying details. Journals and study JSON retain
private narratives; review and restrict them separately from public summaries.

## Source and regression handoff

Implementation surfaces are `scripts/human-first-use-capture.mjs` (versioned
preparation/replay/migration/export), `scripts/human-first-use-intake.mjs`
(`validateCredentialEvidence`, version dispatch and starting-state cohorts), and
`scripts/human-first-use-observer.mjs` (explicit opt-in, reviewed event/close UI).
This guide/test continuation does not rewrite those existing scripts.

`tests/humanFirstUseCredentials.test.ts` authors positive and refusal cases for
legacy/new isolation, immutable preparation, chronological changes/use, equal-time
ordering, later credential loss, operator/unknown assistance, coverage blockers,
strict fields, preparation-only migration, observed/corrected refusal, a controlled
moving-head interleaving, disjoint/exclusive output, prior-byte retention, complete
roster export, starting-strata separation and public capture/observer entrypoints.
All data, including affirmative human flags used to reach cohort projection, is
explicitly synthetic. The cases are **authored, not executed, typechecked, passed
or mutation-qualified**. No test count is offered as coverage evidence.

The current continuation record is under
`AMC_OS/RESEARCH/2026-09-10-amc-1512-credential-transition-contract/authoring-completion/`.
Earlier evidence-transfer mappings remain dated legacy artifacts; their next
version must deliberately bind capture version, migration provenance, actual-use
events and independent provider/review references without rewriting old evidence.
Complete remaining Phase A implementation before the separately authorized fresh
pinned-candidate qualification and genuine provider/human collection. No command
in this guide lifts the execution hold or the standing Done/external gates.

## Recovery addendum — credential contract `1`, 2026-09-10

Task key: `amc-1512-credential-authoring-recovery-2026-09-10`.
The regression file, guide and scoped addenda were late-present when this
recovery reconciled the stalled predecessor. They are preserved, not recreated
or attributed as new file creations by the recovery. Additional regression
source covers the following boundaries; it remains entirely unexecuted.

**Unknown assistance is sticky.** A later known operator intervention or a
distinct recorded explanation cannot erase an earlier unknown credential actor.
The derived count remains null, not a known lower bound presented as the total.
Incomplete credential coverage is a separate blocker even when assistance is
already unknown. A configured starting state is not evidence of actual use;
an affirmative close without any actual-use observation remains blocked.

**Same-time evidence is not equally expressive at every surface.** Capture
requires model use before useful result in submitted event order, even at equal
timestamps. Direct intake carries only the credential observations and a separate
result timestamp: it admits a supported use at that timestamp but cannot recover
the missing cross-event order. Retain the complete journal for that distinction;
an admissible reduced row does not authenticate a rejected or missing journal.

**Immutable declarations are not external authentication.** Capture freezes its
prepared roster/baseline through its append and correction interfaces. Direct
intake compares the supplied starting-state fields; it cannot independently
establish the original preregistration when both supplied fields were falsified.
A migration's `startingStatesUnchanged: true` must reflect an actually unchanged
starting condition. Do not affirm it after configuring credentials between
preparation and migration. Source-head rereading is optimistic conflict detection,
not a cross-directory transaction or protection against every hostile writer.

**Current execution authority.** Sole CoS authoring continues. Historical guide
directions to delegate validation to workers or Codex are not current authority.
No tests, checks, builds, imports, fixtures, acceptance, providers or human
sessions may run yet. Next is the separately versioned provider-to-human
transfer mapping/blank-sidecar extension named in the preserved predecessor
NEXT_ACTION.md, not execution of the examples in this guide.

Recovery receipt and role handoff:
`AMC_OS/RESEARCH/2026-09-10-amc-1512-credential-transition-contract/authoring-completion/stall-recovery/`.


## AMC-1512 terminal credential carry-forward continuation 2026-09-10

Scope: capture `2026-09-10.1`, intake `2026-09-10`, credential contract `1`.
This addendum extends the existing guide and regression source; it does not
replace their earlier authoring or change the legacy defaults. **AUTHORING ONLY;
UNEXECUTED / UNQUALIFIED.** No command, fixture or observation was run to write it.

A participant may repair missing credentials without an observed model use.
For a failed or incomplete first attempt, retain that change, the originally
missing starting state and `model.used: false`; configuration is not inference.
An affirmative close without an actual-use observation remains a
`credential-use-missing` evidence blocker, not a retrospectively invented use.
This is distinct from a contradictory use event, which can be refused before
persistence. The useful-result timestamp remains null for that unsuccessful
first attempt; a credential change alone is not a useful answer or submitted task.

For repeated use, retain every use at its position in the credential timeline.
A repair after a loss must precede the subsequent use even when all three events
share a timestamp. A final loss does not delete either supported earlier use or
rewrite the starting state. An operator change is counted once as assistance;
an earlier unknown actor still keeps assistance unknown despite later known
changes. These rules do not turn declared events into authenticated inference.

`tests/humanFirstUseCredentials.test.ts` now additionally authors the two
failed/incomplete repair-without-use cases and a repeated-use/final-loss case,
including unsupported-close and same-time ordering counterexamples. Existing
migration/refusal, immutable-state, unknown-assistance, version-isolation and
full-roster blocked-export cases are retained. This is an inventory of authored
assertions, not a passing count or a claim of coverage sufficiency.

Full-roster export and migration boundaries above are unchanged: do not filter
blocked entries, relabel old cohorts, migrate an observed/corrected journal or
rewrite an earlier receipt. The separately versioned evidence-transfer mapping
is a next implementation task, not permission to run the capture or test suite.
Current continuation receipt/handoff location:
`AMC_OS/RESEARCH/2026-09-10-amc-1512-credential-transition-contract/authoring-completion/terminal-credential-contract-continuation-2026-09-10/`.

## September 11, 2026 — migration correction chronology

Scope: capture `2026-09-10.1`, intake `2026-09-10`, credentials `1`.
Task `amc-1512-credential-contract-finalization-2026-09-11` preserves the earlier
implementation, regression source and guide. This is a bounded source correction
and additional unexecuted regression authoring, not a new study or qualification.

A migrated preparation deliberately retains its original `preparedAt`. The
earliest declaration within the new journal is nevertheless its explicit
`migration.declaredAt`. A correction's `declaredAt` must be at or after that
migration, even when both the old and replacement event lists are empty. It must
also remain at or after every replaced/replacement observation and observer
attestation. Equality is permitted; timestamps are not automatically advanced.
The persistence `savedAt` is still not an observed event or declaration time.

Previously, event replay already used the migration boundary, but the correction
check used only the older preparation timestamp plus event/attestation times.
The empty-list case could therefore admit a pre-migration correction. The source
now uses the same existing `observationBoundary` for both paths and returns
`correction-order` for this contradiction. No executed failure or pass is claimed.
Legacy `2026-09-09.1` and new non-migrated preparations retain their original
preparation floor; their valid byte serialization and original refusal wording
are unchanged by this correction. No format identity is silently relabelled.

An invalid correction is refused before append. Loading an existing journal with
that contradictory revision also refuses; export emits no apparently valid prefix.
Preserve the entire original journal and private rejected declaration. Do not
delete the offending revision, invent a later timestamp, downgrade the reader or
re-run a session to disguise it as original first use. Resolve genuine declaration
errors through the independently reviewed recovery procedure; this patch supplies
no automated repair or exemption for already observed evidence.

A valid empty correction does not create observations, model use or an admissible
participant. Every original roster entry remains in the blocked report. Supported
failed/incomplete outcomes and assistance unknowns remain representable once all
entries are genuinely closed and admissible. Local declaration consistency and
byte retention do not authenticate humans, migration timing or provider activity.

Additional regression source: `tests/humanFirstUseCredentialMigrationBoundary.test.ts`.
It specifies pure-state, actual local append/CLI refusal, cold journal rejection,
legacy/non-migrated compatibility and migrated blocked/complete-roster export
with synthetic failures and unknown assistance. Existing credential regressions
are preserved. All regressions remain UNEXECUTED / UNQUALIFIED.
Receipt: `AMC_OS/RESEARCH/2026-09-11-amc-1512-credential-contract-finalization/`.
The next separate implementation remains version-labelled evidence-transfer
mapping and a blank review sidecar; no execution hold or Done gate is lifted.
