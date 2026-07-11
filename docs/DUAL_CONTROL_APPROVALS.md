# Dual-Control Approvals

AMC supports approval quorum chains for high-impact actions.

## Core Flow
1. ToolHub creates `approvalRequestId` on guarded intent.
2. AMC can route a metadata-only notification to configured Integrations channels and the Studio inbox refreshes over SSE.
3. Approvers open the authenticated, workspace-aware Studio review path or use the CLI with explicit reviewer identity and roles to submit signed decisions.
4. Quorum engine evaluates role eligibility, distinct-user rules, and TTL.
5. ToolHub executes only when quorum is `QUORUM_MET`.
6. Approval is consumed single-shot and replay attempts are denied.

## Policy
Configured in signed `/.amc/approval-policy.yaml`.

Example high-impact posture:
- `WRITE_HIGH`: `requiredApprovals: 2`, `requireDistinctUsers: true`
- `DEPLOY`: `requiredApprovals: 2`, `requireDistinctUsers: true`
- `SECURITY`: `requiredApprovals: 2`, roles constrained to `OWNER|AUDITOR`

## Binding Hashes
Approval requests bind execution context:
- `intentHash`
- `workOrderHash`
- `policyHash`, `toolsHash`, `budgetsHash`
- lease constraints hash

This prevents replay under modified governance state. Signed consumption artifacts are also bound to their request path and agent, so copying a valid artifact to a different request fails closed.

## Notification Boundary

Notifications carry only an opaque request reference and digest, action/risk/mode metadata, timestamps, quorum progress, lifecycle state, and a relative authenticated review path. They omit tool names, raw arguments, reasons, intent/work-order IDs, bound hashes, signatures, credentials, Vault refs, tokens, local paths, and destination URLs.

Delivery is not authority. Missing routes, transport failures, duplicates, reordering, expiry, and notification replay never change quorum or permit execution. Pending deliveries remain `QUEUED` in the existing signed SQLite outbox and resume on Studio startup/scheduler ticks. See [Approvals](APPROVALS.md) for setup and remediation.

## Audit Events
- `APPROVAL_REQUEST_CREATED`
- `APPROVAL_DECISION_RECORDED`
- `APPROVAL_QUORUM_MET`
- `APPROVAL_CONSUMED`
- `APPROVAL_DENIED`
- `APPROVAL_CANCELLED`
- `APPROVAL_EXPIRED`
- `APPROVAL_QUORUM_FAILED`
- `APPROVAL_REPLAY_ATTEMPTED`
