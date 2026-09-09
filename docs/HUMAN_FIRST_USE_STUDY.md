# Human first-use evidence intake

Implementation/operator packet for **AMC-1512** (native first use and real-provider
evidence) and **AMC-1518** (matched comparative outcomes), authored 2026-09-09.
This document contains no collected human results or execution qualification.

The standalone dependency-free Node ESM intake reads one operator-supplied JSON
study containing session records, checks their schema and local recording bytes,
and writes a new JSON report. It does not run AMC, DSH, Pi, models, installers,
automated personas, recording software, or an actual study. It does not upload
anything. It is independent of `scripts/install-persona-qa.mjs` and the automated
runner documented in [HARNESS_COMPARISON.md](HARNESS_COMPARISON.md).

### Optional preregistered observer capture

Use the [observer capture workflow](HUMAN_FIRST_USE_CAPTURE.md) to preserve the
planned roster, explicit observation events and correction history before intake.
`scripts/human-first-use-capture.mjs` exports this unchanged study schema only when
every planned session is closed and admissible; blocked exports retain missing
sessions and evidence gaps without emitting a selected subset. Preparation is not
human evidence, and capture does not authenticate observer declarations.

## Run after integration and qualification

From a checkout containing the script, using an existing private output directory:

```sh
node scripts/human-first-use-intake.mjs \
  --input /absolute/private-study/study.json \
  --evidence-root /absolute/private-study/recordings \
  --out /absolute/private-study/intake-2026-09-09-01.json
```

Supply actual local paths. The input is the complete study, not a selection of its
successful sessions. The evidence root is mandatory. Recording paths are relative
to that root, never relative to the input JSON or current working directory.
Output parents must already exist. Existing reports, including symlinks, are
refused; choose a new name for every corrected intake and retain the old report
and original JSON. No package alias, installation, build or competitor dependency
is needed to invoke this script. Use the repository-supported Node environment;
platform and runtime qualification for this new implementation is still pending.

| Exit | Meaning |
| --- | --- |
| `0` | Structurally valid intake and sufficient matched **declared** cohorts; not a successful human task, authenticated participation, acceptance receipt or release gate. An entirely failed but well-recorded study can return this code. |
| `2` | Report written, but invalid/missing evidence or insufficient comparative cohorts. Read field-specific errors and cohort reasons. |
| `1` | Argument, input encoding/JSON, or local I/O failure. Do not infer that a report exists or is complete. Preserve any partial newly created output and use a fresh path. |

The terminal summary contains intake/comparison statuses, not the report's private
metadata. `--help` prints the command without conducting intake. Imports do not
invoke the CLI. `validateSession`, `validateStudy` and `parseStudyJson` are pure;
`intakeStudy`, `inspectRecording`, `writeIntakeReport` and `runCli` own the explicit
filesystem boundary. In-memory `intakeStudy` reports leave input/tool hashes null;
the CLI binds its exact input bytes and local script file with SHA-256. Neither
hash is a signature or an attestation of the source/build provenance.

## Standing common-task protocol: version 1

This packet operationalizes the first-use task in
`AMC_OS/RESEARCH/2026-09-08-dsh-pi/first-use-improvement-design.md` and the measurement
requirements of `plans/2026-09-09-amc-execution-brief.md` §7a. The standing target is
**five real first-use sessions per harness: AMC, DSH and Pi**. It is a recruitment
target, not evidence already collected. The broader proposal in
`september-harness-usability-audit.md` is not silently substituted for this target.
Existing source audits and automated conformance receipts cannot fill it.

### Before the participant arrives

The operator preregisters a study ID, the task/protocol version, observation-window
end rule, exact installed harness versions and source/artifact pins, machine class,
OS/architecture/Node versions, install state, model identity, generation settings,
credential starting state and assistance policy. Keep a private roster containing
only the pseudonyms required for this report; store identity/consent documents
separately with restricted access. Obtain appropriate recording consent before
capturing a screen or voice. Do not put a name, email, credential value or contact
address in the study JSON or recording filename.

Use equal-sized cohorts with the same protocol, task, machine class and setup.
Within each matched cohort, every harness uses one declared artifact identity.
Preregister the same model/provider, revision, generation settings and bounds;
use the same model step and output-token limits for the common task (one step,
512 output tokens, no tools). These are protocol bounds, not measured usage,
elapsed-time promises or prices. The sanitized settings document must include
these bounds; hash its exact retained UTF-8 bytes, excluding credential values.
This intake checks the settings digest declaration, not the document or execution.

The shared task is exactly this UTF-8 text, without a trailing newline:

> Draft three acceptance tests for a CLI that imports JSONL, rejects malformed records, and reports partial failures.

Use protocol `amc-human-first-use`, version `1`, task `jsonl-acceptance-tests`, task
version `1`. `taskSha256` is the SHA-256 of that exact prompt. The implementation
exports `COMMON_TASK` and `COMMON_PROTOCOL`, including the computed prompt pin.
For a local recording, an operator can obtain its actual digest with:

```sh
shasum -a 256 /absolute/private-study/recordings/p-example-amc.webm
```

Never copy a digest from this document or another participant. A source-only
harness identity requires a known clean source/build receipt. For a changed build,
record its actual artifact digest and retain the build/install provenance. The
intake checks identity syntax and cohort consistency, not whether that artifact
was built from the stated source or used on screen.

### Participant and independent observer procedure

The participant must be a real first-time user of the particular harness. One
participant may try all three harnesses, but only once per harness in this study;
counterbalance order and retain the recruitment/order protocol privately. The
observer records their independence, presence, first-use assessment and consent
confirmation as **declarations**. Affirmative booleans cannot establish that these
facts are true. Do not convert any existing automated persona into a human record.

Start the recording and measurement window before the participant's first setup
action. Provide the common task and ordinary public starting instructions; do not
pre-complete hidden configuration or coach an ostensibly unaided session. Keep
clean-install and preinstalled cohorts separate. Log every intentional submitted
command, navigation/button action and saved configuration change before the first
useful result. Count separately submitted operations in a pasted command chain;
do not count each keystroke or an internally automated operation as a human action.
Record observer assistance separately, including unsolicited rescue instructions.
This action definition and assistance policy must remain identical across harnesses.

A useful result is the participant-observed model answer addressing all three
requested JSONL requirements, with concrete test inputs and expected outcomes.
The observer records the participant's judgement and the first useful-result
timestamp/action count. A help screen, successful install, baseline score, canned
stub answer, signed receipt, command exit or verifier verdict is not that result.
Recording a judgement does not make it independently correct. Preserve failed
attempts, setup failures and partial answers. When no useful result is obtained,
mark `failed` or `incomplete`, leave its timestamp/actions null, and explain why.
Never substitute a keyless demo after a real-provider failure without recording
that distinct activity; it cannot complete this common real-model task.

Record each refusal and whether its message actually named an actionable fix:
true, false or unknown (null). Do not count a refusal as an overall harness failure
merely because it correctly enforced policy. After the first task attempt, use a
bounded continuation to exercise ordinary cancellation/interruption and resume.
Record when interruption happened and whether the same session/context resumed;
do not infer successful recovery from a process exit. Do not disable signed policy
or kill unrelated processes to force success. Failed, not-attempted and not-observed
resume outcomes require reasons and remain visible.

Offer the same optional second task, “Add an acceptance test for an empty JSONL
file.” Record whether the participant chose to return, explicitly did not return
by the preregistered observation-window close, or was not observed. No follow-up
is `not-observed`, not `did-not-return`. Do not force the optional return and then
describe it as voluntary repeat use. `endedAt` closes the entire observation window,
including the recovery/return observation; the observer statement is timestamped
at or after that close. All event timestamps must lie inside the window.

## Exact input contract

One UTF-8 JSON object: `schemaVersion`, `studyId`, `sessions`. Schema version is
`2026-09-09`; session count is bounded at 2000. Duplicate JSON object members,
including escaped aliases, and unknown fields are rejected. Every field shown in
the example is required, even where null is permitted. Do not omit unknown fields
or use a string such as `"unknown"` instead of the documented null/enum form.

| Field | Rule |
| --- | --- |
| `studyId`, `sessionId`, protocol IDs/versions, `machineClass`, `arch`, failure/refusal `code` | Lowercase ASCII letter/digit followed by lowercase letters/digits, `_` or `-`; at most 64 characters. Session IDs are unique across the entire input, including automation. |
| `participation` | Exactly `human-declared` or `automated-fixture`. Missing, unknown or misleading alternative labels are not inferred as human. |
| `participantId`, `observer.id` | Pseudonym syntax `p-…` / `o-…`, respectively; suffix is a lowercase letter/digit followed by up to 59 lowercase letters/digits, `_` or `-`. Syntax cannot prove anonymity or distinct people. |
| `observer` | `humanPresent`, `independent`, `consentRecorded`, `firstUse` are booleans; all must be true for human-declared records. `statement` is nonempty bounded text; `recordedAt` is a timestamp covering the full window. Automation still supplies the fields but is never counted as human. |
| `harness` | Name `amc`, `dsh` or `pi`; nonempty version; `sourceCommit` is null or full 40-character lowercase hex; `artifactSha256` is null or 64-character lowercase hex. At least one identity pin must be present. Both, when available, are preferable. |
| `environment` | Machine class, exact OS version, architecture, exact Node version; OS `darwin`, `linux` or `win32`; install state `clean`, `preinstalled` or `unknown`. These are study-host declarations, separate from the intake host in the report. |
| `protocol` | Required `id`, `version`, `taskId`, `taskVersion`, `taskSha256`. Other protocol/task versions may be retained as records, but only the standing common task qualifies for this version's descriptive aggregation. |
| `model` | Kind `live-provider`, `local-provider` or `keyless-demo`; actual `used` boolean; provider, model `id`, exact revision/reference and settings SHA-256 (nullable only when not used). Record planned identity even for setup failures so they remain matchable. Credential state is `configured`, `not-required`, `missing` or `unknown`, never a credential value. A used model requires identity/settings and a configured or not-required state. A keyless demo requires used=false, null identity/settings and not-required credentials. |
| Timestamps | Real UTC calendar values in `YYYY-MM-DDTHH:mm:ss.sssZ` form. No local/ambiguous timezone, rolled dates, negative duration or event outside the observation window. |
| `measurements.outcome` | Outcome of the **first useful-result task**, not all later recovery/return steps: `completed`, `failed`, `incomplete`. Completion requires a useful-result timestamp, nonnegative integer action count, null no-result reason and actual declared model use. Failed/incomplete requires both result fields null and a nonempty no-result reason. |
| `assistanceCount` | Nonnegative safe integer or explicit null for unknown. Null is never zero. |
| `setupFailures`, `refusals` | Required arrays: `[]` explicitly means none observed. Null/missing arrays mean missing evidence, not zero. Each setup failure has timestamp, code, detail. Each refusal has timestamp, code, `namedFix` boolean or null. |
| `interruption` | Nullable interruption/resume timestamps; outcome `succeeded`, `failed`, `not-attempted`, `not-observed`; nullable reason. Succeeded requires both timestamps. Failed requires the interruption timestamp. All nonsuccess outcomes require a reason; unattempted/unobserved resume has no resume-success timestamp. |
| `secondTask` | Outcome `returned`, `did-not-return` or `not-observed`, nullable timestamp/reason. An observed decision requires a timestamp; not-observed requires null. Both non-returned outcomes require a reason. |
| `recording` | Relative local `path` and actual lowercase SHA-256. No absolute paths, drives/URLs, `.`/`..` segments, empty segments, backslashes or control characters. One standalone, nonempty regular recording file per session; any symlink component, hard link, unavailable file or mismatching bytes is refused. |

All counts are nonnegative safe integers, not floating values or numeric strings.
Text is bounded and cannot contain control characters; the usual maximum is 2048
characters, with 256 for identity/version labels and 1024 for a recording path.
JSON is limited to 16 MiB; recordings to 8 GiB each; arrays to 2000 entries. These
are implementation resource limits, not measurements or study sample claims.

### Synthetic preparation example — not collected evidence

This is a **synthetic automated template**, not a human session, benchmark result,
or admissible receipt. The angle-bracket digests are intentionally invalid
placeholders. Replace them with hashes of actual locally retained preparation
inputs before using the template to exercise intake; do not relabel it as human.
The times and outcomes below are fictional schema examples only.

```json
{
  "schemaVersion": "2026-09-09",
  "studyId": "synthetic-preparation-only",
  "sessions": [
    {
      "sessionId": "synthetic-amc-01",
      "participation": "automated-fixture",
      "participantId": "p-synthetic-01",
      "observer": {
        "id": "o-synthetic-01",
        "humanPresent": false,
        "independent": false,
        "consentRecorded": false,
        "firstUse": false,
        "statement": "Synthetic schema example; no person participated.",
        "recordedAt": "2026-09-01T10:10:00.000Z"
      },
      "harness": {
        "name": "amc",
        "version": "synthetic-template",
        "sourceCommit": null,
        "artifactSha256": "<replace with actual artifact SHA-256>"
      },
      "environment": {
        "machineClass": "synthetic-machine-class",
        "os": "darwin",
        "osVersion": "synthetic-template",
        "arch": "arm64",
        "nodeVersion": "22.0.0",
        "installState": "clean"
      },
      "protocol": {
        "id": "amc-human-first-use",
        "version": "1",
        "taskId": "jsonl-acceptance-tests",
        "taskVersion": "1",
        "taskSha256": "<SHA-256 of the exact common prompt without a trailing newline>"
      },
      "model": {
        "kind": "keyless-demo",
        "used": false,
        "provider": null,
        "id": null,
        "revision": null,
        "settingsSha256": null,
        "credentialState": "not-required"
      },
      "measurements": {
        "startedAt": "2026-09-01T10:00:00.000Z",
        "endedAt": "2026-09-01T10:10:00.000Z",
        "outcome": "incomplete",
        "firstUsefulResultAt": null,
        "actionsToFirstUsefulResult": null,
        "noResultReason": "Synthetic preparation, not a real-model task.",
        "assistanceCount": null,
        "setupFailures": [],
        "refusals": [
          { "at": "2026-09-01T10:01:00.000Z", "code": "synthetic-refusal", "namedFix": null }
        ],
        "interruption": {
          "at": null,
          "resumedAt": null,
          "resumeOutcome": "not-attempted",
          "reason": "Synthetic preparation did not exercise resume."
        },
        "secondTask": {
          "outcome": "not-observed",
          "at": null,
          "reason": "No human return observation exists."
        }
      },
      "recording": {
        "path": "synthetic-amc-01.txt",
        "sha256": "<replace with actual local fixture file SHA-256>"
      }
    }
  ]
}
```

## Interpreting the report without overstating evidence

Each record separately retains declared participation, the first-task outcome,
intake status, field-specific errors and recording check. `human-declared` means
schema-valid declarations with matching local recording bytes. `automated-fixture`
is a separate category and never enters human totals. `missing-evidence` means the
required fields/bytes cannot be established; `invalid` means malformed,
contradictory, unsafe or duplicate evidence. Invalid takes precedence if both are
present. A valid failed/incomplete task stays human-declared; it is not removed
because its task failed. For an invalid measurement block, `declaredOutcome`
remains visible without promoting its malformed metrics to valid observations.

Every duplicate session ID is rejected, including the first occurrence. Repeated
participant/harness pairs and repeated declared human recording hashes also
reject all colliding entries. Sharing one recording among separate session
records is not supported. A human declaration remains a declaration even when
its bytes are unique: this is not duplicate-person or synthetic-media detection.

Cohorts are matched by protocol/task versions and task pin, machine class and
OS/architecture/Node, install state, model/provider/revision/settings and credential
state. Actual model use is an outcome, so a genuine setup failure is not excluded
just because its planned model was never called. Different artifact identities
within the same harness/cohort make it insufficient. Unknown starting state,
absent planned model identity, keyless demos or an unrecognized protocol also
prevent aggregation. Do not rewrite a failed session's model/setup declaration
merely to make matching succeed.

Only equal-sized AMC/DSH/Pi cohorts meeting the standing minimum receive
descriptive summaries. No automatic downsampling or best-result selection occurs.
An invalid/missing human or unclassified record blocks human aggregation, even
when the remaining good-looking subset reaches the target. Unmatched human strata
keep the overall comparison insufficient; inspect every cohort rather than quoting
one matched subgroup as a whole-study result. All automation is excluded from
human summaries even when its observer flags claim a human was present.

Summaries preserve completed/failed/incomplete outcomes, setup failures, refusal
fix/unknown counts, resume outcomes, second-task outcomes, and unknown assistance.
Action/time-to-useful-result summaries are explicitly **conditional on obtaining a
useful result**, with the without-result denominator beside them. They are not an
unconditional speed comparison: missing/failed results are not zero-time samples.
Observation-window durations include failed/incomplete records and the full
recovery/return window. No observations yields a null median, never zero. Times
and counts are operator declarations, not independent instrument measurements.
The script never emits a ranking, superiority claim, 10x factor, maturity score,
human satisfaction rating or a release/Done judgement.

## Recording privacy and limitations

Use an operator-owned private evidence directory, inaccessible to other writers
during intake. The root itself is resolved to its canonical path; every component
beneath it must be nonsymlink. The tool checks realpath containment, regular-file
type, descriptor identity and file stability around bounded-buffer hashing. This
is not an OS sandbox or a portable directory-descriptor/openat confinement proof
against a concurrently hostile filesystem mutator. Freeze the evidence snapshot
and the intake source while reading; platform/race acceptance remains Codex's work.

The report never embeds recording bytes, decodes media, extracts transcripts,
uploads files or contacts a provider. Observer statements and narrative
detail/reason text are omitted from report output, replaced by `...Recorded`
booleans. Retain the input JSON privately: its digest and field indices locate the
underlying declarations. Safe recording references, pseudonyms, times, machine
and model labels remain in the report and can still be sensitive. The tool is not
an anonymizer or secret detector; do not put private data into metadata fields.
New reports request mode 0600; maintain appropriate directory permissions and
platform ACLs separately. Review any report before sharing it. No public/network
publication is part of this workflow.

A matching hash establishes only equality with operator-supplied bytes. It does
not prove the file is a genuine recording, the participant consented, the observer
is independent, the model/provider or artifact was really used, or the task was
correct. Review the recordings and underlying provenance independently. This
version cannot audit recruitment, cross-study reuse, counterbalancing or learning
effects, validate generation budgets/settings, authenticate clocks, or estimate
population-level statistical significance. It cannot discover sessions omitted
from the input entirely: independently reconcile the submitted study with the
preregistered roster and retained recordings. Meeting the standing sample target
alone establishes none of those things. AMC-1512/AMC-1518 remain subject to the
standing fresh-clone acceptance and independently reviewed human evidence rules.

## Integration and regression handoff

Authored regressions are in `tests/humanFirstUseIntake.test.ts`. All fixture
declarations/recordings are synthetic; affirmative test booleans deliberately
exercise the unverified-declaration boundary. They are not real study records.
This implementation batch has not run those tests, imports, the CLI, typechecks,
builds, installations, mutation probes, provider calls or a release gate.

Codex owns integration and validation. After reviewing/committing the candidate,
run focused tests in a fresh pinned clone, exercise the CLI on private disposable
fixtures, then perform the standing full-suite/release-gate and hostile-mutation
checks under the execution brief. Mutate hash comparison, containment/symlink
refusal, duplicate detection, human-only cohort filtering, minimum/equality checks
and exclusive report creation to establish that the authored tests fail for the
right reason. Retain the exact source/environment and any failures. No earlier
repository test receipt qualifies this new script. The worker handoff is
`AMC_OS/INBOX/REV_IMPLEMENTATION_SPECIALIST.md` in the assigned worktree.
