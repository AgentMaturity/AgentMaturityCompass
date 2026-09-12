# Human first-use observer capture

> September 11, 2026 — prospective capture `2026-09-11.1` adds typed nullable
> model revision declarations while retaining credential contract `1` and legacy
> defaults. See [Model revision](HUMAN_FIRST_USE_MODEL_REVISION.md). Source and
> regressions are authored, not executed; no automatic migration enters that version.

> Version notice — 2026-09-10: the original text below describes legacy capture
> `2026-09-09.1`. The opt-in `2026-09-10.1` credential contract and preparation-only
> migration are defined in [Credential transitions](HUMAN_FIRST_USE_CREDENTIAL_TRANSITIONS.md)
> and the dated addendum below. Historical executor/validation directions do not
> override the current sole-CoS instruction or execution hold.

Local operator workflow for **AMC-1512 / AMC-1518**, authored 2026-09-09.
Implementation and regression authoring are not execution qualification or human
study evidence. Codex owns integration and final validation.

`scripts/human-first-use-capture.mjs` is a dependency-free, import-safe Node ESM
CLI. It preregisters a planned population, retains explicit observer events and
corrections, and exports records for the existing
[human first-use intake](HUMAN_FIRST_USE_STUDY.md). Use the repository's Node 22
environment (`.nvmrc`). No package alias, build, installer, DSH or Pi dependency
is required by this standalone script.

The tool does **not** recruit people, execute a harness/model, acquire credentials,
record a screen, decode media, upload evidence, authenticate humans, judge task
correctness, rank outcomes or close a Linear issue. Obtain consent and conduct the
study separately, following the existing common-task and observer protocol.

## What a completed export means

Preparation is never a completed session. A roster entry without events stays
`unobserved`; a started but unclosed entry stays `open`. Every entry remains in
status and export reports. The population, pseudonyms and planned settings cannot
be edited out of a journal or replaced by successful participants.

`complete-roster-export` means **all preregistered sessions** are closed, their
records satisfy the existing intake schema and their distinct local recording
bytes match the hashes derived by capture. It does not mean successful tasks,
complete observations, sufficient/matched human cohorts or authenticated evidence.
A failed or incomplete first task is exportable with null useful-result timestamp
and action count. Successful later recovery does not change that first-task outcome.

Unknown assistance exports as null. Explicit unknown recovery and voluntary-return
dispositions remain unknown. Unknown setup-failure/refusal coverage cannot be
represented as a valid array by the existing intake schema: capture retains the
events and gaps but **blocks the entire study export**, rather than inventing `[]`.
An unobserved action count also blocks a completed useful-result record. No subset
study, best-result selection or automatic downsampling is emitted.

## Commands and outputs

Use existing private parent directories. JSON input, journal, evidence-root and
export paths are absolute local paths. New journal/export directories must not
already exist. Export directories must be outside both the journal and evidence
root. The CLI does not create missing parent directories.

```sh
node scripts/human-first-use-capture.mjs --help
node scripts/human-first-use-capture.mjs protocol

node scripts/human-first-use-capture.mjs prepare \
  --input /absolute/private-study/preparation.json \
  --store /absolute/private-study/new-journal

node scripts/human-first-use-capture.mjs status \
  --store /absolute/private-study/new-journal

node scripts/human-first-use-capture.mjs event \
  --store /absolute/private-study/new-journal \
  --expect HEAD_SHA256_FROM_LATEST_STATUS \
  --session SESSION_ID_FROM_THE_ROSTER \
  --input /absolute/private-study/event.json

node scripts/human-first-use-capture.mjs correct \
  --store /absolute/private-study/new-journal \
  --expect HEAD_SHA256_FROM_LATEST_STATUS \
  --input /absolute/private-study/correction.json

node scripts/human-first-use-capture.mjs export \
  --store /absolute/private-study/new-journal \
  --expect HEAD_SHA256_FROM_LATEST_STATUS \
  --evidence-root /absolute/private-study/recordings \
  --out /absolute/private-study/new-export
```

Replace uppercase placeholders with the reviewed current values. Every successful
write returns its new `headSha256`. Read status again after interruptions or
conflicts; do not reuse an old head or blindly repeat an observation. All flags
are strict and may appear once. `--record-now` is an optional valueless flag only
for `event`; all other flags require values. `protocol` prints the actual
`COMMON_PROTOCOL` and exact `COMMON_TASK` imported from the existing intake.

| Exit | Meaning |
| --- | --- |
| `0` | Command completed. For export, a full-roster study was written. Neither interpretation is a test pass, successful human task or release acceptance. |
| `2` | Export wrote a blocked report and journal archive, but **no `study.json`**. Review every missing/open/blocked session. |
| `1` | Argument, sequence, declaration, conflict, input or I/O refusal. Preserve any partial newly created output. No complete bundle is implied. |

An export directory contains `journal/r-00000.json` and every following retained
revision byte-for-byte, plus `report.json`. Only an unblocked export also contains
`study.json`. The report is the last file written and binds the study bytes with
`studySha256`, the journal head, revision hashes and the complete planned-session
inventory. A missing/partial report is not a completed bundle. Media stays under
the original evidence root; archiving a journal does not copy recordings.

Run the existing intake on a completed export after integration/qualification:

```sh
node scripts/human-first-use-intake.mjs \
  --input /absolute/private-study/new-export/study.json \
  --evidence-root /absolute/private-study/recordings \
  --out /absolute/private-study/new-intake-report.json
```

That intake can still report insufficient comparative cohorts. Capture does not
override its standing sample target, model matching, automation exclusion or
independent evidence requirements. Retain capture's report and journal beside
the intake report: intake alone cannot discover omitted preregistered sessions.

## Exact preparation and draft schema

All JSON is UTF-8. Duplicate members (including escaped aliases), unknown fields,
omitted required fields, controls in text and excessive nesting are refused.
Null is permitted only where explicitly stated. Timestamps use actual UTC calendar
values in `YYYY-MM-DDTHH:mm:ss.sssZ` form. IDs are lowercase ASCII letters/digits
followed by lowercase letters/digits, `_` or `-`, up to 64 characters; participant
and observer pseudonyms use intake's `p-…` and `o-…` syntax.

Preparation input has exactly these keys:

| Key | Required value |
| --- | --- |
| `studyId` | Study ID. |
| `preparedAt` | Operator-declared preregistration timestamp, not inferred from invocation. |
| `operator` | Exactly `id` (observer pseudonym) and nonempty `statement`. This is preparation metadata, not an observation attestation. |
| `protocol`, `task` | Exact common protocol object and task string returned by `protocol`; alternate tasks/versions are refused by this capture version. |
| `observationWindowRule` | Nonempty declared end rule covering first-task, recovery and voluntary-return observation. |
| `assistancePolicy` | Nonempty declared assistance policy, fixed across the intended comparison. |
| `plannedSessions` | Nonempty ordered roster of at most 2000 entries; no duplicate session IDs or participant/harness pairs. |

Every planned session has exactly `sessionId`, `participation`, `participantId`,
`observerId`, `harness`, `environment`, and `model`. `participation` is explicitly
`human-declared` or `automated-fixture`; this classification declares intent, not
that anyone has already participated.

`harness` has `name` (`amc`, `dsh`, `pi`), nonempty `version`, nullable
`sourceCommit` (full lowercase 40-hex commit), and nullable `artifactSha256`
(lowercase 64-hex digest). At least one actual identity pin is required.

`environment` has `machineClass`, `os` (`darwin`, `linux`, `win32`), `osVersion`,
`arch`, `nodeVersion` (exact version, optional `v` prefix), and `installState`
(`clean`, `preinstalled`, `unknown`). These are the study-host declarations, not
the capture host's automatically detected environment.

The planned `model` has exactly `kind`, `provider`, `id`, `revision`,
`settingsSha256`, and `credentialState`. **It has no `used` flag.** A live/local
provider requires explicit nonempty identity/revision and an actual settings
digest, even when the subsequent first task fails before model use. Credential
starting state is `configured`, `not-required`, `missing`, or `unknown`, never a
credential value. For `keyless-demo`, identity/revision/settings are all null and
credentials are `not-required`; it cannot complete the common real-model task.

The draft adds `captureVersion: "2026-09-09.1"` to this exact input, preserving
the full roster and original fields in the preparation revision. Standard text
limits are 2048 characters; version/model labels and OS version use 256; safe
recording paths use 1024. Protocol, identity and path validation reuse the intake
contract or its same formats. No source/model/artifact identity is inferred.

### Synthetic preparation template — not observations

The following is fictional **automated preparation**, not a human record. The
angle-bracket pins are deliberately invalid placeholders. Obtain the exact common
protocol from the `protocol` command and use actual retained artifact/source pins
before exercising the tool on private synthetic fixtures. Do not relabel the
template as human evidence. Its keyless model cannot yield a completed first task.

```json
{
  "studyId": "synthetic-preparation-only",
  "preparedAt": "2026-09-01T09:00:00.000Z",
  "operator": { "id": "o-synthetic", "statement": "Synthetic preparation only; no person participated." },
  "protocol": {
    "id": "amc-human-first-use", "version": "1",
    "taskId": "jsonl-acceptance-tests", "taskVersion": "1",
    "taskSha256": "<exact common protocol digest from the protocol command>"
  },
  "task": "Draft three acceptance tests for a CLI that imports JSONL, rejects malformed records, and reports partial failures.",
  "observationWindowRule": "Synthetic window closes after explicit first-task, recovery and optional-return dispositions.",
  "assistancePolicy": "Synthetic policy: record every assistance event and every coverage gap.",
  "plannedSessions": [{
    "sessionId": "synthetic-amc-01", "participation": "automated-fixture",
    "participantId": "p-synthetic-01", "observerId": "o-synthetic",
    "harness": { "name": "amc", "version": "synthetic-template", "sourceCommit": "<actual full source commit>", "artifactSha256": null },
    "environment": { "machineClass": "synthetic-machine", "os": "darwin", "osVersion": "synthetic-template", "arch": "arm64", "nodeVersion": "22.0.0", "installState": "unknown" },
    "model": { "kind": "keyless-demo", "provider": null, "id": null, "revision": null, "settingsSha256": null, "credentialState": "not-required" }
  }]
}
```

## Exact event schema and sequence

Each event is exactly `{ "type": ..., "at": ..., "timing": ..., "data": ... }`.
Normal observations supply an explicit timestamp and `timing: "explicit-observed"`.
Events are nondecreasing in time and cannot precede `preparedAt`. Equal timestamps
retain submission order; this determines which actions occurred before a useful
result. A journal's automatic `savedAt` is storage metadata, never an event time.

For a deliberate record-now action, supply **both** `at: null` and `timing: null`
and pass `--record-now`. The CLI stamps `at` and labels it
`operator-declared-now`. That is the operator's declaration, not independent
timing or event detection. It never replaces a supplied timestamp. `close` refuses
`--record-now`: use an explicit observed close timestamp and an at/after-close
observer attestation; do not fabricate a future attestation to make record-now work.

| Type | Exact `data` keys and rules |
| --- | --- |
| `start` | `{}`; exactly once, before all other events. |
| `submitted-action` | `description`: nonempty sanitized description of **one** intentionally submitted operation. Record separately submitted commands/actions separately, not keystrokes or internally automated operations. No caller-supplied action count is accepted. |
| `assistance` | `detail`: nonempty sanitized narrative; each event counts once when coverage is declared complete. |
| `setup-failure` | `code` (ID), `detail` (nonempty). Retain failures even when the task later succeeds. |
| `refusal` | `code` (ID), `namedFix` (true, false, or null). Null means actionable-fix status unknown, not false. |
| `useful-result` | `judgement`: nonempty observed judgement under the standing common-task criteria. Ends the first task as completed; requires explicit true actual model use at close for export. |
| `first-task-ended` | `outcome` (`failed` or `incomplete`), `reason` (nonempty). Ends the first attempt with both useful-result metrics null. Mutually exclusive with useful-result. |
| `interruption` | `reason` (nonempty). One recovery exercise, after the first-task outcome and before second-task decision. |
| `resume` | `outcome` (`succeeded`, `failed`, `not-attempted`, `not-observed`), `reason` (nullable only for succeeded). Requires a preceding interruption and resolves it once. Successful resume exports this event's timestamp; other dispositions export null `resumedAt`, with the original event time retained in history. |
| `recovery-decision` | `outcome` (`not-attempted` or `not-observed`), `reason` (nonempty). Explicit alternative when no interruption was recorded, after the first-task outcome. |
| `second-task` | `outcome` (`returned`, `did-not-return`, `not-observed`), `reason` (nullable only for returned). Requires the first-task and recovery dispositions. Unknown return exports a null decision timestamp, retaining this disposition event in history. |
| `close` | Exactly `completeness`, `modelUsed`, `observer`, `recordingPath`, `windowRuleSatisfied`, `windowRuleDeviation`, described below. Only after all three outcomes/dispositions; no normal event may follow close. |

Submitted actions, assistance, failures and refusals may be retained throughout
the open window. Only actions before the useful-result event enter its derived
count. Recovery and second-task activity are not additional first-task actions.
The intake represents one interruption/resume exercise; extra exercises are not
silently collapsed into a different outcome. Keep the protocol symmetric.

Close `completeness` contains exactly four explicitly supplied booleans:
`actions`, `assistance`, `setupFailures`, `refusals`. True declares the retained
event list complete for that category across the window; false declares unknown
or partial coverage. No events plus true coverage is explicitly observed none.
No events without that declaration is **not** zero or an empty observation list.

Close `modelUsed` is an explicit boolean, independent of planned model identity.
Close `observer` has exactly `humanPresent`, `independent`, `consentRecorded`,
`firstUse` (all explicit booleans), `statement` (nonempty), and `recordedAt`
(timestamp at/after close). The observer ID comes from the roster. False human
flags can be retained in capture but cannot be exported as admitted human-declared
first-use evidence. They are never automatically changed to true or automation.

`recordingPath` is an actual safe relative reference under the later explicit
evidence root, or null when no retained recording can be declared. Null blocks
export. `windowRuleSatisfied` is an explicit boolean: true requires null
`windowRuleDeviation`; false requires a nonempty deviation and blocks export.
The tool does not infer compliance with the prose rule.

Synthetic start-event illustration, not a measured start:

```json
{ "type": "start", "at": "2026-09-01T09:01:00.000Z", "timing": "explicit-observed", "data": {} }
```

Synthetic close illustration for an **automated incomplete** template, only after
explicit failed/incomplete first-task, recovery and return dispositions. The
fictional timestamp and false declarations are not evidence of human participation:

```json
{
  "type": "close", "at": "2026-09-01T09:05:00.000Z", "timing": "explicit-observed",
  "data": {
    "completeness": { "actions": true, "assistance": false, "setupFailures": true, "refusals": true },
    "modelUsed": false,
    "observer": { "humanPresent": false, "independent": false, "consentRecorded": false, "firstUse": false,
      "statement": "Synthetic fixture only; no person participated.", "recordedAt": "2026-09-01T09:05:01.000Z" },
    "recordingPath": null, "windowRuleSatisfied": true, "windowRuleDeviation": null
  }
}
```

## Corrections, resumption and preserved history

Normal updates are append-only. Each exclusively created `r-NNNNN.json` has
exactly `captureVersion`, `revision` (zero-based integer), `previousSha256`
(null for preparation, otherwise the prior file's exact byte digest), `savedAt`,
`kind`, and `payload`. Kind `prepare` carries the full draft; kind `event` carries
exactly `sessionId` and `event`. Loading replays all contiguous revisions and
checks their links. There is no replaceable head pointer.

A correction input has exactly `sessionId`, `declaredAt`, `reason`, and `events`.
`events` is the **complete corrected sequence**, not a patch or just the changed
event. Its schema/order is rechecked. `reason` must be nonempty; `declaredAt` must
be at/after all replaced/replacement event times and observer attestations. The
new revision has kind `correction` and retains the previous events/revisions
unchanged. The effective sequence changes only for the same planned session.
An empty corrected sequence makes the current record unobserved, blocks full
export, and leaves the old evidence and correction revision visible in the archive.

After a reload, read status, review the retained journal, and continue with its
head digest. If the head changed, reconcile the observation against the winning
revision before resubmitting. Identical deterministic next filenames plus
exclusive creation prevent cooperating writers from overwriting one another.
A reader can encounter a still-being-written revision; retry status only after
that writer finishes. This is not a background process or an unattended recorder.

For an interrupted partial revision, missing file or broken chain, stop writes
and preserve the original directory. Restore exact known bytes from a retained
copy when available; never invent a missing event. If recovering a damaged tail
requires a new journal, an operator must independently review and copy the exact
validated prefix into a new private directory, retain the damaged original as a
companion artifact and reconcile the uncertain in-flight observation before
resubmitting it. Never omit a valid revision to bypass a refusal. Capture does
not automatically repair, truncate, delete, or guess past an invalid tail.

Metadata/pins/roster are frozen. An incorrectly prepared study is not silently
rewritten through correction; preserve it and resolve the protocol deviation
with the study owner. In particular, the existing intake rejects `model.used=true`
with an originally missing/unknown credential state. Capture preserves that
starting state and blocks an unrepresentable record; do not falsify the starting
state to force admission. This limitation requires intake-owner review, not an
unauthorized intake schema change in this implementation.

## Evidence, privacy and resource boundaries

Keep journals, recordings and exports in operator-owned private directories with
no hostile concurrent filesystem writers. Recording references cannot contain
traversal, empty/dot segments, absolute paths, drives, URLs, backslashes or control
characters. Symlink components beneath the canonical root, a symlink root itself,
hardlinks, nonregular files and empty files are refused. System path ancestors
may be canonicalized; the tool does not claim every ancestor on the machine is
nonsymlink. Descriptor identity, parent identity, sizes and modification metadata
are checked around fixed-buffer hashing. The actual digest is derived first,
then verified using intake's existing `inspectRecording`; no placeholder expected
digest or weakened verifier is used. Every colliding recording digest is blocked,
including collisions between synthetic/automated sessions.

JSON inputs/revisions/studies/reports are limited to 16 MiB, JSON nesting to 32,
the roster to 2000 sessions, effective events per session to 2000, the journal to
10000 revisions and 64 MiB of retained revision bytes. Recordings are capped at
8 GiB per file and 64 GiB of charged snapshot sizes per export; reads use a 64 KiB
buffer and are serial, not an unbounded worker pool. Changed-file attempts still
consume their preflight budget. These are resource limits, not measured results.

Portable Node path checks are **not** a directory-descriptor/openat sandbox or a
proof against malicious concurrent filesystem mutation. Freeze the evidence and
tool source while exporting. Post-export changes require a new export/intake;
the retained hashes locate those mismatches. Private files request mode 0600 and
new directories 0700; maintain appropriate parent permissions/Windows ACLs yourself.
Any partial newly created artifact stays visible and must not be treated as final.

`study.json` and archived journal revisions contain private original narratives,
pseudonyms, event descriptions and declarations. They are not redacted reports.
The export report avoids those narratives and never includes recording bytes,
but pseudonyms, safe recording references, timestamps and digests can still be
sensitive. Avoid names, emails, credentials, transcripts and secret-bearing command
lines in metadata; the tool is not an anonymizer or secret detector. Review every
artifact independently before sharing it. No upload or publication is performed.

Hash links make recorded versions inspectable relative to a retained head; they
are not signatures, authenticated timestamps, OS-immutable storage, proof of
preregistration time, or proof that media depicts a real consented human. A party
able to rewrite the entire journal can recompute its hashes. Preserve independent
copies/heads and review provenance and recordings separately. The tool can expose
missing sessions in its supplied roster, not prove recruitment completeness or
find people intentionally omitted from that original roster.

## Authored regression and integration handoff

`tests/humanFirstUseCapture.test.ts` contains synthetic-only regression cases for
preregistration, event order and action counts, unknowns, separate task/recovery/
return outcomes, declarations, missing planned sessions, closed failures, actual
hashes, changing files, reuse, containment, input bounds, conflicts, history,
correction/resume and exclusive output. They have **not been run** by this worker.

Codex should review and integrate the exact assigned files, then run the focused
capture/intake tests and disposable CLI cases in a fresh pinned candidate clone.
Exercise the existing full-suite/release gate and targeted hostile mutations
after integration, recording exact source/environment, failures and skipped
platform cases. Test deliberate roster omission, altered event order/counting,
weakened hash comparison/path rejection, stale-head acceptance and output overwrite.
The source-only authored tests do not establish mutation detection or qualification.

The resumable/final worker handoff is
`AMC_OS/INBOX/REV_IMPLEMENTATION_SPECIALIST.md` inside
`/Users/sid/AgentMaturityCompass/tmp/cos-study-capture`. No issue Done, passing-test,
release or collected-human-evidence claim is made by this implementation batch.

## 2026-09-10 addendum — capture 2026-09-10.1 / credentials 1

Default preparation stays `2026-09-09.1`; select the new version explicitly with
`prepare ... --capture-version 2026-09-10.1`. The prepare JSON shape is unchanged;
do not add version, migration, credentials or used fields to it. New drafts add
`migration: null`; exported studies use schema `2026-09-10`.

The planned `model.credentialState` remains immutable. New events are
`credential-change` with `{from,to,actor}` and `model-use` with
`{credentialState}` inside the existing event envelope. Actual-use state must
match the state at that point, not a later repair. New close completeness adds
the required `credentials` boolean. False preserves observations but blocks
export. Operator changes count as assistance once; unknown actors preserve null
assistance. Record intentional submitted actions separately under the existing rule.

The missing/unknown-start export limitation described in the legacy section is
not a direction to rewrite a baseline. New prospectively observed transitions
are representable through the opt-in contract, while an already observed legacy
journal stays legacy. Migration is only a reviewed-head, new/disjoint create-only
fork of an unobserved preparation. Any observation/correction, including an empty
effective corrected sequence, refuses automatic migration. Original bytes remain.

Full-roster blocked export, retained corrections and recording admission are
unchanged. Read the [exact contract and migration guide](HUMAN_FIRST_USE_CREDENTIAL_TRANSITIONS.md)
for schema, refusal codes and deferred command forms. Credential regressions are
authored in `tests/humanFirstUseCredentials.test.ts`, UNEXECUTED. No checks,
imports, fixtures, migrations, providers or human sessions are authorized now.

### Recovery authority — capture `2026-09-10.1`, credential contract `1`

2026-09-10; task `amc-1512-credential-authoring-recovery-2026-09-10`.
The version-labelled addendum is retained. The credential guide's recovery
addendum clarifies sticky assistance unknowns and equal-time capture/intake
lossiness. Sole CoS authoring is current; historical worker/Codex validation
instructions do not authorize execution. No test, check, build, import, fixture,
acceptance, provider or human session may run yet.

### September 11 correction boundary — capture `2026-09-10.1`

For a migrated preparation, even an empty correction declaration cannot predate
`migration.declaredAt`. Replaced/replacement observations and attestations remain
additional lower bounds. `correction-order` refuses the append and also refuses
an existing contradictory journal during load; it does not rewrite history.
Non-migrated and legacy preparation floors are unchanged. Keep original bytes
and truthful times, not an automatically advanced date. See the credential guide's
migration correction chronology and the unexecuted
`tests/humanFirstUseCredentialMigrationBoundary.test.ts`. Full-roster blocked
export and all execution holds remain.
