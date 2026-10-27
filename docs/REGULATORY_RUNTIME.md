# Regulatory Runtime

P2-26 adds a regulatory runtime to AMC, in four stacked slices: live incident
clocks, a signed kill switch, change envelopes, and retention per regime with
a provider exit drill. Every regulatory duration, retention minimum and
mapping here is agent-drafted and **experimental** until the D-08 experts
approve it. AMC is designed to support the duties these instruments describe;
it claims no conformity with DORA, the CRA, SEC Rule 17a-4, the EU AI Act,
CERT-In directions or FDA PCCP guidance. AMC drafts notices; people file them.

## Slice A: incident clocks

### When clocks start

`startIncidentClocks({ workspace, db, incidentId, nowTs })` runs when an
incident opens: from `amc incident create`, from `POST /api/v1/incidents`, and
from the ledger's detectors. It records one signed row in
`incident_clock_runs` (ledger migration 15, append-only by trigger) with the
active compiled plan's digest and one decision per candidate clock. A later
plan never rewrites what applied when the incident opened.

Candidates are `clocksForStation` for the plan's stations. Facts come from the
deployment profile the plan pins, read only when the signed residency
registry names it and its canonical digest is the plan's `profile.sha256`.
Without that pin, jurisdictions and entity types are unknown.

| Fact | Outcome |
|---|---|
| The clock's jurisdiction is declared absent | No clock |
| The clock's entity type (for example `eu_financial_entity` for DORA) is declared absent | No clock |
| Jurisdiction or entity type unknown | `NEEDS_CLASSIFICATION` |
| The trigger is AWARENESS-derived, so the condition depends on the incident | `NEEDS_CLASSIFICATION` |
| The trigger is a determination a person records (for example `CLASSIFICATION_MAJOR`, `INCIDENT_DETERMINATION`) | `APPLICABLE`, `NOT_STARTED` until that trigger is recorded |

A US-wide declaration cannot decide a state clock: `US` alone leaves
`US-NY` clocks `NEEDS_CLASSIFICATION`. No active plan gives a
`not_evaluated` run, which the operator inbox lists.

`NEEDS_CLASSIFICATION` is never dropped and never treated as applicable. It
shows the deadline it would have, and a person resolves it with a signed
`REPORT_REQUIRED` or `NO_REPORT_REQUIRED` oversight record naming the clock
(`amc incident oversight`). An oversight chain that fails verification
classifies nothing.

AWARENESS is the incident's ledger creation time. Every later trigger is a
signed P1-17 clock event that a person records (`amc incident clocks
--trigger`); a trigger before the incident's creation is refused.

### Detectors

The ledger calls `runLedgerDetectors` after each audit row commits.
`autoDetectAndAssemble` opens one incident per trigger id among open
incidents for drift regressions, assurance failures, freezes, budget
overruns, P1-03 `outcome_unknown` actions (`ACTION_STATE`), P2-01 blocked
residency routes (`RESIDENCY_ROUTE_BLOCKED`) and P2-24 break-glass use
(`BREAK_GLASS_ACTION`). A detector failure raises a process warning and never
fails the append.

### Notice drafts

`buildNoticeDraft({ incident, clock, evidence })` writes JSON and markdown:
the deadline, the recipients from the clock's `notify`, a checklist from its
`requiredContent`, the evidence packet's missing items and the banner
"Draft for human review. AMC does not file notices." Nothing is sent.

Surfaces: `amc incident show <id> --clocks [--packet <dir>]`,
`GET /api/v1/incidents/:id/clocks` without `station`, and the operator inbox
(`NEEDS_CLASSIFICATION` as `not_evaluated`; `DUE_SOON` and `OVERDUE` as
`review_pending`, each with its due time).

The CRA clock `eu-cra-early-warning-24h` was already in the table; it stays
`verified: false` with its recorded reason.

### Not in slice A

There is no Studio incident view to add a clocks panel to; the API route
serves the clocks for one when it lands. The provider-outage detector lands
with slice D.

## Slice B: kill switch

`src/runtime/killSwitch.ts` holds the signed `KillSwitchRecord`
(`killId`, `scope`, `mode`, `reason`, `incidentId`, `issuedBy`, `issuedTs`,
`signature`). Operation is in [the runbook](runbooks/kill-switch.md).

| Boundary | Check | Refusal |
|---|---|---|
| Tool pipeline, authorization stage (every class) | `killSwitchDenial` | `kill_switch_active`, `TOOL_CALL_DENIED` row |
| P1-02 recheck (journaled calls) | `recheckAuthorization` | `recheck_failed:kill_switch_active` receipt |
| Toolhub | `activeFreezeStatus` (the incident-freeze path) | `EXECUTE_FROZEN_ACTIVE` |
| Gateway, before model calls | lease verification | 403, `KILL_SWITCH_DENIED` |
| Gateway HTTP proxy and CONNECT | lease verification, host mapped to a configured upstream | 403, `KILL_SWITCH_DENIED` |
| `checkEgress` (native provider calls, MCP over HTTP, bridge, network tools) | `assertEgressNotKilled` | `KillSwitchDenied` |

- Attacker-writable workspace state cannot block activation: each kill and
  release is its own new file, so activation never reads, locks or rewrites
  an existing one. A record that cannot be read or verified counts as an
  active `stop_all` and raises an alert.
- Deleting the workspace copy lifts nothing while the mirror under the
  control checkpoint root (outside the workspace) holds the record. With the
  checkpoint root inside the workspace there is no mirror; AMC already
  refuses compiled plans in that configuration.
- Proxy egress to a host that is a configured upstream's is a model call to
  that provider; any other host is `NETWORK_EXTERNAL`, and while a provider
  kill is active a host that maps to no upstream is refused (fail closed).
  At `checkEgress`, AMC's own traffic is exempt: `agentId` `system` and the
  `callback` and `storage` channels. A native provider call names its
  provider; a provider call that names none is refused while a provider kill
  is active. Traffic of a shell command already dispatched (the native shell's
  own egress proxy) is not interrupted.
- Lifting needs a signed release by an OWNER naming the kill's incident.
  Break-glass is weighed after the kill check and never overrides it.
- `GET /api/v1/runtime/kill-switch` serves the status; the Studio banner
  (pages with the unified banner) shows an active switch in red.
- `scripts/drills/kill-switch-drill.mjs` writes the signed `amc.drill/1`
  receipt. The kind-cluster rehearsal of the manual fallback is pending.
- `KILL_SWITCH_ACTIVATED` opens an incident through the slice A detectors.

## Slice C: change envelopes

`src/runtime/changeEnvelope.ts` pins an agent's model, prompt, tool, policy
and corpus versions and pre-declares the changes allowed, each with the tests
that must pass first, in the style of a predetermined change control plan.
AMC claims no FDA or other conformity for it.

An envelope is a P2-24 bound record (kind `change-envelope`):
`requestChangeEnvelope` writes the draft under
`.amc/runtime/envelopes/pending/` and raises its approval;
`activateChangeEnvelope` signs it once the approval's quorum is met, the
requester's own decision never counting. `approvalId` is that approval.

| Rule | Admits |
|---|---|
| `pinned` | No change |
| `digest_in_set` | A live value (prompt, tool, policy or corpus digest, or `provider/model@version`) in `values` |
| `provider_version_in_set` | The same provider and model at a provider-reported version in `values` |

At native session open (`composeAgentSession`), `checkChangeEnvelopeAtOpen`
compares the live manifest with the agent's newest envelope:

- Identical to the baseline: allowed.
- Every change admitted, with a passing result for each required test:
  allowed, citing the envelope (`CHANGE_ENVELOPE_APPLIED`). A result counts
  only when `recordEnvelopeTestResult` recorded it: attributed to the
  authenticated session user (refused for the envelope's requester or the
  agent), bound to the envelope id, its approval's request digest and the
  digest of the exact manifest tested, and signed with the artifact-seal key
  through the P2-08 async signer. Other ledger rows, unsigned or
  unverifiable rows, and rows that only mention the type are ignored.
- Anything else (a change outside it, missing or failing test evidence, an
  expired envelope, an envelope file that fails verification): in a
  regulated workspace (an active compiled plan, or a plan that cannot be
  read) the session is refused before any lease or session row; elsewhere
  it is a warning. Both record `AGENT_REASSESSMENT_REQUIRED`, which opens an
  incident.
- No envelope at all: nothing is compared.

The live manifest is what the session resolves, never the caller's pins:
the tool digest covers the tool mode, the verified signed `tools.yaml` and
every additional capability (a tools config that does not verify gives no
digest, which always counts as changed), and the policy digest is the
active compiled plan's (one that cannot be read always counts as changed).

A model with no provider-reported version is `unpinned`, a claim downgrade.
No provider reports a version before the first response, so a native session
is always unpinned at open (Not verified per provider: Gemini reports
`modelVersion` mid-stream; the others were not checked).

P2-23 owns the version manifest (`src/lifecycle/versionManifest.ts`) and
reassessment as a lifecycle state, and is built in parallel. Until they are
reconciled, `AgentVersionManifest` here is the minimal shape compared and the
`AGENT_REASSESSMENT_REQUIRED` ledger row is the reassessment record.
