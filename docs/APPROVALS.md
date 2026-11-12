# Approvals

AMC approvals are signed, quorum-aware human authorization for high-impact actions. The canonical approval inbox is projected from one per-agent chain:

- `.amc/agents/<agentId>/approvals/requests/<requestId>.json`
- `.amc/agents/<agentId>/approvals/decisions/<decisionId>.json`
- `.amc/agents/<agentId>/approvals/consumed/<requestId>.json`
- a detached auditor signature beside every artifact

The CLI, Dashboard, diagnostics, and Studio all read this chain. There is no separate notification authority or second approval store.

## Flow

1. An agent creates a ToolHub intent.
2. When signed policy requires human authorization, ToolHub creates a canonical request and returns `approvalRequired: true` plus `approvalRequestId`.
3. AMC sends a metadata-only lifecycle notification through configured Integrations channels.
4. An authenticated approver opens Studio or uses the CLI to record a signed decision.
5. The agent polls `/agent/approvals/:id/status` with a valid lease.
6. ToolHub permits execution only after the signed quorum is `QUORUM_MET` and every bound policy, tools, budget, intent, work-order, and lease context still verifies.
7. Execute consumes the approval once, by exclusive create, before the tool runs. A replay, or a second execute racing the first, is denied before any effect. A tool run that then fails has still spent the approval.

`DENIED`, `EXPIRED`, `CANCELLED`, and `CONSUMED` are terminal. AMC rejects further decisions or cancellation attempts for a terminal request.

## What an approval binds

For a native agent run with `--approve-tools`, a call in an authorized class (every class except `READ_ONLY` and `WRITE_LOW`) is approved under the tool's own signed action class, not the `--approve-tools` class, and the question names the amount and recipient first. The approval binds the call's authorization intent: the tool, its adapter and class, a digest of the normalized arguments, the amount, recipient, destination and resource, the deployment digest of the signed policy files, and the workspace id. The intent is kept with the signed request.

`--approve-tools <class>` decides each call under that class's signed rule. The default `READ_ONLY` rule has
`requiredApprovals: 0`, so `--approve-tools READ_ONLY` (the usual gate for `--mcp` mounts and `native-schedule
run-due`) records a signed request per call that settles `QUORUM_MET 0/0` and asks no human; the run says "needs no
human decision" for it. Use `WRITE_LOW` or higher, or raise the class's `requiredApprovals` in the signed approval
policy, to have a human asked before each call.

The tool pipeline binds an authorization record (`amc.authorization-record/v1`, ADR 009) when the call enters and rechecks it as the last step before the tool runs. The call is denied, and the tool never runs, when:

- the amount, recipient, destination or resource differs from what was approved (`binding_changed:amount` and so on), or the tool differs (`tool_changed`);
- a signed tools, action or budgets policy changed after the approval (`policy_revision_changed`, `deployment_changed`);
- the approval expired, was cancelled or denied, was already consumed, or was issued under another action class;
- the class is frozen by a signed incident, a lease the composition supplies is revoked or does not cover the class (a lease's optional `executeActionClasses`), or a delegated child calls outside its scope;
- an approval, lease, freeze or policy store cannot be read (`authority_store_unavailable`).

A `FINANCIAL` tool must declare `bindingFields` for `amount`, `currency` and `recipient` in `.amc/tools.yaml`, and a `DATA_EXPORT` tool for `destination`; otherwise every call is denied `binding_fields_missing`. Amounts are decimal strings such as `"100.50"`; a JSON number is refused. Create the approval policy (`amc policy approval init`) before the first gated run: the deployment digest covers it, so a policy the engine creates while raising the first approval denies that call `deployment_changed`.

```yaml
- name: payments.transfer
  actionClass: FINANCIAL
  bindingFields: { amount: amount, currency: currency, recipient: payee }
```

Arguments such as `approvalId`, `approved` or `consent` grant nothing. Only the approval gate names approvals, after a grant. Under a gate, a call in an authorized class needs a signed approval from the approvals engine: an answerer's allow, including an ADR-5 exception, names none and is denied `approval_missing`. Code Mode sub-calls are asked one by one. Each call's tool evidence rows carry `authorizationId` and `authorizationDigest`, and one `AUTHORIZATION_RECORD` audit row holds the full record. The record and its signatures are checked against the workspace's own keys: a local audit trail, not a portable verdict.

## Scoped exceptions and review records

A scoped exception (`amc.scoped-exception/v1`, `src/governor/scopedExceptions.ts`) is a signed deviation from one control version. It names the workspace, agents, tools and action classes (no wildcards), the resource ids (or `null`, justified in the reason), a maximum amount, and a window of at most 30 days. `requestScopedException` raises an approval under the signed policy's `SECURITY` rule whose intent is the draft's digest. Once the quorum has recorded decisions bound to that request (`expectedRequestDigestSha256`), `issueScopedException` signs and writes the exact approved draft under `.amc/governor/scoped-exceptions/`. The requester is the authenticated user of an `amc approvals login` session (`sessionTokenFile`), never a caller-supplied name; it is recorded as the approval request's initiator, so the engine refuses that user's own decision, and without a valid session the request is refused (`principal_unresolved`). There is no CLI command for requesting an exception yet (TypeScript API only). A missing signing key refuses the operation.

Only the enforcement point honours an exception. The compiled-policy guard abstains for that control when the exception verifies, names this workspace and its approval, is in window, is not revoked, and covers the call's agent, tool, class, resource and amount. The authorization record lists it in `authority.exceptions`, and the recheck re-reads it before every call. An exception copied from another workspace, with a broken signature, for another control version, or for a larger amount is ignored. `revokeScopedException(workspace, id, reason, revokedBy)` takes effect on the next call. Any revocation file revokes, even unsigned, because a revocation only ever denies.

`--approval-exception` in a regulated profile (an active compiled plan, or one that cannot be verified) takes the id of a signed scoped exception for the plan's approval control, granted for the control version the plan runs now. The unsigned ADR-5 note is refused there and keeps working only outside a regulated profile.

A review record (`amc.review-record/v1`, `src/approvals/reviewRecords.ts`) is signed and approval-bound the same way. It names its subject (`compiled-plan`, `control-result`, `scoped-exception`, `break-glass-packet`, `agent-output` or `attestation-draft`) by id and exact SHA-256. The reviewer is the authenticated user of an `amc approvals login` session, never a caller-supplied identity, and is recorded as the review approval's initiator. For a `break-glass-packet` review the requester is the break-glass record's activator, not the caller's input. A reviewer equal to the requester is refused at creation, and neither the reviewer's nor the requester's decision counts toward the review's quorum. `reviewStatusFor` is the Review dimension:

- `rejected` when any review of the current digest rejects it, even beside an approval;
- `approved` when an unexpired review approves exactly the current digest;
- `expired` when the only approvals have lapsed;
- `pending` otherwise, including reviews of an earlier digest.

An exception or review is a recorded human decision, never a certification or a compliance verdict.

## CLI

```bash
amc approvals list --agent <agentId> --status pending
amc approvals list --agent <agentId> --query <requestId-fragment> --action-class DEPLOY --risk-tier high --effective-mode execute --created-after 2026-07-01T00:00:00Z --created-before 2026-08-01T00:00:00Z --order newest --limit 50 --json
amc approvals show --agent <agentId> <requestId>
amc approvals login --username <reviewer> --token-file <private-session-file> --json
amc approvals approve --agent <agentId> <requestId> --mode execute --reason "approved by owner" --user-id <userId> --username <reviewer> --roles OWNER \
  --session-token-file <private-session-file> --expect-request-digest <requestDigestSha256-from-show>
amc approvals deny --agent <agentId> <requestId> --reason "not approved" --username <reviewer> --roles APPROVER
```

An EXECUTE approval needs an authenticated reviewer: `--session-token-file` (an `amc approvals login` session) and
`--expect-request-digest`, and the reviewer fields must match the session. `--username`/`--roles` without a session are
self-asserted, so `approve --mode execute` refuses them and records nothing; the refusal names the login command.

The engine enforces this for every caller. `decideApprovalForIntent` requires `reviewerAuthentication`, and anything
other than `"authenticated"` is refused an EXECUTE approval, so a caller that omits it fails closed. Only callers that
verified the reviewer pass `"authenticated"`: the CLI's session-token path (and through it native chat and one-shot
prompts, ACP, and the TypeScript and Python SDKs' `approve`), Studio's decision routes (the signed-in session and its
live roles, or the admin token), and Studio's audit evidence approval. `amc audit request approve --actor <id>` is
self-asserted: it raises the dual-control request but records no owner decision; signed-in reviewers decide it.

Each signed decision records `authentication: "authenticated" | "self-asserted"`. A self-asserted reviewer may still
**deny** and approve **simulate**, but only a DENY or an authenticated approval is read by the engine and its consumers
(`listApprovalDecisions`, `countedApprovalDecisions`): quorum, the distinct-user check, the native gate, assurance
waiver publication (its OWNER and AUDITOR approvals), audit evidence fulfilment, authorization records and A4 effect
approvals. A self-asserted approval of either mode, and a legacy row without the field, never attests to an identity
or role; a deny only ever stops an action. Inbox and Studio displays still list every signed row.

`--expect-request-digest` accepts the inbox digest or the engine's binding digest of the request (the one P2-24 break-glass prints, which leaves the request's initiator out), and the decision binds the binding digest. `--username` and `--roles` are required for decisions; `--user-id` can bind a stable identity distinct from its display name. Unknown roles and a repeated reviewer on a distinct-user request fail closed. CLI decisions use the same lifecycle delivery path as Studio. `APPROVED` remains an input compatibility alias for canonical `QUORUM_MET`.

### Approval modes (`--approval-mode`)

`amc agent-loop run` and `agent-loop chat` take `--approval-mode <plan|default|accept-edits|untrusted>`, the
operator-facing form of the gate, comparable to Claude Code's `plan`/`default`/`acceptEdits` and Codex's
`untrusted`/`on-request`. A mode only narrows. It sits on top of the signed tools policy, the compiled policy's
approval classes, every guard, every freeze and the signed Action Policy; none of those is removed by any mode.

| Mode | What is asked | What executes |
|---|---|---|
| `plan` | nothing (no gate is composed) | nothing outside `READ_ONLY`: every other call enters as `SIMULATE` and the tool reports what it would do. The mode is composed with the Action Policy's own narrowing (neither can widen the other) and is inherited by every delegated child, so `--delegate` under `plan` cannot write through a child either |
| `default` | every call outside `READ_ONLY` (file edits, the shell, network, deploys, secrets) | what a human allows |
| `accept-edits` | as `default`, except `WRITE_LOW` (the file tools' workspace edits) | `WRITE_LOW` runs without a question; the shell still asks. AMC does not pre-approve "filesystem-looking" shell commands by inspecting their text |
| `untrusted` | every call, `READ_ONLY` included, except `ask_user` | what a human allows |

A call that carries an authorization intent is still asked under its own signed class, as with `--approve-tools`;
a call without one is raised under `WRITE_HIGH`, risk `high`. A tool whose class the composition cannot name is
gated. `--approval-mode` composes its own gate, so it refuses `--approve-tools`, `--approve-risk` and
`--approval-exception` beside it; a preset's `approveTools` is replaced by an explicit mode, and the run says so.
In `agent-loop chat` the same precedence holds: a preset's `approveTools` is replaced by an explicit mode, and
only an explicit `--approve-tools`/`--approve-risk` beside the mode is refused; a gating mode's requests are
reviewed in the chat terminal exactly as `--approve-tools` requests are.
`never`, `bypass`, `yolo`, `dontAsk`, `auto` and `danger-full-access` are refused by name: AMC has no bypass mode
(omit the flag for no gate outside a regulated profile, or use `plan` to run nothing), and no classifier that can
allow. `on-failure` is refused until the sandbox denial-to-escalation loop exists.

Two combinations are refused rather than weakened. An out-of-process delegate (`--delegate-provider <foreign>`,
from the flag or a signed preset) runs outside this run's gate and SIMULATE narrowing, so any `--approval-mode` with
one is refused: drop the provider (children then run in-process under the mode) or use `--approve-tools`. Under an
active compiled policy, a mode that leaves a class the policy's `approvalRequiredFor` names unasked (for example
`accept-edits` where `WRITE_LOW` needs a signed approval) is refused by name, because every such call could only be
denied as `approval_missing`; use `default`, `untrusted` or `--approve-tools`.

The mode, its gated classes and its exempt tools are part of the signed composition digest (`session/open`) and of
each child's `delegation/hook-control` row, so an `accept-edits` run and a `--approve-tools WRITE_HIGH` run sign
different digests, and a `plan` run differs from an ungated one. With a preset, the mode is recorded as an override
source and the preset's `approveTools` as replaced. The SDK, ACP and Studio native-task options still take the
expert `approveTools` form.

### Native one-shot and interactive review

The native one-shot approval prompt reads the actual signed pending request and
prints an inspection command plus the existing authenticated login and decision
templates. Unlike the legacy examples above, native templates include both
`--session-token-file` and `--expect-request-digest`. Keep both: omitting them
selects the self-asserted reviewer path, which can deny or approve simulate but
is refused for an EXECUTE approval, so it can never satisfy a native gate.

`amc approvals login --username '<existing-reviewer>' --token-file '<new-private-file>' --json`
uses an existing active local user, a masked password prompt and a new private
session file. It does not create a reviewer or grant roles. Its output contains
identity, roles, expiry and file-path metadata, not the password or token. Fill the
native template's user ID, username and comma-separated roles from that identity,
and pass the private file **path**, never its contents. Review the request's tool,
scope, current context and reason before choosing approve or deny.

Native templates pin the canonical request digest and current effective mode;
the actual decision command checks them again with the authenticated identity.
Invalid, expired, changed or mismatched request/context produces inspection-only
guidance, not a guessed decision command. A recorded decision is distinct from
notification delivery, quorum satisfaction and tool execution. No command is run
merely because instructions were printed. Ctrl-C cancels the waiting native turn.

The list command searches only a case-insensitive stable request-ID fragment. It filters status, action class, approval risk tier, effective mode, inclusive RFC3339 or epoch-millisecond creation bounds, deterministic order, and a 1-200 row limit. It does not search tool names, raw arguments, intent or work-order IDs, reviewer identities, decision reasons, commands, MCP servers, prompts, payloads, credentials, Vault references, tokens, absolute paths, or destination URLs. `show` is the explicit authenticated local detail command for an approver who needs to inspect signed request context.

Every list result is the same schema-versioned projection used by Studio and `GET /approvals/requests`. It reports normalized filters, aggregate inventory counts, total matches, returned rows, truncation, and generic integrity reason codes. The result says `derivedView: true`, `recorded: false`, and `proofEligible: false`: it is not a new activity record and does not prove that an approved action executed.

Before filtering, AMC audits every canonical request, decision, consumption record, and detached signature. Invalid signatures, malformed artifacts, filename or agent binding failures, unknown request references, duplicate bindings, or detached signatures without their artifact fail closed with an empty result. A narrow filter cannot hide corrupt activity and then imply a complete history. Current policy/context drift remains visible on each historical row, but does not rewrite the integrity of the signed historical inventory.

## Studio and API

Studio Approvals supports a direct authenticated review link:

```text
/console/approvals?approval=<requestId>
```

Hosted workspace notifications use the router-aware form `/w/<workspaceId>/console/approvals?approval=<requestId>`. AMC accepts only these relative same-origin path shapes; absolute or arbitrary review targets are rejected.

The inbox refreshes on privacy-safe approval SSE events. It starts in pending mode, supports the same bounded search and filters as the CLI, and shows decision controls only for pending rows whose request, chain, and current context are trusted. The current Studio routes are:

- `GET /approvals/requests?agentId=<id>&query=<requestId-fragment>&status=<status>&actionClass=<class>&riskTier=<tier>&effectiveMode=<mode>&createdAfter=<timestamp>&createdBefore=<timestamp>&order=<newest|oldest>&limit=<1-200>`
- `GET /approvals/requests/:id`
- `POST /approvals/requests/:id/decide`
- `POST /approvals/requests/:id/cancel`
- `GET /agent/approvals/:id/status` for lease-scoped agent polling

Decision values are `APPROVE_EXECUTE`, `APPROVE_SIMULATE`, or `DENY`. Unknown values, conflicting modes, extra fields, malformed JSON, stale sessions, revoked users, changed roles, and terminal requests fail closed.

## Lifecycle Delivery

Run `amc integrations init`, store channel credentials in Vault, configure routing in `.amc/integrations.yaml`, sign the edited file with `amc integrations sign` (owner mode; `init` rewrites the template), then verify with:

```bash
amc integrations verify
amc integrations status
amc integrations test --channel <channelId>
```

The existing integration router handles these events:

- `APPROVAL_REQUEST_CREATED`
- `APPROVAL_DECISION_RECORDED`
- `APPROVAL_QUORUM_MET`
- `APPROVAL_DENIED`
- `APPROVAL_CANCELLED`
- `APPROVAL_EXPIRED`
- `APPROVAL_CONSUMED`

Each versioned notification contains only the opaque request ID and digest, action class, risk tier, requested/effective mode, creation/expiry timestamps, lifecycle status, quorum counts, and relative authenticated review path. It is explicitly `notificationOnly: true` and `proofEligible: false`.

Delivery uses the existing HMAC signature, Vault resolution, ordered queue, retries, dead letters, delivery journal, and signed ledger receipt path. Every queued row binds its immutable channel, event, agent, payload digest, sequence, retry limit, and creation time with an auditor signature; payload or routing metadata tampering is dead-lettered before any network call. Studio drains due rows on startup and each scheduler tick, and terminal journal/dead-letter finalization is idempotent across restarts. Queue and journal records retain a destination hash and normalized error code, not a destination URL, Vault reference, shared secret, or raw transport error. The shared HMAC secret is never sent as a header.

Studio persists and delivers `EXPIRED` when an authenticated detail/status read first observes expiry. Successful ToolHub execution delivers `CONSUMED`. Persist-before-notify and serialized transition checks prevent duplicate expiry delivery, and a consumption artifact is accepted only when its signed embedded request and agent IDs match the addressed path.

## Failure and Remediation

| State | Meaning | Operator action |
| --- | --- | --- |
| `DELIVERED` | At least one routed channel returned success and signed evidence was written. | Review in Studio; delivery does not authorize execution. |
| `QUEUED` | A routed channel failed this attempt but remains inside its signed retry window. | Leave Studio running or restart it; the durable queue resumes automatically. |
| `SKIPPED` | Every route was disabled or absent. | Enable and route a signed channel, or use Studio/CLI directly. |
| `FAILED` | A routed delivery did not complete. | Inspect `amc integrations status`, retry/dead-letter state, and channel health. |
| `BLOCKED` | Request/context or Integrations integrity failed. | Repair and re-sign the named configuration; never bypass the approval. |

A failed, duplicated, reordered, expired, or replayed notification cannot approve or execute an action. Missing or tampered request, decision, consumption, approval policy, action policy, tools, budgets, or Integrations evidence remains denied by default.

## Security Guarantees

- Auditor signatures protect requests, decisions, consumption records, policies, and delivery evidence.
- Quorum enforces allowed roles, distinct users, expiry, and requested mode.
- Every approval request raised outside A4 records its initiator (P1-78): the authenticated Studio user (`agent:<id>` for an agent token), the API caller, a native task's session principal, an operator resolution's operator, an audit evidence request's requester (kept as `sha256-16:<hex>`), or for a CLI command the OS user, which is self-reported and can only refuse that same user id's approval. Where the class's rule requires distinct users (`requireDistinctUsers` on the signed request or in the signed approval policy), the engine refuses the initiator's approval ("initiator cannot approve their own request") and the quorum never counts one; the initiator's denial still denies. A single-user class still counts the initiator. The initiator is read only from the signed request; the binding digest leaves it out, so a request digests the same with or without one. `createApprovalForIntent({ initiator })` stays optional for A4, which enforces its own exclusion.
- Execution rechecks intent, tool, action class, work order, policy, tools, budgets, and lease bindings.
- Session revocation, user status, and current roles are revalidated on every authenticated request.
- Hosted workspace sessions preserve their mapped roles through the proxy; client bootstrap-admin headers are stripped and logout revokes the tracked session.
- HTTPS responses set `Secure` on session cookies; local HTTP development remains supported.
- Notifications are pointers to authenticated review, never approval credentials.

## Audit Events

- `APPROVAL_REQUEST_CREATED`
- `APPROVAL_DECISION_RECORDED`
- `APPROVAL_QUORUM_MET`
- `APPROVAL_QUORUM_FAILED`
- `APPROVAL_DENIED`
- `APPROVAL_CANCELLED`
- `APPROVAL_EXPIRED`
- `APPROVAL_CONSUMED`
- `APPROVAL_REPLAY_ATTEMPTED`

These events remain observable through AMC's signed ledger and approval hygiene summaries.
