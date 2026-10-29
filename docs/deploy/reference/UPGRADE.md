# Upgrade the reference deployment

Every upgrade has an outage: the chart uses `strategy: Recreate`, so the old pod stops before the new one is Ready. The harness records it as `downtimeMs` instead of hiding it.

1. Run the workload fixture and record the ledger head hash, event count and receipt ids. (check UPG-1)
2. Take a backup before upgrading: `amc backup create --out <file>` in the Studio pod with `AMC_BACKUP_PASSPHRASE_FILE` set; copy the file off the volume. RB-2 restores it. (check UPG-1)
3. Upgrade by digest: `helm upgrade amc-rd deploy/helm/amc --reuse-values --set image.digest=sha256:<N> --wait`. (check UPG-1)
4. Confirm the pre-upgrade chain is a byte-identical prefix of the new chain, every migration version appears once, and `PRAGMA integrity_check` returns `ok`. (check UPG-1)
5. Run `helm test` and `scripts/deploy-verify.mjs` again. (check UPG-1)
6. If the new image never becomes Ready (for example a migration throws), the ledger file must be unchanged; run `helm rollback amc-rd <previous revision> --wait`. (check UPG-2)

Chart 0.4.0 changes from 0.3.0: the PodDisruptionBudget defaults to `maxUnavailable: 1` (0.3.0 used `minAvailable: 1`, which blocked every drain), and `metrics.*` values are new and off by default.
