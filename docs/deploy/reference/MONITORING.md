# Monitoring and alerts

`metrics.enabled=true` makes Studio serve Prometheus metrics on port 9464 (`AMC_METRICS_BIND=0.0.0.0`, `AMC_METRICS_PORT`). Studio refuses that bind unless signed LAN mode is on, which is the chart default. The Service exposes the port inside the cluster only, and the NetworkPolicy admits it from `metrics.namespaceSelector` (default: the `monitoring` namespace). `metrics.serviceMonitor.enabled` and `metrics.prometheusRule.enabled` render Prometheus Operator objects and need its CRDs.

Thresholds are proposals for Sid to confirm.

| Alert | Expression (in `templates/prometheusrule.yaml`) | Proposed threshold | Runbook |
|---|---|---|---|
| `AMCStudioDown` | `up == 0` for the Studio scrape job | 5 minutes | [amc-service-down](../../runbooks/amc-service-down.md) |
| `AMCLedgerVolumeFilling` | `amc_db_size_bytes` | 8 GiB (80% of the 10 Gi volume) for 15 minutes | [BACKUP_RESTORE](BACKUP_RESTORE.md) |
| `AMCGatewayFailures` | `rate(amc_gateway_failures_total[5m])` | 0.1 per second for 10 minutes | [amc-service-down](../../runbooks/amc-service-down.md) |

Alerts P2-06 asks for that need a metric AMC does not export yet. They are follow-ups, not alerts on a proxy:

- ledger verification failure (no verification-result metric);
- open `outcome_unknown` receipts (P1-03; no gauge);
- last good backup older than `opsPolicy.backups.maxBackupAgeDaysWarning` (no backup-age gauge);
- KeyProvider errors (P2-08; no error counter).
