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
7. A successful execute consumes the approval once. Replay is denied.

`DENIED`, `EXPIRED`, `CANCELLED`, and `CONSUMED` are terminal. AMC rejects further decisions or cancellation attempts for a terminal request.

## CLI

```bash
amc approvals list --agent <agentId> --status pending
amc approvals show --agent <agentId> <requestId>
amc approvals approve --agent <agentId> <requestId> --mode execute --reason "approved by owner" --username <reviewer> --roles OWNER
amc approvals deny --agent <agentId> <requestId> --reason "not approved" --username <reviewer> --roles APPROVER
```

`--username` and `--roles` are required for decisions; `--user-id` can bind a stable identity distinct from its display name. Unknown roles and a repeated reviewer on a distinct-user request fail closed. CLI decisions use the same lifecycle delivery path as Studio. `APPROVED` remains an input compatibility alias for canonical `QUORUM_MET`. List output is a bounded summary and omits tool names, raw arguments, intent or work-order IDs, reasons, bound hashes, credentials, Vault references, tokens, absolute paths, and destination URLs. `show` is the explicit authenticated local detail command for an approver who needs to inspect signed request context.

## Studio and API

Studio Approvals supports a direct authenticated review link:

```text
/console/approvals?approval=<requestId>
```

Hosted workspace notifications use the router-aware form `/w/<workspaceId>/console/approvals?approval=<requestId>`. AMC accepts only these relative same-origin path shapes; absolute or arbitrary review targets are rejected.

The inbox refreshes on privacy-safe approval SSE events. The current Studio routes are:

- `GET /approvals/requests`
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
