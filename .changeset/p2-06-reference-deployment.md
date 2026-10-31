---
"agent-maturity-compass": minor
---

Reference deployment qualification harness and platform matrix (P2-06). The reference deployment is **not qualified** yet: the receipts list which checks failed or did not run.

- `scripts/qualify-reference-deployment.mjs` runs the 22 checks in `qualification/reference-deployment/matrix.json` (install, upgrade, rollback, backup and restore, crash recovery, offline verification, tenant separation) against one Helm release, calling helm and kubectl with argument arrays. It writes a contract receipt and one artifact per check, and exits 0 only when every check passed; a check that did not run counts as failed. It exits 2 on a usage error, a missing tool, or recovery targets that are not filled in: `qualification/reference-deployment/targets.json` ships empty for Sid and the P2-03 partner to agree, with no defaults.
- Helm chart 0.4.0: `metrics.enabled` (off by default) exposes Prometheus metrics on port 9464 inside the cluster, admitted by the NetworkPolicy from the monitoring namespace only, with optional ServiceMonitor and PrometheusRule templates whose thresholds are proposals. The PodDisruptionBudget now defaults to `maxUnavailable: 1`, so a node drain evicts the single pod (with an outage) instead of blocking; `minAvailable: 1` with `maxUnavailable: null` restores the old behaviour, and setting both or neither fails the render.
- `scripts/gen-platform-matrix.mjs` generates `docs/PLATFORM_MATRIX.md` from platform-lane receipts: a cell is qualified only with a passing receipt for the same commit and a `native-modules` PASS from `amc doctor --json`; another commit's receipt is "not run". The nightly compatibility matrix adds a Linux ARM64 lane, a doctor check and lane receipts on every lane, and desktop installer lanes on macOS and Windows. `.github/workflows/reference-deployment.yml` runs the harness on kind.
- Runbooks for the reference topology are in `docs/deploy/reference/`, including the manual GUI launcher checklist.
