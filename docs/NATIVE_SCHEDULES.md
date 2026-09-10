# Native signed schedules

`amc native-schedule` manages the existing native goal scheduler. It is distinct
from assessment `amc loop schedule` and prompt/assurance scheduling. Registration,
imports, `list` and `inspect-file` start no timers or jobs. There is no daemon,
automatic Studio activation, OS scheduler installation or external harness.

**Qualification:** this contract and its lifecycle/CLI regressions were authored
on 2026-09-10 under AMC-1548. Checks, tests, mutation proof, installed-package and
platform acceptance are **UNEXECUTED** pending final implementation qualification.
Do not treat the commands below as instructions to activate an existing production
workspace without its normal operator, signing, approval and deployment gates.

## Review and manage

Work in the intended existing AMC workspace as its operator. The normal workspace
signer is required for configuration changes; these commands do not create keys,
unlock credentials or repair an invalid signature automatically.

Create an operator JSON file, initially disabled:

```json
{
  "id": "daily-review",
  "runAs": "reviewer",
  "goal": "Review the permitted workspace material and report findings without making changes.",
  "maxRounds": 2,
  "everyMs": 86400000,
  "enabled": false,
  "scope": ["READ_ONLY"]
}
```

```sh
amc native-schedule inspect-file review.json
amc native-schedule list
amc native-schedule put review.json --expect-input-sha256 <reviewed-input-hash> --expect-digest <current-config-hash-or-absent>
```

`inspect-file` previews and hashes the exact JSON bytes. `list` verifies the signed
configuration and reports `configDigest`, due/claim/failure history and the current
`toolsPolicy.digestSha256` with signature/schema status. Review the actual tools
policy as well as its hash. `absent` is accepted only when creating the first
configuration. `put` validates the schema and signs through the existing workspace
policy; it does not start execution. The schedule ID must be unique; reserved IDs,
unknown fields, invalid scopes and unsafe numeric bounds are refused.

Subsequent operations require the current `configDigest` from `list`:

```sh
amc native-schedule enable daily-review --expect-digest <current-config-hash>
amc native-schedule disable daily-review --expect-digest <current-config-hash>
amc native-schedule remove daily-review --expect-digest <current-config-hash>
amc native-schedule reset-failures daily-review --expect-digest <current-config-hash>
```

Enable, disable and remove re-sign the reviewed configuration. Reset-failures
changes only operational suspension, retaining cadence and the last outcome; it
does not widen or re-sign policy. Replacement/removal/enable/reset refuse an active
or interrupted claim. Disable blocks future claims but does **not** pretend to
cancel work already executing. A changed configuration invalidates a running
owner's pin before its next child dispatch/pass. Stop and deliberately restart
with reviewed pins after any policy change. Removal retains run history so reusing
an ID does not create an immediate duplicate occurrence.

## Explicit due execution

After separately enabling the reviewed schedule, pass both policy pins and an
explicit governing root agent, provider and approval class:

```sh
amc native-schedule run-due --agent <root-agent> --provider <native-provider> --model <model> --credential <reference-name> --expect-digest <schedule-config-hash> --expect-tools-digest <tools-policy-hash> --approve-tools READ_ONLY --max-tokens 1024 --max-steps 8
```

Credential flags hold **references**, not secret values. The existing native
provider routing and credentials service are reused. `--provider stub` is a local
recording demonstration, not a real model/provider result; it can still request
tools and require actual approvals. It is not an approval bypass.

Every enabled schedule must explicitly declare a scope containing only the chosen
approval class. The existing approval seam selects one class, so a mixed/absent
scope is refused rather than misclassified under weaker approval rules. No
approval-exception flag, foreign runner, custom tool seam, inherited background
delegation or resumable session is accepted on this surface. Existing signed tool
allowlists, firewall/action/lease rules, native budget admission and root-agent
usage attribution remain in the existing native child path. Schedules grant no
independent budget or permission. Approval requests report the existing authenticated
decision instructions; signing a schedule is not a human tool approval.

For an explicitly owned foreground lifecycle, replace `run-due` with `watch` and
optionally add `--poll-ms 30000`. A pass settles before the next polling delay
begins. There are no overlapping passes within an owner. Ctrl-C or SIGTERM stops
new claims, requests cancellation and waits for actual active child work and
claim settlement. An abort request is **not** proof that an uncooperative executor
has exited. The owner remains active while waiting; it does not detach work or
claim a successful closure. Terminal failures stop the service and release its
timer/listeners; they are not silently retried in a hidden process.

## Time, duplicate protection and evidence

Each pass samples one non-negative safe-integer Unix-millisecond due cutoff.
Cadence advances at claim time, not completion. Never-run enabled schedules are
due; otherwise elapsed time must meet the interval. Clock rollback delays the
next occurrence. A long outage produces one catch-up occurrence, not a backlog.
In-flight claims block duplicates even after the interval elapses. Repeated
consecutive failures suspend admission at the store's existing limit; an explicit
reset is required. Mechanical `max-rounds` completion is not proof of goal quality.

Short exclusive local-file transactions coordinate claims and updates. Each claim
has a unique token; a wrong, duplicate or old completion cannot clear a newer
owner. This is local operational coordination, **not** distributed-consensus,
host-compromise protection or exactly-once external side effects. Do not delete
the state file to reset a schedule: losing local history can lose duplicate
protection. Malformed state fails closed instead of being replaced by empty history.

The actual parent session records claim and execution-settlement audit projections
binding the schedule/config digest, claim, goal hash and child session IDs. Child
work uses ordinary signed native sessions. The CLI reports parent/child IDs and
mechanical outcomes; use normal session inspection and `amc agent-loop verify
<session-id>` separately. The unsigned `schedule-state.json` is operational state,
not independent verification or proof of answer quality.

`list.interrupted` includes claims that may still be live; timestamps alone do not
prove death. A crash, legacy claim without a token, recorder refusal or state-close
failure remains visible and is not automatically stolen or retried. A leftover
`.amc/schedule-store.lock` is also never stolen by timeout or guessed PID. Stop
competing owners, preserve the records, and reconcile actual session/process
closure before any separately authorized recovery. This implementation supplies
no force-clear, automatic stale-owner takeover or cross-process pretend-cancel.

Library integrations closing occurrences must now pass the `claimId` returned by
`claimDueRun` to `completeRun(workspace, id, outcome, claimId)`. Public foreground
execution is wired through `runComposedTurn`'s explicit schedule pass and the
existing `runDueSchedules`/`runGoalRounds` chain, not a second scheduler.
