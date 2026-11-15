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
- Token thresholds checked between model dispatches. A single admitted request can cross a token threshold because its final usage is not yet known.
- Native USD admission when `daily.maxCostUsd` is present: reserve an auditor-attested worst-case request ceiling before dispatch. Measured settled spend plus outstanding reservations must fit the signed daily allowance. This guarantee depends on the auditor's ceiling contract covering the request; indicative catalog pricing is insufficient.

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

## Native USD Request Bounds

New default policies contain token and count limits, with `daily.maxCostUsd: null`. Omit that field or set it to `null` to select that mode explicitly. Existing signed policies with a USD limit retain that limit and require request bounds before native dispatch.

Set `budgets.perAgent.<agent>.nativeUsdBounds` to reviewed request-ceiling records, then run `amc budgets sign`. Each record requires `providerId`, `model`, `encoderId`, `encoderVersion`, the exact HTTPS `endpoint`, `maxRequestBytes`, `maxOutputTokens`, `maxCostUsd`, `source`, and an ISO `expiresAt`. Its monetary amount is an auditor-attested upper bound for the **entire request** within those byte and output limits, including input and cache charges. It is not an estimated average or a per-token price. This package does not supply or invent such prices. A record matches one exact `encoderVersion`: when a release moves a route to a new encoder version (for example `openai-chat@4` to `@6`, or `deepseek-chat@1` to `@2`), add a reviewed record for the new version and re-sign, or USD admission refuses the request as unbounded.

Admission matches the actual destination and body digest to the signed request header. It requires one unexpired matching bound and an explicit covered output limit. Supported text encoders are OpenAI Chat, OpenAI Responses and Anthropic Messages. Unmodeled billing parameters, multiple completions, hosted tools and media refuse this budget mode. Text content uses encoder-specific allowlists: Chat accepts `text`, Responses accepts `input_text` and `output_text`, and Anthropic accepts `text` plus `tool_use`/`tool_result` carrying text-only content. Unknown content types and nested keys ending in `_url`, `file` or `source` refuse hard USD admission, even when their value is empty. Function schemas remain data; they still receive the recursive attachment-key check. Unknown historical cost without a reservation also refuses further USD admission. A token uncertainty waiver cannot bypass USD admission.

Reservations are signed and sealed in the existing atomic budget ledger transaction. The audit retains the bound digest, source and expiry. Only a matching successful response with complete provider-reported USD cost releases its ceiling; partial or missing usage retains exposure across midnight. Ordinary native adapters currently report tokens without measured USD, so their completed calls retain the USD reservation. Catalog estimates remain separately labeled and never settle it. Measured spend above an attested ceiling remains visible and prevents further admission; AMC cannot reverse a provider charge or correct an auditor's inaccurate ceiling.

Admission uses integer trillionths of USD, rounding exposure upward and available capacity downward. Status amounts are display values; integer accounting prevents floating-point rounding from creating spend allowance.

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
| `daily.llmReservedCostUsd` | Outstanding USD exposure, including unresolved reservations from earlier days |
| `daily.llmBudgetCostUsd` | Conservative settled daily spend plus outstanding exposure |
| `daily.llmUnreservedCostRequests` | Unknown cost without a USD reservation; blocks hard USD admission |
| `daily.toolDenied` | Calls refused before tool execution |

Daily and minute model fields use their respective windows. The `ok` field reports whether recorded usage has already exceeded a configured threshold. At an exact request or tool cap, `ok` can still be true while native admission correctly refuses another dispatch. Inspect the counters, limits and `nativeAdmissionPolicy` together.

## Missing Usage and Recovery

The signed per-agent `unknownTokenUsage` setting defaults to `BLOCK` when omitted. It decides what happens when AMC cannot tell what an earlier model request cost. AMC first works out what it can prove, so that one failed or cancelled request does not stop the agent:

- **Nothing was sent.** A request refused before the transport, or one whose connection never opened (nothing listening, no such host: `ECONNREFUSED`, `ENOTFOUND`, `EAI_AGAIN`, `EHOSTUNREACH`, `ENETUNREACH`, recorded as `connectFailed` on the request's failure row), counts as a request that used no tokens. The same holds for the gateway: when every attempt to reach the upstream failed before connecting, its `request_error` row carries `connectFailed`.
- **The stand-in model.** A request to the built-in stand-in model (`--provider stub`) goes nowhere and costs nothing, so it counts as zero, and unknown usage elsewhere never stops it. The request and token limits still apply to it.
- **A request that was sent but never reported usage** (a Ctrl-C mid-answer, a dropped stream, a timeout) counts at its upper estimate, recorded on its reservation as `tokenCeiling`: the bytes sent, plus a fixed allowance of 4,096 tokens for the provider's own prompt wrapping, plus the request's output limit. AMC's native agent sets an output limit (`--max-tokens`) on every request; AMC reads it from the request body (`max_tokens`, `max_completion_tokens`, `max_output_tokens`, Ollama's `options.num_predict` or Gemini's `generationConfig.maxOutputTokens`), and a request whose body carries none is not bounded. This estimate counts against `maxLlmTokens`, so the token limits stay enforced, and the request is still listed as unknown (`unknownLlmTokenRequests`, `llmTokenUsageComplete: false`).
- **HTTP 401, 403 and 429 refusals** consume request allowance and keep their usage unknown, but do not block.

Only a request that has none of these (no usage report and no output limit to bound it, or an older record written before these rules) is blocking unknown usage (`blockingUnknownLlmTokenRequests`). While one is in the applicable window, the next native model request of that agent is refused with `AMC_NATIVE_BUDGET_REFUSED`, the refusal says so in plain words and names the command below, and `amc budgets status --agent <agent>` reports `"ok": false` with the same reason and a `next` list (it also prints both to stderr and exits 1). A pending reservation (the process stopped before it recorded an outcome) is treated the same way: counted at its upper estimate when it has one.

To continue:

- Unknown usage counts only in its local budget day and minute windows, so the block clears when the local day ends.
- To continue now, check what the earlier requests did, then run `amc budgets reset --agent <agent> --accept-unknown`. It signs `acceptUnknownUsageBefore` (the current time) into the agent's entry in `.amc/budgets.yaml`, through the same vault-held key as `amc budgets sign`, so only someone who can sign budgets can do it. Requests recorded before that time no longer block; limits are unchanged, the requests stay listed as unknown, and a later request with unknown usage blocks again.
- `amc budgets reset --day <yyyy-mm-dd>` only records a reset; it does not restore allowance.

A refusal for a real limit (requests or tokens per day or per minute) names the limit, how much is used and when it ends, and how to change the limit on purpose (edit `budgets.perAgent.<agent>` and run `amc budgets sign`). Waiting for the period to end is the other way on.

An operator can explicitly set `budgets.perAgent.<agent>.unknownTokenUsage` to `ALLOW_WITH_WARNING` and sign the reviewed policy to allow further dispatch with incomplete usage. Request allowances still apply, uncertainty remains visible in status, and this setting does not provide a hard token or cost cap. `nativeAdmissionPolicy` reports the effective choice alongside the token and cost threshold semantics.

Native reservations and their settlement are bound to the session and call identity in verified evidence. Invalid signatures, broken event chains or inconsistent reservation settlement cannot be used as trusted usage. Preserve the ledger and its trusted verification checkpoint when investigating a blocked session.
