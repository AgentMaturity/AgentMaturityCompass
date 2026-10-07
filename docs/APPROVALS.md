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

## CLI

```bash
amc approvals list --agent <agentId> --status pending
amc approvals list --agent <agentId> --query <requestId-fragment> --action-class DEPLOY --risk-tier high --effective-mode execute --created-after 2026-07-01T00:00:00Z --created-before 2026-08-01T00:00:00Z --order newest --limit 50 --json
amc approvals show --agent <agentId> <requestId>
amc approvals approve --agent <agentId> <requestId> --mode execute --reason "approved by owner" --username <reviewer> --roles OWNER
amc approvals deny --agent <agentId> <requestId> --reason "not approved" --username <reviewer> --roles APPROVER
```

`--username` and `--roles` are required for decisions; `--user-id` can bind a stable identity distinct from its display name. Unknown roles and a repeated reviewer on a distinct-user request fail closed. CLI decisions use the same lifecycle delivery path as Studio. `APPROVED` remains an input compatibility alias for canonical `QUORUM_MET`.

### Native one-shot and interactive review

The native one-shot approval prompt reads the actual signed pending request and
prints an inspection command plus the existing authenticated login and decision
templates. Unlike the legacy examples above, native templates include both
`--session-token-file` and `--expect-request-digest`. Keep both: omitting them
selects the legacy supplied-reviewer path, not authenticated native review.

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

Run `amc integrations init`, store channel credentials in Vault, configure signed routing in `.amc/integrations.yaml`, then verify with:

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
