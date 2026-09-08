# Autonomy Budgets

AMC budgets control model requests and tool execution per agent using signed policy and verified usage evidence. AMC's native runtime reserves a request or tool slot before dispatch, including across concurrent SQLite-backed sessions.

## Config

File:
- `.amc/budgets.yaml`
- `.amc/budgets.yaml.sig` (auditor-signed)

Unsigned/invalid budgets config is treated as untrusted and restricts execute behavior.

## What Is Enforced

- Per-minute and per-day model request allowances. Native admission refuses the next request when the allowance is reached.
- Per-day tool execution allowances by `ActionClass`. Executed attempts and pending reservations consume slots. Policy-denied calls are reported separately; a tool body that runs and fails still consumes an attempt.
- Token thresholds checked between model dispatches, and cost thresholds against the known cost subtotal. A single admitted request can cross a token threshold because its final usage is not yet known. These are not hard prospective total-token or dollar caps.

Budget checks run in:
- Native agent, chat, SDK and ACP sessions (model admission and tool guards)
- Gateway (LLM path/rate/budget)
- ToolHub (execute budget guard)
- Governor decisions (mode downgrades for exceeded budgets)

## Commands

```bash
amc budgets init
amc budgets verify
# After reviewing intentional edits to the existing YAML:
amc budgets sign
amc budgets status --agent <id>
amc budgets reset --agent <id> --day 2026-02-11
```

## Audit Signals

- `BUDGET_EXCEEDED`
- `LEASE_RATE_LIMITED`

These audits feed diagnostic caps (for example Q24/Q25 caps when execute-related budgets are exceeded).

`budgets sign` validates and signs the existing file without rewriting its limits or comments. Missing or invalid policy is refused without replacing an existing signature. Use `--json` for signature metadata. `budgets init` creates default limits; use it only when those defaults are intended.

`budgets reset` writes an audit record. It does **not** erase recorded usage, restore allowance, settle a pending request, or clear unknown usage. To change an allowance, review the existing YAML, edit it intentionally, then sign it.

## Read the Status Accurately

`budgets status` combines verified native session events with legacy gateway and ToolHub evidence. Numeric token and cost fields are **known subtotals**, not evidence that unreported usage was zero.

| Field | Meaning |
| --- | --- |
| `llmRequests` | Dispatched or reserved requests in the reporting window |
| `llmPreparedRequests` | Prepared request records, which alone do not prove dispatch |
| `llmTokens`, `llmCostUsd` | Known usage subtotals |
| `unknownLlmTokenRequests`, `unknownLlmCostRequests` | Requests with incomplete token or price coverage |
| `llmTokenUsageComplete`, `llmCostUsageComplete` | Whether the corresponding subtotal covers all counted requests |
| `blockingUnknownLlmTokenRequests` | Unknown token usage that blocks another native dispatch under the default policy |
| `daily.llmPendingRequests`, `daily.toolPending` | Reservations without matching verified settlement |
| `daily.toolDenied` | Calls refused before tool execution |

Daily and minute model fields use their respective windows. The `ok` field reports whether recorded usage has already exceeded a configured threshold. At an exact request or tool cap, `ok` can still be true while native admission correctly refuses another dispatch. Inspect the counters, limits and `nativeAdmissionPolicy` together.

## Missing Usage and Recovery

The signed per-agent `unknownTokenUsage` setting defaults to `BLOCK` when omitted. Transport loss, cancellation, a partial usage report or an unresolved reservation can leave token usage unknown; AMC blocks another native model request while such usage remains in the applicable window. Pending reservations do not silently expire. HTTP 401, 403 and 429 refusals consume request allowance and retain unknown reported usage, but do not count as blocking unknown token usage, allowing configured retries without inventing a zero-usage measurement.

An operator can explicitly set `budgets.perAgent.<agent>.unknownTokenUsage` to `ALLOW_WITH_WARNING` and sign the reviewed policy to allow further dispatch with incomplete usage. Request allowances still apply, uncertainty remains visible in status, and this setting does not provide a hard token or cost cap. `nativeAdmissionPolicy` reports the effective choice alongside the token and cost threshold semantics.

Native reservations and their settlement are bound to the session and call identity in verified evidence. Invalid signatures, broken event chains or inconsistent reservation settlement cannot be used as trusted usage. Preserve the ledger and its trusted verification checkpoint when investigating a blocked session.
