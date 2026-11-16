# Drift + Regression Alerts

AMC detects maturity/integrity regressions across runs and can freeze EXECUTE for risky action classes until recovery.

## Config

Files:
- `.amc/alerts.yaml`
- `.amc/alerts.yaml.sig`

Webhook secrets are not stored in plaintext YAML. Use `secretRef` values that resolve to vault entries.

## Commands

```bash
amc alerts init
amc alerts verify
amc alerts test

amc drift check --agent <id> --against previous
amc drift check --agent <id> --against observed --window 7d
amc drift report --agent <id> --out .amc/agents/<id>/reports/drift.md

amc freeze status --agent <id>
amc freeze lift --agent <id> --incident <incidentId>
```

## Observed change

`amc drift check --against observed` reads what AMC recorded about the agent's traffic in the window: replies that went
through the AMC gateway, tool calls the hooks decided, and tool outcomes the hooks reported. It prints:

- how many tool calls were denied or sent to a person, and the denial rate;
- how many reported tool calls failed, and the error rate;
- how many replies were refusals, only where the reply says so: Anthropic's stop reason "refusal", or an OpenAI-style
  reply whose message carries refusal text or that stopped for the content filter. A reply that does not say (an
  OpenAI-style reply without a `refusal` field, a streamed reply, other providers) counts as not recorded;
- tokens per task (a task is one run id, or one recorded session without a run id);
- an "observed change" note when one of these numbers, or the model named in most replies, shifts. The window is cut
  into 24 parts and the existing change-point check (CUSUM) runs over them.

A note says what changed in the numbers and which recorded rows it rests on. It does not say why, and it does not say
whether the agent is safe or working. Exit code 3 means there were no rows to compare. The same counts and rates, for
the last 24 hours, are on the Live runs page of the Compass Console (`GET /api/v1/runtime/tool-rates`).

When an agent recorded more rows in the window than AMC reads at once (200,000), the newest rows are counted and the
output and the console say that only part was read.

`--against` takes `previous` (the default: the last two scored runs) or `observed`; any other value is refused.

Fixed canary prompts are not part of this check yet.

## Incidents and Freeze

When regression rules trigger:
- AMC records `DRIFT_REGRESSION_DETECTED`.
- AMC creates signed incident artifacts under:
  - `.amc/agents/<id>/incidents/`
- Freeze can activate for configured action classes.

While frozen:
- Governor denies EXECUTE for frozen classes.
- ToolHub rejects execute requests and allows simulate flow.
- Diagnostic reflects reduced autonomy allowance.

## When Drift Cannot Be Evaluated

Drift compares only the agent's trusted runs. When its run history is not whole (the ledger cannot be read, a run file the ledger records is deleted, hidden or unverifiable, or a ledger run cannot be attributed to an agent on disk) the check reports `INSUFFICIENT_EVIDENCE` and decides nothing. That is never a clean result:
- `amc drift check` dispatches an owner alert with rule `drift-not-evaluated` and exits 3 (2 is a triggered drift). An alert that cannot be delivered is added to the result as `ALERT_NOT_DELIVERED: <reason>`.
- The continuous monitor (`amc monitor start`, `amc watch start`) sends the same alert and counts the check in its `driftNotEvaluated` metric.

A run another agent's sealed file on disk accounts for never counts against this agent. A ledger run whose file is gone cannot be attributed to any agent, so it still blocks every agent's drift check, which now alerts instead of passing silently.

## Alert Payloads

Alert dispatcher sends deterministic JSON to configured local/webhook endpoints, including:
- rule/agent/run identifiers
- summary
- report/dashboard links
- content hashes for verification
