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
amc drift report --agent <id> --out .amc/agents/<id>/reports/drift.md

amc freeze status --agent <id>
amc freeze lift --agent <id> --incident <incidentId>
```

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
