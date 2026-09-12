# AMC-1512 — human first-use operator packet

> Credential contract addendum — 2026-09-10: the original limitation below is
> retained as the legacy capture boundary. Prospectively selected capture
> `2026-09-10.1` / intake `2026-09-10` uses [Credential transitions](HUMAN_FIRST_USE_CREDENTIAL_TRANSITIONS.md).
> Read the dated addendum before preparing a new protocol; no execution is authorized.

Version: `amc-1512-human-first-use/1`, authored September 10, 2026.
**PROTOCOL ARTIFACT ONLY. NO PARTICIPANT HAS BEEN OBSERVED BY THIS TASK.**

This packet operationalizes the standing brief's five real first-use sessions
per harness. It reuses, rather than reimplements,
`scripts/human-first-use-observer.mjs`, `scripts/human-first-use-capture.mjs`
and `scripts/human-first-use-intake.mjs`. Their exact commands, journal semantics
and strict JSON interfaces are documented in [observer](HUMAN_FIRST_USE_OBSERVER.md),
[capture](HUMAN_FIRST_USE_CAPTURE.md) and [study](HUMAN_FIRST_USE_STUDY.md).
The [provider packet](AMC_1512_EVIDENCE_PROTOCOL.md) supplies source/route binding
and dispatch/quality review. Current authorization is writing only: no scripts,
help, preparation commands, fixtures, checks, providers or human studies run now.

## Two outcomes, never blended

AMC-1512's AMC first-use evidence and AMC-1518's matched comparison are linked
but not equivalent. Target at least five genuine human sessions for each of
AMC, DSH and Pi, with an equal declared matched cohort. This minimum is a design
requirement, not a collected count or a statistically representative sample.
An AMC-only packet can retain valuable observations; it cannot obtain the
existing intake's complete matched-three-harness disposition.

Automation, scripted providers, agent personas, operator dry runs and synthetic
recordings belong in explicitly separate datasets. A paid provider sample with
an automated operator is real inference but not a human session. An observer's
attestation and a valid recording hash are declarations and byte-binding, not
independent authentication of personhood, consent, clock accuracy or first use.

## Preregistration packet

Use `human-plan.template.json` as an unfilled planning worksheet, not direct
capture input. Before recruitment/recording, an authorized human operator must
fill and freeze a real study plan containing:

| Required item | Decision to record before observation |
|---|---|
| Study authority | Study ID, responsible operator and independent observers; private consent/identity register location, retention deadline, withdrawal/deletion policy and allowed redacted publication. No names or contacts in repository/Linear/vault records. |
| Exact task | Unchanged common protocol/task identifiers and exact prompt bytes from the existing intake contract; verified task/settings digests at the later authorized qualification boundary. Never copy a fictional example hash. |
| Candidate | Committed AMC source and installed artifact pins; actual versions/commits/artifacts for DSH and Pi; clean starting installation and environment per session. The brief's comparator pins are historical defaults, not silently upgraded to current main. |
| Route and environment | Same machine class, OS/version/architecture/Node, model/provider/revision/settings and declared credential starting state for each matched cohort. Preserve harness-specific system prompts and permissions as limitations rather than claiming identical execution semantics. |
| Roster | Pseudonymous participant and observer IDs, unique session IDs, first-use status per harness, fixed order and all planned sessions. No fabricated placeholder people. Capture requires its full preregistered roster at export. |
| Order and learning | Counterbalance harness order and record the method before outcomes. For within-person use across harnesses, use one stable participant ID and record order/carryover. Do not call repeated practice with a harness first use. Do not imply five human sessions are five independent model-quality trials. |
| Boundaries | First-task time limit, assistance policy, interruption/recovery trigger, optional-return observation interval, whole-window closing rule and recording time source. Fill exact limits before recording; this packet supplies no invented elapsed times. |
| Failure handling | Keep all setup failures and incomplete sessions, prespecify deviation rules and preserve the original roster. Replacement recruitment needs an amendment; it does not erase a failed participant. |

The protocol's one-step, 512-output-token, no-tools primary task is fixed by the
existing common task contract. No delegation, extensions, MCP, background public
checks or undisclosed skills/presets may be added. Record any unavoidable native
prompt/configuration difference and any route-specific settings. A settings or
model change after outcomes is a new cohort, not a repair of the old result.

**Credential-transition limitation:** the existing capture freezes starting
credential state, while intake requires configured/not-required credentials
when `model.used` is true. A session starting missing/unknown and later obtaining
a model response cannot presently be exported truthfully through that contract.
Do not relabel its starting state, set modelUsed false, delete it, or call a new
prepared session its original first use. Preserve its full journal/private
recording and a blocked-export disposition plus the actual transition timeline.
It remains an open measurement/schema issue for separately authorized
implementation. A preregistered preconfigured-credential cohort measures that
declared starting condition only, not end-to-end credential onboarding.

Remote model revisions may be unavailable. Do not invent a revision to satisfy
matching: record the limitation and withhold an exact matched-model claim until
the protocol can support it. Planned provider/model/settings identity is kept
even when setup prevents use; failure is part of the cohort, not exclusion.

## Participant briefing card

Read the same neutral briefing to each participant, adapted only for the
preregistered harness name:

> This session evaluates the tool, not you. Use the supplied starting environment
> and instructions to complete the task below. You may ask for help, stop or
> decline recording without being graded. Tell the observer when you think you
> have a useful answer. Setup problems and error messages are part of the study.
> Do not paste account secrets into the terminal or recording. After the first
> task there is a separately observed recovery exercise and an optional second
> task; choosing not to do the optional task is acceptable.

Obtain explicit real consent before recording; consent language does not prove
consent was obtained. Store any withdrawal or recording refusal privately and
report the resulting evidence limitation without coercion. The observer should
not recruit participants into the result merely by assigning pseudonyms.

Task card, exact primary prompt without trailing newline:

> Draft three acceptance tests for a CLI that imports JSONL, rejects malformed records, and reports partial failures.

Do not show the participant a model answer or coach them toward the review
rubric. Supply only the preregistered public entry documentation; record any
extra hint, copied command, configuration intervention or explanation as
assistance. Do not exclude the setup time by starting the clock at first reply.

## Observer procedure and event sheet

The independent human observer records actual events through the existing
guided tool only when execution is authorized. In a real TTY, review every
candidate event and the current journal head before confirming. Blank input is
not yes/no/zero. EOF or interruption does not auto-close a session.

| Observation | Capture event / required evidence |
|---|---|
| Start | `start` at the actual beginning of the declared setup/task window; recording/time-source reference. |
| Intentional action | One `submitted-action` for each intentionally submitted command, navigation, button or configuration operation under the existing counting rule. Split intentionally submitted chained commands; do not count keystrokes or automatic internal calls. |
| Assistance | `assistance` with a factual description, including observer-typed actions. Record who performed an action in the narrative; no silent rescue. |
| Setup failure | `setup-failure` with actual supported code/message reference and effect on progress. Do not invent a failed-provider request when admission never dispatched. |
| Refusal | `refusal` with recorded code and `namedFix` true/false/null. Record whether an actionable fix was actually supplied; do not infer it from the observer knowing a command. Correct policy denial is distinct from poor explanation. |
| Useful answer | `useful-result` only on actual participant judgement with an answer reference and contemporaneous time. Reviewer quality criteria are recorded separately in the review form. |
| No useful answer | `first-task-ended` with failed/incomplete and real reason. No useful-result time/actions is null, not zero; preserve terminal output and failures. |
| Recovery | After first-task termination, `interruption`, then `resume`, or an explicit `recovery-decision` when not attempted/not observed. Keep the original session/owner and same approved route; never manufacture Ctrl-C timing after a turn already finished. |
| Optional return | `second-task`: returned, did-not-return, or not-observed with reason and actual timing. The participant decides; an instructed mandatory recovery turn is not voluntary return. |
| Close | `close` only after the declared whole observation window, with honest completeness booleans, actual modelUsed, observer attestations and an actual recording path. Unknown completeness is not an empty failure list. |

The optional second-task prompt is:

> Add an acceptance test for an empty JSONL file.

Freeze the return interval before the first session. `did-not-return` means the
whole interval was actually observed without return; `not-observed` means the
observer cannot know. Do not close the session immediately after a useful first
answer if recovery/return observation is still outstanding. Actual observer
attestation time must not precede the observations it attests.

Recovery checks use only supported public controls in a separately declared
turn. Record cancellation requested, command exit, session release, subsequent
resume and history continuity separately. Resume failure is retained even if
the original answer was useful. No broad process kill, signed-policy widening,
new provider or shadow session is a valid recovery shortcut. Network-drop and
crash behavior are not established by a graceful Ctrl-C exercise.

## Independent useful-result review

Use the provider packet's three criteria: concrete valid JSONL import, concrete
malformed-record rejection, and mixed valid/invalid partial-failure reporting,
each with expected outcomes. Preserve the participant's useful-result judgement
and timestamp unchanged even when the independent reviewer disagrees. Report
both participant-declared usefulness and rubric-met answer quality; do not turn
disagreement into a quietly recoded completion or a retrospective faster time.

The review form is a sidecar, not new fields to inject into strict intake JSON.
It records actual answer/recording references, observer/reviewer pseudonyms,
per-criterion met/unmet/unknown and reasons, dispatch support, protocol deviations,
credential transitions, expected and observed roster, and export/verification
dispositions. Unfilled template nulls are not observations of missing evidence.

## Journal, recording and export integrity

Use the existing append-only revision chain and expected-head checks. Corrections
are new revisions with reasons, not edits of prior events. On uncertain write
delivery, inspect the existing head before deciding what happened; never blindly
resend. Keep the original roster and all corrections in the export.

Actual recordings must meet the unchanged intake/capture containment, regular
file, uniqueness and hash rules. Use pseudonyms and private consent records;
recordings can still contain sensitive data, so restrict access and retain only
what the consent permits. A redacted derivative gets a new digest and explicit
mapping; it is not the original file under the original hash. No synthetic
recording, copied session or empty fixture can stand in for a real session.

Only a complete, admissible whole-roster export can emit `study.json`; blocked
export retains its report and journal instead. The existing final `report.json`
is the completion marker; directory existence or a partial file is not success.
The intake's exit 0 means structural validity and enough declared matched human
rows under its rules, not successful tasks, genuine humans, consent validity,
provider authenticity or a release gate. Preserve nonzero/error reports too.

## Analysis contract

Report exact preregistered, attempted, completed, failed, incomplete, unavailable
and excluded-with-reason counts for every harness and cohort. Retain unmatched
or invalid observations in the audit inventory; do not selectively export only
the convenient rows. Show the full denominator and unknowns alongside any rate.

- First-useful-result time is actual useful timestamp minus start; actions are
  actual intentional actions through that moment. Summaries are conditional on
  observed useful results and must show sessions with no useful result beside
  them. Do not assign failed sessions zero seconds/actions or silently censor
  them out of completion rates.
- Named-fix reporting separates true, false and unknown refusal counts. A
  known-only rate requires its explicit true+false denominator and unknown count;
  with no known refusals the rate is unavailable, not 100 percent.
- Resume reporting separates attempted success/failure from not-attempted and
  not-observed, with reasons. Optional return reporting similarly separates
  observed return/nonreturn from unknown observation windows.
- Participant IDs/order expose repeated measures and learning. Small declared
  matched cohorts support descriptive results, not market-wide superiority,
  causal ranking, the brief's target time/action thresholds, or a "10x" claim.

Keep automated conformance counts, model-quality results and human observations
in separate tables. No composite of them is a human usability score. No metric
is computed in this authoring task; the forms contain no results or fabricated
participants. AMC-1512 remains open until actual evidence and the standing Done
gates are met. AMC-1518 and platform/release obligations remain separate.

## 2026-09-10 version-labelled addendum — credential contract 1

The underlying common task and this packet's human/provenance requirements do
not change. Record the chosen capture/intake/credential contract versions in the
approved private planning sidecar, not as extra fields in strict prepare JSON.
Default capture remains legacy. Only the explicit new-version opt-in supports
prospective starting-state/change/actual-use observation without relabelling the
baseline. Earlier worksheet and evidence-transfer packets remain dated artifacts.

For the new version, after observed start record each genuine credential-state
change and its actor, and each declared actual model use with its state at that
point. Preserve provider/request/answer/recording references in the independent
review sidecar: the enum and a local journal hash do not prove remote inference.
Never infer use solely from an answer, configuration success or a verifier exit.

An operator credential change counts as assistance once; unknown actor means
unknown assistance, not zero. Keep the intentional-action rule and separate
distinct advice. New close completeness includes credentials across the whole
window. Missing/partial credential coverage blocks the entire study export while
retaining observations; no-shows, open sessions, refusals and failures stay visible.

The legacy limitation section still applies to old journals. Migration never
upgrades an already observed or corrected session. It only creates a new disjoint
fork of an unobserved preparation with unchanged roster/start and reviewed-head
provenance. Do not delete events, invent a transition, or call a repeat attempt
original first use. Starting-state and contract-version strata remain separate;
unknown starting state still blocks matched comparison after later repair.

The new [contract guide](HUMAN_FIRST_USE_CREDENTIAL_TRANSITIONS.md) and
`tests/humanFirstUseCredentials.test.ts` are authored, not executed evidence.
No people, consent, model identity, usage, quality result, timing, passing tests
or Phase A completion follows from these additions. Keep the current execution
hold and all fresh-candidate, genuine-observation and standing Done gates.

### Recovery authority — capture `2026-09-10.1` / intake `2026-09-10` / credentials `1`

2026-09-10; task `amc-1512-credential-authoring-recovery-2026-09-10`.
Preserve full journals and original starting conditions; consistent intake fields
alone do not authenticate preregistration. Do not affirm unchanged migration
baseline after intervening credential setup. Unknown assistance and missing
credential coverage remain different conditions. See the credential guide's
recovery addendum. Sole CoS source authoring continues; all tests/checks/builds/
imports/fixtures/acceptance/providers/human sessions remain held.

### September 11 correction-boundary review — credential contract `1`

Retain both original preparation and migration provenance when reviewing a
capture `2026-09-10.1` journal. Correction declarations must not predate migration,
even when they leave no effective events, and must cover replaced/replacement
observations and attestations. The capture reader's `correction-order` admission
is not authentication of those dates. A refused journal stays preserved and cannot
be replaced by a selected successful subset or fictitious new first-use session.
Direct intake still lacks the full journal chronology. The independent versioned
transfer/review sidecar remains the next separate artifact requirement; no fields
are added to strict intake inputs. All new assertions are unexecuted source only.

## September 11, 2026 — transfer/2 roster and review companion

Task `amc-1512-evidence-transfer-v2-2026-09-11` delivers a separately versioned
mapping and blank review sidecar in
`AMC_OS/RESEARCH/2026-09-11-amc-1512-evidence-transfer-v2/`:
`CAPTURE_INPUT_MAPPING.v2.md`, `EVIDENCE_TRANSFER_PROTOCOL.v2.md`, and
`evidence-transfer.v2.template.json`. These target capture `2026-09-10.1`, intake
`2026-09-10` and credentials `1` without changing strict inputs or the legacy packet.

Retain one sidecar row per original roster entry, all correction occurrences,
each actual-use join and all blocked/unobserved/failed/incomplete dispositions.
Unknown assistance never becomes zero, and intake admission does not establish
the missing original/migration or same-time cross-event chronology. Independent
provider/answer/consent/presence/first-use reviews remain separate from participant
judgements and original times. Null collections mean unfilled, not observed none;
catalog prototypes are not participants, requests or review findings.

This companion is manual documentation, not an automated validator or a populated
study. All tests/checks/builds/imports/fixtures/acceptance/provider/human execution,
candidate qualification and standing Done/external gates remain held.
