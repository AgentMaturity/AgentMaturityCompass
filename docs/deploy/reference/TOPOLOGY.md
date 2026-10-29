# Reference deployment topology (P2-06)

D-03 was decided on 2026-10-11 as option C: Helm, Compose, Railway and Vercel all stay documented. P2-06 qualifies one of them end to end, Helm on Kubernetes, because it is the only target with a cluster-level harness (`scripts/qualify-reference-deployment.mjs`). The other three targets remain documented and are not qualified by this item. Compose has container-level rollback receipts (P0-14 `scripts/deploy/rollback-drill.mjs`) and A4 deployment receipts; Railway and Vercel have no qualification receipts.

## What the reference deployment is

| Part | Reference value | Where it is set |
|---|---|---|
| Chart | `deploy/helm/amc`, chart version 0.4.0, appVersion 1.2.0 | `deploy/helm/amc/Chart.yaml` |
| Image | `ghcr.io/agentmaturity/amc-studio@sha256:<release digest>` with `image.requireDigest=true` | Sid pins the digest at release (P0-35, P2-15). Kind runs use the containerd import digest from `scripts/deploy/kind-image-digest.mjs`. |
| Kubernetes | kind node `kindest/node` v1.37.0 for kind runs; Sid records the D-03 cluster's version in its receipt | `qualification/<date>-P2-06/cluster/receipt.json` |
| Replicas and strategy | 1 replica, `Recreate` (one SQLite writer on a `ReadWriteOnce` volume) | `templates/deployment.yaml` |
| Disruption budget | `maxUnavailable: 1` by default (a drain evicts the pod, with an outage) | `values.yaml` `podDisruptionBudget` |
| KeyProvider | the file provider inside the workspace volume. The chart has no setting for the P2-08 providers (PKCS#11, cloud KMS) yet. | not wired: INS-1 records this criterion as failed |
| Ledger storage | SQLite (`.amc/evidence.sqlite`) on the workspace volume. Field encryption (P2-09a) and the Postgres HA option are not switched on by the chart. | not wired: INS-1 and CR-5 record it |
| WORM target | none in the chart; `amc evidence-stores worm-export` is run by an operator | OV-2 is not run |
| Secrets | `amc-bootstrap` created out of band (five keys); the chart renders no Secret by default | `docs/KUBERNETES_HELM_DEPLOYMENT.md` |
| Monitor key | pinned by `env.AMC_EXPECTED_MONITOR_FINGERPRINT`; kind runs pin it on first use, a real install pins it out of band | INS-1 |
| Metrics | off by default; `metrics.enabled=true` exposes port 9464 inside the cluster, admitted from the monitoring namespace only | `docs/deploy/reference/MONITORING.md` |
| Tenant model | one release per namespace, one workspace per release (`amc studio start`). `amc host` multi-workspace mode is not part of the reference topology. | TS-1 to TS-5 |

## Scope statement

The claim vocabulary is D-03's: a deployment is "qualified within scope S, versions V, window W", or it is not qualified. Until every check in `qualification/reference-deployment/matrix.json` passes on kind and on Sid's D-03 cluster, and the recovery targets are agreed, the statement is:

- Scope S: Helm chart 0.4.0 on Kubernetes, one release per namespace, SQLite workspace volume, file KeyProvider.
- Versions V: the image digests and commit recorded in the latest `qualification/<date>-P2-06/` receipt.
- Window W: none. The reference deployment is **not qualified**; the receipts list which checks failed or did not run.

## Runbooks

[INSTALL](INSTALL.md) · [UPGRADE](UPGRADE.md) · [ROLLBACK](ROLLBACK.md) · [BACKUP_RESTORE](BACKUP_RESTORE.md) · [CRASH_RECOVERY](CRASH_RECOVERY.md) · [KEY_PROVIDER_OUTAGE](KEY_PROVIDER_OUTAGE.md) · [OFFLINE_VERIFICATION](OFFLINE_VERIFICATION.md) · [TENANT_ONBOARDING](TENANT_ONBOARDING.md) · [GUI_CHECKLIST](GUI_CHECKLIST.md) · [MONITORING](MONITORING.md) · [RECOVERY_TARGETS](RECOVERY_TARGETS.md)
