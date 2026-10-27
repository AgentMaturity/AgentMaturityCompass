# Agent lifecycle, reassessment and retirement

A governed agent has one of five lifecycle states: `proposed`, `approved`, `active`, `suspended` or `retired`.
AMC records every move as a signed ledger audit row (`LIFECYCLE_TRANSITION`) and keeps a materialized
`agent_lifecycle_state` table that admission reads. The table can be rebuilt from the rows alone. A signed row
proves AMC recorded the move unchanged; it is not proof that the agent is fit to run. This is evidence of
conformity planning, never a compliance claim.

The older stage commands (`amc lifecycle status`, `amc lifecycle advance`) keep working. Their stage trail is the
caller's word (controls, actor and note are typed in, and the file is unsigned), so every result they return is
labelled `claimKind: "self_reported"`. They do not change governed state.

## States and transitions

| From | To | Needs |
| --- | --- | --- |
| no record | proposed | an OWNER |
| proposed | approved | an OWNER and a bound approval |
| approved | active | an OWNER; the active plan must still be the one approved |
| active | suspended | an OWNER, a reassessment trigger, or a kill switch (P2-26) |
| suspended | active | an OWNER and a bound approval |
| any state except retired | retired | an OWNER (see Retirement) |
| active, migrated, no approval | active | an OWNER and a bound approval |

A retired agent is final. Each row carries `{ agentId, from, to, reason, manifestDigest, planDigest, approvalId, actor }`.

- **Actor.** The actor is the signed-in user of an `amc approvals login` token (CLI `--session-token-file`) or the
  Studio sign-in, resolved live in the signed `users.yaml`. No flag or request body names the actor. An automatic
  suspension names AMC itself (`via: "amc"`).
- **Time.** Every time is AMC's clock at the write. A caller cannot supply a timestamp.
- **Bound approvals.** A move that needs one raises a P2-24 approval (SECURITY class, the policy's quorum) for
  exactly `{ agentId, to, manifestDigest, planDigest }`. The plan digest is the active plan's digest, or `none`
  when no plan is active. Only decisions bound to the request digest count. The requester's own decision never
  counts, and the approval is spent by the move. An approval bound to one manifest cannot approve another.

## The version manifest

`src/lifecycle/versionManifest.ts` pins what an agent runs:

```ts
type ChangeKind = "model" | "prompt" | "tool" | "policy" | "deployment" | "corpus";
interface AgentVersionManifest {
  v: 1; agentId: string; deploymentId: string;
  model: { providerId: string; model: string; providerReportedVersion: string | null };
  systemPromptSha256: string; toolsDigest: string | null; policyDigest: string;
  compiledPlanDigest: string; harnessVersion: string; compositionDigest: string;
  corpusDigests: string[];
}
manifestDigest(m)          // "sha256:" + sha256(canonicalize(m))
diffManifests(bound, now)  // the ChangeKinds that moved
```

A null, empty or missing component in the current manifest counts as changed (fail closed). The exception is
`providerReportedVersion`: providers often serve several versions behind one model name, and no provider reports a
version to the native runtime yet, so the model is reported as unpinned (`unpinned: ["model"]` on a reassessment)
rather than suspending every session. The native runtime pins no corpus yet, so `corpusDigests` is empty.

At each native session open AMC builds the manifest from the route's provider and model, the system prompt, the
signed tools config, the session's policy and composition digests and the active plan. For a governed agent it records
the manifest when it changed (`LIFECYCLE_MANIFEST_OBSERVED`). An approval binds the observed manifest by default, or a
manifest file (`--manifest <file>`, API `manifest`).

## Reassessment triggers

Triggers run at native session open, before the first turn. The scheduled trigger also runs at the authorization
stage.

- **invalidated_by.** AMC diffs the current manifest against the one the active approval bound. Each change kind maps
  to the catalog trigger (`model` to `model_version`, and so on). The active plan's applicable controls whose
  `invalidatedBy` names a trigger are invalidated. If any of them is mandatory, the agent is suspended with reason
  `reassessment_required`, unless a P2-26 change envelope covers the change. A covered change, or one that
  invalidates no mandatory control, is recorded as `passed` and the agent stays active.
- **scheduled.** An approval carries `reviewDueTs` from the plan's manual-duty cadences: the shortest periodic cadence
  (daily, weekly, monthly, quarterly or annually) of a mandatory control. Once past, the agent is suspended with
  `review_expired`. When only optional controls set a cadence, the review is advisory, and AMC records an open
  warning instead. Event-driven cadences ("on every release") set no date.
- **manual and incident.** An OWNER suspends with `amc lifecycle transition --to suspended`. P2-26's kill switch
  calls `suspendAgent(workspace, { agentId, reason: "incident" })`.

A reassessment is a ledger row (`LIFECYCLE_REASSESSMENT`) shaped
`{ reassessmentId, agentId, trigger, changed, invalidatedControls, requiredTests, status, createdTs, closedTs }`.
`status` is `open`, `passed` or `failed`, and `requiredTests` come from the plan's evidence plan. Resuming an agent
closes its open reassessments as `passed`. Retiring it closes them as `failed`. `lifecycleInvalidations()` returns each
change as `{ trigger, at, ref }`, the input P1-11's evidence admission takes to mark evidence recorded before the change
as invalidated.

## Admission

At P1-02's authorization stage, every consequential call (every action class except `READ_ONLY` and `WRITE_LOW`)
reads the agent's row. An agent that is not active is denied with the message `agent {id} is {state} ({reason})`, and
the denial is the call's receipt (`agent_not_active`). Reads and low-impact writes are not bound at that stage, so they
follow the plan's visible-tool allowlist. A row that does not match the agent's newest signed lifecycle row refuses.

Admission enforces only when the active plan carries `L0-CHG-01` (Pinned versions). Without such a plan it is
advisory: the call runs and AMC writes a `LIFECYCLE_ADMISSION_WARNING` row.

A retired agent opens no native session. A suspended agent can still open one and read.

## Retirement

`amc lifecycle transition --to retired` (or the API) runs these steps in order:

1. It refuses while the agent has open `outcome_unknown` receipts, unless an OWNER records an acceptance note
   (`--accept-outcome-unknown <note>`).
2. It revokes every lease of the agent with one signed revocation-list row, `agent:<id>`, which `verifyLeaseToken`
   honours.
3. It rotates the agent's static Studio token to an unscoped one that nobody holds.
4. It cancels the agent's pending approvals.
5. It writes the final transition row, naming the ledger head hash, the retention segment ids and the agent's bundle
   ids.

Retirement never deletes evidence. Deletion after the retention period goes through P2-01's executor.
Revoking P2-25 delegation chains waits for P2-25.

## Migration

Existing agents have no lifecycle row. They read as `active`, reason `legacy_migration`, claim kind `self_reported`,
with nothing bound, so nothing stops running. `migrateLegacyAgents()` records that state as signed rows. Under an
enforcing plan, a migrated agent needs a bound approval (`--to active` with `--approval`) before its next
consequential action. An agent that was never migrated is not held, even under an enforcing plan: every activated
plan carries Layer 0, so holding it would stop every existing regulated workspace on upgrade. Migrating is the
operator's opt-in. Whether unmigrated agents should be held instead is an open decision.

## Surfaces

- `GET /api/v1/lifecycle/agents/{id}` returns the state, the transitions and the reassessments. Every human role can
  read it.
- `POST /api/v1/lifecycle/agents/{id}/transition` is OWNER only. Its body is
  `{ to, approvalId?, requestApproval?, manifest?, note?, acceptOutcomeUnknown? }`.
- `amc lifecycle transition --to <state> --session-token-file <file> [--request-approval | --approval <id>]` and
  `amc lifecycle reassessments` both print JSON.
- The Studio agent page shows a lifecycle panel (`agent?agent=<id>`).

A move that needs an approval runs in two steps:

```bash
amc lifecycle transition --agent a1 --to approved --request-approval --session-token-file owner.token
# approvers other than you decide it, bound to the printed digest (amc approvals approve ... --expect-request-digest <digest>)
amc lifecycle transition --agent a1 --to approved --approval apprreq_... --session-token-file owner.token
amc lifecycle transition --agent a1 --to active --session-token-file owner.token
```
