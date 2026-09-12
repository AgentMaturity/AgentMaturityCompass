# Guided human first-use observer

> September 11, 2026 — explicit preparation version `2026-09-11.1` adds
> unknown-preserving revision prompts with required reasons and reviewed typed
> declarations. See [Model revision](HUMAN_FIRST_USE_MODEL_REVISION.md). Legacy
> prompts/defaults remain; authored source is not qualification or authority to run.

> Version notice — 2026-09-10: the original walkthrough below is legacy-default.
> See [Credential transitions](HUMAN_FIRST_USE_CREDENTIAL_TRANSITIONS.md) and the
> dated addendum for opt-in capture `2026-09-10.1`. Historical executor/validation
> directions do not override the current sole-CoS instruction or execution hold.

Local terminal workflow for **AMC-1512 / AMC-1518**, authored 2026-09-09.
Implementation and synthetic regression source are **not execution qualification
or collected human evidence**. Codex owns integration and final validation.

`scripts/human-first-use-observer.mjs` adds guided preparation, resumable event
entry, readable status and reviewed export over the unchanged
[capture core](HUMAN_FIRST_USE_CAPTURE.md) and
[intake/protocol](HUMAN_FIRST_USE_STUDY.md). It uses Node built-ins and those local
modules only. Use the repository-supported Node environment; no package alias,
dependency installation, build, DSH/Pi component or provider access is required.

The interface does not record a screen, start a study, recruit people, contact a
model, execute shell commands/harnesses, collect credentials, launch a browser or
server, upload media, authenticate participants or mark an issue Done. Arrange
the consented study and independent observation separately under the common
protocol. This implementation does not supply those people or observations.

## Start here

Run from a checkout containing the integrated script. Replace these illustrative
absolute paths with private local paths. Parent directories must already exist;
new journal and export directories must not exist.

```sh
node scripts/human-first-use-observer.mjs --help
node scripts/human-first-use-observer.mjs protocol

# Guided metadata and full planned roster; nothing is created before review.
node scripts/human-first-use-observer.mjs prepare \
  --store /absolute/private-study/new-journal

# Alternative: read an independently reviewed preparation JSON, then review
# the entire population in the terminal before explicitly choosing create.
node scripts/human-first-use-observer.mjs prepare \
  --store /absolute/private-study/new-journal \
  --input /absolute/private-study/preparation.json

node scripts/human-first-use-observer.mjs observe \
  --store /absolute/private-study/new-journal

# Resume a particular existing roster entry, never an invented/replacement ID.
node scripts/human-first-use-observer.mjs observe \
  --store /absolute/private-study/new-journal --session SESSION_ID_FROM_ROSTER

node scripts/human-first-use-observer.mjs status \
  --store /absolute/private-study/new-journal

# Prompts for the evidence root, new output, reviewed head and confirmation.
node scripts/human-first-use-observer.mjs export \
  --store /absolute/private-study/new-journal

# Explicit paths can also be supplied; head review/approval is still required.
node scripts/human-first-use-observer.mjs export \
  --store /absolute/private-study/new-journal \
  --evidence-root /absolute/private-study/recordings \
  --out /absolute/private-study/new-export
```

`prepare`, `observe` and `export` require an interactive terminal. Piped approval
scripts are refused at the native CLI boundary. `status`, `protocol` and `--help`
are read-only and do not prompt. Every flag may appear once; there is no force,
overwrite, auto-confirm, execute-harness or destructive repair option.

At any prompt, `:help` or `?` prints help; `:pause`, `:quit` or `:cancel` exits
without fabricating an observation. Menus also offer `pause`. Enter one answer
per prompt: extra pasted lines are not queued as approval of later questions.
Empty answers never select yes, no, zero, completion or an observed outcome.

## Prepare the entire study, not just successful sessions

The wizard requests the study ID, explicit preregistration UTC timestamp,
preparing operator pseudonym/statement, full-window end rule, assistance policy
and total planned roster size. It prints the actual `COMMON_TASK` and
`COMMON_PROTOCOL` imported from intake, rather than a separately authored task
or hash. Read the full participant and observer procedure in the intake guide.

Each planned row explicitly supplies its unique session ID, participation class,
participant/observer pseudonyms, harness/version, actual source and/or installed
artifact pin, study-machine environment and planned model identity/settings.
Choose `source`, `artifact` or `both` for the pins you actually possess; no HEAD,
local environment, example digest or model identity is detected or substituted.
The planned model has no `used` flag. Credential questions ask only for starting
state, never a credential value.

`human-declared` is the planned classification, not an affirmation of presence,
consent, independence or first use. `automated-fixture` stays separate. Explicit
`keyless-demo` means null model identity/settings and no required credential;
it cannot complete the common real-model task. Unknown install/credential starting
states remain unknown and may prevent comparative admission. A later `used=true`
declaration with missing/unknown starting credentials can be unrepresentable to
the unchanged intake; do not falsify the original plan to bypass that limitation.

The complete population and metadata are printed for review. `edit-study` or
`edit-session` re-enters unsaved fields; `create` appears only after the core
accepts the preparation. The file fast path uses the same review, core JSON
reader and `prepareDraft` validation. It does not modify its input file.

Creation delegates to `createCapture` and freezes the population. It creates no
session observations, human attestations or inferred outcomes. Every planned
session starts `unobserved`, not completed. A mistaken roster is not repaired by
silently replacing entries: retain it and resolve the protocol deviation with
the study owner. Capture cannot discover people omitted from the original plan.

## Observe, review and resume

Select an existing planned session. The screen shows its frozen plan, common
task, assistance/window rules, current head and separate first-task, recovery
and voluntary-return state. Menus are suggestions derived from core-validated
history, not an alternate validator. Every proposed event is replayed through
`projectSession` and every save through `appendCapture`.

Before start, only `start` is offered as an event. During the open window,
submitted operations, assistance, setup failures and refusals remain available.
Record one intentionally submitted operation at a time, not keystrokes or an
internally automated operation. Record separately submitted commands separately.
No caller-supplied action total replaces the retained events.

End the first attempt explicitly with `useful-result`, or `first-task-ended`
and a `failed`/`incomplete` outcome plus reason. A useful result is the
participant-observed real-model answer with concrete test inputs and expected
outcomes for all three common-task requirements. An install, help screen, canned
stub, signed receipt or command exit is not that result. A recorded judgement
does not authenticate task correctness.

Recovery follows the first-task disposition: record an `interruption` and its
`resume` disposition, or a `recovery-decision` of not-attempted/not-observed with
a reason. Then record the separate optional second-task return decision. No
follow-up observation means `not-observed`, never an inferred `did-not-return`.
Successful recovery or return cannot convert a failed first task to completed.
The menus do not collapse extra recovery exercises into this single-exercise
protocol; consult the study owner rather than inventing substitute outcomes.

Each event is printed with the selected session and exact expected head. `save`
explicitly confirms that candidate; `edit` re-enters it; `discard` discards only
the current unsaved input. Previously saved events are never removed by those
choices. Closed windows accept no new normal event. The `status` menu shows all
planned sessions; `history` shows this session's private effective event sequence.
Retained revision files also preserve earlier versions and corrections.

### Timestamps and close

Every non-close event asks for either an explicit observed UTC timestamp in
`YYYY-MM-DDTHH:mm:ss.sssZ` form or an explicit `record-now` declaration. Only that
deliberate choice calls `declareRecordNow`; it labels the event
`operator-declared-now` and displays the clock value before save. A clock reading
is not independent observation. Journal `savedAt` and export `generatedAt` are
storage metadata, never substitutes for observed event times.

Close is offered only after first-task, recovery and return dispositions. It
requires an explicitly entered observed close time and an observer attestation
time at/after that close, plus complete-window declarations. There is no
record-now shortcut, future-time calculation or inferred attestation. Supply
actual observed times, never future times invented to satisfy order validation.
Chronology and timestamp syntax remain the core's responsibility.

### Unknown means unknown

| Prompt | Explicit unknown handling |
| --- | --- |
| Did the refusal name an actionable fix? | `unknown` saves `namedFix: null`, distinct from no. |
| Is a category's retained observation list complete? | `partial`/`unknown` declares core coverage `false`; derived measurements remain null, never zero or `[]`. The journal retains observed partial events. |
| Unknown assistance coverage | Null assistance count can be exported. |
| Unknown setup-failure/refusal coverage | The current intake requires arrays, so the whole study export stays blocked. |
| Unknown action coverage | A completed first-task record is blocked, not given an invented action count. Failed/incomplete useful-result metrics stay null. |
| Model use, human presence, independence, consent, first use, window-rule satisfaction | `unknown` is visibly unready: the core requires a boolean. No close is saved and no value is silently chosen. Explicit no remains no, with any resulting admission blocker shown. |
| Required identity, reason or timestamp | `unknown` is unready. Blank re-prompts. No placeholder is substituted. |
| Optional reason/recording reference | Explicit `none`/`unknown` becomes null only where supported. A missing recording reference blocks export. |
| Recovery and voluntary return | Explicit `not-observed` retains the reason and unknown disposition; it never becomes succeeded/returned. |

Declaring coverage complete with no events explicitly declares observed none.
An empty event list without that coverage declaration is not a measured zero.
Close can retain a core-valid but export-blocked declaration; its blockers are
shown before confirmation and remain in status/export. For example, false human
flags do not become true or automatically change the participation class.

## Interruption and conflict safety

Resume `observe` against the same journal. Each completed save is durable through
the existing capture API and the next invocation replays retained history. An
unfinished prompt or preparation draft exists only in memory and is displayed
as private unsaved input on pause/unready exit; it is **not automatically saved**
to a second file or submitted on restart. Retain that displayed draft privately
and review/re-enter it deliberately when needed.

EOF/Ctrl-C does not auto-close a window or create a failure, success, return or
consent event. An already confirmed disk write that began before cancellation
may finish or leave a partial file; cancellation cannot roll it back. Read status
and the actual retained revisions before any re-entry. The interface labels
uncertain writes unconfirmed rather than promising they were never saved.

The head used for a candidate stays fixed through review and append. A competing
writer can advance it. A conflict shows the candidate and offers `review` or
`pause`; review reloads current status and the selected session's effective events.
The command then stops, without retrying at a newer head, merging candidates or
appending the event twice. Compare retained revisions before deciding that an
observation still needs manual entry. Apply the same rule to I/O failures and
partial tails. Do not delete revision files, truncate history or overwrite outputs.

The existing reviewed correction CLI remains the escape hatch:
`node scripts/human-first-use-capture.mjs correct ...`, using the complete
documented correction schema and expected head in the capture guide. There is
no guided destructive repair or roster replacement. Preserve damaged originals
and use that guide's reviewed recovery procedure; do not guess missing events.

## Status and export

Status lists **every planned session**, including unobserved, open and blocked
entries; missing first-task, recovery/return dispositions and coverage remain
visible. Status does not read/hash recording bytes or authenticate anyone.

Export requires an explicit private evidence root and a new absolute output
directory outside both the journal and evidence root. Review the full population,
paths and displayed head, paste that exact digest, and choose `export`.
`finalizeCapture` alone handles full-roster admission, path containment, actual
recording hashing, intake verification, distinct recording bytes, byte bounds
and exclusive output. The interface never supplies a guessed recording hash or
filters the population. It never silently updates a mismatched review head.

A blocked export writes `report.json` and retained journal history but **no
`study.json`**, even when a subset looks successful. A completed roster export
also writes `study.json`; failed/incomplete outcomes and supported unknowns stay
in it. A missing/partial final report is not a complete export. Keep each attempt
and choose a new output path rather than overwriting it.

After integration/qualification, submit a completed study to the existing intake
using the command in the capture guide. Full-roster export is not the same as
successful tasks, complete observations, matched/sufficient human cohorts,
authenticated participation, acceptance, release or issue Done.

| Exit | Meaning |
| --- | --- |
| `0` | Command completed or safely paused. Export specifically wrote the complete-roster study. Not a test pass or human-study result. |
| `2` | Required unknown declaration left the workflow unready, or export wrote a blocked report without a study. Read the displayed state. |
| `1` | Argument/core/I/O refusal, conflict, or cancellation with an uncertain write. Preserve partial artifacts and reconcile. |

## Privacy, trust and validation boundary

Prompts, roster reviews, unsaved candidates and history contain private narratives
and pseudonyms. Terminal scrollback or external session recording can retain them.
Avoid real names, emails, credentials, transcripts and secret-bearing commands.
Control characters in program-rendered values are escaped; this is not a secret
detector or anonymizer. Do not publish the terminal transcript or unreviewed bundle.

Keep journals, recordings and exports under operator-owned private parents with
stable evidence snapshots. The core requests private file/directory modes; manage
platform ACLs separately. Its containment and file-change checks are not a portable
OS sandbox against hostile concurrent filesystem writers. Hashes bind retained
bytes relative to a retained head, not participant authenticity, consent, media
genuineness, source provenance or an independently trusted clock. No recording
content is decoded, copied or uploaded by this workflow.

`runCli(args, { prompt, output, error, now, isCancelled })` is import-safe. The
injected prompt receives `{ id, label, choices? }` and returns text or null for
EOF; `AbortError` is treated as cancellation. `output`/`error` receive strings.
`now` supplies only persistence metadata and deliberately chosen record-now times.
`isCancelled` is checked after prompts and before writes. `createTerminalPrompt`
exposes the native EOF/SIGINT adapter for focused tests. These seams are for
synthetic testing/embedding, not unattended human observation or evidence admission.
Capture helpers and storage are not injected or reimplemented.

Authored regressions: `tests/humanFirstUseObserver.test.ts`. The source covers
scripted real-storage preparation/entry/export, unknowns, failed outcomes,
timestamp/close rules, missing roster rows, no overwrite, cancellation, actual
optimistic-head conflicts, native EOF/SIGINT handling and import safety. The worker
has **not run** tests, scripts/imports, builds, installs, generators or model calls.
Codex should review and integrate the assigned source/test/guide, then validate
the focused observer/capture/intake suite and native terminal behavior in a fresh
pinned candidate, followed by the standing release/qualification process. Retain
source/environment receipts, failures and platform limitations separately.

The implementation handoff is `AMC_OS/INBOX/REV_IMPLEMENTATION_SPECIALIST.md`
inside `/Users/sid/AgentMaturityCompass/tmp/cos-observer-guide`.

## 2026-09-10 addendum — guided credential observations

Only explicit `prepare ... --capture-version 2026-09-10.1` selects the new
contract. Without it, preparation retains legacy behavior. Full-roster review
and explicit create remain mandatory; existing journals retain their version.
The guided observer has no migration command. Use the reviewed capture migration
interface from the [contract guide](HUMAN_FIRST_USE_CREDENTIAL_TRANSITIONS.md)
only at the later authorized boundary, and only for an unobserved preparation.

After start, a new-version non-demo session offers `credential-change` and
`model-use`. Prompts ask for from/to/actor or the actual-use state, never a secret.
The core replays each candidate and saves only after explicit head-bound review.
The useful-result menu requires a prior model-use observation, not merely a
configured state. Status shows starting and last-declared state separately.
Displayed counts are retained entries, not proof of complete coverage.

Close additionally asks whether credential-transition/use coverage is complete,
partial or unknown. Partial/unknown encodes false and retains a closed-blocked
record; it does not invent absent events. Unknown actors keep assistance null;
operator changes count automatically once, so do not duplicate that intervention
as an assistance event. Other intentional actions and distinct help remain explicit.

Pause, EOF and cancellation never auto-create model use or close. Inadmissible
events stay refused; preserve/reconcile the private candidate rather than changing
facts. Full-roster blocked export still writes no subset study. Guided opt-in,
event/close, pause and blocked-export regressions are authored in
`tests/humanFirstUseCredentials.test.ts` and remain UNEXECUTED. No study,
fixture/import, provider, check or acceptance is run or authorized by this addendum.

### Recovery authority — observer capture `2026-09-10.1`, credentials `1`

2026-09-10; task `amc-1512-credential-authoring-recovery-2026-09-10`.
Keep the complete journal: the reduced intake cannot reconstruct the separate
same-time result/use order. Later known assistance never resolves an earlier
unknown actor. See the credential guide's recovery addendum. Sole CoS authoring
supersedes historical worker/Codex validation assignments, not the execution
hold. No preparation, observation or export session is authorized now.

### September 11 boundary note — observer capture `2026-09-10.1`

The separate capture correction command now rejects declarations before the
migration boundary even for an empty effective sequence. Existing journal load
may therefore refuse a contradictory old correction. Preserve its original bytes
and the rejected declaration; do not treat that refusal as permission to remove
a revision, invent a date or repeat a participant's first use. The guided observer
does not add a migration or automatic repair command. See the credential guide's
migration correction chronology. Review prompts, pause behavior, unknown assistance,
full-roster export and the execution hold are unchanged.
